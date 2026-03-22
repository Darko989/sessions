// Window API type declaration — mirrors the shape exposed in src/preload/index.ts

type IpcFn = (...args: unknown[]) => Promise<unknown>

interface WindowAPI {
  sessions: {
    getAll: IpcFn
    getByRepo: IpcFn
    create: IpcFn
    delete: IpcFn
    archive: IpcFn
    getStatus: IpcFn
    refresh: IpcFn
    push: IpcFn
    getLog: IpcFn
    getChangedFiles: IpcFn
    getFileDiff: IpcFn
    getPrUrl: IpcFn
    openInVSCode: IpcFn
    openInClaude: IpcFn
    openInCursor: IpcFn
    openInPyCharm: IpcFn
    openInIntelliJ: IpcFn
    openInCodex: IpcFn
    openInTerminal: IpcFn
    openInFinder: IpcFn
    getDiffCompare: IpcFn
    getDiffStats: IpcFn
    getFileDiffVsBase: IpcFn
    runHealthChecks: IpcFn
    analyzeCodebase: IpcFn
    getConflictRisk: IpcFn
  }
  repos: {
    getAll: IpcFn
    add: IpcFn
    remove: IpcFn
    update: IpcFn
    getBranches: IpcFn
    getDefaultBranch: IpcFn
    fetchOrigin: IpcFn
  }
  git: {
    getBranchMergeStatus: IpcFn
  }
  settings: {
    get: IpcFn
    update: IpcFn
    pickDirectory: IpcFn
  }
  tickets: {
    fetchAll: IpcFn
    // JIRA
    fetchJira: IpcFn
    searchJira: IpcFn
    getJiraBaseUrl: IpcFn
    isJiraConfigured: IpcFn
    fetchJiraProjects: IpcFn
    fetchJiraIssueTypes: IpcFn
    fetchJiraAssignableUsers: IpcFn
    createJira: IpcFn
    // Shortcut
    fetchShortcut: IpcFn
    searchShortcut: IpcFn
    fetchShortcutProjects: IpcFn
    fetchShortcutWorkflowStates: IpcFn
    createShortcut: IpcFn
    isShortcutConfigured: IpcFn
    // ClickUp
    fetchClickup: IpcFn
    searchClickup: IpcFn
    fetchClickupSpaces: IpcFn
    fetchClickupLists: IpcFn
    createClickup: IpcFn
    isClickupConfigured: IpcFn
  }
  activity: {
    getAll: IpcFn
    getForSession: IpcFn
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  app: {
    onUpdateAvailable: (cb: (info: { latestVersion: string; releaseUrl: string; canAutoUpdate: boolean }) => void) => void
    onUpdateProgress: (cb: (info: { percent: number }) => void) => void
    onUpdateReady: (cb: () => void) => void
    downloadUpdate: () => Promise<void>
    installUpdate: () => Promise<void>
  }
}

declare global {
  interface Window {
    api: WindowAPI
  }
}

export {}
