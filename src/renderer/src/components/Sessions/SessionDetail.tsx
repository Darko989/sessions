import React, { useState, useEffect, useCallback, useMemo } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { Session, GitStatus, ActivityEntry } from '../../types'
import { useAppStore } from '../../store/appStore'
import iconVSCode from '../../assets/icons/vscode.png'
import iconTerminal from '../../assets/icons/terminal.webp'
import iconCursor from '../../assets/icons/cursor.jpeg'
import iconClaude from '../../assets/icons/claude-code.png'
import iconIntelliJ from '../../assets/icons/intellij.webp'
import iconCodex from '../../assets/icons/codex.png'

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

// ── Preview Changes tab ───────────────────────────────────────────────────────

interface DiffFileStat {
  file: string
  additions: number
  deletions: number
  binary: boolean
}

/** Parse a unified diff hunk into old/new text */
function parseDiffToOldNew(unifiedDiff: string): { oldText: string; newText: string } {
  const oldLines: string[] = []
  const newLines: string[] = []
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue
    if (line.startsWith('-')) {
      oldLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      newLines.push(line.slice(1))
    } else if (line.startsWith(' ') || line === '') {
      const content = line.startsWith(' ') ? line.slice(1) : line
      oldLines.push(content)
      newLines.push(content)
    }
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') }
}

const diffViewerStyles = {
  variables: {
    dark: {
      diffViewerBackground: '#1e1e1e',
      diffViewerColor: '#e2e8f0',
      addedBackground: '#064e3b20',
      addedColor: '#6ee7b7',
      removedBackground: '#7f1d1d20',
      removedColor: '#fca5a5',
      wordAddedBackground: '#065f4630',
      wordRemovedBackground: '#991b1b30',
      addedGutterBackground: '#064e3b30',
      removedGutterBackground: '#7f1d1d30',
      gutterBackground: '#1e1e1e',
      gutterBackgroundDark: '#1e1e1e',
      highlightBackground: '#2a2a2a',
      highlightGutterBackground: '#2a2a2a',
      codeFoldGutterBackground: '#2a2a2a',
      codeFoldBackground: '#2a2a2a',
      emptyLineBackground: '#1e1e1e',
      gutterColor: '#475569',
      addedGutterColor: '#6ee7b7',
      removedGutterColor: '#fca5a5',
      codeFoldContentColor: '#64748b',
    },
    light: {
      diffViewerBackground: '#ffffff',
      diffViewerColor: '#1e293b',
      addedBackground: '#dcfce720',
      addedColor: '#166534',
      removedBackground: '#fee2e220',
      removedColor: '#991b1b',
      wordAddedBackground: '#bbf7d030',
      wordRemovedBackground: '#fecaca30',
      addedGutterBackground: '#dcfce730',
      removedGutterBackground: '#fee2e230',
      gutterBackground: '#ffffff',
      gutterBackgroundDark: '#ffffff',
      highlightBackground: '#f1f5f9',
      highlightGutterBackground: '#f1f5f9',
      codeFoldGutterBackground: '#f1f5f9',
      codeFoldBackground: '#f1f5f9',
      emptyLineBackground: '#ffffff',
      gutterColor: '#94a3b8',
      addedGutterColor: '#166534',
      removedGutterColor: '#991b1b',
      codeFoldContentColor: '#94a3b8',
    }
  },
  line: { padding: '2px 10px', fontSize: '12px', lineHeight: '1.6' },
  gutter: { padding: '0 8px', fontSize: '11px', minWidth: '35px' },
  contentText: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', whiteSpace: 'pre' as const },
}

const PreviewChangesTab: React.FC<{ sessionId: string; baseBranch: string }> = ({ sessionId, baseBranch }) => {
  const [stats, setStats] = useState<DiffFileStat[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({})
  const [splitView, setSplitView] = useState(false)

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
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  const allExpanded = stats.length > 0 && expandedFiles.size === stats.length
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedFiles(new Set())
    } else {
      setExpandedFiles(new Set(stats.map(s => s.file)))
    }
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
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-ink-3">vs <span className="font-mono">{baseBranch}</span></span>
            <button
              onClick={toggleAll}
              className="text-[11px] font-medium px-2 py-0.5 rounded border text-ink-3 border-panel-border hover:text-ink transition-colors"
            >
              {allExpanded ? 'Collapse All' : 'Expand All'}
            </button>
            <button
              onClick={() => setSplitView(!splitView)}
              className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-colors ${splitView ? 'bg-accent/10 text-accent border-accent/30' : 'text-ink-3 border-panel-border hover:text-ink'}`}
            >
              {splitView ? 'Split' : 'Unified'}
            </button>
          </div>
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
            const isExpanded = expandedFiles.has(file)
            const diffKey = file in fileDiffs
              ? file
              : Object.keys(fileDiffs).find((k) => k.endsWith(file) || file.endsWith(k)) || file
            const diff = fileDiffs[diffKey] || ''

            return (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover text-left transition-colors sticky top-0 z-10 bg-panel-card"
                >
                  <svg
                    className={`w-3 h-3 text-ink-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                  {binary ? (
                    <span className="text-xs text-ink-3">binary</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {additions > 0 && <span className="text-xs font-mono text-green-600">+{additions}</span>}
                      {deletions > 0 && <span className="text-xs font-mono text-red-500">-{deletions}</span>}
                    </div>
                  )}
                </button>
                {isExpanded && (
                  <FileDiffView diff={diff} splitView={splitView} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const FileDiffView: React.FC<{ diff: string; splitView: boolean }> = ({ diff, splitView }) => {
  const { oldText, newText } = useMemo(() => diff ? parseDiffToOldNew(diff) : { oldText: '', newText: '' }, [diff])

  if (!diff) return <div className="border-t border-panel-border bg-gray-950 p-4 text-xs text-gray-500">No diff content available</div>

  return (
    <div
      className="border-t border-panel-border overflow-auto max-h-[500px]"
      style={{ backgroundColor: 'var(--color-panel-card)' }}
    >
      <div style={{ minWidth: 'fit-content' }}>
        <ReactDiffViewer
          oldValue={oldText}
          newValue={newText}
          splitView={splitView}
          useDarkTheme={true}
          compareMethod={DiffMethod.WORDS}
          styles={diffViewerStyles}
          hideLineNumbers={false}
        />
      </div>
    </div>
  )
}

// ── Conflict Risk tab ─────────────────────────────────────────────────────────

interface ConflictRiskFile {
  file: string
  mainCommits: number
  authors: string[]
}

const ConflictRiskTab: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [risks, setRisks] = useState<ConflictRiskFile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(window.api.sessions.getConflictRisk(sessionId) as Promise<ConflictRiskFile[]>)
      .then(setRisks)
      .catch(() => setRisks([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <svg className="animate-spin w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
      <span className="text-xs text-ink-3">Checking for conflicts...</span>
    </div>
  )

  if (risks.length === 0) return (
    <div className="text-center py-12">
      <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      </div>
      <p className="text-xs text-ink-3 font-medium">No conflict risk detected</p>
      <p className="text-[11px] text-ink-3 mt-1">None of your changed files were modified in main recently</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border-2 p-4 ${risks.length >= 3 ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-2 mb-1">
          <svg className={`w-4 h-4 ${risks.length >= 3 ? 'text-red-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.27 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <span className={`text-sm font-bold ${risks.length >= 3 ? 'text-red-700' : 'text-amber-700'}`}>
            {risks.length} file{risks.length !== 1 ? 's' : ''} likely to conflict
          </span>
        </div>
        <p className={`text-xs ${risks.length >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
          These files were recently changed in main and may conflict when you merge.
        </p>
      </div>

      <div className="rounded-xl border border-panel-border bg-panel-card overflow-hidden">
        <div className="px-4 py-3 border-b border-panel-border bg-panel-bg">
          <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">At-risk files</span>
        </div>
        <div className="divide-y divide-panel-border">
          {risks.map(({ file, mainCommits, authors }) => (
            <div key={file} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${mainCommits >= 5 ? 'bg-red-500' : mainCommits >= 2 ? 'bg-amber-500' : 'bg-yellow-400'}`} />
                <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                <span className="text-[11px] font-medium text-ink-3 flex-shrink-0">{mainCommits} commit{mainCommits !== 1 ? 's' : ''} in main</span>
              </div>
              {authors.length > 0 && (
                <div className="ml-4 text-[11px] text-ink-3">
                  Changed by: {authors.slice(0, 3).join(', ')}{authors.length > 3 ? ` +${authors.length - 3} more` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
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
  const [activeTab, setActiveTab] = useState<'activity' | 'diff' | 'conflict'>('activity')

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
          'IntelliJ': 'idea', 'Codex CLI': 'codex', 'Claude': 'claude',
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
    { id: 'openInCodex',     label: 'Codex CLI',  icon: <AppIcon src={iconCodex}     label="Codex CLI"/>,  action: (id) => window.api.sessions.openInCodex(id) },
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
            <button onClick={handleSync} disabled={syncing} className="ml-auto flex items-center gap-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-lg px-3 py-1.5 disabled:opacity-50 shadow-sm">
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
              <button onClick={() => setAppError(null)} className="w-full text-[13px] font-semibold bg-accent hover:bg-accent-hover text-white rounded-xl py-2.5 transition-colors shadow-sm">
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
                <button onClick={() => setActiveTab('diff')} className={`flex-1 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors ${activeTab === 'diff' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-3 hover:text-ink hover:bg-panel-hover'}`}>Preview Changes</button>
                <button onClick={() => setActiveTab('conflict')} className={`flex-1 px-4 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors ${activeTab === 'conflict' ? 'text-accent border-b-2 border-accent bg-accent/5' : 'text-ink-3 hover:text-ink hover:bg-panel-hover'}`}>Conflict Risk</button>
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
              <PreviewChangesTab sessionId={session.id} baseBranch={session.baseBranch} />
            )}

            {activeTab === 'conflict' && prUrl && commitLog.length > 0 && (
              <ConflictRiskTab sessionId={session.id} />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
