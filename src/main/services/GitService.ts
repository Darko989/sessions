import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'

const execFileAsync = promisify(execFile)

export interface GitStatus {
  branch: string
  aheadBy: number
  behindBy: number
  hasConflicts: boolean
  isClean: boolean
  modifiedFiles: string[]
}

export interface WorktreeInfo {
  path: string
  branch: string
  commit: string
  isLocked: boolean
}

export class GitService {
  private async git(repoPath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, { cwd: repoPath })
      return stdout.trim()
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string }
      const detail = e.stderr?.trim() || e.message || String(err)
      throw new Error(detail)
    }
  }

  async getDefaultBranch(repoPath: string): Promise<string> {
    try {
      const result = await this.git(repoPath, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'])
      return result.replace('origin/', '')
    } catch {
      try {
        const branches = await this.git(repoPath, ['branch', '-r'])
        if (branches.includes('origin/main')) return 'main'
        if (branches.includes('origin/master')) return 'master'
      } catch {
        // ignore
      }
      return 'main'
    }
  }

  async listBranches(repoPath: string): Promise<string[]> {
    const output = await this.git(repoPath, ['branch', '-a', '--format=%(refname:short)'])
    return output
      .split('\n')
      .map((b) => b.trim().replace(/^origin\//, '')) // only strip leading origin/ prefix
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe local + remote tracking refs
  }

  async createWorktree(repoPath: string, worktreePath: string, branchName: string, baseBranch: string): Promise<void> {
    // Ensure the parent dir exists
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true })

    // Fetch latest (best-effort)
    try {
      await this.git(repoPath, ['fetch', 'origin', baseBranch])
    } catch {
      // offline or no remote — proceed with local
    }

    // Determine the best start point (prefer remote ref so we don't need a clean local branch)
    const remoteRef = `origin/${baseBranch}`
    let startPoint: string
    try {
      await this.git(repoPath, ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteRef}`])
      startPoint = remoteRef
    } catch {
      // No remote ref — fall back to local branch or HEAD
      startPoint = baseBranch
    }

    // Check if the branch already exists locally
    let branchExists = false
    try {
      await this.git(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`])
      branchExists = true
    } catch {
      branchExists = false
    }

    if (branchExists) {
      // Check if already checked out in another worktree
      const worktrees = await this.listWorktrees(repoPath)
      const alreadyUsed = worktrees.some((wt) => wt.branch === branchName)
      if (alreadyUsed) {
        throw new Error(
          `Branch "${branchName}" is already checked out in another worktree. ` +
          `Delete that session first or use a different branch name.`
        )
      }
      // Reuse existing branch
      await this.git(repoPath, ['worktree', 'add', worktreePath, branchName])
    } else {
      // Create new branch from start point
      await this.git(repoPath, ['worktree', 'add', '-b', branchName, worktreePath, startPoint])
    }
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    try {
      await this.git(repoPath, ['worktree', 'remove', worktreePath, '--force'])
    } catch {
      // Fallback: prune
      await this.git(repoPath, ['worktree', 'prune'])
    }
  }

  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    const output = await this.git(repoPath, ['worktree', 'list', '--porcelain'])
    const worktrees: WorktreeInfo[] = []
    const blocks = output.split('\n\n').filter(Boolean)
    for (const block of blocks) {
      const lines = block.split('\n')
      const wt: Partial<WorktreeInfo> = {}
      for (const line of lines) {
        if (line.startsWith('worktree ')) wt.path = line.slice(9)
        else if (line.startsWith('HEAD ')) wt.commit = line.slice(5)
        else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
        else if (line === 'locked') wt.isLocked = true
      }
      if (wt.path) worktrees.push(wt as WorktreeInfo)
    }
    return worktrees
  }

  async getStatus(worktreePath: string): Promise<GitStatus> {
    const [branchOutput, statusOutput] = await Promise.allSettled([
      this.git(worktreePath, ['status', '--porcelain=v2', '--branch']),
      this.git(worktreePath, ['status', '--porcelain'])
    ])

    let branch = 'unknown'
    let aheadBy = 0
    let behindBy = 0

    if (branchOutput.status === 'fulfilled') {
      for (const line of branchOutput.value.split('\n')) {
        if (line.startsWith('# branch.head ')) branch = line.slice(14)
        if (line.startsWith('# branch.ab ')) {
          const match = line.match(/\+(\d+) -(\d+)/)
          if (match) {
            aheadBy = parseInt(match[1])
            behindBy = parseInt(match[2])
          }
        }
      }
    }

    const modifiedFiles: string[] = []
    let hasConflicts = false

    if (statusOutput.status === 'fulfilled' && statusOutput.value) {
      for (const line of statusOutput.value.split('\n').filter(Boolean)) {
        const xy = line.slice(0, 2)
        const file = line.slice(3)
        if (xy === 'UU' || xy === 'AA' || xy === 'DD') hasConflicts = true
        modifiedFiles.push(file)
      }
    }

    return {
      branch,
      aheadBy,
      behindBy,
      hasConflicts,
      isClean: modifiedFiles.length === 0,
      modifiedFiles
    }
  }

  async fetchAndRebase(worktreePath: string, baseBranch: string, remote = 'origin'): Promise<{
    success: boolean
    output: string
    hasConflicts: boolean
    conflictingFiles: string[]
  }> {
    // Step 1: Fetch latest (use execFileAsync to avoid shell injection)
    try {
      await execFileAsync('git', ['fetch', remote, baseBranch], { cwd: worktreePath })
    } catch {
      // offline or no remote — continue with local ref
    }

    // Step 2: Preflight — detect files that overlap between upstream changes and local changes
    // This gives useful context even if the rebase ultimately succeeds
    let conflictingFiles: string[] = []
    try {
      const { stdout: mbOut } = await execFileAsync(
        'git', ['merge-base', 'HEAD', `${remote}/${baseBranch}`],
        { cwd: worktreePath }
      )
      const mergeBase = mbOut.trim()
      const [upstreamResult, sessionResult] = await Promise.all([
        execFileAsync('git', ['diff', '--name-only', mergeBase, `${remote}/${baseBranch}`], { cwd: worktreePath }),
        execFileAsync('git', ['diff', '--name-only', mergeBase, 'HEAD'], { cwd: worktreePath })
      ])
      const upstreamFiles = upstreamResult.stdout.split('\n').filter(Boolean)
      const sessionFiles = sessionResult.stdout.split('\n').filter(Boolean)
      conflictingFiles = upstreamFiles.filter((f) => sessionFiles.includes(f))
    } catch {
      // preflight is best-effort — a fresh branch with no commits has no merge-base
    }

    // Step 3: Attempt rebase
    try {
      const { stdout: rebaseOut } = await execFileAsync(
        'git', ['rebase', `${remote}/${baseBranch}`],
        { cwd: worktreePath }
      )
      return { success: true, output: rebaseOut.trim(), hasConflicts: false, conflictingFiles }
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string }
      const errStr = [e.stderr, e.stdout, e.message].filter(Boolean).join('\n')
      const hasConflicts = errStr.toLowerCase().includes('conflict')

      if (hasConflicts) {
        try {
          await execFileAsync('git', ['rebase', '--abort'], { cwd: worktreePath })
        } catch {
          // ignore abort error
        }
      }

      return {
        success: false,
        output: errStr.slice(0, 500),
        hasConflicts,
        conflictingFiles
      }
    }
  }

  async isGitRepo(dirPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: dirPath })
      return true
    } catch {
      return false
    }
  }

  async getRepoName(repoPath: string): Promise<string> {
    try {
      const remoteUrl = await this.git(repoPath, ['remote', 'get-url', 'origin'])
      const name = remoteUrl.split('/').pop()?.replace('.git', '') ?? path.basename(repoPath)
      return name
    } catch {
      return path.basename(repoPath)
    }
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      return await this.git(repoPath, ['branch', '--show-current'])
    } catch {
      return 'unknown'
    }
  }

  async deleteBranch(repoPath: string, branchName: string): Promise<void> {
    await this.git(repoPath, ['branch', '-D', branchName])
  }

  /** Returns 'merged' | 'open' | 'unknown' */
  async getBranchMergeStatus(repoPath: string, branchName: string, baseBranch: string): Promise<'merged' | 'open' | 'unknown'> {
    try {
      await execFileAsync('git', ['fetch', 'origin', baseBranch, '--quiet'], { cwd: repoPath }).catch(() => null)
      const mergedList = await this.git(repoPath, ['branch', '--merged', `origin/${baseBranch}`])
      const isMerged = mergedList.split('\n').some((b) => b.replace(/^\*?\s+/, '') === branchName)
      return isMerged ? 'merged' : 'open'
    } catch {
      return 'unknown'
    }
  }

  /** Fetch latest from origin for a repo (non-blocking update) */
  async fetchOrigin(repoPath: string): Promise<void> {
    await execFileAsync('git', ['fetch', 'origin', '--prune'], { cwd: repoPath })
  }

  /** Push current branch to origin, setting upstream tracking. */
  async pushBranch(worktreePath: string, branch: string, remote = 'origin'): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(
        'git', ['push', '--set-upstream', remote, branch],
        { cwd: worktreePath }
      )
      return { success: true, output: (stdout + stderr).trim() }
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string }
      const output = [e.stderr, e.stdout, e.message].filter(Boolean).join('\n').trim()
      return { success: false, output: output.slice(0, 500) }
    }
  }

  async getCommitLog(worktreePath: string, limit = 30): Promise<Array<{
    hash: string
    shortHash: string
    subject: string
    author: string
    date: string
  }>> {
    try {
      const out = await this.git(worktreePath, [
        'log', `--max-count=${limit}`,
        '--pretty=format:%H|%h|%s|%an|%ar'
      ])
      if (!out) return []
      return out.split('\n').filter(Boolean).map((line) => {
        const [hash, shortHash, subject, author, date] = line.split('|')
        return { hash, shortHash, subject, author, date }
      })
    } catch {
      return []
    }
  }

  async getChangedFiles(worktreePath: string): Promise<Array<{
    status: string
    file: string
  }>> {
    try {
      const out = await this.git(worktreePath, ['status', '--porcelain'])
      if (!out) return []
      return out.split('\n').filter(Boolean).map((line) => {
        const xy = line.slice(0, 2).trim() || '?'
        const file = line.slice(3)
        return { status: xy, file }
      })
    } catch {
      return []
    }
  }

  async getFileDiff(worktreePath: string, file: string): Promise<string> {
    try {
      // Try staged+unstaged diff vs HEAD
      const out = await this.git(worktreePath, ['diff', 'HEAD', '--', file])
      if (out) return out
      // Fallback: untracked file — show full content
      const content = await this.git(worktreePath, ['show', `:${file}`]).catch(() => '')
      return content
    } catch {
      return ''
    }
  }

  /**
   * Returns a PR creation URL for the given branch based on the repo's remote URL.
   * Supports GitHub, GitLab, and Bitbucket (HTTPS and SSH remotes).
   */
  async getPrUrl(repoPath: string, branch: string, baseBranch: string): Promise<string | null> {
    try {
      const remoteUrl = await this.git(repoPath, ['remote', 'get-url', 'origin'])

      // Normalise SSH → HTTPS and strip .git suffix
      // git@github.com:owner/repo.git  →  https://github.com/owner/repo
      // https://github.com/owner/repo.git  →  https://github.com/owner/repo
      const normalised = remoteUrl
        .replace(/^git@([^:]+):/, 'https://$1/')
        .replace(/\.git$/, '')

      const enc = encodeURIComponent

      if (normalised.includes('github.com')) {
        return `${normalised}/compare/${enc(baseBranch)}...${enc(branch)}?expand=1`
      }
      if (normalised.includes('gitlab.com') || normalised.match(/gitlab\./)) {
        return `${normalised}/-/merge_requests/new?merge_request[source_branch]=${enc(branch)}&merge_request[target_branch]=${enc(baseBranch)}`
      }
      if (normalised.includes('bitbucket.org')) {
        return `${normalised}/pull-requests/new?source=${enc(branch)}&dest=${enc(baseBranch)}`
      }

      // Unknown provider — best-effort: link to the repo root
      return normalised
    } catch {
      return null
    }
  }
}
