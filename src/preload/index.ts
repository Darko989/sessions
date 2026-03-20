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
    openInTerminal: invoke('sessions:openInTerminal'),
    openInFinder: invoke('sessions:openInFinder')
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
    fetchJira: invoke('tickets:fetchJira'),
    fetchShortcut: invoke('tickets:fetchShortcut'),
    searchJira: invoke('tickets:searchJira'),
    getJiraBaseUrl: invoke('tickets:getJiraBaseUrl'),
    createJira: invoke('tickets:createJira')
  },
  activity: {
    getAll: invoke('activity:getAll'),
    getForSession: invoke('activity:getForSession')
  },
  app: {
    onUpdateAvailable: (cb: (info: { latestVersion: string; releaseUrl: string }) => void) => {
      ipcRenderer.on('app:updateAvailable', (_e, info) => cb(info))
    }
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
