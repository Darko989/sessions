import React, { useState, useEffect, useCallback } from 'react'
import { Session, GitStatus, ActivityEntry } from '../../types'
import { useAppStore } from '../../store/appStore'
import iconVSCode from '../../assets/icons/vscode.png'
import iconTerminal from '../../assets/icons/terminal.webp'
import iconCursor from '../../assets/icons/cursor.jpeg'
import iconClaude from '../../assets/icons/claude-code.png'
import iconIntelliJ from '../../assets/icons/intellij.webp'
import iconPhpStorm from '../../assets/icons/phpstorm.png'

interface Props {
  session: Session
}

// ── App card definitions ──────────────────────────────────────────────────────

interface AppDef {
  id: string
  label: string
  icon: React.ReactNode
  action: (sessionId: string) => Promise<unknown>
}

const AppIcon = ({ src, label }: { src: string; label: string }) => (
  <img src={src} alt={label} className="w-11 h-11 rounded-xl object-cover" draggable={false}/>
)


// ── Copy command section ──────────────────────────────────────────────────────

const CopyManually: React.FC<{ path: string }> = ({ path }) => {
  const [copied, setCopied] = useState(false)
  const [iterm, setIterm] = useState(false)

  const getCommand = () => {
    if (iterm) {
      return `cd "${path}" && printf "\\033]0;${path.split('/').pop()}\\007"`
    }
    return `cd "${path}"`
  }

  const copy = () => {
    navigator.clipboard.writeText(getCommand())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-panel-border bg-panel-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">Copy Manually</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">iTerm2 label</span>
          <button
            onClick={() => setIterm(!iterm)}
            className={`flex rounded-full border text-xs font-medium overflow-hidden ${iterm ? 'border-accent/30' : 'border-panel-border'}`}
          >
            <span className={`px-2 py-0.5 ${iterm ? 'bg-accent text-white' : 'text-ink-3'}`}>On</span>
            <span className={`px-2 py-0.5 ${!iterm ? 'bg-panel-hover text-ink' : 'text-ink-3'}`}>Off</span>
          </button>
        </div>
      </div>
      <button
        onClick={copy}
        className="w-full text-left font-mono text-xs bg-panel-bg border border-panel-border rounded-lg px-3 py-2.5 text-ink-2 hover:bg-panel-hover transition-colors flex items-center justify-between gap-3 group"
      >
        <span className="truncate">{getCommand()}</span>
        <span className={`flex-shrink-0 text-xs font-sans font-medium transition-colors ${copied ? 'text-green-600' : 'text-ink-3 group-hover:text-ink'}`}>
          {copied ? 'Copied!' : 'Click to copy'}
        </span>
      </button>
    </div>
  )
}

// ── Activity section ──────────────────────────────────────────────────────────

const ActivitySection: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [entries, setEntries] = useState<ActivityEntry[]>([])

  useEffect(() => {
    window.api.activity.getForSession(sessionId)
      .then((e) => setEntries(e as ActivityEntry[]))
      .catch(() => setEntries([]))
  }, [sessionId])

  if (entries.length === 0) return null

  const icons: Record<string, string> = {
    session_created: '✦',
    session_opened: '⬒',
    session_synced: '↻',
  }

  return (
    <div className="rounded-xl border border-panel-border bg-panel-card p-4">
      <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Activity</div>
      <div className="space-y-2">
        {entries.slice(0, 8).map((e) => (
          <div key={e.id} className="flex items-start gap-2.5">
            <span className="text-accent text-sm w-4 text-center flex-shrink-0 mt-px">{icons[e.type] ?? '·'}</span>
            <span className="text-[13px] leading-snug text-ink flex-1">{e.message}</span>
            <span className="text-[11px] font-medium text-ink-3 flex-shrink-0 tabular-nums">
              {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Shared utilities ─────────────────────────────────────────────────────────

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
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function splitDiffByFile(diff: string): Record<string, string> {
  const result: Record<string, string> = {}
  const parts = diff.split(/^diff --git /m)
  for (const part of parts) {
    if (!part.trim()) continue
    const headerEnd = part.indexOf('\n')
    const header = part.slice(0, headerEnd)
    const bMatch = header.match(/\s"?b\/(.+?)(?:"?\s*$)/)
    if (bMatch) {
      const rawPath = bMatch[1].replace(/"$/, '')
      result[decodeGitPath(rawPath)] = 'diff --git ' + part
    }
  }
  return result
}

// ── Diff Compare tab ─────────────────────────────────────────────────────────

interface DiffFileStat {
  file: string
  additions: number
  deletions: number
  binary: boolean
}

const DiffCompareTab: React.FC<{ sessionId: string; baseBranch: string }> = ({ sessionId, baseBranch }) => {
  const [stats, setStats] = useState<DiffFileStat[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.sessions.getDiffStats(sessionId) as Promise<DiffFileStat[]>,
      window.api.sessions.getDiffCompare(sessionId) as Promise<string>
    ]).then(([st, fullDiff]) => {
      setStats(st)
      setFileDiffs(splitDiffByFile(fullDiff))
    }).catch(() => {
      setStats([])
      setFileDiffs({})
    }).finally(() => setLoading(false))
  }, [sessionId])

  const toggleFile = (file: string) => {
    setExpandedFile(expandedFile === file ? null : file)
  }

  const totalAdd = stats.reduce((s, f) => s + f.additions, 0)
  const totalDel = stats.reduce((s, f) => s + f.deletions, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (stats.length === 0) {
    return <div className="text-center py-12 text-xs text-ink-3">No differences vs {baseBranch}</div>
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="rounded-xl border border-panel-border bg-panel-card p-4">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-ink">{stats.length} files changed</span>
          <span className="text-xs font-mono text-green-600">+{totalAdd}</span>
          <span className="text-xs font-mono text-red-500">-{totalDel}</span>
          <span className="ml-auto text-xs text-ink-3">vs <span className="font-mono">{baseBranch}</span></span>
        </div>
        <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-panel-bg">
          {totalAdd + totalDel > 0 && (
            <>
              <div className="bg-green-500 h-full" style={{ width: `${(totalAdd / (totalAdd + totalDel)) * 100}%` }} />
              <div className="bg-red-500 h-full" style={{ width: `${(totalDel / (totalAdd + totalDel)) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="rounded-xl border border-panel-border bg-panel-card overflow-hidden">
        <div className="divide-y divide-panel-border">
          {stats.map(({ file, additions, deletions, binary }) => {
            const diffKey = file in fileDiffs
              ? file
              : Object.keys(fileDiffs).find((k) => k.endsWith(file) || file.endsWith(k)) || file
            const diff = fileDiffs[diffKey] || ''

            return (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover text-left transition-colors"
                >
                  <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                  {binary ? (
                    <span className="text-xs text-ink-3">binary</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {additions > 0 && <span className="text-xs font-mono text-green-600">+{additions}</span>}
                      {deletions > 0 && <span className="text-xs font-mono text-red-500">-{deletions}</span>}
                    </div>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 text-ink-3 flex-shrink-0 transition-transform ${expandedFile === file ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedFile === file && (
                  <div className="border-t border-panel-border bg-gray-950 overflow-x-auto">
                    {diff ? (
                      <pre className="text-xs font-mono p-4 leading-relaxed whitespace-pre">
                        {diff.split('\n').map((line, i) => (
                          <div key={i} className={
                            line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' :
                            line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                            line.startsWith('@@') ? 'text-blue-400' :
                            'text-gray-400'
                          }>{line || ' '}</div>
                        ))}
                      </pre>
                    ) : (
                      <div className="text-xs text-gray-500 p-4">No diff content available</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── PR Risk Review tab ───────────────────────────────────────────────────────

type FindingSeverity = 'must_fix' | 'nice_to_fix' | 'nitpick'

interface ReviewFinding {
  severity: FindingSeverity
  file: string
  detail: string
  recommendation: string
}

interface RiskAssessment {
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  findings: ReviewFinding[]
  summary: string
}

interface FileCodeReview {
  file: string
  additions: number
  deletions: number
  findings: ReviewFinding[]
}

const RISK_COLORS: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  LOW:      { text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500' },
  MEDIUM:   { text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  HIGH:     { text: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500' },
  CRITICAL: { text: 'text-red-700',    bg: 'bg-red-100',   border: 'border-red-300',    dot: 'bg-red-700' },
}

const SEVERITY_STYLE: Record<FindingSeverity, { label: string; color: string; bg: string; border: string; dot: string }> = {
  must_fix:    { label: 'Must Fix',    color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200',   dot: 'bg-red-500' },
  nice_to_fix: { label: 'Nice to Fix', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  nitpick:     { label: 'Nitpick',     color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', dot: 'bg-slate-400' },
}

function getAddedLines(fileDiff: string): string[] {
  return fileDiff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
}

/** Analyze a single file's diff and produce review findings */
function analyzeFile(file: string, fileDiff: string, stat: DiffFileStat): ReviewFinding[] {
  const findings: ReviewFinding[] = []
  const addedLines = getAddedLines(fileDiff)
  const addedText = addedLines.join('\n')
  const totalLines = stat.additions + stat.deletions
  const isSource = /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cpp|cs|php)$/.test(file)

  // Correctness
  if (isSource) {
    const syntaxIssues: string[] = []
    for (const rawLine of addedLines) {
      const trimmed = rawLine.slice(1).trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue
      for (const q of ["'", '"']) {
        const matches = trimmed.match(new RegExp(`(?<!\\\\)${q === "'" ? "'" : '"'}`, 'g'))
        if (matches && matches.length % 2 !== 0 && !trimmed.includes('`')) {
          syntaxIssues.push(trimmed.slice(0, 80))
          break
        }
      }
      const opens = (trimmed.match(/[({[]/g) || []).length
      const closes = (trimmed.match(/[)}\]]/g) || []).length
      if (opens > 0 && closes > opens + 2) syntaxIssues.push(trimmed.slice(0, 80))
      if (trimmed.length > 10 && !/[=(){}[\];:'"`,.<>+\-*\/|&!?@#$%^~]/.test(trimmed) && !/^(import|export|const|let|var|function|class|if|else|return|from|type|interface|enum|for|while|switch|case|break|continue|throw|try|catch|finally|async|await|default|new|delete|typeof|void|in|of|do|with|yield|def|end|fn|pub|mod|use|impl|struct|trait|match|loop)\b/.test(trimmed)) {
        syntaxIssues.push(`Suspicious non-code text: ${trimmed.slice(0, 60)}`)
      }
    }
    if (syntaxIssues.length > 0) {
      findings.push({ severity: 'must_fix', file, detail: `${syntaxIssues.length} syntax issue${syntaxIssues.length > 1 ? 's' : ''} detected. ${syntaxIssues.slice(0, 3).map(s => `"${s}"`).join(', ')}`, recommendation: 'Fix syntax errors before merging. These will likely cause build failures or runtime crashes.' })
    }
  }

  // Corrupted code
  if (isSource) {
    const removedLines = fileDiff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'))
    const removedCode = removedLines.map((l) => l.slice(1).trim()).filter((l) => l.length > 5)
    const addedCode = addedLines.map((l) => l.slice(1).trim()).filter((l) => l.length > 5)
    if (removedCode.length > 0 && addedCode.length > 0) {
      const broken = addedCode.filter((line) => {
        const semiCount = (line.match(/;/g) || []).length
        if (semiCount >= 3 && !line.includes('for')) return true
        if (/[a-z]{5,};[a-z]{3,}/i.test(line)) return true
        return false
      })
      if (broken.length > 0) {
        findings.push({ severity: 'must_fix', file, detail: `${broken.length} line${broken.length > 1 ? 's look' : ' looks'} like corrupted code. Example: "${broken[0].slice(0, 80)}"`, recommendation: 'Revert these changes and re-apply the intended modifications.' })
      }
    }
  }

  // Brace balance
  if (isSource) {
    let bal = 0
    for (const rawLine of addedLines) { const ns = rawLine.slice(1).replace(/'[^']*'|"[^"]*"|`[^`]*`/g, ''); bal += (ns.match(/{/g) || []).length; bal -= (ns.match(/}/g) || []).length }
    if (bal < -2 || bal > 3) findings.push({ severity: 'nice_to_fix', file, detail: `Unbalanced braces in added code (${bal > 0 ? '+' : ''}${bal}).`, recommendation: 'Verify brace matching in full file context.' })
  }

  // Empty catch
  if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(addedText) || /catch\s*\{\s*\}/.test(addedText))
    findings.push({ severity: 'must_fix', file, detail: 'Empty catch block silently swallows errors.', recommendation: 'Add error handling, logging, or re-throw.' })

  // Non-null assertions
  const nnc = (addedText.match(/\w+!\./g) || []).length
  if (nnc >= 3) findings.push({ severity: 'nice_to_fix', file, detail: `${nnc} non-null assertions (!) bypass TypeScript safety.`, recommendation: 'Add proper null checks or use optional chaining.' })

  // as any
  const aac = (addedText.match(/as\s+any/g) || []).length
  if (aac > 0) findings.push({ severity: aac >= 3 ? 'must_fix' : 'nice_to_fix', file, detail: `${aac} \`as any\` cast${aac > 1 ? 's' : ''} disable type checking.`, recommendation: 'Use proper types or \`unknown\` with type guards.' })

  // Console statements
  const cm = addedText.match(/console\.(log|debug|warn|error|info)\(/g)
  if (cm && cm.length > 0) findings.push({ severity: 'nice_to_fix', file, detail: `${cm.length} console statement${cm.length > 1 ? 's' : ''} left in code.`, recommendation: 'Remove debug logging before merging.' })

  // TODO/FIXME
  const dm = addedText.match(/\b(TODO|FIXME|HACK|XXX)\b/g)
  if (dm && dm.length > 0) findings.push({ severity: 'nitpick', file, detail: `${dm.length} tech debt marker${dm.length > 1 ? 's' : ''}: ${[...new Set(dm)].join(', ')}.`, recommendation: 'Address now or create a follow-up ticket.' })

  // Suppressions
  const sp = addedText.match(/(eslint-disable|@ts-ignore|@ts-expect-error|noqa|noinspection)/g)
  if (sp && sp.length > 0) findings.push({ severity: 'nice_to_fix', file, detail: `${sp.length} lint/type suppression${sp.length > 1 ? 's' : ''}.`, recommendation: 'Fix the underlying issue instead of suppressing.' })

  // Large change
  if (totalLines > 300 && isSource) findings.push({ severity: 'nice_to_fix', file, detail: `Large change: +${stat.additions} / -${stat.deletions} lines.`, recommendation: 'Consider splitting into smaller changes.' })

  // Deep nesting
  const dn = addedLines.filter((l) => /^\+(\s{12,}|\t{3,})\S/.test(l))
  if (dn.length >= 5) findings.push({ severity: 'nitpick', file, detail: 'Deeply nested code (3+ levels).', recommendation: 'Use early returns or extract helper functions.' })

  // Duplication
  const cl = addedLines.map((l) => l.slice(1).trim()).filter((l) => l.length > 10)
  const sb = new Map<string, number>()
  for (let i = 0; i < cl.length - 2; i++) { const b = cl.slice(i, i + 3).join('|'); sb.set(b, (sb.get(b) || 0) + 1) }
  const db = [...sb.entries()].filter(([, c]) => c >= 2)
  if (db.length > 0) findings.push({ severity: 'nice_to_fix', file, detail: `${db.length} repeated code block${db.length > 1 ? 's' : ''} in this file.`, recommendation: 'Extract into a shared helper or loop.' })

  // Await in loop
  if (/for\s*\(|\.forEach\(|\.map\(|while\s*\(/.test(addedText) && /await\s/.test(addedText)) {
    const la = addedLines.some((l, i) => { if (!/await\s/.test(l)) return false; for (let j = Math.max(0, i - 10); j < i; j++) { if (/for\s*\(|\.forEach\(|\.map\(|while\s*\(/.test(addedLines[j])) return true } return false })
    if (la) findings.push({ severity: 'must_fix', file, detail: 'Await inside loop — potential N+1 performance issue.', recommendation: 'Use Promise.all() or batch operations.' })
  }

  // Security: XSS
  if (/eval\(|new Function\(|innerHTML\s*=|dangerouslySetInnerHTML|v-html/.test(addedText))
    findings.push({ severity: 'must_fix', file, detail: 'Potential XSS / code injection detected.', recommendation: 'Use safe alternatives like textContent or sanitize input.' })

  // Security: SQL injection
  if (/(?:SELECT|INSERT|UPDATE|DELETE)\s+.*(?:FROM|INTO|SET)\s/i.test(addedText) && !/\$\d|\?\s|%s/.test(addedText))
    findings.push({ severity: 'must_fix', file, detail: 'Potential SQL injection — inline SQL without parameterized placeholders.', recommendation: 'Use prepared statements or an ORM.' })

  // Security: hardcoded secrets
  if (/(?:password|secret|api_?key|token|private_?key)\s*[:=]\s*['"][^'"]{4,}['"]/i.test(addedText))
    findings.push({ severity: 'must_fix', file, detail: 'Possible hardcoded secret in source code.', recommendation: 'Move to environment variables or a secrets manager.' })

  // Security: sensitive files
  if (/\.env$|\.pem$|\.key$|credentials/i.test(file) && !/\.example|\.sample|\.template/i.test(file))
    findings.push({ severity: 'must_fix', file, detail: 'Security-sensitive file modified.', recommendation: 'Verify no sensitive values are being committed.' })

  // Security: CORS wildcard
  if (/Access-Control-Allow-Origin.*\*|cors\(\s*\)/.test(addedText))
    findings.push({ severity: 'nice_to_fix', file, detail: 'Open CORS policy (wildcard origin).', recommendation: 'Restrict to specific allowed domains.' })

  return findings
}

/** Build risk assessment from file reviews and stats */
function buildRiskAssessment(stats: DiffFileStat[], fileReviews: FileCodeReview[]): RiskAssessment {
  const allFindings: ReviewFinding[] = []
  const totalChanges = stats.reduce((s, f) => s + f.additions + f.deletions, 0)
  const fileCount = stats.length
  const sourceFiles = stats.filter((f) => /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cpp|cs|php)$/.test(f.file))
  const testFiles = stats.filter((f) => /test|spec|__tests__|_test\./i.test(f.file))

  if (totalChanges > 1000) allFindings.push({ severity: 'must_fix', file: `${fileCount} files`, detail: `Very large PR: ${totalChanges} lines across ${fileCount} files.`, recommendation: 'Split into smaller, incremental PRs.' })
  else if (totalChanges > 500) allFindings.push({ severity: 'nice_to_fix', file: `${fileCount} files`, detail: `Moderately large PR: ${totalChanges} lines.`, recommendation: 'Split unrelated changes into separate PRs.' })

  const depFiles = stats.filter((f) => /package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|Cargo\.lock|go\.sum|poetry\.lock/i.test(f.file))
  if (depFiles.length > 0) allFindings.push({ severity: 'must_fix', file: depFiles.map((f) => f.file).join(', '), detail: 'Dependency lockfile changed.', recommendation: 'Run npm audit or equivalent. Review new packages.' })

  const migFiles = stats.filter((f) => /migrat/i.test(f.file) || /\d{4,}.*\.(sql|ts|js)/.test(f.file.split('/').pop() || ''))
  if (migFiles.length > 0) allFindings.push({ severity: 'must_fix', file: migFiles.map((f) => f.file).join(', '), detail: 'Database migration detected.', recommendation: 'Ensure migrations are reversible and tested against production-like data.' })

  const ciFiles = stats.filter((f) => /\.github\/workflows|\.gitlab-ci|Jenkinsfile|Dockerfile|docker-compose|\.circleci|\.travis/i.test(f.file))
  if (ciFiles.length > 0) allFindings.push({ severity: 'nice_to_fix', file: ciFiles.map((f) => f.file).join(', '), detail: 'CI/CD or infrastructure config changed.', recommendation: 'Test in staging before merging.' })

  const deleted = stats.filter((f) => f.additions === 0 && f.deletions > 0 && !f.binary)
  if (deleted.length > 3) allFindings.push({ severity: 'nice_to_fix', file: deleted.slice(0, 3).map((f) => f.file).join(', '), detail: `${deleted.length} files deleted.`, recommendation: 'Verify no breaking imports remain.' })

  if (sourceFiles.length > 2 && testFiles.length === 0) allFindings.push({ severity: 'nice_to_fix', file: `${sourceFiles.length} source files`, detail: 'No test changes detected.', recommendation: 'Add test coverage for new behavior.' })

  const fileMustFix = fileReviews.flatMap((r) => r.findings.filter((f) => f.severity === 'must_fix'))
  allFindings.push(...fileMustFix)

  const mustFixCount = allFindings.filter((f) => f.severity === 'must_fix').length
  const niceCount = fileReviews.flatMap((r) => r.findings).filter((f) => f.severity === 'nice_to_fix').length

  let level: RiskAssessment['level']
  if (mustFixCount >= 3 || (mustFixCount > 0 && totalChanges > 500)) level = 'HIGH'
  else if (mustFixCount > 0 || niceCount >= 5) level = 'MEDIUM'
  else level = 'LOW'

  const parts: string[] = []
  parts.push(`This PR modifies ${fileCount} file${fileCount !== 1 ? 's' : ''} with ${totalChanges} total line changes (+${stats.reduce((s, f) => s + f.additions, 0)} / -${stats.reduce((s, f) => s + f.deletions, 0)}).`)
  if (mustFixCount > 0) parts.push(`Found ${mustFixCount} issue${mustFixCount !== 1 ? 's' : ''} to address before merging.`)
  if (niceCount > 0) parts.push(`${niceCount} suggestion${niceCount !== 1 ? 's' : ''} for improvement.`)
  if (allFindings.length === 0) parts.push('No significant issues detected. Code looks good to merge.')

  return { level, findings: allFindings, summary: parts.join(' ') }
}

/** Finding card */
const FindingCard: React.FC<{ finding: ReviewFinding; showFile?: boolean }> = ({ finding, showFile = true }) => {
  const sc = SEVERITY_STYLE[finding.severity]
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${sc.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${sc.bg} ${sc.color} font-semibold`}>{sc.label}</span>
            {showFile && <span className="text-xs font-mono text-ink-3">{finding.file}</span>}
          </div>
          <p className="text-xs text-ink leading-relaxed">{finding.detail}</p>
          <p className="text-xs text-ink-2 mt-1.5 leading-relaxed italic">{finding.recommendation}</p>
        </div>
      </div>
    </div>
  )
}

const PRRiskReviewTab: React.FC<{ sessionId: string; baseBranch: string }> = ({ sessionId }) => {
  const [fileReviews, setFileReviews] = useState<FileCodeReview[]>([])
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [activeSection, setActiveSection] = useState<'risk' | 'review'>('risk')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.sessions.getDiffCompare(sessionId) as Promise<string>,
      window.api.sessions.getDiffStats(sessionId) as Promise<DiffFileStat[]>,
      window.api.sessions.analyzeCodebase(sessionId) as Promise<{ findings: ReviewFinding[] }>
    ]).then(([diff, st, codebaseAnalysis]) => {
      const fileDiffs = splitDiffByFile(diff)
      const cbFindings = codebaseAnalysis?.findings || []
      const cbByFile = new Map<string, ReviewFinding[]>()
      for (const f of cbFindings) { const e = cbByFile.get(f.file) || []; e.push(f); cbByFile.set(f.file, e) }

      const reviews: FileCodeReview[] = st.filter((s) => !s.binary).map((s) => {
        const fd = fileDiffs[s.file] || fileDiffs[Object.keys(fileDiffs).find((k) => k.endsWith(s.file) || s.file.endsWith(k)) || ''] || ''
        const diffFindings = fd ? analyzeFile(s.file, fd, s) : []
        const codebaseFindings = cbByFile.get(s.file) || []
        return { file: s.file, additions: s.additions, deletions: s.deletions, findings: [...diffFindings, ...codebaseFindings] }
      }).sort((a, b) => b.findings.length - a.findings.length)

      const statsFiles = new Set(st.map((s) => s.file))
      const orphanedFindings = cbFindings.filter((f) => !statsFiles.has(f.file))

      setFileReviews(reviews)
      const assessment = buildRiskAssessment(st, reviews)
      assessment.findings.push(...orphanedFindings)
      setRiskAssessment(assessment)
      setExpandedFiles(new Set(reviews.filter((r) => r.findings.some((f) => f.severity === 'must_fix')).map((r) => r.file)))
    }).catch(() => { setFileReviews([]); setRiskAssessment(null) }).finally(() => setLoading(false))
  }, [sessionId])

  const toggleFile = (file: string) => {
    setExpandedFiles((prev) => { const next = new Set(prev); if (next.has(file)) next.delete(file); else next.add(file); return next })
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <svg className="animate-spin w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
      <span className="text-xs text-ink-3">Analyzing changes...</span>
    </div>
  )

  if (!riskAssessment) return <div className="text-center py-12 text-xs text-ink-3">Unable to analyze changes</div>

  const rc = RISK_COLORS[riskAssessment.level]
  const allCodeFindings = fileReviews.flatMap((r) => r.findings)
  const mustFixCount = allCodeFindings.filter((f) => f.severity === 'must_fix').length
  const niceCount = allCodeFindings.filter((f) => f.severity === 'nice_to_fix').length
  const nitpickCount = allCodeFindings.filter((f) => f.severity === 'nitpick').length
  const filesWithFindings = fileReviews.filter((r) => r.findings.length > 0).length

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex rounded-lg border border-panel-border overflow-hidden">
        <button onClick={() => setActiveSection('risk')} className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${activeSection === 'risk' ? 'bg-accent text-white' : 'bg-panel-card text-ink-3 hover:bg-panel-hover'}`}>Risk Assessment</button>
        <button onClick={() => setActiveSection('review')} className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${activeSection === 'review' ? 'bg-accent text-white' : 'bg-panel-card text-ink-3 hover:bg-panel-hover'}`}>Code Review</button>
      </div>

      {activeSection === 'risk' && (
        <div className="space-y-4">
          <div className={`rounded-xl border-2 ${rc.border} ${rc.bg} p-5`}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-3 h-3 rounded-full ${rc.dot}`} />
              <span className={`text-lg font-bold ${rc.text}`}>Risk Assessment: {riskAssessment.level}</span>
            </div>
            <p className="text-sm text-ink leading-relaxed">{riskAssessment.summary}</p>
          </div>

          {riskAssessment.findings.length > 0 && (
            <div className="rounded-xl border border-panel-border bg-panel-card overflow-hidden">
              <div className="px-4 py-3 border-b border-panel-border bg-panel-bg">
                <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">Findings ({riskAssessment.findings.length})</span>
              </div>
              <div className="divide-y divide-panel-border">
                {riskAssessment.findings.map((finding, i) => <FindingCard key={i} finding={finding} />)}
              </div>
            </div>
          )}

        </div>
      )}

      {activeSection === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-panel-border bg-panel-card p-4">
            <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Code Review Summary</div>
            <div className="text-xs text-ink-2 mb-3">Reviewed {fileReviews.length} files. Checks: correctness, code quality, patterns, duplication, performance, security.</div>
            <div className="flex items-center gap-3 flex-wrap">
              {mustFixCount > 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE.must_fix.border} ${SEVERITY_STYLE.must_fix.bg} ${SEVERITY_STYLE.must_fix.color}`}>{mustFixCount} Must Fix</span>}
              {niceCount > 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE.nice_to_fix.border} ${SEVERITY_STYLE.nice_to_fix.bg} ${SEVERITY_STYLE.nice_to_fix.color}`}>{niceCount} Nice to Fix</span>}
              {nitpickCount > 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE.nitpick.border} ${SEVERITY_STYLE.nitpick.bg} ${SEVERITY_STYLE.nitpick.color}`}>{nitpickCount} Nitpick</span>}
              {allCodeFindings.length === 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full border border-green-200 bg-green-50 text-green-700">All Clear</span>}
              <span className="text-xs text-ink-3 ml-auto">{filesWithFindings} of {fileReviews.length} files with findings</span>
            </div>
          </div>

          <div className="rounded-xl border border-panel-border bg-panel-card overflow-hidden">
            <div className="px-4 py-3 border-b border-panel-border bg-panel-bg">
              <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">File-by-File Review ({fileReviews.length})</span>
            </div>
            <div className="divide-y divide-panel-border">
              {fileReviews.map(({ file, additions, deletions, findings }) => {
                const isExpanded = expandedFiles.has(file)
                const worstSev = findings.length === 0 ? null
                  : findings.some((f) => f.severity === 'must_fix') ? 'must_fix' as FindingSeverity
                  : findings.some((f) => f.severity === 'nice_to_fix') ? 'nice_to_fix' as FindingSeverity
                  : 'nitpick' as FindingSeverity

                return (
                  <div key={file}>
                    <button onClick={() => toggleFile(file)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover text-left transition-colors">
                      {worstSev ? <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_STYLE[worstSev].dot}`} /> : <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" />}
                      <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {findings.length > 0 && <span className="text-xs text-ink-3">{findings.length}</span>}
                        <span className="text-xs font-mono text-green-600">+{additions}</span>
                        <span className="text-xs font-mono text-red-500">-{deletions}</span>
                      </div>
                      <svg className={`w-3.5 h-3.5 text-ink-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-panel-border bg-panel-bg/50">
                        {findings.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-green-600 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-400" />No issues found</div>
                        ) : (
                          <div className="divide-y divide-panel-border">{findings.map((finding, fi) => <FindingCard key={fi} finding={finding} showFile={false} />)}</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sync status badge ─────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: GitStatus | null }> = ({ status }) => {
  if (!status) return null
  if (status.hasConflicts) return (
    <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">⚠ conflicts</span>
  )
  if (status.behindBy > 0) return (
    <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">↓ {status.behindBy} behind</span>
  )
  if (status.aheadBy > 0) return (
    <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">↑ {status.aheadBy} ahead</span>
  )
  return <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-medium">✓ up to date</span>
}

// ── Main component ────────────────────────────────────────────────────────────

export const SessionDetail: React.FC<Props> = ({ session }) => {
  const { repos } = useAppStore()
  const repo = repos.find((r) => r.id === session.repoId)
  const repoColor = repo?.color ?? '#166534'

  const [status, setStatus] = useState<GitStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [appError, setAppError] = useState<{ app: string; message: string } | null>(null)

  // Push state
  const [pushing, setPushing] = useState(false)
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)

  // Changes & activity
  const [changedFiles, setChangedFiles] = useState<Array<{ status: string; file: string }>>([])
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null)
  const [diffContent, setDiffContent] = useState<Record<string, string>>({})
  const [commitLog, setCommitLog] = useState<Array<{ hash: string; shortHash: string; subject: string; author: string; date: string }>>([])
  const [mergeStatus, setMergeStatus] = useState<'merged' | 'open' | 'unknown'>('unknown')

  // Tabs
  const [activeTab, setActiveTab] = useState<'activity' | 'diff' | 'risk'>('activity')

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await window.api.sessions.getStatus(session.id) as GitStatus)
    } catch { setStatus(null) }
  }, [session.id])

  const loadChanges = useCallback(async () => {
    try {
      const [files, log] = await Promise.all([
        window.api.sessions.getChangedFiles(session.id),
        window.api.sessions.getLog(session.id)
      ])
      setChangedFiles(files as Array<{ status: string; file: string }>)
      setCommitLog(log as Array<{ hash: string; shortHash: string; subject: string; author: string; date: string }>)
    } catch { /* ignore */ }
  }, [session.id])

  useEffect(() => {
    loadStatus()
    loadChanges()
    const t = setInterval(() => { loadStatus(); loadChanges() }, 30_000)
    return () => clearInterval(t)
  }, [loadStatus, loadChanges])

  // Load PR URL + merge status on mount and periodically
  const loadMergeStatus = useCallback(() => {
    window.api.git.getBranchMergeStatus(session.worktreePath, session.branch, session.baseBranch)
      .then((s) => setMergeStatus(s as 'merged' | 'open' | 'unknown'))
      .catch(() => setMergeStatus('unknown'))
  }, [session.worktreePath, session.branch, session.baseBranch])

  useEffect(() => {
    window.api.sessions.getPrUrl(session.id)
      .then((url) => setPrUrl(url as string | null))
      .catch(() => setPrUrl(null))
    loadMergeStatus()
    const t = setInterval(loadMergeStatus, 30_000)
    return () => clearInterval(t)
  }, [session.id, loadMergeStatus])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await window.api.sessions.refresh(session.id) as {
        success: boolean; hasConflicts: boolean; output: string; conflictingFiles: string[]
      }
      let text: string
      if (r.hasConflicts) {
        const files = r.conflictingFiles?.length ? ` (${r.conflictingFiles.slice(0, 3).join(', ')}${r.conflictingFiles.length > 3 ? ` +${r.conflictingFiles.length - 3} more` : ''})` : ''
        text = `Conflicts detected — rebase aborted${files}`
      } else if (!r.success) { text = r.output?.slice(0, 120) ?? 'Sync failed' }
      else { text = 'Up to date' }
      setSyncMsg({ ok: r.success && !r.hasConflicts, text })
      await loadStatus()
    } catch (err) { setSyncMsg({ ok: false, text: String(err).slice(0, 120) }) }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(null), 6000) }
  }

  const handlePush = async () => {
    setPushing(true); setPushMsg(null)
    try {
      const r = await window.api.sessions.push(session.id) as { success: boolean; output: string }
      if (r.success) {
        setPushMsg({ ok: true, text: 'Branch pushed to origin' })
        const url = await window.api.sessions.getPrUrl(session.id) as string | null
        setPrUrl(url)
        await loadStatus()
      } else {
        const hint = r.output.includes('Authentication') ? 'Authentication failed — check your git credentials'
          : r.output.includes('already exists') ? 'Branch already exists on remote' : r.output.slice(0, 150)
        setPushMsg({ ok: false, text: hint })
      }
    } catch (err) { setPushMsg({ ok: false, text: String(err).slice(0, 150) }) }
    finally { setPushing(false); setTimeout(() => setPushMsg(null), 6000) }
  }

  const handleOpenPr = () => { if (prUrl) window.api.shell.openExternal(prUrl) }

  const toggleDiff = async (file: string) => {
    if (expandedDiff === file) { setExpandedDiff(null); return }
    setExpandedDiff(file)
    if (!diffContent[file]) {
      try {
        const diff = await window.api.sessions.getFileDiff(session.id, file) as string
        setDiffContent((prev) => ({ ...prev, [file]: diff }))
      } catch { /* ignore */ }
    }
  }

  const open = async (method: string) => {
    setOpening(method)
    try { await (window.api.sessions as Record<string, (...args: unknown[]) => Promise<unknown>>)[method](session.id) }
    catch (err) {
      const msg = String(err)
      const appLabel = apps.find(a => a.id === method)?.label ?? method
      if (msg.includes('ENOENT')) {
        const cliMap: Record<string, string> = {
          'IntelliJ': 'idea', 'PhpStorm': 'phpstorm', 'Claude': 'claude',
          'VS Code': 'code', 'Cursor': 'cursor'
        }
        const cli = cliMap[appLabel] || appLabel.toLowerCase()
        setAppError({
          app: appLabel,
          message: `The "${cli}" command was not found in your PATH.\n\nTo fix this, open ${appLabel} and install the CLI command from the app menu, or add it to your PATH manually.`
        })
      } else {
        setAppError({ app: appLabel, message: `Failed to open ${appLabel}: ${msg}` })
      }
    }
    finally { setOpening(null) }
  }

  const apps: AppDef[] = [
    { id: 'openInTerminal',  label: 'Terminal',   icon: <AppIcon src={iconTerminal} label="Terminal"/>,   action: (id) => window.api.sessions.openInTerminal(id) },
    { id: 'openInVSCode',    label: 'VS Code',    icon: <AppIcon src={iconVSCode}   label="VS Code"/>,    action: (id) => window.api.sessions.openInVSCode(id) },
    { id: 'openInCursor',    label: 'Cursor',     icon: <AppIcon src={iconCursor}   label="Cursor"/>,     action: (id) => window.api.sessions.openInCursor(id) },
    { id: 'openInClaude',    label: 'Claude',     icon: <AppIcon src={iconClaude}    label="Claude"/>,     action: (id) => window.api.sessions.openInClaude(id) },
    { id: 'openInIntelliJ',  label: 'IntelliJ',   icon: <AppIcon src={iconIntelliJ}  label="IntelliJ"/>,   action: (id) => window.api.sessions.openInIntelliJ(id) },
    { id: 'openInPhpStorm',  label: 'PhpStorm',   icon: <AppIcon src={iconPhpStorm}  label="PhpStorm"/>,   action: (id) => window.api.sessions.openInPhpStorm(id) },
  ]

  const hasCommitsAhead = status && status.aheadBy > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink leading-tight break-all mb-2">{session.name}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            {repo && <span className="text-[13px] font-bold" style={{ color: repoColor }}>{repo.name}</span>}
            {session.ticketId && (
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${session.ticketId.startsWith('SC-') ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>{session.ticketId}</span>
            )}
            <StatusBadge status={status} />
            <button onClick={handleSync} disabled={syncing} className="ml-auto flex items-center gap-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg px-3 py-1.5 disabled:opacity-50 shadow-sm">
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Sync
            </button>
          </div>
          {syncMsg && <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg border ${syncMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{syncMsg.text}</div>}
          <div className="mt-2 flex items-center gap-1.5 text-ink-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            <span className="font-mono text-[13px] font-semibold text-ink-2 truncate">{session.branch}</span>
          </div>
          <div className="flex items-center gap-1.5 text-ink-3 mt-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
            <span className="font-mono text-[12px] font-medium text-ink-3 truncate">{session.worktreePath}</span>
          </div>
        </div>

        {/* PUSH + CREATE PR */}
        <div className="rounded-xl border border-panel-border bg-panel-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">Publish</span>
            {mergeStatus === 'merged' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-200">Merged</span>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handlePush} disabled={pushing || !hasCommitsAhead || mergeStatus === 'merged'} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${hasCommitsAhead && mergeStatus !== 'merged' ? 'bg-accent text-white hover:bg-accent/90' : 'bg-panel-hover text-ink-3 cursor-not-allowed'} disabled:opacity-60`} title={mergeStatus === 'merged' ? 'Branch already merged' : !hasCommitsAhead ? 'No commits to push yet' : 'Push branch to origin'}>
              {pushing ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>}
              {pushing ? 'Pushing…' : 'Push Branch'}
            </button>
            <button onClick={handleOpenPr} disabled={!prUrl || mergeStatus === 'merged'} title={mergeStatus === 'merged' ? 'Branch already merged' : !prUrl ? 'Push your branch first to create a PR' : 'Open pull request'} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold border transition-all ${prUrl && mergeStatus !== 'merged' ? 'border-accent/30 text-accent hover:bg-accent/5 cursor-pointer' : 'border-panel-border text-ink-3 cursor-not-allowed opacity-50'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              {prUrl ? 'Open PR' : 'Create PR'}
            </button>
            {mergeStatus === 'merged' ? <span className="text-[13px] font-medium text-purple-600">This branch has been merged</span>
              : !hasCommitsAhead && !pushing && !pushMsg && !prUrl ? <span className="text-[13px] text-ink-3">Make commits in your editor first</span> : null}
          </div>
          {pushMsg && <div className={`mt-3 text-xs px-3 py-1.5 rounded-lg border ${pushMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{pushMsg.text}</div>}
        </div>

        {/* OPEN IN */}
        <div className="rounded-xl border border-panel-border bg-panel-card p-4">
          <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Open In</div>
          <div className="grid grid-cols-3 gap-2.5">
            {apps.map((app) => (
              <button key={app.id} onClick={() => open(app.id)} disabled={opening === app.id} className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${opening === app.id ? 'border-accent/30 bg-accent/5 opacity-60' : 'border-panel-border hover:border-panel-border hover:bg-panel-hover hover:shadow-sm'}`}>
                {opening === app.id ? <div className="w-11 h-11 flex items-center justify-center"><svg className="animate-spin w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div> : app.icon}
                <span className="text-[13px] text-ink font-semibold">{app.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* APP NOT FOUND MODAL */}
        {appError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setAppError(null)}>
            <div className="bg-panel-card rounded-2xl shadow-xl border border-panel-border w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-ink">{appError.app} not found</h3>
                  <p className="text-[12px] text-ink-3 font-medium">CLI command missing</p>
                </div>
              </div>
              <p className="text-[13px] text-ink-2 font-medium leading-relaxed whitespace-pre-line mb-5">{appError.message}</p>
              <button onClick={() => setAppError(null)} className="w-full text-[13px] font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-2.5 transition-colors shadow-sm">
                Got it
              </button>
            </div>
          </div>
        )}

        {/* COPY MANUALLY */}
        <CopyManually path={session.worktreePath} />

        {/* TABS */}
        <div className="rounded-xl border border-panel-border bg-panel-card overflow-hidden">
          <div className="flex border-b border-panel-border">
            <button onClick={() => setActiveTab('activity')} className={`flex-1 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors ${activeTab === 'activity' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-3 hover:text-ink hover:bg-panel-hover'}`}>Activity</button>
            {prUrl && commitLog.length > 0 && (
              <>
                <button onClick={() => setActiveTab('diff')} className={`flex-1 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors ${activeTab === 'diff' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-3 hover:text-ink hover:bg-panel-hover'}`}>Diff Compare</button>
                <button onClick={() => setActiveTab('risk')} title="Optional — static analysis based risk review" className={`flex-1 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors relative group ${activeTab === 'risk' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-3 hover:text-ink hover:bg-panel-hover'}`}>Risk Review <span className="text-[9px] font-normal normal-case tracking-normal text-ink-3 ml-1">optional</span></button>
              </>
            )}
          </div>

          <div className="p-4">
            {activeTab === 'activity' && (
              <div className="space-y-4">
                {changedFiles.length > 0 && (
                  <div className="rounded-lg border border-panel-border overflow-hidden">
                    <div className="px-3 py-2 border-b border-panel-border bg-panel-bg">
                      <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">Changes ({changedFiles.length})</span>
                    </div>
                    <div className="divide-y divide-panel-border">
                      {changedFiles.map(({ status, file }) => (
                        <div key={file}>
                          <button onClick={() => toggleDiff(file)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover text-left transition-colors">
                            <span className={`text-xs font-mono font-bold w-5 flex-shrink-0 ${status === 'A' || status === '??' ? 'text-green-600' : status === 'D' ? 'text-red-500' : 'text-amber-600'}`}>{status === '??' ? 'U' : status.charAt(0)}</span>
                            <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                            <svg className={`w-3.5 h-3.5 text-ink-3 flex-shrink-0 transition-transform ${expandedDiff === file ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {expandedDiff === file && (
                            <div className="border-t border-panel-border bg-gray-950 overflow-x-auto">
                              {diffContent[file] ? (
                                <pre className="text-xs font-mono p-4 leading-relaxed whitespace-pre">
                                  {diffContent[file].split('\n').map((line, i) => (
                                    <div key={i} className={line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' : line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' : line.startsWith('@@') ? 'text-blue-400' : 'text-gray-400'}>{line || ' '}</div>
                                  ))}
                                </pre>
                              ) : <div className="text-xs text-gray-500 p-4">No diff available</div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-panel-border overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3.314-5.373 6-12 6"/></svg>
                    <span className="font-mono text-[13px] font-semibold text-ink flex-1 truncate">{session.branch}</span>
                    {prUrl && (
                      <button onClick={() => window.api.shell.openExternal(prUrl)} className="text-ink-3 hover:text-ink flex-shrink-0" title="Open PR">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </button>
                    )}
                    <span className={`text-[12px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${mergeStatus === 'merged' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                      {mergeStatus === 'merged' ? 'Merged' : 'Open'}
                    </span>
                  </div>
                  {commitLog.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-ink-3 border-t border-panel-border">No commits yet</div>
                  ) : (
                    <div className="divide-y divide-panel-border border-t border-panel-border">
                      {commitLog.map((commit) => (
                        <div key={commit.hash} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="text-[12px] font-mono font-bold text-accent flex-shrink-0 mt-0.5 w-[60px]">{commit.shortHash}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-ink leading-snug">{commit.subject}</div>
                            <div className="text-[12px] text-ink-3 mt-0.5">{commit.author} · {commit.date}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <ActivitySection sessionId={session.id} />
              </div>
            )}

            {activeTab === 'diff' && prUrl && commitLog.length > 0 && (
              <DiffCompareTab sessionId={session.id} baseBranch={session.baseBranch} />
            )}

            {activeTab === 'risk' && prUrl && commitLog.length > 0 && (
              <PRRiskReviewTab sessionId={session.id} baseBranch={session.baseBranch} />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
