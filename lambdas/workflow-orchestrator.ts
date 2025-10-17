import { Lambda } from "aws-sdk";
import { S3 } from "aws-sdk";

const lambda = new Lambda({ region: process.env.AWS_REGION });
const s3 = new S3();

export const main = async (event: any) => {
  console.log("Workflow Orchestrator event", event);
  const { runId, owner } = event;
  
  // Load run data from S3
  const bucket = process.env.TOOLS_BUCKET!;
  const runKey = `runs/${runId}.json`;
  let runData;
  try {
    const runResp = await s3.getObject({ Bucket: bucket, Key: runKey }).promise();
    runData = JSON.parse(runResp.Body!.toString());
  } catch (e) {
    return { error: "Run not found" };
  }
  
  if (runData.status === "completed" || runData.status === "failed" || runData.status === "cancelled") {
    return { ok: true };
  }

  // Load workflow definition from S3
  const workflowKey = `workflows/${runData.workflowId}.json`;
  let workflow;
  try {
    const workflowResp = await s3.getObject({ Bucket: bucket, Key: workflowKey }).promise();
    workflow = JSON.parse(workflowResp.Body!.toString());
  } catch (e) {
    return { error: "Workflow not found" };
  }
  
  const definition = workflow.definition as any;

  // Build stepOutputs map from existing steps
  const stepOutputs: Record<string, any> = {};
  (runData.steps || []).forEach((s: any) => {
    if (s.status === "completed") stepOutputs[s.stepId] = s.output;
  });

  // Find runnable nodes: nodes whose deps are satisfied and not yet completed/queued
  const nodes: any[] = definition.nodes || [];
  const edges: any[] = definition.edges || [];
  const stepsById = new Map(nodes.map((n: any) => [n.id, n]));

  const existingStepIds = new Set((runData.steps || []).map((s: any) => s.stepId));
  const completedStepIds = new Set((runData.steps || []).filter((s: any) => s.status === "completed").map((s: any) => s.stepId));
  const runningOrQueued = new Set((runData.steps || []).filter((s: any) => s.status === "running" || s.status === "queued").map((s: any) => s.stepId));

  console.log("existingStepIds", existingStepIds);
  console.log("completedStepIds", completedStepIds);
  console.log("runningOrQueued", runningOrQueued);

  const upstreams = new Map<string, string[]>(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of edges) {
    const arr = upstreams.get(e.target) as string[];
    arr.push(e.source);
  }

  const runnable: any[] = [];
  for (const n of nodes) {
    if (completedStepIds.has(n.id) || runningOrQueued.has(n.id)) continue;
    const ups = upstreams.get(n.id) || [];
    const allUpsDone = ups.every((u) => completedStepIds.has(u));
    if (!allUpsDone) continue;
    // Condition check if edge has condition on any incoming edge
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
    // Terminal? if all nodes completed, mark run completed
    const allDone = nodes.length > 0 && nodes.every((n) => completedStepIds.has(n.id));
    if (allDone) {
      // Update run status in S3
      runData.status = "completed";
      runData.output = stepOutputs;
      runData.endedAt = new Date().toISOString();
      await s3.putObject({
        Bucket: bucket,
        Key: runKey,
        Body: JSON.stringify(runData)
      }).promise();
      return { ok: true };
    }
    // else waiting for running steps
    runData.status = "running";
    await s3.putObject({
      Bucket: bucket,
      Key: runKey,
      Body: JSON.stringify(runData)
    }).promise();
    return { ok: true };
  }

  // Mark new steps queued and invoke step runner for each
  const stepRunnerArn = process.env.WORKFLOW_STEP_RUNNER_ARN!;
  const now = new Date();
  
  // Create new step records
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

  // Update run data with new steps
  runData.steps = [...(runData.steps || []), ...newSteps];
  runData.status = "running";
  runData.startedAt = runData.startedAt || now.toISOString();
  
  await s3.putObject({
    Bucket: bucket,
    Key: runKey,
    Body: JSON.stringify(runData)
  }).promise();

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

  return { ok: true };
};


