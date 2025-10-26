import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth.server";
import { getUserWorkflows } from "@/lib/db/queries";

export async function GET(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get AI workflows (executionEnv = 'db')
    const workflows = await getUserWorkflows(user.sub, 'db');
    
    // Transform for API response
    const workflowList = workflows.map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      inputSchema: wf.inputSchema,
      outputSchema: wf.outputSchema,
      definition: wf.definition,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt
    }));

    return NextResponse.json({ 
      ok: true, 
      workflows: workflowList,
      count: workflowList.length
    });
    
  } catch (error: any) {
    console.error("Error listing AI workflows:", error);
    return NextResponse.json({ 
      error: error?.message || "Failed to list AI workflows" 
    }, { status: 500 });
  }
}
