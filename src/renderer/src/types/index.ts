export interface Repository {
  id: string
  name: string
  path: string
  defaultBranch: string
  addedAt: string
  color?: string
  jiraProjectKey?: string
}

export interface Session {
  id: string
  name: string
  repoId: string
  repoPath: string
  worktreePath: string
  branch: string
  baseBranch: string
  ticketId?: string
  ticketTitle?: string
  createdAt: string
  lastOpenedAt?: string
  status: 'active' | 'archived'
}

export interface GitStatus {
  branch: string
  aheadBy: number
  behindBy: number
  hasConflicts: boolean
  isClean: boolean
  modifiedFiles: string[]
}

export interface Settings {
  defaultBaseBranch: string
  defaultEditor: 'vscode' | 'cursor' | 'pycharm' | 'zed'
  sessionsDirectory: string
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
  shortcutApiToken: string
  mcpServerUrl: string
  mcpServerToken: string
}

export interface Ticket {
  id: string
  key: string
  title: string
  status: string
  type: 'jira' | 'shortcut'
  url?: string
}

export interface ActivityEntry {
  id: string
  type: string
  sessionId?: string
  repoId?: string
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}

export type CreateSessionInput = {
  name: string
  repoId: string
  repoPath: string
  baseBranch: string
  branchName?: string
  ticketId?: string
  ticketTitle?: string
}
