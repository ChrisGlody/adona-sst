// app/api/tools/register/route.ts (Next.js App Router)
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { S3 } from "aws-sdk";
import { db } from "@/lib/db";
import { tools } from "@/lib/db/schema";
import { getAuthUser } from "@/lib/auth.server";

export async function POST(req: Request) { 
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, description, inputSchema, outputSchema, code, type } = body;
  
  const id = uuidv4();
  const bucketName = process.env.TOOLS_BUCKET_NAME!;
  const s3 = new S3();

  // upload metadata + code to S3
  await s3
    .putObject({
      Bucket: bucketName,
      Key: `tools/${id}.json`,
      Body: JSON.stringify({ id, name, description, inputSchema, outputSchema, implementation: `code/${id}.js`, type }),
    })
    .promise();

  await s3
    .putObject({
      Bucket: bucketName,
      Key: `code/${id}.js`,
      Body: code, // user-provided JS snippet that exports async function main(input)
    })
    .promise();

  await db.insert(tools).values({
    id: id,
    owner: user.sub,
    name,
    description,
    type,
    inputSchema,
    outputSchema,
    implementation: `s3://${bucketName}/code/${id}.js`,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, toolId: id });
}
