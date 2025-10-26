import { db } from "./index"
import { chats, chatMessages, tools, workflows, workflowRuns, workflowRunSteps } from "./schema"
import { and, asc, desc, eq, inArray } from "drizzle-orm"
import { generateId } from "ai"
import type { ModelMessage } from "ai"

export async function createChat(userId: string): Promise<string> {
  const id = generateId()
  await db.insert(chats).values({ id, userId, title: null })
  return id
}

export async function getUserChats(userId: string) {
  return db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt))
}

export async function loadChat(chatId: string, userId: string): Promise<ModelMessage[]> {
  const own = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)

  if (own.length === 0) return []

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(asc(chatMessages.createdAt))

  const messages = rows.map((r) => ({
    role: r.role as "system" | "user" | "assistant",
    content: r.content as any,
  })) as unknown as ModelMessage[]

  return messages
}

function titleFromModelMessages(messages: ModelMessage[]): string | null {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser) return null
  const text =
    typeof firstUser.content === "string"
      ? firstUser.content
      : Array.isArray(firstUser.content)
      ? firstUser.content.map((p: any) => (p.type === "text" ? p.text : "")).join(" ")
      : ""
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, 60) : null
}

export async function saveChat({
  chatId,
  userId,
  messages,
}: {
  chatId: string
  userId: string
  messages: ModelMessage[]
}): Promise<void> {
  const exists = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)

  if (exists.length === 0) {
    await db.insert(chats).values({
      id: chatId,
      userId,
      title: titleFromModelMessages(messages),
    })
  }

  const nowTitle = titleFromModelMessages(messages)

  await db
    .update(chats)
    .set({ updatedAt: new Date(), ...(nowTitle ? { title: nowTitle } : {}) })
    .where(eq(chats.id, chatId))

  await db.delete(chatMessages).where(eq(chatMessages.chatId, chatId))

  const inserts = messages.map((m) => ({
    id: generateId(),
    chatId,
    role: m.role,
    content: m.content as any,
    createdAt: new Date(),
  }))

  if (inserts.length > 0) {
    await db.insert(chatMessages).values(inserts)
  }
}

export async function getUserTools(owner: string) {
  return db.select().from(tools).where(eq(tools.owner, owner))
}

export async function getUserTool(id: string, owner: string) {
  return db.select().from(tools).where(and(eq(tools.id, id), eq(tools.owner, owner)))
}

// Workflows
export async function createOrUpdateWorkflow({
  id,
  owner,
  name,
  description,
  definition,
}: {
  id?: string
  owner: string
  name: string
  description?: string | null
  definition: any
}) {
  const wfId = id ?? generateId()
  const row = {
    id: wfId,
    owner,
    name,
    description: description ?? null,
    definitionVersion: 1,
    definition,
    updatedAt: new Date(),
  } as any

  // upsert by id
  const existing = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.id, wfId)).limit(1)
  if (existing.length > 0) {
    await db.update(workflows).set(row).where(eq(workflows.id, wfId))
  } else {
    row.createdAt = new Date()
    await db.insert(workflows).values(row)
  }
  return wfId
}

export async function listWorkflows(owner: string) {
  return db.select().from(workflows).where(eq(workflows.owner, owner)).orderBy(desc(workflows.updatedAt))
}

export async function getWorkflow(id: string, owner: string) {
  return db.select().from(workflows).where(and(eq(workflows.id, id), eq(workflows.owner, owner)))
}

export async function createRun({ workflowId, owner, input }: { workflowId: string; owner: string; input: any }) {
  const id = generateId()
  await db.insert(workflowRuns).values({ id, workflowId, owner, status: "queued", input })
  return id
}

export async function updateRunStatus({
  id,
  status,
  output,
  error,
  startedAt,
  endedAt,
}: {
  id: string
  status?: "queued" | "running" | "completed" | "failed" | "cancelled"
  output?: any
  error?: any
  startedAt?: Date
  endedAt?: Date
}) {
  const patch: any = { updatedAt: new Date() }
  if (status) patch.status = status
  if (output !== undefined) patch.output = output
  if (error !== undefined) patch.error = error
  if (startedAt) patch.startedAt = startedAt
  if (endedAt) patch.endedAt = endedAt
  await db.update(workflowRuns).set(patch).where(eq(workflowRuns.id, id))
}

export async function getRun(id: string, owner: string) {
  const runs = await db.select().from(workflowRuns).where(and(eq(workflowRuns.id, id), eq(workflowRuns.owner, owner)))
  if (runs.length === 0) return null
  const steps = await db
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, id))
    .orderBy(asc(workflowRunSteps.startedAt))
  return { run: runs[0], steps }
}

export async function upsertRunSteps(
  runId: string,
  steps: Array<{
    id: string
    stepId: string
    name: string
    type: string
    status?: "queued" | "running" | "completed" | "failed" | "skipped"
    attempt?: number
    maxAttempts?: number
    input?: any
    output?: any
    error?: any
    deps?: string[]
    logs?: string
    startedAt?: Date | null
    endedAt?: Date | null
  }>
) {
  if (steps.length === 0) return
  const ids = steps.map((s) => s.id)
  const existing = await db
    .select({ id: workflowRunSteps.id })
    .from(workflowRunSteps)
    .where(inArray(workflowRunSteps.id, ids))
  const existingIds = new Set(existing.map((e) => e.id))

  const inserts = steps.filter((s) => !existingIds.has(s.id)).map((s) => ({ ...s, runId }))
  const updates = steps.filter((s) => existingIds.has(s.id))

  if (inserts.length > 0) await db.insert(workflowRunSteps).values(inserts as any)
  for (const u of updates) {
    await db.update(workflowRunSteps).set({ ...u }).where(eq(workflowRunSteps.id, u.id))
  }
}

// AI Workflow Functions
export async function createAIWorkflow({
  id,
  owner,
  name,
  description,
  inputSchema,
  outputSchema,
  definition,
}: {
  id?: string
  owner: string
  name: string
  description?: string | null
  inputSchema?: any
  outputSchema?: any
  definition: any
}) {
  const wfId = id ?? generateId()
  const row = {
    id: wfId,
    owner,
    name,
    description: description ?? null,
    definitionVersion: 1,
    definition,
    executionEnv: "db",
    inputSchema: inputSchema ?? null,
    outputSchema: outputSchema ?? null,
    updatedAt: new Date(),
  } as any

  // upsert by id
  const existing = await db.select({ id: workflows.id }).from(workflows).where(eq(workflows.id, wfId)).limit(1)
  if (existing.length > 0) {
    await db.update(workflows).set(row).where(eq(workflows.id, wfId))
  } else {
    row.createdAt = new Date()
    await db.insert(workflows).values(row)
  }
  return wfId
}

export async function getUserWorkflows(userId: string, executionEnv?: string) {
  const conditions = [eq(workflows.owner, userId)]
  if (executionEnv) {
    conditions.push(eq(workflows.executionEnv, executionEnv))
  }
  return db
    .select()
    .from(workflows)
    .where(and(...conditions))
    .orderBy(desc(workflows.updatedAt))
}

export async function getWorkflowWithSteps(workflowId: string, owner: string) {
  const workflowRows = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.owner, owner)))
  
  if (workflowRows.length === 0) return null
  
  return workflowRows[0]
}

export async function createWorkflowRun({ workflowId, owner, input }: { workflowId: string; owner: string; input: any }) {
  const id = generateId()
  await db.insert(workflowRuns).values({ 
    id, 
    workflowId, 
    owner, 
    status: "queued", 
    input,
    createdAt: new Date(),
    updatedAt: new Date()
  })
  return id
}

export async function updateStepExecution({
  runId,
  stepId,
  output,
  status,
  error,
  startedAt,
  endedAt,
}: {
  runId: string
  stepId: string
  output?: any
  status?: "queued" | "running" | "completed" | "failed" | "skipped"
  error?: any
  startedAt?: Date | null
  endedAt?: Date | null
}) {
  const patch: any = {}
  if (output !== undefined) patch.output = output
  if (status) patch.status = status
  if (error !== undefined) patch.error = error
  if (startedAt !== undefined) patch.startedAt = startedAt
  if (endedAt !== undefined) patch.endedAt = endedAt
  
  await db
    .update(workflowRunSteps)
    .set(patch)
    .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.stepId, stepId)))
}

export async function getRunStatus(runId: string, owner: string) {
  const runs = await db
    .select()
    .from(workflowRuns)
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.owner, owner)))
  
  if (runs.length === 0) return null
  
  const steps = await db
    .select()
    .from(workflowRunSteps)
    .where(eq(workflowRunSteps.runId, runId))
    .orderBy(asc(workflowRunSteps.startedAt))
  
  return { run: runs[0], steps }
}

export async function createOrUpdateStepExecution({
  runId,
  stepId,
  name,
  type,
  output,
  status,
  error,
  startedAt,
  endedAt,
}: {
  runId: string
  stepId: string
  name: string
  type: string
  output?: any
  status?: "queued" | "running" | "completed" | "failed" | "skipped"
  error?: any
  startedAt?: Date | null
  endedAt?: Date | null
}) {
  // Check if step exists
  const existing = await db
    .select({ id: workflowRunSteps.id })
    .from(workflowRunSteps)
    .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.stepId, stepId)))
    .limit(1);

  const patch: any = { runId, stepId, name, type }
  if (output !== undefined) patch.output = output
  if (status) patch.status = status
  if (error !== undefined) patch.error = error
  if (startedAt !== undefined) patch.startedAt = startedAt
  if (endedAt !== undefined) patch.endedAt = endedAt

  if (existing.length === 0) {
    // Create new step
    patch.id = `${runId}_${stepId}`;
    patch.attempt = 0;
    patch.maxAttempts = 1;
    patch.deps = [];
    await db.insert(workflowRunSteps).values(patch);
  } else {
    // Update existing step
    await db
      .update(workflowRunSteps)
      .set(patch)
      .where(and(eq(workflowRunSteps.runId, runId), eq(workflowRunSteps.stepId, stepId)));
  }
}


