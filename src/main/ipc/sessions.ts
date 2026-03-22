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
  // Claude Code is a TUI — it needs a terminal to run in.
  // Open a terminal and launch `claude` inside it.
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      spawn('osascript', [
        '-e', `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\\\"')} && claude"`,
        '-e', 'tell application "Terminal" to activate'
      ], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}" && claude`], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else {
      // Linux — try common terminals
      const terminals: [string, string[]][] = [
        ['gnome-terminal', ['--', 'bash', '-c', `cd "${cwd}" && claude; exec bash`]],
        ['konsole', ['-e', 'bash', '-c', `cd "${cwd}" && claude; exec bash`]],
        ['xfce4-terminal', ['-e', `bash -c 'cd "${cwd}" && claude; exec bash'`]],
        ['xterm', ['-e', `bash -c 'cd "${cwd}" && claude; exec bash'`]]
      ]
      const tryNext = (i: number) => {
        if (i >= terminals.length) { reject(new Error('No supported terminal found')); return }
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

function openCursor(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cursor', [cwd], { detached: true, stdio: 'ignore' })
    proc.on('error', reject)
    proc.unref()
    setTimeout(resolve, 300)
  })
}

function openIntelliJ(cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // IntelliJ IDEA CLI: 'idea' on all platforms
    const proc = spawn('idea', [cwd], { detached: true, stdio: 'ignore' })
    proc.on('error', reject)
    proc.unref()
    setTimeout(resolve, 300)
  })
}

function openCodex(cwd: string): Promise<void> {
  // Codex CLI is a TUI — it needs a terminal to run in.
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      spawn('osascript', [
        '-e', `tell application "Terminal" to do script "cd ${cwd.replace(/"/g, '\\\\"')} && codex"`,
        '-e', 'tell application "Terminal" to activate'
      ], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${cwd}" && codex`], { detached: true, stdio: 'ignore' }).unref()
      resolve()
    } else {
      const terminals: [string, string[]][] = [
        ['gnome-terminal', ['--', 'bash', '-c', `cd "${cwd}" && codex; exec bash`]],
        ['konsole', ['-e', 'bash', '-c', `cd "${cwd}" && codex; exec bash`]],
        ['xfce4-terminal', ['-e', `bash -c 'cd "${cwd}" && codex; exec bash'`]],
        ['xterm', ['-e', `bash -c 'cd "${cwd}" && codex; exec bash'`]]
      ]
      const tryNext = (i: number) => {
        if (i >= terminals.length) { reject(new Error('No supported terminal found')); return }
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

  ipcMain.handle('sessions:openInIntelliJ', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openIntelliJ(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in IntelliJ IDEA`, { sessionId })
  })

  ipcMain.handle('sessions:openInCodex', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    await openCodex(session.worktreePath)
    sessionManager.markOpened(sessionId)
    activityLog.add('session_opened', `Opened "${session.name}" in Codex CLI`, { sessionId })
  })

  ipcMain.handle('sessions:openInFinder', (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    openFileManager(session.worktreePath)
  })

  ipcMain.handle('sessions:getLog', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getCommitLog(session.worktreePath, session.baseBranch)
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

  ipcMain.handle('sessions:getDiffCompare', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getDiffCompare(session.worktreePath, session.baseBranch)
  })

  ipcMain.handle('sessions:getDiffStats', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getDiffStats(session.worktreePath, session.baseBranch)
  })

  ipcMain.handle('sessions:getFileDiffVsBase', async (_e, sessionId: string, file: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getFileDiffVsBase(session.worktreePath, session.baseBranch, file)
  })

  ipcMain.handle('sessions:runHealthChecks', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.runHealthChecks(session.worktreePath)
  })

  ipcMain.handle('sessions:analyzeCodebase', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.analyzeCodebase(session.worktreePath, session.baseBranch)
  })

  ipcMain.handle('sessions:getConflictRisk', async (_e, sessionId: string) => {
    const session = sessionManager.getById(sessionId)
    if (!session) throw new Error('Session not found')
    return gitService.getConflictRisk(session.worktreePath, session.baseBranch)
  })
}
