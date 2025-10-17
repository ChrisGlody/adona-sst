import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { createOrUpdateWorkflow } from "@/lib/db/queries";
import { S3 } from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
// orchestrator is only used by the run route

const s3 = new S3();

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, name, description, definition } = body;
    if (!name || !definition) {
      return NextResponse.json({ error: "Missing name or definition" }, { status: 400 });
    }

    const wfId = id || uuidv4();
    const bucketName = process.env.TOOLS_BUCKET_NAME!;

    // Store workflow definition in S3 (like tools do)
    await s3.putObject({
      Bucket: bucketName,
      Key: `workflows/${wfId}.json`,
      Body: JSON.stringify({ id: wfId, name, description, definition, owner: user.sub, createdAt: new Date() }),
    }).promise();

    console.log("===> Workflow definition", definition);

    // Store inline code snippets in S3 if any
    for (const node of definition.nodes || []) {
      console.log("===> Node", node);
      if (node.type === "inline" && node.code) {
        console.log("===> Node code", node.code);
        await s3.putObject({
          Bucket: bucketName,
          Key: `workflow-code/${wfId}_${node.id}.js`,
          Body: node.code,
        }).promise();
        // Update node to reference S3 location
        node.implRef = `s3://${bucketName}/workflow-code/${wfId}_${node.id}.js`;
        delete node.code; // Remove inline code from definition
      }
    }

    // Update S3 with cleaned definition
    await s3.putObject({
      Bucket: bucketName,
      Key: `workflows/${wfId}.json`,
      Body: JSON.stringify({ id: wfId, name, description, definition, owner: user.sub, createdAt: new Date() }),
    }).promise();

    // Also store in DB for API queries
    await createOrUpdateWorkflow({ id: wfId, owner: user.sub, name, description, definition });
    
    return NextResponse.json({ ok: true, id: wfId });
  } catch (e: any) {
    console.error("Error saving workflow:", e);
    return NextResponse.json({ error: e?.message || "Failed to save workflow" }, { status: 500 });
  }
}


