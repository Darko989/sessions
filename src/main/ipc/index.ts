import { ipcMain, shell } from 'electron'
import { SessionManager } from '../services/SessionManager'
import { RepoManager } from '../services/RepoManager'
import { GitService } from '../services/GitService'
import { SettingsStore } from '../services/SettingsStore'
import { ActivityLog } from '../services/ActivityLog'
import { TicketService } from '../services/TicketService'
import { registerSessionIpc } from './sessions'
import { registerRepoIpc } from './repos'
import { registerSettingsIpc } from './settings'
import { registerTicketIpc } from './tickets'

export function registerAllIpc(services: {
  sessionManager: SessionManager
  repoManager: RepoManager
  gitService: GitService
  settingsStore: SettingsStore
  activityLog: ActivityLog
  ticketService: TicketService
}): void {
  const { sessionManager, repoManager, gitService, settingsStore, activityLog, ticketService } = services

  registerSessionIpc(sessionManager, gitService, activityLog)
  registerRepoIpc(repoManager, sessionManager, gitService, activityLog)
  registerSettingsIpc(settingsStore)
  registerTicketIpc(ticketService)

  ipcMain.handle('activity:getAll', () => activityLog.getAll())
  ipcMain.handle('activity:getForSession', (_e, sessionId: string) =>
    activityLog.getForSession(sessionId)
  )

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('git:getBranchMergeStatus',
    (_e, repoPath: string, branchName: string, baseBranch: string) =>
      gitService.getBranchMergeStatus(repoPath, branchName, baseBranch)
  )
}
