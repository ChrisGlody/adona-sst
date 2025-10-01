import { db } from "./index"
import { chats, chatMessages, tools } from "./schema"
import { and, asc, desc, eq } from "drizzle-orm"
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


