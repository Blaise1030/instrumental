export type VocabLevel = 1 | 2 | 3;

export type VocabKey =
  | "worktree"
  | "worktrees"
  | "select_worktree"
  | "add_worktree"
  | "worktree_removed"
  | "branch"
  | "branches"
  | "loading_branches"
  | "branch_name"
  | "source_branch"
  | "commit_verb"
  | "commit_noun"
  | "commit_message_placeholder"
  | "staged"
  | "unstaged"
  | "untracked"
  | "push"
  | "push_title"
  | "pull_request"
  | "pull_requests"
  | "repository"
  | "diff"
  | "suggest_commit"
  | "switch_worktree_desc"
  | "agents_in_worktree"
  | "files_in_worktree";

type VocabMap = Record<VocabKey, string>;

export const VOCAB: Record<VocabLevel, VocabMap> = {
  1: {
    worktree: "Working copy",
    worktrees: "Working copies",
    select_worktree: "Select working copy",
    add_worktree: "Add working copy",
    worktree_removed: "The working copy for",
    branch: "Version",
    branches: "Versions",
    loading_branches: "Loading versions…",
    branch_name: "Version name",
    source_branch: "Source version",
    commit_verb: "Save checkpoint",
    commit_noun: "Checkpoint",
    commit_message_placeholder: "Describe this checkpoint…",
    staged: "Ready to save",
    unstaged: "Changed",
    untracked: "New files",
    push: "Upload",
    push_title: "Upload changes to remote (remote must be set)",
    pull_request: "Change request",
    pull_requests: "Change requests",
    repository: "Project folder",
    diff: "Changes",
    suggest_commit: "Suggest description from ready-to-save changes",
    switch_worktree_desc: "Switch to another working copy in this project",
    agents_in_worktree: "Threads in this working copy",
    files_in_worktree: "Files in the active working copy",
  },
  2: {
    worktree: "Workspace",
    worktrees: "Workspaces",
    select_worktree: "Select workspace",
    add_worktree: "Add workspace",
    worktree_removed: "The workspace for",
    branch: "Branch",
    branches: "Branches",
    loading_branches: "Loading branches…",
    branch_name: "Branch name",
    source_branch: "Source branch",
    commit_verb: "Commit",
    commit_noun: "Commit",
    commit_message_placeholder: "Enter commit message",
    staged: "Staged",
    unstaged: "Modified",
    untracked: "New files",
    push: "Push",
    push_title: "Push current branch to remote (upstream must be set)",
    pull_request: "Pull Request",
    pull_requests: "Pull Requests",
    repository: "Project",
    diff: "Changes",
    suggest_commit: "Suggest commit message from staged changes",
    switch_worktree_desc: "Switch branch workspace in this project",
    agents_in_worktree: "Threads in this workspace",
    files_in_worktree: "Files in the active workspace",
  },
  3: {
    worktree: "Worktree",
    worktrees: "Worktrees",
    select_worktree: "Select worktree",
    add_worktree: "Add worktree",
    worktree_removed: "The worktree for",
    branch: "Branch",
    branches: "Branches",
    loading_branches: "Loading branches…",
    branch_name: "Branch name",
    source_branch: "Source branch",
    commit_verb: "Commit",
    commit_noun: "Commit",
    commit_message_placeholder: "Enter commit message",
    staged: "Staged",
    unstaged: "Unstaged",
    untracked: "Untracked",
    push: "Push",
    push_title: "Push current branch to remote (upstream must be set)",
    pull_request: "Pull Request",
    pull_requests: "Pull Requests",
    repository: "Repository",
    diff: "Diff",
    suggest_commit: "Suggest commit message from staged changes",
    switch_worktree_desc: "Switch branch checkout in this project",
    agents_in_worktree: "Threads in this worktree",
    files_in_worktree: "Files in the active worktree",
  },
};

export const VOCAB_LEVEL_LABELS: Record<VocabLevel, string> = {
  1: "Plain",
  2: "Standard",
  3: "Developer",
};
