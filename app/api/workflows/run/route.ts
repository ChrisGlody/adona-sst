import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { createRun, getWorkflow, updateRunStatus } from "@/lib/db/queries";
import { S3 } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { orchestrateRun } from "@/lib/workflows/orchestrator";

const s3 = new S3();

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
  const { workflowId, input, resumeRunId } = await req.json();
  const wfRows = await getWorkflow(workflowId, user.sub);
  if (wfRows.length === 0) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  const runId = resumeRunId || uuidv4();
  const bucketName = process.env.TOOLS_BUCKET_NAME!;

  if (!resumeRunId) {
    // Create run in DB and S3 only for new runs
    await createRun({ workflowId, owner: user.sub, input });
    await updateRunStatus({ id: runId, status: "queued" });

    const runData = {
      id: runId,
      workflowId,
      owner: user.sub,
      status: "queued",
      input,
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await s3.putObject({
      Bucket: bucketName,
      Key: `runs/${runId}.json`,
      Body: JSON.stringify(runData)
    }).promise();
  }

  const payload = await orchestrateRun({ runId, owner: user.sub });
  if ((payload as any).error) {
    return NextResponse.json({ error: (payload as any).error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, runId });
  } catch (e) {
    console.error("Error running workflow:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


