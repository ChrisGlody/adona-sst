import { Lambda } from "aws-sdk";
import { S3 } from "aws-sdk";

const lambda = new Lambda({ region: process.env.AWS_REGION });
const s3 = new S3();

export async function orchestrateRun(params: { runId: string; owner: string }) {
  const { runId, owner } = params;

  const bucket = process.env.TOOLS_BUCKET_NAME || process.env.TOOLS_BUCKET;
  if (!bucket) throw new Error("TOOLS_BUCKET_NAME not configured");

  const runKey = `runs/${runId}.json`;
  let runData: any;
  try {
    const runResp = await s3.getObject({ Bucket: bucket, Key: runKey }).promise();
    runData = JSON.parse(runResp.Body!.toString());
  } catch (e) {
    return { error: "Run not found" } as const;
  }

  if (runData.status === "completed" || runData.status === "failed" || runData.status === "cancelled") {
    return { ok: true } as const;
  }

  const workflowKey = `workflows/${runData.workflowId}.json`;
  let workflow: any;
  try {
    const workflowResp = await s3.getObject({ Bucket: bucket, Key: workflowKey }).promise();
    workflow = JSON.parse(workflowResp.Body!.toString());
  } catch (e) {
    return { error: "Workflow not found" } as const;
  }

  const definition = workflow.definition as any;

  const stepOutputs: Record<string, any> = {};
  (runData.steps || []).forEach((s: any) => {
    if (s.status === "completed") stepOutputs[s.stepId] = s.output;
  });

  const nodes: any[] = definition.nodes || [];
  const edges: any[] = definition.edges || [];

  const existingStepIds = new Set((runData.steps || []).map((s: any) => s.stepId));
  const completedStepIds = new Set((runData.steps || []).filter((s: any) => s.status === "completed").map((s: any) => s.stepId));
  const runningOrQueued = new Set((runData.steps || []).filter((s: any) => s.status === "running" || s.status === "queued").map((s: any) => s.stepId));

  const upstreams = new Map<string, string[]>(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of edges) {
    const arr = upstreams.get(e.target) as string[];
    arr.push(e.source);
  }

  console.log("nodes ----=>", nodes)
  const runnable: any[] = [];
  for (const n of nodes) {
    if (completedStepIds.has(n.id) || runningOrQueued.has(n.id)) continue;
    const ups = upstreams.get(n.id) || [];
    const allUpsDone = ups.every((u) => completedStepIds.has(u));
    if (!allUpsDone) continue;

    const incoming = edges.filter((e) => e.target === n.id);
    let allowed = true;
    for (const e of incoming) {
      if (e.condition) {
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function("context", `return (${e.condition});`);
          const ok = !!fn({ workflowInput: runData.input, stepOutputs });
          if (!ok) { allowed = false; break; }
        } catch {
          allowed = false; break;
        }
      }
    }
    if (allowed) runnable.push(n);
  }

  if (runnable.length === 0) {
    const allDone = nodes.length > 0 && nodes.every((n) => completedStepIds.has(n.id));
    if (allDone) {
      runData.status = "completed";
      runData.output = stepOutputs;
      runData.endedAt = new Date().toISOString();
      await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();
      return { ok: true } as const;
    }
    runData.status = "running";
    await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();
    return { ok: true } as const;
  }

  const stepRunnerArn = process.env.WORKFLOW_STEP_RUNNER_ARN!;
  const now = new Date();

  const newSteps = runnable.map((n: any) => ({
    id: `${runId}_${n.id}`,
    stepId: n.id,
    name: n.name || n.id,
    type: n.type || "tool",
    status: "queued",
    attempt: 0,
    maxAttempts: n.retry?.maxAttempts ?? 1,
    deps: (upstreams.get(n.id) || []) as any,
    startedAt: null,
    endedAt: null,
  }));

  runData.steps = [...(runData.steps || []), ...newSteps];
  runData.status = "running";
  runData.startedAt = runData.startedAt || now.toISOString();
  console.log("===> running data", runData)
  await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();

  await Promise.all(
    runnable.map((n: any) =>
      lambda
        .invoke({
          FunctionName: stepRunnerArn,
          InvocationType: "Event",
          Payload: JSON.stringify({ runId, owner, stepId: n.id }),
        })
        .promise()
    )
  );

  return { ok: true } as const;
}


