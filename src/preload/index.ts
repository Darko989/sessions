import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type IpcInvoke = (...args: unknown[]) => Promise<unknown>

function invoke(channel: string): IpcInvoke {
  return (...args) => ipcRenderer.invoke(channel, ...args)
}

const api = {
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  },
  sessions: {
    getAll: invoke('sessions:getAll'),
    getByRepo: invoke('sessions:getByRepo'),
    create: invoke('sessions:create'),
    delete: invoke('sessions:delete'),
    archive: invoke('sessions:archive'),
    getStatus: invoke('sessions:getStatus'),
    refresh: invoke('sessions:refresh'),
    push: invoke('sessions:push'),
    getLog: invoke('sessions:getLog'),
    getChangedFiles: invoke('sessions:getChangedFiles'),
    getFileDiff: invoke('sessions:getFileDiff'),
    getPrUrl: invoke('sessions:getPrUrl'),
    openInVSCode: invoke('sessions:openInVSCode'),
    openInClaude: invoke('sessions:openInClaude'),
    openInCursor: invoke('sessions:openInCursor'),
    openInIntelliJ: invoke('sessions:openInIntelliJ'),
    openInCodex: invoke('sessions:openInCodex'),
    openInTerminal: invoke('sessions:openInTerminal'),
    openInFinder: invoke('sessions:openInFinder'),
    getDiffCompare: invoke('sessions:getDiffCompare'),
    getDiffStats: invoke('sessions:getDiffStats'),
    getFileDiffVsBase: invoke('sessions:getFileDiffVsBase'),
    runHealthChecks: invoke('sessions:runHealthChecks'),
    analyzeCodebase: invoke('sessions:analyzeCodebase'),
    getConflictRisk: invoke('sessions:getConflictRisk')
  },
  repos: {
    getAll: invoke('repos:getAll'),
    add: invoke('repos:add'),
    remove: invoke('repos:remove'),
    update: invoke('repos:update'),
    getBranches: invoke('repos:getBranches'),
    getDefaultBranch: invoke('repos:getDefaultBranch'),
    fetchOrigin: invoke('repos:fetchOrigin')
  },
  git: {
    getBranchMergeStatus: invoke('git:getBranchMergeStatus')
  },
  settings: {
    get: invoke('settings:get'),
    update: invoke('settings:update'),
    pickDirectory: invoke('settings:pickDirectory')
  },
  tickets: {
    fetchAll: invoke('tickets:fetchAll'),
    // JIRA
    fetchJira: invoke('tickets:fetchJira'),
    searchJira: invoke('tickets:searchJira'),
    getJiraBaseUrl: invoke('tickets:getJiraBaseUrl'),
    isJiraConfigured: invoke('tickets:isJiraConfigured'),
    fetchJiraProjects: invoke('tickets:fetchJiraProjects'),
    fetchJiraIssueTypes: invoke('tickets:fetchJiraIssueTypes'),
    fetchJiraAssignableUsers: invoke('tickets:fetchJiraAssignableUsers'),
    createJira: invoke('tickets:createJira'),
    // Shortcut
    fetchShortcut: invoke('tickets:fetchShortcut'),
    searchShortcut: invoke('tickets:searchShortcut'),
    fetchShortcutProjects: invoke('tickets:fetchShortcutProjects'),
    fetchShortcutWorkflowStates: invoke('tickets:fetchShortcutWorkflowStates'),
    createShortcut: invoke('tickets:createShortcut'),
    isShortcutConfigured: invoke('tickets:isShortcutConfigured'),
    // ClickUp
    fetchClickup: invoke('tickets:fetchClickup'),
    searchClickup: invoke('tickets:searchClickup'),
    fetchClickupSpaces: invoke('tickets:fetchClickupSpaces'),
    fetchClickupLists: invoke('tickets:fetchClickupLists'),
    createClickup: invoke('tickets:createClickup'),
    isClickupConfigured: invoke('tickets:isClickupConfigured')
  },
  activity: {
    getAll: invoke('activity:getAll'),
    getForSession: invoke('activity:getForSession')
  },
  app: {
    onUpdateAvailable: (cb: (info: { latestVersion: string; releaseUrl: string; canAutoUpdate: boolean }) => void) => {
      ipcRenderer.on('app:updateAvailable', (_e, info) => cb(info))
    },
    onUpdateProgress: (cb: (info: { percent: number }) => void) => {
      ipcRenderer.on('app:updateProgress', (_e, info) => cb(info))
    },
    onUpdateReady: (cb: () => void) => {
      ipcRenderer.on('app:updateReady', () => cb())
    },
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
}

export type API = typeof api
