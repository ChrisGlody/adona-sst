import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { S3 } from "aws-sdk";

const s3 = new S3();

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const { runId } = await params;
  const bucketName = process.env.TOOLS_BUCKET_NAME!;
  
  try {
    const runResp = await s3.getObject({ Bucket: bucketName, Key: `runs/${runId}.json` }).promise();
    const runData = JSON.parse(runResp.Body!.toString());
    
    // Check ownership
    if (runData.owner !== user.sub) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    
    return NextResponse.json({ run: runData, steps: runData.steps || [] });
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}


