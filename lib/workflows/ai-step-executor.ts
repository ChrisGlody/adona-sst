import { Mem0Memory } from '../memory/mem0'
import { getUserTool } from '../db/queries'
import { Lambda } from 'aws-sdk'

const lambda = new Lambda({ region: process.env.AWS_REGION })

export interface StepExecutionContext {
  workflowInput: any
  stepOutputs: Record<string, any>
  userId: string
}

export interface WorkflowStep {
  id: string
  name: string
  type: 'tool' | 'inline' | 'http' | 'memory'
  description?: string
  inputSchema?: any
  outputSchema?: any
  // Step-specific config
  toolId?: string
  code?: string
  url?: string
  operation?: 'search' | 'add'
  queryExpression?: string
  inputMapping?: string
}

/**
 * Executes a single workflow step in the Next.js context
 */
export async function executeStep(
  stepDef: WorkflowStep,
  input: any,
  context: StepExecutionContext
): Promise<any> {
  const { userId } = context
  
  try {
    let result: any
    
    switch (stepDef.type) {
      case 'tool':
        result = await executeToolStep(stepDef, input, userId)
        break
        
      case 'inline':
        result = await executeInlineStep(stepDef, input, context)
        break
        
      case 'http':
        result = await executeHttpStep(stepDef, input)
        break
        
      case 'memory':
        result = await executeMemoryStep(stepDef, input, context)
        break
        
      default:
        throw new Error(`Unsupported step type: ${stepDef.type}`)
    }
    
    // Optional output schema validation
    if (stepDef.outputSchema) {
      // Basic validation - could be enhanced with Ajv
      if (typeof result !== 'object' && stepDef.outputSchema.type === 'object') {
        throw new Error('Output does not match expected schema type')
      }
    }
    
    return result
    
  } catch (error: any) {
    console.error(`Step execution failed for ${stepDef.id}:`, error)
    throw new Error(`Step execution failed: ${error.message}`)
  }
}

/**
 * Execute tool step by calling existing registered tool
 */
async function executeToolStep(
  stepDef: WorkflowStep,
  input: any,
  userId: string
): Promise<any> {
  if (!stepDef.toolId) {
    throw new Error('Tool step missing toolId')
  }
  
  const results = await getUserTool(stepDef.toolId, userId)
  const tool = results[0]
  
  if (!tool) {
    throw new Error(`Tool not found: ${stepDef.toolId}`)
  }
  
  // Execute tool based on its execution environment
  if (tool.executionEnv === 's3' && tool.type === 's3-inline') {
    // Use Lambda runner for S3 tools
    const runnerArn = process.env.TOOL_RUNNER_ARN!
    const resp = await lambda.invoke({
      FunctionName: runnerArn,
      Payload: JSON.stringify({ toolId: stepDef.toolId, input }),
    }).promise()
    const payload = JSON.parse(Buffer.from(resp.Payload as any).toString())
    return payload.result || payload
  } else if (tool.executionEnv === 'db' && tool.implementation) {
    // Execute inline code directly
    return await executeInlineCode(tool.implementation, input, { userId })
  } else if (tool.type === 'http' && tool.implementation) {
    // Make HTTP request
    const res = await fetch(tool.implementation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return await res.json()
  } else if (tool.type === 'lambda' && tool.lambdaArn) {
    // Call Lambda function
    const resp = await lambda.invoke({
      FunctionName: tool.lambdaArn,
      Payload: JSON.stringify({ input }),
    }).promise()
    return JSON.parse(Buffer.from(resp.Payload as any).toString())
  }
  
  throw new Error(`Unsupported tool type: ${tool.type}`)
}

/**
 * Execute inline code step
 */
async function executeInlineStep(
  stepDef: WorkflowStep,
  input: any,
  context: StepExecutionContext
): Promise<any> {
  if (!stepDef.code) {
    throw new Error('Inline step missing code')
  }
  
  return await executeInlineCode(stepDef.code, input, context)
}

/**
 * Execute inline JavaScript code in VM sandbox
 */
async function executeInlineCode(
  code: string,
  input: any,
  context: StepExecutionContext
): Promise<any> {
  // Build a small CommonJS wrapper and normalize ESM `export function main`
  const script = `\n\
const exports = {};\n\
const module = { exports };\n\
${String(code)
  .replace(/export\\s+async\\s+function\\s+main/g, 'async function main')
  .replace(/export\\s+function\\s+main/g, 'function main')}\n\
if (typeof main === 'function') {\n\
  module.exports.main = main;\n\
}\n\
module.exports;\n`

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const vm = require('vm')
  const sandbox = {
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    ReferenceError,
    SyntaxError,
    fetch, // Add fetch for HTTP requests
  } as any
  
  const ctx = vm.createContext(sandbox)
  const exported = vm.runInContext(script, ctx, { timeout: 10000, displayErrors: true })
  
  if (typeof exported?.main !== 'function') {
    console.error('No main function found in inline code', exported)
    throw new Error('No main function found in inline code')
  }
  
  return await exported.main(input, context)
}

/**
 * Execute HTTP step
 */
async function executeHttpStep(
  stepDef: WorkflowStep,
  input: any
): Promise<any> {
  if (!stepDef.url) {
    throw new Error('HTTP step missing URL')
  }
  
  const res = await fetch(stepDef.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  
  if (!res.ok) {
    throw new Error(`HTTP request failed: ${res.status} ${res.statusText}`)
  }
  
  return await res.json()
}

/**
 * Execute memory step
 */
async function executeMemoryStep(
  stepDef: WorkflowStep,
  input: any,
  context: StepExecutionContext
): Promise<any> {
  if (!stepDef.operation || !stepDef.queryExpression) {
    throw new Error('Memory step missing operation or queryExpression')
  }
  
  const memory = new Mem0Memory()
  const { userId } = context
  
  try {
    // Evaluate query expression with context
    const contextForEval = {
      workflowInput: context.workflowInput,
      stepOutputs: context.stepOutputs,
      input
    }
    
    // eslint-disable-next-line no-new-func
    const fn = new Function('context', `return (${stepDef.queryExpression});`)
    const query = fn(contextForEval)
    
    if (stepDef.operation === 'search') {
      const results = await memory.search(query, { userId })
      return {
        operation: 'search',
        query,
        results: results.map((r: any) => ({
          id: r.id,
          content: r.content
        }))
      }
    } else if (stepDef.operation === 'add') {
      await memory.add([{ role: 'user', content: query }], { userId })
      return {
        operation: 'add',
        content: query,
        success: true
      }
    } else {
      throw new Error(`Unsupported memory operation: ${stepDef.operation}`)
    }
  } catch (error: any) {
    console.error('Memory step execution failed:', error)
    throw new Error(`Memory operation failed: ${error.message}`)
  }
}
