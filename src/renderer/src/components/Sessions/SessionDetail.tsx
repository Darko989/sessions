import React, { useState, useEffect, useCallback } from 'react'
import { Session, GitStatus, ActivityEntry } from '../../types'
import { useAppStore } from '../../store/appStore'
import iconVSCode from '../../assets/icons/vscode.png'
import iconTerminal from '../../assets/icons/terminal.png'
import iconClaude from '../../assets/icons/claude.jpg'
import iconCursor from '../../assets/icons/cursor.jpeg'

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
  <img src={src} alt={label} className="w-9 h-9 rounded-xl object-cover" draggable={false}/>
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
    <div className="rounded-xl border border-panel-border bg-white p-4">
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
    <div className="rounded-xl border border-panel-border bg-white p-4">
      <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Activity</div>
      <div className="space-y-2">
        {entries.slice(0, 8).map((e) => (
          <div key={e.id} className="flex items-start gap-2.5">
            <span className="text-accent text-sm w-4 text-center flex-shrink-0 mt-px">{icons[e.type] ?? '·'}</span>
            <span className="text-xs text-ink flex-1">{e.message}</span>
            <span className="text-xs text-ink-3 flex-shrink-0">
              {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
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

  // Load PR URL + merge status on mount
  useEffect(() => {
    window.api.sessions.getPrUrl(session.id)
      .then((url) => setPrUrl(url as string | null))
      .catch(() => setPrUrl(null))
    window.api.git.getBranchMergeStatus(session.repoPath, session.branch, session.baseBranch)
      .then((s) => setMergeStatus(s as 'merged' | 'open' | 'unknown'))
      .catch(() => setMergeStatus('unknown'))
  }, [session.id])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await window.api.sessions.refresh(session.id) as {
        success: boolean
        hasConflicts: boolean
        output: string
        conflictingFiles: string[]
      }

      let text: string
      if (r.hasConflicts) {
        const files = r.conflictingFiles?.length
          ? ` (${r.conflictingFiles.slice(0, 3).join(', ')}${r.conflictingFiles.length > 3 ? ` +${r.conflictingFiles.length - 3} more` : ''})`
          : ''
        text = `Conflicts detected — rebase aborted${files}`
      } else if (!r.success) {
        text = r.output?.slice(0, 120) ?? 'Sync failed'
      } else if (r.conflictingFiles?.length) {
        text = `Up to date (overlapping files: ${r.conflictingFiles.slice(0, 3).join(', ')}${r.conflictingFiles.length > 3 ? ` +${r.conflictingFiles.length - 3} more` : ''})`
      } else {
        text = 'Up to date'
      }

      setSyncMsg({ ok: r.success && !r.hasConflicts, text })
      await loadStatus()
    } catch (err) {
      setSyncMsg({ ok: false, text: String(err).slice(0, 120) })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 6000)
    }
  }

  const handlePush = async () => {
    setPushing(true)
    setPushMsg(null)
    try {
      const r = await window.api.sessions.push(session.id) as { success: boolean; output: string }
      if (r.success) {
        setPushMsg({ ok: true, text: 'Branch pushed to origin' })
        // Fetch PR URL now that the branch is on the remote
        const url = await window.api.sessions.getPrUrl(session.id) as string | null
        setPrUrl(url)
        await loadStatus()
      } else {
        // Surface the most useful part of the git error
        const hint = r.output.includes('Authentication')
          ? 'Authentication failed — check your git credentials'
          : r.output.includes('already exists')
          ? 'Branch already exists on remote'
          : r.output.slice(0, 150)
        setPushMsg({ ok: false, text: hint })
      }
    } catch (err) {
      setPushMsg({ ok: false, text: String(err).slice(0, 150) })
    } finally {
      setPushing(false)
      setTimeout(() => setPushMsg(null), 6000)
    }
  }

  const handleOpenPr = () => {
    if (prUrl) window.api.shell.openExternal(prUrl)
  }

  const toggleDiff = async (file: string) => {
    if (expandedDiff === file) {
      setExpandedDiff(null)
      return
    }
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
    try {
      await (window.api.sessions as Record<string, (...args: unknown[]) => Promise<unknown>>)[method](session.id)
    } catch (err) {
      alert(`Failed to open: ${String(err)}`)
    } finally {
      setOpening(null)
    }
  }

  const apps: AppDef[] = [
    { id: 'openInTerminal', label: 'Terminal',    icon: <AppIcon src={iconTerminal} label="Terminal"/>,    action: (id) => window.api.sessions.openInTerminal(id) },
    { id: 'openInClaude',   label: 'Claude Code', icon: <AppIcon src={iconClaude}   label="Claude Code"/>, action: (id) => window.api.sessions.openInClaude(id) },
    { id: 'openInCursor',   label: 'Cursor',      icon: <AppIcon src={iconCursor}   label="Cursor"/>,      action: (id) => window.api.sessions.openInCursor(id) },
    { id: 'openInVSCode',   label: 'VS Code',     icon: <AppIcon src={iconVSCode}   label="VS Code"/>,     action: (id) => window.api.sessions.openInVSCode(id) },
  ]

  const hasCommitsAhead = status && status.aheadBy > 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-ink leading-tight break-all mb-2">
            {session.name}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {repo && (
              <span className="text-sm font-semibold" style={{ color: repoColor }}>
                {repo.name}
              </span>
            )}
            {session.ticketId && (
              <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                session.ticketId.startsWith('SC-') ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {session.ticketId}
              </span>
            )}
            <StatusBadge status={status} />

            {/* Sync button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="ml-auto flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink border border-panel-border rounded-lg px-2.5 py-1 hover:bg-panel-hover disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync
            </button>
          </div>

          {syncMsg && (
            <div className={`mt-2 text-xs px-3 py-1.5 rounded-lg border ${syncMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              {syncMsg.text}
            </div>
          )}

          <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            <span className="font-mono truncate">{session.branch}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-3 mt-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="font-mono truncate">{session.worktreePath}</span>
          </div>
        </div>

        {/* PUSH + CREATE PR */}
        <div className="rounded-xl border border-panel-border bg-white p-4">
          <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Publish</div>
          <div className="flex items-center gap-3">
            {/* Push button */}
            <button
              onClick={handlePush}
              disabled={pushing || !hasCommitsAhead}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                hasCommitsAhead
                  ? 'bg-accent text-white hover:bg-accent/90'
                  : 'bg-panel-hover text-ink-3 cursor-not-allowed'
              } disabled:opacity-60`}
              title={!hasCommitsAhead ? 'No commits to push yet' : 'Push branch to origin'}
            >
              {pushing ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              )}
              {pushing ? 'Pushing…' : 'Push Branch'}
            </button>

            {/* Create PR button — appears once PR URL is known */}
            {prUrl && (
              <button
                onClick={handleOpenPr}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-accent/30 text-accent hover:bg-accent/5 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Create PR
              </button>
            )}

            {/* Push status hint */}
            {!hasCommitsAhead && !pushing && !pushMsg && (
              <span className="text-xs text-ink-3">Make commits in your editor first</span>
            )}
          </div>

          {pushMsg && (
            <div className={`mt-3 text-xs px-3 py-1.5 rounded-lg border ${pushMsg.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              {pushMsg.text}
            </div>
          )}
        </div>

        {/* OPEN IN */}
        <div className="rounded-xl border border-panel-border bg-white p-4">
          <div className="text-xs font-semibold tracking-widest text-ink-3 uppercase mb-3">Open In</div>
          <div className="grid grid-cols-3 gap-2">
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => open(app.id)}
                disabled={opening === app.id}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                  opening === app.id
                    ? 'border-accent/30 bg-accent/5 opacity-60'
                    : 'border-panel-border hover:border-panel-border hover:bg-panel-hover hover:shadow-sm'
                }`}
              >
                {opening === app.id ? (
                  <div className="w-9 h-9 flex items-center justify-center">
                    <svg className="animate-spin w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  </div>
                ) : app.icon}
                <span className="text-xs text-ink-2 font-medium">{app.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* COPY MANUALLY */}
        <CopyManually path={session.worktreePath} />

        {/* CHANGED FILES */}
        {changedFiles.length > 0 && (
          <div className="rounded-xl border border-panel-border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-panel-border">
              <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">
                Changes ({changedFiles.length})
              </span>
            </div>
            <div className="divide-y divide-panel-border">
              {changedFiles.map(({ status, file }) => (
                <div key={file}>
                  <button
                    onClick={() => toggleDiff(file)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-hover text-left transition-colors"
                  >
                    <span className={`text-xs font-mono font-bold w-5 flex-shrink-0 ${
                      status === 'A' || status === '??' ? 'text-green-600' :
                      status === 'D' ? 'text-red-500' :
                      'text-amber-600'
                    }`}>
                      {status === '??' ? 'U' : status.charAt(0)}
                    </span>
                    <span className="text-xs font-mono text-ink flex-1 truncate">{file}</span>
                    <svg
                      className={`w-3.5 h-3.5 text-ink-3 flex-shrink-0 transition-transform ${expandedDiff === file ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedDiff === file && (
                    <div className="border-t border-panel-border bg-gray-950 overflow-x-auto">
                      {diffContent[file] ? (
                        <pre className="text-xs font-mono p-4 leading-relaxed whitespace-pre">
                          {diffContent[file].split('\n').map((line, i) => (
                            <div key={i} className={
                              line.startsWith('+') && !line.startsWith('+++') ? 'text-green-400' :
                              line.startsWith('-') && !line.startsWith('---') ? 'text-red-400' :
                              line.startsWith('@@') ? 'text-blue-400' :
                              'text-gray-400'
                            }>{line || ' '}</div>
                          ))}
                        </pre>
                      ) : (
                        <div className="text-xs text-gray-500 p-4">No diff available</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACTIVITY */}
        <div className="rounded-xl border border-panel-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-panel-border">
            <span className="text-xs font-semibold tracking-widest text-ink-3 uppercase">Activity</span>
          </div>

          {/* Branch + PR status row */}
          <div className="px-4 py-3 border-b border-panel-border flex items-center gap-3">
            <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3.314-5.373 6-12 6"/>
            </svg>
            <span className="font-mono text-xs text-ink flex-1 truncate">{session.branch}</span>
            {prUrl && (
              <button
                onClick={() => window.api.shell.openExternal(prUrl)}
                className="text-ink-3 hover:text-ink flex-shrink-0"
                title="Open PR"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
              </button>
            )}
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${
              mergeStatus === 'merged'
                ? 'bg-purple-50 text-purple-600 border-purple-200'
                : 'bg-green-50 text-green-600 border-green-200'
            }`}>
              {mergeStatus === 'merged' ? 'Merged' : 'Open'}
            </span>
          </div>

          {/* Commit log */}
          {commitLog.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-ink-3">No commits yet</div>
          ) : (
            <div className="divide-y divide-panel-border">
              {commitLog.map((commit) => (
                <div key={commit.hash} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-xs font-mono text-accent flex-shrink-0 mt-0.5 w-16">{commit.shortHash}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-ink leading-snug">{commit.subject}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{commit.author} · {commit.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ACTIVITY */}
        <ActivitySection sessionId={session.id} />

      </div>
    </div>
  )
}
