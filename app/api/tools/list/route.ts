import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getUserTools } from "@/lib/db/queries";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tools = await getUserTools(user.sub);
    return NextResponse.json({ tools });
  } catch (error) {
    console.error("Error fetching tools:", error);
    return NextResponse.json({ error: "Failed to fetch tools" }, { status: 500 });
  }
}
