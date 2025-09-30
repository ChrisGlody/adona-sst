import { S3 } from "aws-sdk";
import Ajv from "ajv";
import { VM } from "vm2"; // vm2 recommended over raw vm

const s3 = new S3();
const ajv = new Ajv({ strict: false });

export const handler = async (event: any) => {
  // event: { toolId, input }
  const { toolId, input } = event;
  // load tool metadata from Postgres or S3. For simplicity assume S3 JSON at key `tools/{toolId}.json`
  const bucket = process.env.TOOLS_BUCKET!;
  const key = `tools/${toolId}.json`;

  const metaResp = await s3.getObject({ Bucket: bucket, Key: key }).promise();
  const meta = JSON.parse(metaResp.Body!.toString());

  // validate input
  const validate = ajv.compile(meta.inputSchema);
  if (!validate(input)) {
    return { error: "Invalid input", details: validate.errors };
  }

  // load implementation (meta.implementation contains either code or an s3 key)
  const implKey = meta.implementation; // e.g. 'code/{toolId}.js'
  const implResp = await s3.getObject({ Bucket: bucket, Key: implKey }).promise();
  const code = implResp.Body!.toString();

  // Use vm2 for sandboxed execution
  const vm = new VM({
    timeout: 2000, // ms
    sandbox: {}, // no access to process, network, etc.
  });

  // Expect code exports a function named `main`
  const script = `
    const exports = {};
    ${code}
    exports;
  `;
  const exported = vm.run(script);
  if (typeof exported.main !== "function") {
    return { error: "Tool implementation must export async function main(input)" };
  }

  // run tool
  const result = await exported.main(input);
  // optionally validate output with meta.output_schema
  return { result };
};
