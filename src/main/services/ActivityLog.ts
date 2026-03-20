import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export type ActivityType = 'session_created' | 'session_opened' | 'session_synced' | 'session_deleted' | 'repo_added' | 'repo_removed'

export interface ActivityEntry {
  id: string
  type: ActivityType
  sessionId?: string
  repoId?: string
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}

export class ActivityLog {
  private readonly filePath: string
  private entries: ActivityEntry[]

  constructor() {
    const dir = path.join(app.getPath('home'), '.branchless')
    fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'activity.json')
    this.entries = this.load()
  }

  private load(): ActivityEntry[] {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      }
    } catch {
      // ignore
    }
    return []
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8')
  }

  add(type: ActivityType, message: string, opts?: { sessionId?: string; repoId?: string; meta?: Record<string, unknown> }): ActivityEntry {
    const entry: ActivityEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      message,
      timestamp: new Date().toISOString(),
      ...opts
    }
    this.entries.unshift(entry)
    // Keep last 500 entries
    if (this.entries.length > 500) this.entries = this.entries.slice(0, 500)
    this.persist()
    return entry
  }

  getAll(limit = 100): ActivityEntry[] {
    return this.entries.slice(0, limit)
  }

  getForSession(sessionId: string): ActivityEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId)
  }
}
