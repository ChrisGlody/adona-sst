import { Lambda } from "aws-sdk";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const lambda = new Lambda({ region: process.env.AWS_REGION });

export async function POST(req: Request) {
  const { toolId, input } = await req.json();
  const results = await db.select().from(tools).where(eq(tools.id, toolId)).limit(1);

  const tool = results[0];

  if (!tool) return NextResponse.json({ error: "Tool not found" }, { status: 404 });

  if (tool.type === "lambda" && tool.lambdaArn) {
    const resp = await lambda.invoke({
      FunctionName: tool.lambdaArn,
      Payload: JSON.stringify({ input }),
    }).promise();
    const payload = JSON.parse(Buffer.from(resp.Payload as any).toString());
    return NextResponse.json({ result: payload });
  }

  // Use runner lambda for s3-inline type
  if (tool.type === "s3-inline") {
    // invoke your generic runner
    const runnerArn = process.env.TOOL_RUNNER_ARN!;
    const resp = await lambda.invoke({
      FunctionName: runnerArn,
      Payload: JSON.stringify({ toolId, input }),
    }).promise();
    const payload = JSON.parse(Buffer.from(resp.Payload as any).toString());
    return NextResponse.json({ result: payload });
  }

  if (tool.type === "http") {
    const res = await fetch(tool.implementation!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await res.json();
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: "Unsupported tool type" }, { status: 400 });
}
