import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tools } from "@/lib/db/schema";

export async function GET() {
  try {
    const allTools = await db.select().from(tools);
    return NextResponse.json({ tools: allTools });
  } catch (error) {
    console.error("Error fetching tools:", error);
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 });
  }
}
