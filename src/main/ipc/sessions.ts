import { ipcMain, shell } from 'electron'
import { execFile, spawn } from 'child_process'
import { SessionManager, CreateSessionInput } from '../services/SessionManager'
import { GitService } from '../services/GitService'
import { ActivityLog } from '../services/ActivityLog'

// ── Cross-platform launcher helpers ──────────────────────────────────────────

function openTerminal(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      spawn('osascript', [
        '-e', `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\"')}"`,
        '-e', 'tell application "Terminal" to activate'
      ], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}"`], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else {
      // Linux — try common terminals in order of preference
      const terminals: [string, string[]][] = [
        ['gnome-terminal', [`--working-directory=${cwd}`]],
        ['konsole', ['--workdir', cwd]],
        ['xfce4-terminal', [`--working-directory=${cwd}`]],
        ['tilix', ['-w', cwd]],
        ['xterm', ['-e', `bash -c "cd ${cwd}; exec bash"`]]
      ]

      const tryNext = (i: number) => {
        if (i >= terminals.length) {
          reject(new Error('No supported terminal emulator found. Install gnome-terminal, konsole, or xterm.'))
          return
        }
        const [t, a] = terminals[i]
        execFile('which', [t], (err) => {
          if (err) { tryNext(i + 1); return }
          spawn(t, a, { detached: true, stdio: 'ignore', cwd }).unref()
          resolve()
        })
      }
      tryNext(0)
    }
  })
}

function openVSCode(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('code', [cwd], { detached: true, stdio: 'ignore' })
    proc.on('error', reject)
    proc.unref()
    setTimeout(resolve, 300)
  })
}

function openClaude(cwd: string): Promise<void> {
  // Claude Code CLI opens in whatever directory it's launched from.
  // Spawn with cwd set to the session directory — do NOT pass cwd as an argument.
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env }
    })
    proc.on('error', reject)
    proc.unref()
    // Give it a moment to start — if it errors immediately we'll catch it
    setTimeout(resolve, 300)
  })
}

function openCursor(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cursor', [cwd], { detached: true, stdio: 'ignore' })
    proc.on('error', reject)
    proc.unref()
    setTimeout(resolve, 300)
  })
}

function openFileManager(cwd: string): Promise<void> {
  return shell.openPath(cwd).then(() => undefined)
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerSessionIpc(
  sessionManager: SessionManager,
  gitService: GitService,
  activityLog: ActivityLog
): void {
  ipcMain.handle('sessions:getAll', () => sessionManager.getAll())

  ipcMain.handle('sessions:getByRepo', (_e, repoId: string) =>
    sessionManager.getByRepo(repoId)
  )

  ipcMain.handle('sessions:create', async (_e, input: CreateSessionInput) => {
    const session = await sessionManager.create(input)
    activityLog.add('session_created', `Created session "${session.name}"`, {
      sessionId: session.id,
      repoId: session.repoId
    })
    return session
  })

  ipcMain.handle('sessions:delete', async (_e, id: string) => {
    const session = sessionManager.getById(id)
    await sessionManager.delete(id)
    if (session) {
      activityLog.add('session_deleted', `Deleted session "${session.name}"`, {
        sessionId: id,
        repoId: session.repoId
      })
    }
  })

  ipcMain.handle('sessions:archive', (_e, id: string) => {
    sessionManager.archive(id)
  })

  ipcMain.handle('sessions:getStatus', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getStatus(session.worktreePath)
  })

  ipcMain.handle('sessions:refresh', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    const result = await gitService.fetchAndRebase(session.worktreePath, session.baseBranch)
    activityLog.add('session_synced', `Synced session "${session.name}"`, {
      sessionId,
      repoId: session.repoId,
      meta: { success: result.success }
    })
    return result
  })

  ipcMain.handle('sessions:push', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    const result = await gitService.pushBranch(session.worktreePath, session.branch)
    if (result.success) {
      activityLog.add('session_synced', `Pushed "${session.branch}" to origin`, {
        sessionId,
        repoId: session.repoId
      })
    }
    return result
  })

  ipcMain.handle('sessions:getPrUrl', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getPrUrl(session.repoPath, session.branch, session.baseBranch)
  })

  ipcMain.handle('sessions:openInVSCode', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openVSCode(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in VS Code`, { sessionId })
  })

  ipcMain.handle('sessions:openInClaude', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openClaude(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in Claude Code`, { sessionId })
  })

  ipcMain.handle('sessions:openInCursor', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openCursor(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in Cursor`, { sessionId })
  })

  ipcMain.handle('sessions:openInTerminal', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openTerminal(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in Terminal`, { sessionId })
  })

  ipcMain.handle('sessions:openInFinder', (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    openFileManager(session.worktreePath)
  })

  ipcMain.handle('sessions:getLog', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getCommitLog(session.worktreePath)
  })

  ipcMain.handle('sessions:getChangedFiles', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getChangedFiles(session.worktreePath)
  })

  ipcMain.handle('sessions:getFileDiff', async (_e, sessionId: string, file: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getFileDiff(session.worktreePath, file)
  })
}
