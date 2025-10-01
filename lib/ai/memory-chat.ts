import { openai } from '@ai-sdk/openai'
import { ModelMessage, streamText } from 'ai'
import { z } from 'zod'

import { Mem0Memory } from '../memory/mem0'
import { getUserTool } from '../db/queries'
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

  let memories: { id: string; content: string }[] = []
  if (searchQuery) {
    try {
      updateStatus?.('Searching memory...')
      const result = await memory.search(searchQuery, { userId })
      memories = (result || []).map((m: any) => ({ id: m.id, content: m.content }))
    } catch {}
  }

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

  // Build AI SDK tools from registered tools
  const aiTools =
    (tools || []).reduce<Record<string, any>>((acc, t) => {
      // Use a stable unique tool name (AI SDK expects a string key)
      const key = `${t.name}__${t.id}`

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
        await memory.add([{ role: 'user', content: searchQuery }], { userId }) 
      } catch {} 
    })() 
  }

  return response
}