export type ProjectType = 'nextjs' | 'node' | 'python' | 'php' | 'ruby' | 'java' | 'go' | 'rust' | 'other'
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'pip' | 'poetry' | 'composer' | 'bundler' | null

export interface Repository {
  id: string
  name: string
  path: string
  defaultBranch: string
  addedAt: string
  color?: string
  jiraProjectKey?: string
  ticketIntegration?: 'jira' | 'shortcut' | 'clickup'
  symlinkFiles?: string[]
  projectType?: ProjectType
  packageManager?: PackageManager
  usesDocker?: boolean
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
  pinnedAt?: string
  status: 'active' | 'archived'
  notes?: string
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
  defaultEditor: string
  sessionsDirectory: string
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
  shortcutApiToken: string
  clickupApiToken: string
  clickupTeamId: string
}

export interface Ticket {
  id: string
  key: string
  title: string
  status: string
  type: 'jira' | 'shortcut' | 'clickup'
  url?: string
}

export interface ActivityEntry {
  id: string
  type: string
  sessionId?: string
  repoId?: string
  message: string
  timestamp: string
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
