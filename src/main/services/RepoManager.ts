import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { GitService } from './GitService'

export interface Repository {
  id: string
  name: string
  path: string
  defaultBranch: string
  addedAt: string
  color?: string
  jiraProjectKey?: string
}

export class RepoManager {
  private readonly filePath: string
  private repos: Repository[]
  private git: GitService

  constructor(git: GitService) {
    this.git = git
    const dir = path.join(app.getPath('home'), '.branchless')
    fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'repos.json')
    this.repos = this.load()
  }

  private load(): Repository[] {
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
    fs.writeFileSync(this.filePath, JSON.stringify(this.repos, null, 2), 'utf-8')
  }

  getAll(): Repository[] {
    return [...this.repos]
  }

  getById(id: string): Repository | undefined {
    return this.repos.find((r) => r.id === id)
  }

  async add(repoPath: string): Promise<Repository> {
    const normalized = path.resolve(repoPath)

    const isRepo = await this.git.isGitRepo(normalized)
    if (!isRepo) throw new Error(`Not a Git repository: ${normalized}`)

    const existing = this.repos.find((r) => r.path === normalized)
    if (existing) throw new Error(`Repository already added: ${normalized}`)

    const name = await this.git.getRepoName(normalized)
    const defaultBranch = await this.git.getDefaultBranch(normalized)

    const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
    const color = COLORS[this.repos.length % COLORS.length]

    const repo: Repository = {
      id: `repo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      path: normalized,
      defaultBranch,
      addedAt: new Date().toISOString(),
      color
    }

    this.repos.push(repo)
    this.persist()
    return repo
  }

  remove(id: string): void {
    this.repos = this.repos.filter((r) => r.id !== id)
    this.persist()
  }

  update(id: string, partial: Partial<Pick<Repository, 'name' | 'defaultBranch' | 'color' | 'jiraProjectKey'>>): Repository {
    const idx = this.repos.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error(`Repo not found: ${id}`)
    this.repos[idx] = { ...this.repos[idx], ...partial }
    this.persist()
    return this.repos[idx]
  }
}
