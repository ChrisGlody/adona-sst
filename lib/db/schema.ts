import { pgTable, text, timestamp, jsonb, index, serial, varchar } from "drizzle-orm/pg-core"

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("chats_user_id_idx").on(t.userId),
    updatedIdx: index("chats_updated_at_idx").on(t.updatedAt),
  })
)

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    role: text("role").notNull(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byChatIdx: index("chat_messages_chat_id_idx").on(t.chatId),
    createdIdx: index("chat_messages_created_at_idx").on(t.createdAt),
  })
)

export const tools = pgTable("tools", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 20 }).notNull(), // 'lambda' | 'http' | 's3-inline'
  inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema"),
  implementation: text("implementation"), // inline code (string) OR http url OR S3 key
  lambdaArn: text("lambda_arn"), // if per-tool lambda
  owner: varchar("owner", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});



