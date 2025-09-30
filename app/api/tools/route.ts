// app/api/tools/register/route.ts (Next.js App Router)
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { S3 } from "aws-sdk";

export async function POST(req: Request) {
  //const body = await req.json();
  //const { name, description, input_schema, output_schema, code /*string*/, type } = body;

  const tool = {
    "name": "add_numbers",
    "description": "Adds two numbers together and returns the sum.",
    "type": "s3-inline", 
    "input_schema": {
      "type": "object",
      "properties": {
        "a": { "type": "number" },
        "b": { "type": "number" }
      },
      "required": ["a", "b"]
    },
    "output_schema": {
      "type": "object",
      "properties": {
        "result": { "type": "number" }
      }
    },
    "code": "export async function main({ a, b }) { return { result: a + b }; }"
  }

  const { name, description, input_schema, output_schema, code, type } = tool;
  
  const id = uuidv4();
  const bucketName = process.env.TOOLS_BUCKET_NAME!;
  const s3 = new S3();

  // upload metadata + code to S3
  await s3
    .putObject({
      Bucket: bucketName,
      Key: `tools/${id}.json`,
      Body: JSON.stringify({ id, name, description, input_schema, output_schema, implementation: `code/${id}.js`, type }),
    })
    .promise();

  await s3
    .putObject({
      Bucket: bucketName,
      Key: `code/${id}.js`,
      Body: code, // user-provided JS snippet that exports async function main(input)
    })
    .promise();

  // persist minimal record in Postgres (drizzle)
  const now = new Date().toISOString();


  return NextResponse.json({ ok: true, toolId: id });
}
