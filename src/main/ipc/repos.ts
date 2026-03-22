import { ipcMain } from 'electron'
import { RepoManager } from '../services/RepoManager'
import { SessionManager } from '../services/SessionManager'
import { GitService } from '../services/GitService'
import { ActivityLog } from '../services/ActivityLog'

export function registerRepoIpc(
  repoManager: RepoManager,
  sessionManager: SessionManager,
  gitService: GitService,
  activityLog: ActivityLog
): void {
  ipcMain.handle('repos:getAll', () => repoManager.getAll())

  ipcMain.handle('repos:add', async (_e, repoPath: string) => {
    const repo = await repoManager.add(repoPath)
    activityLog.add('repo_added', `Added repository "${repo.name}"`, { repoId: repo.id })
    return repo
  })

  ipcMain.handle('repos:remove', async (_e, id: string) => {
    const repo = repoManager.getById(id)
    // Delete all sessions for this repo (active + archived)
    const sessions = sessionManager.getAll().filter(s => s.repoId === id)
    for (const session of sessions) {
      try {
        await sessionManager.delete(session.id)
      } catch (err) {
        console.warn(`Failed to delete session "${session.name}":`, err)
      }
    }
    repoManager.remove(id)
    if (repo) {
      activityLog.add('repo_removed', `Removed repository "${repo.name}" and ${sessions.length} session(s)`, { repoId: id })
    }
  })

  ipcMain.handle('repos:update', (_e, id: string, partial: Parameters<RepoManager['update']>[1]) =>
    repoManager.update(id, partial)
  )

  ipcMain.handle('repos:getBranches', (_e, repoPath: string) =>
    gitService.listBranches(repoPath)
  )

  ipcMain.handle('repos:getDefaultBranch', (_e, repoPath: string) =>
    gitService.getDefaultBranch(repoPath)
  )

  ipcMain.handle('repos:fetchOrigin', async (_e, repoPath: string) => {
    await gitService.fetchOrigin(repoPath)
  })
}


