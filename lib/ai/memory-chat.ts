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
    // Tool to list workflows and get first step
    'get_workflow_info': {
      description: "Get information about available workflows or start a workflow by getting its first step",
      inputSchema: toZod({
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['list', 'start'],
            description: 'Action to perform: "list" to see all workflows, "start" to get first step of a workflow'
          },
          workflowId: { 
            type: 'string', 
            description: 'Workflow ID (required when action is "start")' 
          },
          input: { 
            type: 'object', 
            description: 'Input for the workflow (optional when action is "start")' 
          }
        },
        required: ['action']
      }),
      execute: async (args: { action: string, workflowId?: string, input?: any }) => {
        try {
          const { action, workflowId, input } = args

          if (action === 'list') {
            // Return list of available workflows
            const workflowList = workflows.map(wf => ({
              id: wf.id,
              name: wf.name,
              description: wf.description,
              steps: (wf.definition as any)?.nodes?.length || 0
            }))
            
            return {
              workflows: workflowList,
              message: `Found ${workflowList.length} workflows. Use action "start" with a workflowId to begin execution.`
            }
          }

          if (action === 'start') {
            if (!workflowId) {
              throw new Error('workflowId is required when action is "start"')
            }

            // Get workflow definition
            const workflow = await getWorkflowWithSteps(workflowId, userId)
            if (!workflow) {
              throw new Error('Workflow not found')
            }

            // Create workflow run
            const runId = await createWorkflowRun({
              workflowId,
              owner: userId,
              input: input || {}
            })

            // Get first executable steps
            const nextSteps = getNextExecutableSteps(
              workflow.definition as any,
              [], // No completed steps yet
              {}, // No step outputs yet
              input || {}
            )

            if (!nextSteps || nextSteps.length === 0) {
              return { 
                runId,
                message: 'Workflow completed with no steps to execute',
                isComplete: true
              }
            }

            // Return first step for AI to execute
            return {
              runId,
              workflowName: workflow.name,
              nextStep: nextSteps[0],
              totalSteps: (workflow.definition as any)?.nodes?.length || 0,
              isComplete: false,
              message: `Workflow "${workflow.name}" started. First step: ${nextSteps[0].name}. Use execute_workflow_step to run it.`
            }
          }

          throw new Error('Invalid action. Use "list" or "start"')

        } catch (error: any) {
          console.error('Get workflow info failed:', error)
          throw new Error(`Get workflow info failed: ${error.message}`)
        }
      }
    },

    // Tool to execute individual workflow steps
    'execute_workflow_step': {
      description: "Execute a specific step in an AI workflow run",
      inputSchema: toZod({
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'The workflow run ID' },
          stepId: { type: 'string', description: 'The step ID to execute' },
          input: { type: 'object', description: 'Input for the step (optional)' }
        },
        required: ['runId', 'stepId']
      }),
      execute: async (args: { runId: string, stepId: string, input?: any }) => {
        try {
          const { runId, stepId, input } = args
          
          // Get workflow run status
          const runStatus = await getRunStatus(runId, userId)
          if (!runStatus) {
            throw new Error('Workflow run not found')
          }

          const workflow = await getWorkflowWithSteps(runStatus.run.workflowId, userId)
          if (!workflow) {
            throw new Error('Workflow not found')
          }

          // Get step definition
          const stepDef = (workflow.definition as any).nodes.find((n: any) => n.id === stepId)
          if (!stepDef) {
            throw new Error(`Step ${stepId} not found`)
          }

          // Build context
          const stepOutputs: Record<string, any> = {}
          runStatus.steps.forEach((s: any) => {
            if (s.status === 'completed' && s.output) {
              stepOutputs[s.stepId] = s.output
            }
          })

          const context = {
            workflowInput: runStatus.run.input,
            stepOutputs,
            userId
          }

          // Execute step
          const output = await executeStep(stepDef, input || {}, context)

          // Update step status
          await createOrUpdateStepExecution({
            runId,
            stepId,
            name: stepDef.name || stepId,
            type: stepDef.type || "tool",
            status: 'completed',
            output,
            endedAt: new Date()
          })

          // Get next steps
          const updatedRunStatus = await getRunStatus(runId, userId)
          const updatedSteps = updatedRunStatus?.steps || []
          const completedSteps = updatedSteps
            .filter((s: any) => s.status === 'completed')
            .map(s => ({ stepId: s.stepId, output: s.output }))

          const nextSteps = getNextExecutableSteps(
            workflow.definition as any,
            completedSteps,
            { ...stepOutputs, [stepId]: output },
            runStatus.run.input
          )

          const workflowComplete = isWorkflowComplete(
            workflow.definition as any,
            completedSteps
          )

          if (workflowComplete) {
            await updateRunStatus({
              id: runId,
              status: 'completed',
              output: { ...stepOutputs, [stepId]: output },
              endedAt: new Date()
            })
          }

          return {
            stepName: stepDef.name,
            stepOutput: output,
            nextSteps: nextSteps || [],
            isComplete: workflowComplete,
            message: workflowComplete 
              ? `Workflow "${workflow.name}" completed!` 
              : `Step "${stepDef.name}" completed. Next steps: ${nextSteps.map(s => s.name).join(', ')}`
          }

        } catch (error: any) {
          console.error('Step execution failed:', error)
          throw new Error(`Step execution failed: ${error.message}`)
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