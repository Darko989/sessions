import { invoke } from '@tauri-apps/api/core'
import type { Repository, Session, Settings, Ticket, ActivityEntry, CreateSessionInput, GitStatus } from './types'

// ── Repos ────────────────────────────────────────────────────────────────────

export const repos = {
  getAll: () => invoke<Repository[]>('repos_get_all'),
  add: (repoPath: string) => invoke<Repository>('repos_add', { repoPath }),
  remove: (id: string) => invoke<void>('repos_remove', { id }),
  update: (id: string, partial: Partial<Repository>) => invoke<Repository>('repos_update', { id, partial }),
  getBranches: (repoPath: string) => invoke<string[]>('repos_get_branches', { repoPath }),
  getDefaultBranch: (repoPath: string) => invoke<string>('repos_get_default_branch', { repoPath }),
  fetchOrigin: (repoPath: string) => invoke<void>('repos_fetch_origin', { repoPath }),
  suggestSymlinkFiles: (repoPath: string) => invoke<string[]>('repos_suggest_symlink_files', { repoPath }),
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export const sessions = {
  getAll: () => invoke<Session[]>('sessions_get_all'),
  create: (input: CreateSessionInput) => invoke<Session>('sessions_create', { input }),
  delete: (id: string) => invoke<void>('sessions_delete', { id }),
  archive: (id: string) => invoke<void>('sessions_archive', { id }),
  pin: (id: string) => invoke<Session>('sessions_pin', { id }),
  unpin: (id: string) => invoke<Session>('sessions_unpin', { id }),
  getStatus: (sessionId: string) => invoke<GitStatus>('sessions_get_status', { sessionId }),
  refresh: (sessionId: string) => invoke<{ success: boolean; output: string; hasConflicts: boolean; conflictingFiles: string[] }>('sessions_refresh', { sessionId }),
  push: (sessionId: string) => invoke<{ success: boolean; output: string }>('sessions_push', { sessionId }),
  getPrUrl: (sessionId: string) => invoke<string | null>('sessions_get_pr_url', { sessionId }),
  getPrInfo: (sessionId: string) => invoke<{ number: number; url: string; state: string } | null>('sessions_get_pr_info', { sessionId }),
  getLog: (sessionId: string) => invoke<Array<{ hash: string; shortHash: string; subject: string; author: string; date: string }>>('sessions_get_log', { sessionId }),
  getChangedFiles: (sessionId: string) => invoke<Array<{ status: string; file: string }>>('sessions_get_changed_files', { sessionId }),
  getFileDiff: (sessionId: string, file: string) => invoke<string>('sessions_get_file_diff', { sessionId, file }),
  getDiffCompare: (sessionId: string) => invoke<string>('sessions_get_diff_compare', { sessionId }),
  getDiffStats: (sessionId: string) => invoke<Array<{ file: string; additions: number; deletions: number; binary: boolean }>>('sessions_get_diff_stats', { sessionId }),
  getFileDiffVsBase: (sessionId: string, file: string) => invoke<string>('sessions_get_file_diff_vs_base', { sessionId, file }),
  getConflictRisk: (sessionId: string) => invoke<Array<{ file: string; mainCommits: number; authors: string[] }>>('sessions_get_conflict_risk', { sessionId }),
  repairSymlinks: (id: string) => invoke<{ created: string[]; skipped: string[] }>('sessions_repair_symlinks', { id }),
  repairAllSymlinks: (repoId?: string) => invoke<Array<{ sessionId: string; created: string[] }>>('sessions_repair_all_symlinks', { repoId }),
  runHealthChecks: (sessionId: string) => invoke<Array<{ check: string; status: string; output: string; duration: number }>>('sessions_run_health_checks', { sessionId }),
  analyzeCodebase: (sessionId: string) => invoke<Array<{ severity: string; file: string; detail: string; recommendation: string }>>('sessions_analyze_codebase', { sessionId }),
  // Open in
  openInVSCode: (sessionId: string) => invoke<void>('sessions_open_in_vscode', { sessionId }),
  openInCursor: (sessionId: string) => invoke<void>('sessions_open_in_cursor', { sessionId }),
  openInClaude: (sessionId: string) => invoke<void>('sessions_open_in_claude', { sessionId }),
  openInIntelliJ: (sessionId: string) => invoke<void>('sessions_open_in_intellij', { sessionId }),
  openInCodex: (sessionId: string) => invoke<void>('sessions_open_in_codex', { sessionId }),
  openInTerminal: (sessionId: string) => invoke<void>('sessions_open_in_terminal', { sessionId }),
  openInFinder: (sessionId: string) => invoke<void>('sessions_open_in_finder', { sessionId }),
}

// ── Settings ─────────────────────────────────────────────────────────────────

export const settings = {
  get: () => invoke<Settings>('settings_get'),
  update: (partial: Partial<Settings>) => invoke<Settings>('settings_update', { partial }),
  pickDirectory: () => invoke<string | null>('settings_pick_directory'),
}

// ── Activity ─────────────────────────────────────────────────────────────────

export const activity = {
  getAll: (limit?: number) => invoke<ActivityEntry[]>('activity_get_all', { limit }),
  getForSession: (sessionId: string) => invoke<ActivityEntry[]>('activity_get_for_session', { sessionId }),
}

// ── Git ──────────────────────────────────────────────────────────────────────

export const git = {
  getBranchMergeStatus: (repoPath: string, branch: string, baseBranch: string) =>
    invoke<string>('git_get_branch_merge_status', { repoPath, branch, baseBranch }),
}

// ── Tickets ──────────────────────────────────────────────────────────────────

export const tickets = {
  fetchAll: (projectKey?: string, integration?: string) => invoke<Ticket[]>('tickets_fetch_all', { projectKey, integration }),
  searchJira: (query: string, projectKey?: string) => invoke<Ticket[]>('tickets_search_jira', { query, projectKey }),
  searchShortcut: (query: string) => invoke<Ticket[]>('tickets_search_shortcut', { query }),
  searchClickup: (query: string) => invoke<Ticket[]>('tickets_search_clickup', { query }),
  fetchJiraProjects: () => invoke<Array<{ key: string; name: string }>>('tickets_fetch_jira_projects'),
  fetchJiraIssueTypes: (projectKey: string) => invoke<any[]>('tickets_fetch_jira_issue_types', { projectKey }),
  fetchJiraAssignableUsers: (projectKey: string) => invoke<any[]>('tickets_fetch_jira_assignable_users', { projectKey }),
  createJira: (projectKey: string, summary: string, issueTypeId: string, extraFields: Record<string, unknown>) =>
    invoke<Ticket>('tickets_create_jira', { projectKey, summary, issueTypeId, extraFields }),
  fetchShortcutProjects: () => invoke<Array<{ id: number; name: string }>>('tickets_fetch_shortcut_projects'),
  fetchShortcutWorkflowStates: () => invoke<any[]>('tickets_fetch_shortcut_workflow_states'),
  createShortcut: (name: string, projectId: number, storyType: string, description?: string, workflowStateId?: number) =>
    invoke<Ticket>('tickets_create_shortcut', { name, projectId, storyType, description, workflowStateId }),
  fetchClickupSpaces: () => invoke<Array<{ id: string; name: string }>>('tickets_fetch_clickup_spaces'),
  fetchClickupLists: (spaceId: string) => invoke<any[]>('tickets_fetch_clickup_lists', { spaceId }),
  createClickup: (listId: string, name: string, description?: string) =>
    invoke<Ticket>('tickets_create_clickup', { listId, name, description }),
  isJiraConfigured: () => invoke<boolean>('tickets_is_jira_configured'),
  isShortcutConfigured: () => invoke<boolean>('tickets_is_shortcut_configured'),
  isClickupConfigured: () => invoke<boolean>('tickets_is_clickup_configured'),
}
