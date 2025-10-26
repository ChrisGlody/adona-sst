import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getRunStatus } from "@/lib/db/queries";

export async function GET(
  req: Request,
  { params }: { params: { runId: string } }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { runId } = await params;
    
    if (!runId) {
      return NextResponse.json({ 
        error: "Missing required parameter: runId" 
      }, { status: 400 });
    }

    // Get run status
    const runStatus = await getRunStatus(runId, user.sub);
    if (!runStatus) {
      return NextResponse.json({ 
        error: "Workflow run not found" 
      }, { status: 404 });
    }

    const { run, steps } = runStatus;

    // Transform steps for API response
    const stepStatuses = steps.map((step: any) => ({
      id: step.id,
      stepId: step.stepId,
      name: step.name,
      type: step.type,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      startedAt: step.startedAt,
      endedAt: step.endedAt,
      logs: step.logs
    }));

    // Calculate summary statistics
    const completedSteps = steps.filter((s: any) => s.status === 'completed');
    const failedSteps = steps.filter((s: any) => s.status === 'failed');
    const runningSteps = steps.filter((s: any) => s.status === 'running');
    const queuedSteps = steps.filter((s: any) => s.status === 'queued');

    return NextResponse.json({ 
      ok: true, 
      run: {
        id: run.id,
        workflowId: run.workflowId,
        status: run.status,
        input: run.input,
        output: run.output,
        error: run.error,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        startedAt: run.startedAt,
        endedAt: run.endedAt
      },
      steps: stepStatuses,
      summary: {
        total: steps.length,
        completed: completedSteps.length,
        failed: failedSteps.length,
        running: runningSteps.length,
        queued: queuedSteps.length
      }
    });
    
  } catch (error: any) {
    console.error("Error getting AI workflow run status:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to get workflow run status" 
    }, { status: 500 });
  }
}
