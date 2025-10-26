import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getWorkflowWithSteps, getRunStatus, createOrUpdateStepExecution, updateRunStatus } from "@/lib/db/queries";
import { getNextExecutableSteps, isWorkflowComplete } from "@/lib/workflows/graph-analyzer";
import { executeStep } from "@/lib/workflows/ai-step-executor";

export async function POST(
  req: Request,
  { params }: { params: { runId: string; stepId: string } }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { runId, stepId } = await params;
    const body = await req.json();
    const { input } = body;
    
    if (!runId || !stepId) {
      return NextResponse.json({ 
        error: "Missing required parameters: runId and stepId" 
      }, { status: 400 });
    }

    // Get run status to verify ownership and get workflow info
    const runStatus = await getRunStatus(runId, user.sub);
    if (!runStatus) {
      return NextResponse.json({ 
        error: "Workflow run not found" 
      }, { status: 404 });
    }

    const { run, steps } = runStatus;

    // Get workflow definition
    const workflow = await getWorkflowWithSteps(run.workflowId, user.sub);
    if (!workflow) {
      return NextResponse.json({ 
        error: "Workflow not found" 
      }, { status: 404 });
    }

    console.log("workflow ====>", workflow);

    // Find the step definition
    const stepDef = (workflow.definition as any).nodes.find((n: any) => n.id === stepId);
    if (!stepDef) {
      return NextResponse.json({ 
        error: "Step not found in workflow definition" 
      }, { status: 404 });
    }

    // Check if step is already completed
    const existingStep = steps.find((s: any) => s.stepId === stepId);
    if (existingStep && existingStep.status === 'completed') {
      return NextResponse.json({ 
        error: "Step already completed" 
      }, { status: 400 });
    }

    // Build execution context
    const stepOutputs: Record<string, any> = {};
    steps.forEach((s: any) => {
      if (s.status === 'completed' && s.output) {
        stepOutputs[s.stepId] = s.output;
      }
    });

    const context = {
      workflowInput: run.input,
      stepOutputs,
      userId: user.sub
    };

    // Update step status to running (creates if doesn't exist)
    await createOrUpdateStepExecution({
      runId,
      stepId,
      name: stepDef.name || stepId,
      type: stepDef.type || "tool",
      status: 'running',
      startedAt: new Date()
    });

    try {
      // Execute the step
      const output = await executeStep(stepDef, input || {}, context);

      // Update step status to completed
      await createOrUpdateStepExecution({
        runId,
        stepId,
        name: stepDef.name || stepId,
        type: stepDef.type || "tool",
        status: 'completed',
        output,
        endedAt: new Date()
      });

      console.log("updated step ====>", output);

        // Get updated steps from database
        const updatedRunStatus = await getRunStatus(runId, user.sub);
        const updatedSteps = updatedRunStatus?.steps || [];

      // Update step outputs for next analysis
      stepOutputs[stepId] = output;

      // Find next executable steps using updated database state
      const completedSteps = updatedSteps
        .filter((s: any) => s.status === 'completed')
        .map(s => ({ stepId: s.stepId, output: s.output }));

      const nextSteps = getNextExecutableSteps(
        workflow.definition as any,
        completedSteps,
        stepOutputs,
        run.input
      );

      console.log("next steps ====>", nextSteps);

      // Check if workflow is complete
      const workflowComplete = isWorkflowComplete(
        workflow.definition as any,
        completedSteps
      );

      // Update run status if workflow is complete
      if (workflowComplete) {
        await updateRunStatus({
          id: runId,
          status: 'completed',
          output: stepOutputs,
          endedAt: new Date()
        });
      }

      // Transform next steps for API response
      const executableSteps = nextSteps.map(step => ({
        stepId: step.stepId,
        name: step.name,
        description: step.description,
        type: step.type,
        inputSchema: step.inputSchema
      }));

      return NextResponse.json({ 
        ok: true, 
        output,
        nextSteps: executableSteps,
        isComplete: workflowComplete,
        message: "Step executed successfully"
      });

    } catch (stepError: any) {
      // Update step status to failed
      await createOrUpdateStepExecution({
        runId,
        stepId,
        name: stepDef.name || stepId,
        type: stepDef.type || "tool",
        status: 'failed',
        error: { message: stepError.message },
        endedAt: new Date()
      });

      return NextResponse.json({ 
        error: `Step execution failed: ${stepError.message}` 
      }, { status: 500 });
    }
    
  } catch (error: any) {
    console.error("Error executing AI workflow step:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to execute workflow step" 
    }, { status: 500 });
  }
}
