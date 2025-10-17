import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { listWorkflows } from "@/lib/db/queries";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listWorkflows(user.sub);
  return NextResponse.json({ workflows: rows });
}





