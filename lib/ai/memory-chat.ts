import { openai } from '@ai-sdk/openai'
import { ModelMessage, streamText } from 'ai'
import { z } from 'zod'

import { Mem0Memory } from '../memory/mem0'
import { getUserTool, getUserWorkflows } from '../db/queries'
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

async function runWorkflow(userId: string, workflowId: string, input: unknown) {
  try {
    // Initialize workflow run
    const runResponse = await fetch('/api/ai/workflows/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, input })
    })
    
    if (!runResponse.ok) {
      const error = await runResponse.json()
      throw new Error(`Failed to initialize workflow: ${error.error}`)
    }
    
    const { runId, nextSteps } = await runResponse.json()
    
    if (!nextSteps || nextSteps.length === 0) {
      return { result: 'Workflow completed with no steps to execute' }
    }
    
    // Execute steps iteratively
    const stepOutputs: Record<string, any> = {}
    let currentSteps = nextSteps
    
    while (currentSteps.length > 0) {
      for (const step of currentSteps) {
        try {
          // Determine step input based on context and step requirements
          let stepInput = input
          
          // If step has input mapping, evaluate it
          if (step.inputMapping) {
            try {
              // eslint-disable-next-line no-new-func
              const fn = new Function('context', `return (${step.inputMapping});`)
              stepInput = fn({ 
                workflowInput: input, 
                stepOutputs 
              })
            } catch (e) {
              console.warn(`Failed to evaluate input mapping for step ${step.stepId}:`, e)
            }
          }
          
          // Execute the step
          const executeResponse = await fetch(`/api/ai/workflows/${runId}/step/${step.stepId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: stepInput })
          })
          
          if (!executeResponse.ok) {
            const error = await executeResponse.json()
            throw new Error(`Step execution failed: ${error.error}`)
          }
          
          const { output, nextSteps: newSteps, isComplete } = await executeResponse.json()
          
          // Store step output
          stepOutputs[step.stepId] = output
          
          // Update current steps for next iteration
          currentSteps = newSteps || []
          
          // If workflow is complete, return final result
          if (isComplete) {
            return { result: stepOutputs }
          }
          
        } catch (stepError: any) {
          console.error(`Step ${step.stepId} execution failed:`, stepError)
          throw new Error(`Step ${step.name} failed: ${stepError.message}`)
        }
      }
    }
    
    return { result: stepOutputs }
    
  } catch (error: any) {
    console.error('Workflow execution failed:', error)
    throw new Error(`Workflow execution failed: ${error.message}`)
  }
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

  // Build AI SDK tools from workflows
  const workflowTools = workflows.reduce<Record<string, any>>((acc, wf) => {
    const sanitizedName = wf.name
    .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace invalid chars with underscore
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    // Use a stable unique tool name for workflows
    const sanitizedId = wf.id.replace(/[^a-zA-Z0-9_-]/g, '_')

    const key = `workflow_${sanitizedName}_${sanitizedId}`

    acc[key] = {
      description: wf.description || `AI workflow: ${wf.name}`,
      inputSchema: toZod(wf.inputSchema || { type: 'object', properties: {} }),
      execute: async (args: unknown) => {
        console.log("executing workflow name ====>", wf.name, "args ====>", args);
        // Execute workflow step by step
        const out = await runWorkflow(userId, wf.id, args)
        console.log("workflow result ====>", wf.name, "result ====>", out);
        return out
      },
    }
    return acc
  }, {})

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