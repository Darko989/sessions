import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'

const execFileAsync = promisify(execFile)

/** Decode git's octal-escaped UTF-8 paths: \305\241 → š */
function decodeGitPath(p: string): string {
  const s = p.replace(/^"(.*)"$/, '$1')
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 3 < s.length && /^[0-3][0-7]{2}$/.test(s.slice(i + 1, i + 4))) {
      bytes.push(parseInt(s.slice(i + 1, i + 4), 8))
      i += 3
    } else {
      bytes.push(s.charCodeAt(i))
    }
  }
  return Buffer.from(bytes).toString('utf-8')
}

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
    // Get the default branch to exclude merged branches
    const defaultBranch = await this.getDefaultBranch(repoPath)
    let mergeRef = defaultBranch
    try {
      // Use origin/<default> if it exists for accurate merge detection
      await this.git(repoPath, ['rev-parse', '--verify', `origin/${defaultBranch}`])
      mergeRef = `origin/${defaultBranch}`
    } catch { /* fall back to local default branch */ }

    // Long-lived branches that should always appear as base branch options
    const protectedBranches = ['main', 'master', 'develop', 'development', 'staging', 'release']

    const output = await this.git(repoPath, ['branch', '-a', '--no-merged', mergeRef, '--format=%(refname:short)'])
    const branches = output
      .split('\n')
      .map((b) => b.trim().replace(/^origin\//, ''))
      .filter(Boolean)
      .filter((b) => b !== 'HEAD')
      .filter((v, i, arr) => arr.indexOf(v) === i)

    // Always include the default branch and other long-lived branches if they exist
    if (!branches.includes(defaultBranch)) branches.unshift(defaultBranch)

    // Check for protected branches that may have been filtered out
    try {
      const allBranches = await this.git(repoPath, ['branch', '-a', '--format=%(refname:short)'])
      const allSet = new Set(
        allBranches.split('\n').map((b) => b.trim().replace(/^origin\//, '')).filter(Boolean)
      )
      for (const pb of protectedBranches) {
        if (allSet.has(pb) && !branches.includes(pb)) {
          // Insert after defaultBranch
          const idx = branches.indexOf(defaultBranch)
          branches.splice(idx + 1, 0, pb)
        }
      }
    } catch { /* ignore */ }

    return branches
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
      // If the branch was never pushed to origin, it can't be merged via PR
      try {
        await this.git(repoPath, ['rev-parse', '--verify', `origin/${branchName}`])
      } catch {
        // origin/<branch> doesn't exist — branch was never pushed, so it's not merged
        return 'open'
      }

      await execFileAsync('git', ['fetch', 'origin', baseBranch, '--quiet'], { cwd: repoPath }).catch(() => null)
      const mergedList = await this.git(repoPath, ['branch', '-r', '--merged', `origin/${baseBranch}`])
      const isMerged = mergedList.split('\n').some((b) => b.trim() === `origin/${branchName}`)
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

  async getCommitLog(worktreePath: string, baseBranch?: string, limit = 30): Promise<Array<{
    hash: string
    shortHash: string
    subject: string
    author: string
    date: string
  }>> {
    try {
      const range = baseBranch ? `origin/${baseBranch}..HEAD` : `--max-count=${limit}`
      const out = await this.git(worktreePath, [
        'log', range,
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

  async getDiffCompare(worktreePath: string, baseBranch: string, remote = 'origin'): Promise<string> {
    try {
      await execFileAsync('git', ['fetch', remote, baseBranch, '--quiet'], { cwd: worktreePath }).catch(() => null)
      const diff = await this.git(worktreePath, ['diff', `${remote}/${baseBranch}...HEAD`])
      return diff || 'No differences found.'
    } catch {
      try {
        const diff = await this.git(worktreePath, ['diff', `${baseBranch}...HEAD`])
        return diff || 'No differences found.'
      } catch {
        return 'Unable to compute diff.'
      }
    }
  }

  async getDiffStats(worktreePath: string, baseBranch: string, remote = 'origin'): Promise<Array<{
    file: string
    additions: number
    deletions: number
    binary: boolean
  }>> {
    try {
      await execFileAsync('git', ['fetch', remote, baseBranch, '--quiet'], { cwd: worktreePath }).catch(() => null)
      const out = await this.git(worktreePath, ['diff', '--numstat', `${remote}/${baseBranch}...HEAD`])
      if (!out) return []
      return out.split('\n').filter(Boolean).map((line) => {
        const [add, del, ...fileParts] = line.split('\t')
        const file = decodeGitPath(fileParts.join('\t'))
        const binary = add === '-'
        return { file, additions: binary ? 0 : parseInt(add, 10), deletions: binary ? 0 : parseInt(del, 10), binary }
      })
    } catch {
      return []
    }
  }

  async getFileDiffVsBase(worktreePath: string, baseBranch: string, file: string, remote = 'origin'): Promise<string> {
    try {
      return await this.git(worktreePath, ['diff', `${remote}/${baseBranch}...HEAD`, '--', file]) || 'No changes'
    } catch {
      try {
        return await this.git(worktreePath, ['diff', `${baseBranch}...HEAD`, '--', file]) || 'No changes'
      } catch { return '' }
    }
  }

  /**
   * Runs health checks (build, typecheck, lint, tests) in the worktree.
   * Auto-detects project type. Only runs scripts the project defines — no guessing.
   */
  async runHealthChecks(worktreePath: string): Promise<Array<{
    check: string
    status: 'pass' | 'fail' | 'skip'
    output: string
    duration: number
  }>> {
    const results: Array<{ check: string; status: 'pass' | 'fail' | 'skip'; output: string; duration: number }> = []

    const fileExists = (f: string) => fs.existsSync(path.join(worktreePath, f))
    const hasPackageJson = fileExists('package.json')
    const hasCargo = fileExists('Cargo.toml')
    const hasGoMod = fileExists('go.mod')
    const hasPyproject = fileExists('pyproject.toml') || fileExists('setup.py') || fileExists('requirements.txt')
    const hasMakefile = fileExists('Makefile')
    const hasDotNet = fileExists('*.csproj') || fileExists('*.sln')
    const hasGemfile = fileExists('Gemfile')

    // Read package.json scripts if available
    let pkgScripts: Record<string, string> = {}
    if (hasPackageJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(worktreePath, 'package.json'), 'utf-8'))
        pkgScripts = pkg.scripts || {}
      } catch { /* ignore */ }
    }

    // Detect package manager
    let pm = 'npm'
    if (fileExists('pnpm-lock.yaml')) pm = 'pnpm'
    else if (fileExists('yarn.lock')) pm = 'yarn'
    else if (fileExists('bun.lockb')) pm = 'bun'

    // Strip ANSI escape codes from output
    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[A-Za-z]|\x1B\].*?\x07|\x1B\[.*?[a-zA-Z]/g, '')

    const runEnv = {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      NEXT_TELEMETRY_DISABLED: '1'
    }

    const run = async (check: string, cmd: string, args: string[]): Promise<void> => {
      // Check if the command exists before running
      try {
        await execFileAsync('which', [cmd], { timeout: 3000 })
      } catch {
        results.push({ check, status: 'skip', output: `"${cmd}" not found on PATH`, duration: 0 })
        return
      }

      const start = Date.now()
      try {
        const { stdout, stderr } = await execFileAsync(cmd, args, {
          cwd: worktreePath,
          timeout: 300_000,
          env: runEnv,
          maxBuffer: 2 * 1024 * 1024
        })
        results.push({
          check,
          status: 'pass',
          output: stripAnsi((stdout + stderr).trim()).slice(-1500),
          duration: Date.now() - start
        })
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean }
        const raw = [e.stderr, e.stdout, e.message].filter(Boolean).join('\n').trim()
        results.push({
          check,
          status: 'fail',
          output: e.killed ? 'Timed out after 5 minutes' : stripAnsi(raw).slice(-2000),
          duration: Date.now() - start
        })
      }
    }

    // ── Node.js / TypeScript projects ────────────────────────────────────
    if (hasPackageJson) {
      // Install deps if node_modules missing
      if (!fileExists('node_modules')) {
        await run('Install dependencies', pm, ['install'])
        if (results[results.length - 1]?.status === 'fail') return results
      }

      // TypeScript — only run if project has a script or tsconfig
      if (pkgScripts['typecheck']) {
        await run('TypeScript', pm, ['run', 'typecheck'])
      } else if (pkgScripts['type-check']) {
        await run('TypeScript', pm, ['run', 'type-check'])
      } else if (fileExists('tsconfig.json')) {
        await run('TypeScript', 'npx', ['tsc', '--noEmit'])
      }

      // Lint — only run project-defined scripts or if config exists
      const hasLintConfig = fileExists('.eslintrc') || fileExists('.eslintrc.js') || fileExists('.eslintrc.json')
        || fileExists('.eslintrc.yml') || fileExists('.eslintrc.yaml') || fileExists('.eslintrc.cjs')
        || fileExists('eslint.config.js') || fileExists('eslint.config.mjs') || fileExists('eslint.config.cjs')
        || fileExists('biome.json') || fileExists('biome.jsonc')
      if (pkgScripts['lint']) {
        await run('Lint', pm, ['run', 'lint'])
      } else if (hasLintConfig) {
        if (fileExists('biome.json') || fileExists('biome.jsonc')) {
          await run('Lint', 'npx', ['biome', 'check', '.'])
        } else {
          await run('Lint', 'npx', ['eslint', '.'])
        }
      }

      // Build — only run if project defines it
      if (pkgScripts['build']) {
        await run('Build', pm, ['run', 'build'])
      }

      // Tests — only run project-defined scripts
      if (pkgScripts['test']) {
        await run('Tests', pm, ['run', 'test'])
      } else if (pkgScripts['test:unit']) {
        await run('Tests', pm, ['run', 'test:unit'])
      }
    }

    // ── Rust ─────────────────────────────────────────────────────────────
    if (hasCargo) {
      await run('Build', 'cargo', ['check'])
      await run('Lint', 'cargo', ['clippy', '--', '-D', 'warnings'])
      await run('Tests', 'cargo', ['test', '--no-fail-fast'])
    }

    // ── Go ───────────────────────────────────────────────────────────────
    if (hasGoMod) {
      await run('Build', 'go', ['build', './...'])
      await run('Lint', 'go', ['vet', './...'])
      await run('Tests', 'go', ['test', './...', '-short'])
    }

    // ── Python ───────────────────────────────────────────────────────────
    if (hasPyproject && !hasPackageJson) {
      if (fileExists('pyproject.toml')) {
        try {
          const pyproject = fs.readFileSync(path.join(worktreePath, 'pyproject.toml'), 'utf-8')
          if (pyproject.includes('ruff')) await run('Lint', 'ruff', ['check', '.'])
          else if (pyproject.includes('flake8')) await run('Lint', 'flake8', ['.'])
          if (pyproject.includes('mypy')) await run('TypeCheck', 'mypy', ['.'])
          if (pyproject.includes('pytest')) await run('Tests', 'pytest', ['--tb=short', '-q'])
        } catch { /* ignore */ }
      }
    }

    // ── .NET ─────────────────────────────────────────────────────────────
    if (hasDotNet) {
      await run('Build', 'dotnet', ['build', '--no-restore'])
      await run('Tests', 'dotnet', ['test', '--no-build'])
    }

    // ── Ruby ─────────────────────────────────────────────────────────────
    if (hasGemfile && !hasPackageJson) {
      await run('Tests', 'bundle', ['exec', 'rake'])
    }

    // ── Makefile fallback ────────────────────────────────────────────────
    if (hasMakefile && results.length === 0) {
      const makefile = fs.readFileSync(path.join(worktreePath, 'Makefile'), 'utf-8')
      if (/^lint:/m.test(makefile)) await run('Lint', 'make', ['lint'])
      if (/^test:/m.test(makefile)) await run('Tests', 'make', ['test'])
      if (/^check:/m.test(makefile)) await run('Build', 'make', ['check'])
    }

    // If nothing detected
    if (results.length === 0) {
      results.push({ check: 'Detection', status: 'skip', output: 'No supported project type detected', duration: 0 })
    }

    return results
  }

  /**
   * Get files recently changed in main/base branch that overlap with session changes.
   * Returns files that changed in main in the last 30 days AND are also modified in the session.
   */
  async getConflictRisk(
    worktreePath: string,
    baseBranch: string,
    remote = 'origin'
  ): Promise<Array<{ file: string; mainCommits: number; authors: string[] }>> {
    // Get files changed in this session vs base
    let sessionFiles: string[] = []
    try {
      const out = await this.git(worktreePath, ['diff', '--name-only', `${remote}/${baseBranch}...HEAD`])
      sessionFiles = out.split('\n').filter(Boolean).map(decodeGitPath)
    } catch {
      try {
        const out = await this.git(worktreePath, ['diff', '--name-only', `${baseBranch}...HEAD`])
        sessionFiles = out.split('\n').filter(Boolean).map(decodeGitPath)
      } catch { return [] }
    }
    if (sessionFiles.length === 0) return []

    // Get recent changes in main (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    let mainLog: string
    try {
      // Fetch latest main first
      await this.git(worktreePath, ['fetch', remote, baseBranch]).catch(() => {})
      mainLog = await this.git(worktreePath, ['log', `${remote}/${baseBranch}`, '--since', since, '--name-only', '--pretty=format:%an'])
    } catch {
      try {
        mainLog = await this.git(worktreePath, ['log', baseBranch, '--since', since, '--name-only', '--pretty=format:%an'])
      } catch { return [] }
    }

    // Parse: author lines alternate with file lines
    const mainFileInfo = new Map<string, { commits: number; authors: Set<string> }>()
    let currentAuthor = ''
    for (const line of mainLog.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      // Lines that look like file paths (contain / or .)
      if (trimmed.includes('/') || trimmed.includes('.')) {
        const decoded = decodeGitPath(trimmed)
        const info = mainFileInfo.get(decoded) || { commits: 0, authors: new Set<string>() }
        info.commits++
        if (currentAuthor) info.authors.add(currentAuthor)
        mainFileInfo.set(decoded, info)
      } else {
        currentAuthor = trimmed
      }
    }

    // Find overlapping files
    const risks: Array<{ file: string; mainCommits: number; authors: string[] }> = []
    for (const file of sessionFiles) {
      const info = mainFileInfo.get(file)
      if (info && info.commits > 0) {
        risks.push({ file, mainCommits: info.commits, authors: [...info.authors] })
      }
    }

    // Sort by number of commits (most active first)
    risks.sort((a, b) => b.mainCommits - a.mainCommits)
    return risks
  }

  /**
   * Codebase-aware code review. Reads actual files from the worktree,
   * searches for duplicates, broken imports, existing patterns, etc.
   */
  async analyzeCodebase(
    worktreePath: string,
    baseBranch: string,
    remote = 'origin'
  ): Promise<{
    findings: Array<{
      severity: 'must_fix' | 'nice_to_fix' | 'nitpick'
      file: string
      detail: string
      recommendation: string
    }>
  }> {
    const findings: Array<{
      severity: 'must_fix' | 'nice_to_fix' | 'nitpick'
      file: string
      detail: string
      recommendation: string
    }> = []

    // Get list of changed files
    let changedFiles: string[] = []
    try {
      const out = await this.git(worktreePath, ['diff', '--name-only', `${remote}/${baseBranch}...HEAD`])
      changedFiles = out.split('\n').filter(Boolean).map(decodeGitPath)
    } catch {
      try {
        const out = await this.git(worktreePath, ['diff', '--name-only', `${baseBranch}...HEAD`])
        changedFiles = out.split('\n').filter(Boolean).map(decodeGitPath)
      } catch { return { findings } }
    }

    const sourceExts = /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cpp|cs|php)$/
    const sourceFiles = changedFiles.filter((f) => sourceExts.test(f))
    if (sourceFiles.length === 0) return { findings }

    // Read each changed source file's full content
    const fileContents: Record<string, string> = {}
    for (const file of sourceFiles) {
      const fullPath = path.join(worktreePath, file)
      try {
        if (fs.existsSync(fullPath)) {
          fileContents[file] = fs.readFileSync(fullPath, 'utf-8')
        }
      } catch { /* skip unreadable */ }
    }

    // ── 1. Check for broken imports/requires referencing deleted files ──
    const deletedFiles = new Set<string>()
    for (const file of changedFiles) {
      const fullPath = path.join(worktreePath, file)
      if (!fs.existsSync(fullPath)) deletedFiles.add(file)
    }

    if (deletedFiles.size > 0) {
      for (const [file, content] of Object.entries(fileContents)) {
        for (const deleted of deletedFiles) {
          const baseName = path.basename(deleted).replace(/\.[^.]+$/, '')
          const dirName = path.dirname(deleted)
          if (
            content.includes(`from '${baseName}'`) ||
            content.includes(`from "./${baseName}"`) ||
            content.includes(`from './${baseName}'`) ||
            content.includes(`require('${baseName}')`) ||
            content.includes(`from '${dirName}/${baseName}'`) ||
            content.includes(`from './${dirName}/${baseName}'`)
          ) {
            findings.push({
              severity: 'must_fix', file,
              detail: `Imports from "${deleted}" which was deleted in this PR. This will cause a build error or runtime crash.`,
              recommendation: `Update the import in ${file} to point to the new location, or remove the import if the functionality was removed.`
            })
          }
        }
      }
    }

    // ── 2. Search for duplicate functions/utilities in the codebase ──────
    const newDefinitions: Array<{ name: string; file: string }> = []
    for (const [file, content] of Object.entries(fileContents)) {
      const lines = content.split('\n')
      for (const line of lines) {
        const match = line.match(/(?:export\s+)?(?:async\s+)?(?:function|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]{2,})\s*(?:=\s*(?:\([^)]*\)\s*=>|function)|[\s(])/)
        if (match) {
          const name = match[1]
          if (!/^(e|i|j|k|n|s|t|fn|cb|el|on|to|_|it|is|go|ok|id)$/.test(name) && name.length >= 4) {
            newDefinitions.push({ name, file })
          }
        }
      }
    }

    if (newDefinitions.length > 0) {
      const uniqueNames = [...new Set(newDefinitions.map((d) => d.name))]
      const namesToCheck = uniqueNames.slice(0, 20)

      for (const name of namesToCheck) {
        try {
          const grepResult = await execFileAsync('grep', [
            '-rl', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
            `\\b${name}\\b`, '.'
          ], { cwd: worktreePath, timeout: 5000, maxBuffer: 512 * 1024 }).catch(() => ({ stdout: '' }))

          const matchFiles = (grepResult.stdout || '').split('\n').filter(Boolean)
            .map((f: string) => f.replace(/^\.\//, ''))
            .filter((f: string) => !sourceFiles.includes(f))

          if (matchFiles.length > 0) {
            const defFile = newDefinitions.find((d) => d.name === name)?.file || '?'
            for (const otherFile of matchFiles.slice(0, 3)) {
              try {
                const otherContent = fs.readFileSync(path.join(worktreePath, otherFile), 'utf-8')
                const defPattern = new RegExp(`(?:export\\s+)?(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`)
                if (defPattern.test(otherContent)) {
                  findings.push({
                    severity: 'nice_to_fix', file: defFile,
                    detail: `"${name}" is defined in ${defFile}, but a similar definition already exists in ${otherFile}. This may be unintentional duplication.`,
                    recommendation: `Check if the existing "${name}" in ${otherFile} can be reused. If they serve different purposes, consider renaming to clarify intent.`
                  })
                  break
                }
              } catch { /* skip */ }
            }
          }
        } catch { /* grep failed */ }
      }
    }

    // ── 3. Check blast radius — how many files import from changed files ──
    for (const changedFile of sourceFiles.slice(0, 10)) {
      const baseName = path.basename(changedFile).replace(/\.[^.]+$/, '')
      try {
        const grepResult = await execFileAsync('grep', [
          '-rl', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
          baseName, '.'
        ], { cwd: worktreePath, timeout: 5000, maxBuffer: 512 * 1024 }).catch(() => ({ stdout: '' }))

        const importers = (grepResult.stdout || '').split('\n').filter(Boolean)
          .map((f: string) => f.replace(/^\.\//, ''))
          .filter((f: string) => f !== changedFile && !sourceFiles.includes(f))

        if (importers.length > 5) {
          findings.push({
            severity: 'nice_to_fix', file: changedFile,
            detail: `This file is imported by ${importers.length} other files. Changes here have a wide blast radius: ${importers.slice(0, 4).join(', ')}${importers.length > 4 ? ` +${importers.length - 4} more` : ''}.`,
            recommendation: 'Ensure exported interfaces haven\'t changed in breaking ways. Consider adding deprecation warnings for renamed/removed exports.'
          })
        }
      } catch { /* skip */ }
    }

    // ── 4. Check for inconsistent patterns vs existing codebase ──────────
    for (const [file, content] of Object.entries(fileContents)) {
      const dir = path.dirname(path.join(worktreePath, file))
      try {
        const siblings = fs.readdirSync(dir)
          .filter((f) => sourceExts.test(f) && f !== path.basename(file))
          .slice(0, 5)

        let siblingsUseTryCatch = 0
        let siblingsUseCatch = 0
        for (const sib of siblings) {
          try {
            const sibContent = fs.readFileSync(path.join(dir, sib), 'utf-8')
            if (sibContent.includes('try {')) siblingsUseTryCatch++
            if (sibContent.includes('.catch(')) siblingsUseCatch++
          } catch { /* skip */ }
        }

        if (siblings.length >= 2) {
          const usesTryCatch = content.includes('try {')
          const usesDotCatch = content.includes('.catch(')
          if (siblingsUseCatch >= 2 && siblingsUseTryCatch === 0 && usesTryCatch && !usesDotCatch) {
            findings.push({
              severity: 'nitpick', file,
              detail: 'This file uses try/catch while other files in the same directory use .catch() for error handling.',
              recommendation: 'Consider using the same error handling pattern as neighboring files for consistency.'
            })
          } else if (siblingsUseTryCatch >= 2 && siblingsUseCatch === 0 && usesDotCatch && !usesTryCatch) {
            findings.push({
              severity: 'nitpick', file,
              detail: 'This file uses .catch() while other files in the same directory use try/catch for error handling.',
              recommendation: 'Consider using the same error handling pattern as neighboring files for consistency.'
            })
          }
        }
      } catch { /* skip */ }
    }

    // ── 5. Check for exported symbols that were removed/renamed ──────────
    try {
      const diffOutput = await this.git(worktreePath, ['diff', `${remote}/${baseBranch}...HEAD`])
      const removedExports: Array<{ name: string; file: string }> = []

      const fileDiffs = diffOutput.split(/^diff --git /m)
      for (const fileDiff of fileDiffs) {
        if (!fileDiff.trim()) continue
        const headerEnd = fileDiff.indexOf('\n')
        const header = fileDiff.slice(0, headerEnd)
        const bMatch = header.match(/\s"?b\/(.+?)(?:"?\s*$)/)
        if (!bMatch) continue
        const file = decodeGitPath(bMatch[1].replace(/"$/, ''))

        const lines = fileDiff.split('\n')
        for (const line of lines) {
          if (line.startsWith('-') && !line.startsWith('---')) {
            const exportMatch = line.match(/^-\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]+)/)
            if (exportMatch) {
              const name = exportMatch[1]
              const wasReAdded = lines.some((l) =>
                l.startsWith('+') && !l.startsWith('+++') &&
                new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|interface|type|enum)\\s+${name}\\b`).test(l)
              )
              if (!wasReAdded) {
                removedExports.push({ name, file })
              }
            }
          }
        }
      }

      for (const { name, file } of removedExports.slice(0, 10)) {
        try {
          const grepResult = await execFileAsync('grep', [
            '-rl', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
            name, '.'
          ], { cwd: worktreePath, timeout: 5000, maxBuffer: 512 * 1024 }).catch(() => ({ stdout: '' }))

          const usages = (grepResult.stdout || '').split('\n').filter(Boolean)
            .map((f: string) => f.replace(/^\.\//, ''))
            .filter((f: string) => f !== file && !sourceFiles.includes(f))

          if (usages.length > 0) {
            findings.push({
              severity: 'must_fix', file,
              detail: `Exported symbol "${name}" was removed but is still referenced in ${usages.length} file${usages.length > 1 ? 's' : ''}: ${usages.slice(0, 3).join(', ')}${usages.length > 3 ? ` +${usages.length - 3} more` : ''}.`,
              recommendation: `Either keep the export, add a re-export alias, or update all ${usages.length} consumer${usages.length > 1 ? 's' : ''}.`
            })
          }
        } catch { /* skip */ }
      }
    } catch { /* diff failed */ }

    return { findings }
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
