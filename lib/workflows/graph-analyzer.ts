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

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  condition?: string
}

export interface WorkflowDefinition {
  nodes: WorkflowStep[]
  edges: WorkflowEdge[]
}

export interface CompletedStep {
  stepId: string
  output: any
}

export interface ExecutableStep {
  stepId: string
  name: string
  description?: string
  type: string
  inputSchema?: any
}

/**
 * Analyzes workflow graph to determine which steps are ready to execute
 * based on completed steps and dependencies
 */
export function getNextExecutableSteps(
  workflow: WorkflowDefinition,
  completedSteps: CompletedStep[],
  stepOutputs: Record<string, any> = {},
  workflowInput: any = {}
): ExecutableStep[] {
  const { nodes, edges } = workflow
  
  // Build dependency map
  const dependencies = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  
  // Initialize maps
  nodes.forEach(node => {
    dependencies.set(node.id, [])
    dependents.set(node.id, [])
  })
  
  // Build dependency relationships
  edges.forEach(edge => {
    const deps = dependencies.get(edge.target) || []
    deps.push(edge.source)
    dependencies.set(edge.target, deps)
    
    const depsOfSource = dependents.get(edge.source) || []
    depsOfSource.push(edge.target)
    dependents.set(edge.source, depsOfSource)
  })
  
  // Track completed step IDs
  const completedStepIds = new Set(completedSteps.map(s => s.stepId))
  
  // Find executable steps
  const executableSteps: ExecutableStep[] = []
  
  for (const node of nodes) {
    // Skip if already completed
    if (completedStepIds.has(node.id)) {
      continue
    }
    
    // Check if all dependencies are satisfied
    const nodeDeps = dependencies.get(node.id) || []
    const allDepsCompleted = nodeDeps.every(depId => completedStepIds.has(depId))
    
    if (!allDepsCompleted) {
      continue
    }
    
    // Check conditional edges
    const incomingEdges = edges.filter(e => e.target === node.id)
    let canExecute = true
    
    for (const edge of incomingEdges) {
      if (edge.condition) {
        try {
          // Evaluate condition with context
          const context = {
            workflowInput,
            stepOutputs
          }
          
          // eslint-disable-next-line no-new-func
          const fn = new Function('context', `return (${edge.condition});`)
          const conditionResult = fn(context)
          
          if (!conditionResult) {
            canExecute = false
            break
          }
        } catch (error) {
          console.warn(`Failed to evaluate condition for edge ${edge.id}:`, error)
          canExecute = false
          break
        }
      }
    }
    
    if (canExecute) {
      executableSteps.push({
        stepId: node.id,
        name: node.name,
        description: node.description,
        type: node.type,
        inputSchema: node.inputSchema
      })
    }
  }
  
  return executableSteps
}

/**
 * Checks if workflow is complete based on completed steps
 */
export function isWorkflowComplete(
  workflow: WorkflowDefinition,
  completedSteps: CompletedStep[]
): boolean {
  const { nodes } = workflow
  const completedStepIds = new Set(completedSteps.map(s => s.stepId))
  
  // Workflow is complete if all nodes are completed
  return nodes.every(node => completedStepIds.has(node.id))
}

/**
 * Gets workflow execution order (topological sort)
 */
export function getWorkflowExecutionOrder(workflow: WorkflowDefinition): string[] {
  const { nodes, edges } = workflow
  
  // Build dependency map
  const dependencies = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  
  // Initialize
  nodes.forEach(node => {
    dependencies.set(node.id, [])
    inDegree.set(node.id, 0)
  })
  
  // Build dependencies and calculate in-degrees
  edges.forEach(edge => {
    const deps = dependencies.get(edge.target) || []
    deps.push(edge.source)
    dependencies.set(edge.target, deps)
    
    const currentInDegree = inDegree.get(edge.target) || 0
    inDegree.set(edge.target, currentInDegree + 1)
  })
  
  // Topological sort using Kahn's algorithm
  const queue: string[] = []
  const result: string[] = []
  
  // Add nodes with no dependencies
  nodes.forEach(node => {
    if ((inDegree.get(node.id) || 0) === 0) {
      queue.push(node.id)
    }
  })
  
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    
    // Find nodes that depend on current node
    const dependents = edges
      .filter(edge => edge.source === current)
      .map(edge => edge.target)
    
    dependents.forEach(dependent => {
      const currentInDegree = inDegree.get(dependent) || 0
      inDegree.set(dependent, currentInDegree - 1)
      
      if (inDegree.get(dependent) === 0) {
        queue.push(dependent)
      }
    })
  }
  
  return result
}
