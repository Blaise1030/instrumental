import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoPath: text("repo_path").notNull(),
  status: text("status").notNull(),
  tabOrder: integer("tab_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  worktreePath: text("worktree_path").notNull(),
  title: text("title").notNull(),
  agent: text("agent").notNull(),
  createdBranch: text("created_branch"),
  resumeId: text("resume_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const threadSessions = sqliteTable("thread_sessions", {
  threadId: text("thread_id").primaryKey(),
  provider: text("provider").notNull(),
  resumeId: text("resume_id"),
  initialPrompt: text("initial_prompt"),
  titleCapturedAt: text("title_captured_at"),
  launchMode: text("launch_mode").notNull(),
  status: text("status").notNull(),
  lastActivityAt: text("last_activity_at").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const runEvents = sqliteTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  kind: text("kind").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
});

export const appState = sqliteTable("app_state", {
  id: integer("id").primaryKey(),
  activeProjectId: text("active_project_id"),
  activeWorktreePath: text("active_worktree_path"),
  activeThreadId: text("active_thread_id"),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  threadTitle: text("thread_title").notNull(),
  projectName: text("project_name").notNull(),
  read: integer("read").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const githubPrSettings = sqliteTable("github_pr_settings", {
  id: integer("id").primaryKey(),
  token: text("token").notNull().default(""),
  owner: text("owner").notNull().default(""),
  repo: text("repo").notNull().default(""),
});
