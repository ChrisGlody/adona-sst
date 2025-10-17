import { pgTable, text, timestamp, jsonb, index, varchar, pgEnum, integer } from "drizzle-orm/pg-core"

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


// Workflows
export const workflowStatusEnum = pgEnum("workflow_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const stepStatusEnum = pgEnum("step_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    owner: varchar("owner", { length: 160 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    definitionVersion: integer("definition_version").default(1).notNull(),
    definition: jsonb("definition").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("workflows_owner_idx").on(t.owner),
    updatedIdx: index("workflows_updated_at_idx").on(t.updatedAt),
  })
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id").notNull(),
    owner: varchar("owner", { length: 160 }).notNull(),
    status: workflowStatusEnum("status").default("queued").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    wfIdx: index("workflow_runs_wf_idx").on(t.workflowId),
    ownerIdx: index("workflow_runs_owner_idx").on(t.owner),
    statusIdx: index("workflow_runs_status_idx").on(t.status),
  })
);

export const workflowRunSteps = pgTable(
  "workflow_run_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    stepId: text("step_id").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    type: varchar("type", { length: 30 }).notNull(),
    status: stepStatusEnum("status").default("queued").notNull(),
    attempt: integer("attempt").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(1).notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    deps: text("deps").array(),
    logs: text("logs"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    runIdx: index("workflow_run_steps_run_idx").on(t.runId),
    stepIdx: index("workflow_run_steps_step_idx").on(t.stepId),
  })
);



