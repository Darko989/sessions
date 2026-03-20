import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { GitService } from './GitService'
import { SettingsStore } from './SettingsStore'

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

export interface CreateSessionInput {
  name: string
  repoId: string
  repoPath: string
  baseBranch: string
  branchName?: string
  ticketId?: string
  ticketTitle?: string
}

/** Returns true if the title signals a bug/fix — uses bugfix/ prefix instead of feature/ */
function isBugTitle(title: string): boolean {
  return /\b(bug|fix|hotfix|patch|defect|issue|error|crash|broken|regression)\b/i.test(title)
}

export class SessionManager {
  private readonly filePath: string
  private sessions: Session[]
  private git: GitService
  private settings: SettingsStore

  constructor(git: GitService, settings: SettingsStore) {
    this.git = git
    this.settings = settings
    const dir = path.join(app.getPath('home'), '.branchless')
    fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'sessions.json')
    this.sessions = this.load()
  }

  private load(): Session[] {
    try {
      if (fs.existsSync(this.filePath)) {
        const all: Session[] = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))

        // Integrity check: remove sessions whose worktree directory no longer exists on disk.
        // Archived sessions are exempt — they intentionally have no live worktree.
        const valid = all.filter((s) => s.status === 'archived' || fs.existsSync(s.worktreePath))

        if (valid.length !== all.length) {
          // Atomically persist the cleaned list so we don't re-read dangling entries
          this.writeAtomic(valid)
        }

        return valid
      }
    } catch {
      // ignore corrupt file
    }
    return []
  }

  private writeAtomic(sessions: Session[]): void {
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }

  private persist(): void {
    this.writeAtomic(this.sessions)
  }

  getAll(): Session[] {
    return [...this.sessions]
  }

  getById(id: string): Session | undefined {
    return this.sessions.find((s) => s.id === id)
  }

  getByRepo(repoId: string): Session[] {
    return this.sessions.filter((s) => s.repoId === repoId && s.status === 'active')
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const { sessionsDirectory } = this.settings.get()

    // Short unique suffix to avoid branch name collisions
    const suffix = Date.now().toString(36).slice(-4)

    let branch = input.branchName
    if (!branch) {
      if (input.ticketId) {
        // Extract the numeric part of the ticket key: "CIWP-3219" → "3219"
        const ticketNum = input.ticketId.match(/(\d+)$/)?.[1]
          ?? input.ticketId.toLowerCase().replace(/[^a-z0-9]/g, '')
        const raw = input.ticketTitle ?? input.ticketId
        const titleSlug = raw
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 25)
          .replace(/-$/, '')
        const prefix = isBugTitle(raw) ? 'bugfix' : 'feature'
        branch = `${prefix}/${ticketNum}-${titleSlug}-${suffix}`
      } else {
        const slug = input.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 30)
        const prefix = isBugTitle(input.name) ? 'bugfix' : 'feature'
        branch = `${prefix}/${slug}-${suffix}`
      }
    }

    const worktreePath = path.join(sessionsDirectory, sessionId)

    await this.git.createWorktree(input.repoPath, worktreePath, branch, input.baseBranch)

    // Copy global .env if exists
    const globalEnv = path.join(input.repoPath, '.env')
    if (fs.existsSync(globalEnv)) {
      fs.copyFileSync(globalEnv, path.join(worktreePath, '.env'))
    }

    const session: Session = {
      id: sessionId,
      name: input.name,
      repoId: input.repoId,
      repoPath: input.repoPath,
      worktreePath,
      branch,
      baseBranch: input.baseBranch,
      ticketId: input.ticketId,
      ticketTitle: input.ticketTitle,
      createdAt: new Date().toISOString(),
      status: 'active'
    }

    this.sessions.push(session)
    this.persist()
    return session
  }

  markOpened(id: string): void {
    const session = this.sessions.find((s) => s.id === id)
    if (session) {
      session.lastOpenedAt = new Date().toISOString()
      this.persist()
    }
  }

  async delete(id: string): Promise<void> {
    const session = this.sessions.find((s) => s.id === id)
    if (!session) throw new Error(`Session not found: ${id}`)

    // Remove worktree
    try {
      await this.git.removeWorktree(session.repoPath, session.worktreePath)
    } catch (err) {
      console.warn('Failed to remove worktree:', err)
    }

    // Try to delete the branch too
    try {
      await this.git.deleteBranch(session.repoPath, session.branch)
    } catch {
      // branch may have been pushed or doesn't exist
    }

    this.sessions = this.sessions.filter((s) => s.id !== id)
    this.persist()
  }

  archive(id: string): void {
    const session = this.sessions.find((s) => s.id === id)
    if (!session) throw new Error(`Session not found: ${id}`)
    session.status = 'archived'
    this.persist()
  }
}
