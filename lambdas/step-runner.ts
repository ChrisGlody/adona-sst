import Ajv from "ajv";
import { S3 } from "aws-sdk";
import { Lambda } from "aws-sdk";
import { main as runToolInline } from "./tool-runner";

const ajv = new Ajv({ strict: false });
const s3 = new S3();
const lambda = new Lambda({ region: process.env.AWS_REGION });

export const main = async (event: any) => {
  const { runId, owner, stepId } = event;
  
  // Load run data from S3
  const bucket = process.env.TOOLS_BUCKET_NAME || process.env.TOOLS_BUCKET;
  if (!bucket) throw new Error("TOOLS_BUCKET_NAME not configured");
  const runKey = `runs/${runId}.json`;
  let runData;
  try {
    const runResp = await s3.getObject({ Bucket: bucket, Key: runKey }).promise();
    runData = JSON.parse(runResp.Body!.toString());
  } catch (e) {
    return { error: "Run not found" };
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

  const node = (definition.nodes || []).find((n: any) => n.id === stepId);
  if (!node) return { error: "Step not found" };

  const stepKey = `${runId}_${stepId}`;
  const stepRow = (runData.steps || []).find((s: any) => s.id === stepKey) || { id: stepKey };

  const context = {
    workflowInput: runData.input,
    stepOutputs: Object.fromEntries((runData.steps || []).filter((s: any) => s.status === "completed").map((s: any) => [s.stepId, s.output])),
  };

  // Build input via mapping
  let input: any = {};
  if (node.inputMapping) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("context", `return (${node.inputMapping});`);
      input = await fn(context);
    } catch (e) {
      // Update step status in S3
      const stepUpdate = { id: stepKey, stepId, name: node.name || stepId, type: node.type || "tool", status: "failed", error: { message: "Invalid inputMapping" }, endedAt: new Date().toISOString() };
      runData.steps = (runData.steps || []).map((s: any) => s.id === stepKey ? stepUpdate : s);
      await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();
      return { error: "Invalid input mapping" };
    }
  }

  // Update step status to running
  const runningUpdate = { id: stepKey, stepId, name: node.name || stepId, type: node.type || "tool", status: "running", startedAt: new Date().toISOString() };
  runData.steps = (runData.steps || []).map((s: any) => s.id === stepKey ? runningUpdate : s);
  await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();

  try {
    let result: any;
    if (node.type === "tool") {
      // node.toolId should exist
      result = await runToolInline({ toolId: node.toolId, input });
      if (result && result.result !== undefined) result = result.result;
    } else if (node.type === "inline") {
      // Support inline code directly in definition or by S3 implRef
      let code: string | null = node.code || null;
      if (!code && node.implRef) {
        const url = node.implRef as string; // s3://bucket/key
        const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(url || "");
        if (!match) throw new Error("Invalid implRef");
        const [, bkt, key] = match;
        const obj = await s3.getObject({ Bucket: bkt, Key: key }).promise();
        code = obj.Body!.toString();
      }
      if (!code) throw new Error("No inline code provided");

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
  module.exports;\n`;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vm = require("vm");
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
      } as any;
      const ctx = vm.createContext(sandbox);
      const exported = vm.runInContext(script, ctx, { timeout: 2000, displayErrors: true });
      if (typeof exported?.main !== "function") throw new Error("No main function");
      result = await exported.main(input, context);
    } else if (node.type === "http") {
      const res = await fetch(node.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      result = await res.json();
    } else {
      throw new Error("Unsupported step type");
    }

    // Optional output schema validation
    if (node.outputSchema) {
      const validate = ajv.compile(node.outputSchema);
      if (!validate(result)) throw new Error("Output schema validation failed");
    }

    // Update step status to completed
    const completedUpdate = { id: stepKey, stepId, name: node.name || stepId, type: node.type || "tool", status: "completed", output: result, endedAt: new Date().toISOString() };
    runData.steps = (runData.steps || []).map((s: any) => s.id === stepKey ? completedUpdate : s);
    await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();

  } catch (e: any) {
    // Update step status to failed
    const failedUpdate = { id: stepKey, stepId, name: node.name || stepId, type: node.type || "tool", status: "failed", error: { message: e?.message || "Step error" }, endedAt: new Date().toISOString() };
    runData.steps = (runData.steps || []).map((s: any) => s.id === stepKey ? failedUpdate : s);
    await s3.putObject({ Bucket: bucket, Key: runKey, Body: JSON.stringify(runData) }).promise();
  }

  // Trigger orchestrator to continue
  // Notify the API orchestrator route to continue the run.
  // If an internal URL is configured, call it; otherwise fallback to legacy lambda if present.
  try {
    const apiBase = process.env.INTERNAL_API_BASE_URL;
    console.log("====> apibase", apiBase)
    if (apiBase) {
      await fetch(`${apiBase}/api/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: runData.workflowId, input: runData.input, resumeRunId: runId, owner }),
      });
    } else if (process.env.WORKFLOW_ORCHESTRATOR_ARN) {
      const orchestratorArn = process.env.WORKFLOW_ORCHESTRATOR_ARN!;
      await lambda
        .invoke({ FunctionName: orchestratorArn, InvocationType: "Event", Payload: JSON.stringify({ runId, owner }) })
        .promise();
    }
  } catch {
    // swallow errors; orchestration will be re-triggered by polling or manual
  }

  return { ok: true };
};


