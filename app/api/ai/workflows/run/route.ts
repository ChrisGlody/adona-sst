import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getWorkflowWithSteps, createWorkflowRun } from "@/lib/db/queries";
import { getNextExecutableSteps } from "@/lib/workflows/graph-analyzer";

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { workflowId, input } = body;
    
    if (!workflowId) {
      return NextResponse.json({ 
        error: "Missing required field: workflowId" 
      }, { status: 400 });
    }

    // Get workflow definition
    const workflow = await getWorkflowWithSteps(workflowId, user.sub);
    if (!workflow) {
      return NextResponse.json({ 
        error: "Workflow not found" 
      }, { status: 404 });
    }

    // Verify it's an AI workflow (executionEnv = 'db')
    if (workflow.executionEnv !== 'db') {
      return NextResponse.json({ 
        error: "This endpoint only supports AI workflows (executionEnv = 'db')" 
      }, { status: 400 });
    }

    // Validate input against workflow input schema if provided
    if (workflow.inputSchema) {
      // Basic validation - could be enhanced with Ajv
      if ((workflow.inputSchema as any).type === 'object' && typeof input !== 'object') {
        return NextResponse.json({ 
          error: "Input does not match workflow input schema" 
        }, { status: 400 });
      }
    }

    // Create workflow run
    const runId = await createWorkflowRun({
      workflowId,
      owner: user.sub,
      input: input || {}
    });

    // Analyze workflow to find first executable steps
    const nextSteps = getNextExecutableSteps(
      workflow.definition as any,
      [], // No completed steps yet
      {}  // No step outputs yet
    );

    // Transform steps for API response
    const executableSteps = nextSteps.map(step => ({
      stepId: step.stepId,
      name: step.name,
      description: step.description,
      type: step.type,
      inputSchema: step.inputSchema
    }));

    return NextResponse.json({ 
      ok: true, 
      runId,
      workflowId,
      nextSteps: executableSteps,
      isComplete: executableSteps.length === 0,
      message: "Workflow run initialized successfully"
    });
    
  } catch (error: any) {
    console.error("Error initializing AI workflow run:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to initialize workflow run" 
    }, { status: 500 });
  }
}
