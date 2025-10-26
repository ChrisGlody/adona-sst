import { openai } from '@ai-sdk/openai'
import { ModelMessage, streamText } from 'ai'
import { z } from 'zod'

import { Mem0Memory } from '../memory/mem0'
import { getUserTool, getUserWorkflows, getWorkflowWithSteps, createWorkflowRun, getRunStatus, createOrUpdateStepExecution, updateRunStatus } from '../db/queries'
import { getNextExecutableSteps, isWorkflowComplete } from '../workflows/graph-analyzer'
import { executeStep } from '../workflows/ai-step-executor'
import { Lambda } from 'aws-sdk'

type RegisteredTool = {
  id: string
  name: string
  description: string | null
  inputSchema: any
  outputSchema: any
  type: string
  lambdaArn?: string | null
  implementation?: string | null
}

type WorkflowTool = {
  id: string
  name: string
  description: string | null
  inputSchema: any
  outputSchema: any
  definition: any
}

const lambda = new Lambda({ region: process.env.AWS_REGION })

async function runRegisteredTool(userId: string, toolId: string, input: unknown) {
  const results = await getUserTool(toolId, userId)
  const tool = results[0]
  if (!tool) throw new Error('Tool not found')

  // Same execution semantics as /api/tools/run
  if (tool.type === 'lambda' && tool.lambdaArn) {
    const resp = await lambda.invoke({
      FunctionName: tool.lambdaArn,
      Payload: JSON.stringify({ input }),
    }).promise()
    const payload = JSON.parse(Buffer.from(resp.Payload as any).toString())
    return { result: payload }
  }

  if (tool.type === 's3-inline') {
    const runnerArn = process.env.TOOL_RUNNER_ARN!
    const resp = await lambda.invoke({
      FunctionName: runnerArn,
      Payload: JSON.stringify({ toolId, input }),
    }).promise()
    const payload = JSON.parse(Buffer.from(resp.Payload as any).toString())
    return { result: payload }
  }

  if (tool.type === 'http' && tool.implementation) {
    const res = await fetch(tool.implementation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const result = await res.json()
    return { result }
  }

  throw new Error('Unsupported tool type')
}

function toZod(schema: any) {
  // Use catchall instead of passthrough to keep "type: object" in JSON Schema
  const anyObject = z.object({}).catchall(z.any())

  // Converts any JSON Schema into a Zod schema (may be non-object)
  const convert = (s: any): z.ZodTypeAny => {
    if (!s || typeof s !== 'object') return anyObject
    switch (s.type) {
      case 'object': {
        const props = s.properties || {}
        const required: string[] = Array.isArray(s.required) ? s.required : []
        const shape: Record<string, z.ZodTypeAny> = {}
        for (const [key, propSchema] of Object.entries<any>(props)) {
          let prop = convert(propSchema)
          if (!required.includes(key)) prop = prop.optional()
          shape[key] = prop
        }
        return z.object(shape).catchall(z.any())
      }
      case 'string':
        if (Array.isArray(s.enum) && s.enum.length) {
          return z.enum(s.enum as [string, ...string[]])
        }
        return z.string()
      case 'number':
        return z.number()
      case 'integer':
        return z.number().int()
      case 'boolean':
        return z.boolean()
      case 'array':
        return z.array(convert(s.items || {}))
      default:
        return anyObject
    }
  }

  // Ensure the top-level returned schema is ALWAYS an object.
  const zschema = convert(schema)
  // @ts-ignore
  if (zschema._def.typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    return zschema
  }
  // Wrap primitive/array schemas under `input`
  return z.object({ input: zschema }).catchall(z.any())
}

function toJSONSchema(schema: any) {
  // Always return a JSON Schema with top-level type "object"
  const asObject = (s: any = {}) => ({
    type: 'object',
    properties: s.properties || {},
    required: Array.isArray(s.required) ? s.required : [],
    additionalProperties:
      typeof s.additionalProperties === 'boolean' ? s.additionalProperties : true,
  })

  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: true }
  }

  if (schema.type === 'object') {
    return asObject(schema)
  }

  // Wrap non-object schemas under a single "input" field
  return {
    type: 'object',
    properties: { input: schema },
    required: ['input'],
    additionalProperties: false,
  }
}

export const chat = async (
  messages: ModelMessage[],
  userId: string,
  memory: Mem0Memory,
  updateStatus?: (status: string) => void,
  tools?: RegisteredTool[],
) => {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const rawContent = lastUser?.content

  const searchQuery =
    typeof rawContent === 'string'
      ? rawContent
      : rawContent
      ? JSON.stringify(rawContent)
      : ''

  /*    
  let memories: { id: string; content: string }[] = []
  if (searchQuery) {
    try {
      updateStatus?.('Searching memory...')
      const result = await memory.search(searchQuery, { userId })
      memories = (result || []).map((m: any) => ({ id: m.id, content: m.content }))
    } catch {}
  }
  */

  const memories = [] as { id: string; content: string }[]

  const memoryContext =
    memories.length > 0
      ? memories.map((m, index) => `  ${index + 1}. ${m.content}`).join('\n')
      : '  (No saved facts found)'

  const system = `You are a helpful AI chat assistant with long-term memory.

IMPORTANT: You have access to the user's personal memory data below. Use this information to personalize responses and avoid repeating questions.

MEMORY DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Saved User Facts:
${memoryContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Guidelines:
- Reference memory facts naturally when relevant
- Do not invent facts not present in memory
- If unsure, ask for clarification
- Keep responses concise and helpful

MEMORY HIGHLIGHTING:
- Wrap memory-derived info with <memory>...</memory> tags when directly referenced.

Current date: ${new Date().toISOString().split('T')[0]}
User ID: ${userId}`

  // Get user's AI workflows
  let workflows: WorkflowTool[] = []
  try {
    const workflowRows = await getUserWorkflows(userId, 'db')
    workflows = workflowRows.map((wf: any) => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      inputSchema: wf.inputSchema,
      outputSchema: wf.outputSchema,
      definition: wf.definition
    }))
  } catch (error) {
    console.warn('Failed to load workflows:', error)
  }

  // Build AI SDK tools from registered tools
  const toolTools = (tools || []).reduce<Record<string, any>>((acc, t) => {
    // Use a stable unique tool name (AI SDK expects a string key)
    const key = `${t.name}_${t.id}`

    acc[key] = {
      description: t.description || 'User-registered tool',
      inputSchema: toZod(t.inputSchema),
      execute: async (args: unknown) => {
        console.log("executing tool name ====>", t.name, "args ====>", args);
        // Server-side execution; no client round-trip
        const out = await runRegisteredTool(userId, t.id, args)
        console.log("tool result ====>", t.name, "result ====>", out);
        return out
      },
    }
    return acc
  }, {})

  // Build AI SDK tools for workflow management
  const workflowTools = {
    // Tool to list workflows
    'list_workflows': {
      description: "List all available workflows",
      inputSchema: toZod({
        type: 'object',
        properties: {},
        required: []
      }),
      execute: async () => {
        const workflowList = workflows.map(wf => ({
          id: wf.id,
          name: wf.name,
          description: wf.description,
          steps: (wf.definition as any)?.nodes?.length || 0
        }))
        
        return {
          workflows: workflowList,
          message: `Found ${workflowList.length} workflows. Use run_workflow_auto to execute them automatically.`
        }
      }
    },

    // Tool to run workflow automatically with step-by-step output
    'run_workflow_auto': {
      description: "Run a complete workflow automatically, executing all steps in sequence and showing the output of each step",
      inputSchema: toZod({
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'The workflow ID to run' },
          input: { type: 'object', description: 'Input for the workflow' }
        },
        required: ['workflowId']
      }),
      execute: async (args: { workflowId: string, input?: any }) => {
        try {
          // Get workflow definition
          const workflow = await getWorkflowWithSteps(args.workflowId, userId)
          if (!workflow) {
            throw new Error('Workflow not found')
          }

          // Create workflow run
          const runId = await createWorkflowRun({
            workflowId: args.workflowId,
            owner: userId,
            input: args.input || {}
          })

          // Execute all steps automatically with detailed output
          const stepOutputs: Record<string, any> = {}
          const stepDetails: Array<{
            stepId: string,
            stepName: string,
            stepType: string,
            input: any,
            output: any,
            status: string,
            executionTime: number
          }> = []
          
          let currentSteps = getNextExecutableSteps(
            workflow.definition as any,
            [],
            {},
            args.input || {}
          )
          let stepCount = 0

          console.log(`Starting workflow "${workflow.name}" with ${currentSteps.length} initial steps`)

          while (currentSteps.length > 0 && stepCount < 50) { // Safety limit
            for (const step of currentSteps) {
              const stepStartTime = Date.now()
              
              try {
                // Get step definition
                const stepDef = (workflow.definition as any).nodes.find((n: any) => n.id === step.stepId)
                if (!stepDef) {
                  throw new Error(`Step ${step.stepId} not found`)
                }

                console.log(`Executing step ${stepCount + 1}: ${stepDef.name} (${stepDef.type})`)

                // Build context
                const context = {
                  workflowInput: args.input,
                  stepOutputs,
                  userId
                }

                // Execute step
                const output = await executeStep(stepDef, args.input || {}, context)
                const executionTime = Date.now() - stepStartTime

                // Update step status
                await createOrUpdateStepExecution({
                  runId,
                  stepId: step.stepId,
                  name: stepDef.name || step.stepId,
                  type: stepDef.type || "tool",
                  status: 'completed',
                  output,
                  endedAt: new Date()
                })

                // Store detailed results
                stepOutputs[step.stepId] = output
                stepDetails.push({
                  stepId: step.stepId,
                  stepName: stepDef.name || step.stepId,
                  stepType: stepDef.type || "tool",
                  input: args.input || {},
                  output: output,
                  status: 'completed',
                  executionTime: executionTime
                })
                stepCount++

                console.log(`Step ${stepCount} completed: ${stepDef.name} - Output:`, output)

                // Get next steps
                const updatedRunStatus = await getRunStatus(runId, userId)
                const updatedSteps = updatedRunStatus?.steps || []
                const completedSteps = updatedSteps
                  .filter((s: any) => s.status === 'completed')
                  .map(s => ({ stepId: s.stepId, output: s.output }))

                const nextSteps = getNextExecutableSteps(
                  workflow.definition as any,
                  completedSteps,
                  stepOutputs,
                  args.input || {}
                )

                const workflowComplete = isWorkflowComplete(
                  workflow.definition as any,
                  completedSteps
                )

                if (workflowComplete) {
                  await updateRunStatus({
                    id: runId,
                    status: 'completed',
                    output: stepOutputs,
                    endedAt: new Date()
                  })
                  
                  console.log(`Workflow "${workflow.name}" completed! Executed ${stepCount} steps`)
                  
                  return {
                    runId,
                    workflowName: workflow.name,
                    finalResult: stepOutputs,
                    stepDetails,
                    stepsExecuted: stepCount,
                    totalExecutionTime: stepDetails.reduce((sum, step) => sum + step.executionTime, 0),
                    isComplete: true,
                    message: `Workflow "${workflow.name}" completed automatically!`,
                    summary: {
                      totalSteps: stepCount,
                      stepSequence: stepDetails.map(s => s.stepName).join(' → '),
                      finalOutput: stepOutputs,
                      executionTime: stepDetails.reduce((sum, step) => sum + step.executionTime, 0)
                    }
                  }
                }

                // Update current steps for next iteration
                currentSteps = nextSteps || []
                console.log(`Next steps available: ${currentSteps.map(s => s.name).join(', ')}`)

              } catch (stepError: any) {
                const executionTime = Date.now() - stepStartTime
                console.error(`Step ${step.stepId} execution failed:`, stepError)
                
                // Get step definition for error reporting
                const stepDef = (workflow.definition as any).nodes.find((n: any) => n.id === step.stepId)
                
                // Record failed step
                stepDetails.push({
                  stepId: step.stepId,
                  stepName: stepDef?.name || step.stepId,
                  stepType: stepDef?.type || "tool",
                  input: args.input || {},
                  output: null,
                  status: 'failed',
                  executionTime: executionTime
                })

                throw new Error(`Step ${step.name} failed: ${stepError.message}`)
              }
            }
          }

          // If we hit the safety limit
          return {
            runId,
            workflowName: workflow.name,
            partialResult: stepOutputs,
            stepDetails,
            stepsExecuted: stepCount,
            totalExecutionTime: stepDetails.reduce((sum, step) => sum + step.executionTime, 0),
            isComplete: false,
            message: `Workflow "${workflow.name}" partially completed. Executed ${stepCount} steps (safety limit reached).`,
            summary: {
              totalSteps: stepCount,
              stepSequence: stepDetails.map(s => s.stepName).join(' → '),
              partialOutput: stepOutputs,
              executionTime: stepDetails.reduce((sum, step) => sum + step.executionTime, 0)
            }
          }

        } catch (error: any) {
          console.error('Auto workflow execution failed:', error)
          throw new Error(`Auto workflow execution failed: ${error.message}`)
        }
      }
    }
  }

  // Combine all tools
  const aiTools = { ...toolTools, ...workflowTools }

  console.log("Workflow tool names:", Object.keys(aiTools));

  const response = streamText({
    model: openai('gpt-4o'),
    system,
    messages,
    tools: aiTools,          // Enable tool calling
    toolChoice: 'auto',      // Let the model decide when to call tools
  })

  if (searchQuery) { 
    (async () => { 
      try { 
        updateStatus?.('Updating memory...') 
        //await memory.add([{ role: 'user', content: searchQuery }], { userId }) 
      } catch {} 
    })() 
  }

  return response
}