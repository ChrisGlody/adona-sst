import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getWorkflow } from "@/lib/db/queries";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await getWorkflow(id, user.sub);
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}


