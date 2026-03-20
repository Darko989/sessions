import React, { useState, useEffect } from 'react'
import { Session } from '../../types'
import { useAppStore } from '../../store/appStore'

interface Props {
  session: Session
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

type MergeStatus = 'merged' | 'open' | 'unknown'

interface CardStatus {
  aheadBy: number
  behindBy: number
  isClean: boolean
  hasConflicts: boolean
}

export const SessionCard: React.FC<Props> = ({ session, isSelected, onSelect, onDelete }) => {
  const { repos } = useAppStore()
  const repo = repos.find((r) => r.id === session.repoId)

  const [mergeStatus, setMergeStatus] = useState<MergeStatus>('unknown')
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    window.api.git.getBranchMergeStatus(session.repoPath, session.branch, session.baseBranch)
      .then((s) => { if (!cancelled) setMergeStatus(s as MergeStatus) })
      .catch(() => { if (!cancelled) setMergeStatus('unknown') })

    // Stagger git status fetch slightly to avoid hammering git on initial list render
    const t = setTimeout(() => {
      window.api.sessions.getStatus(session.id)
        .then((s) => {
          if (!cancelled) {
            const gs = s as { aheadBy: number; behindBy: number; isClean: boolean; hasConflicts: boolean }
            setCardStatus({ aheadBy: gs.aheadBy, behindBy: gs.behindBy, isClean: gs.isClean, hasConflicts: gs.hasConflicts })
          }
        })
        .catch(() => { /* status unavailable — worktree may be missing */ })
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [session.repoPath, session.branch, session.baseBranch, session.id])

  const shortBranch = session.branch.length > 34
    ? session.branch.slice(0, 34) + '…'
    : session.branch

  const mergeColor = mergeStatus === 'merged' ? '#7c3aed' : mergeStatus === 'open' ? '#16a34a' : '#94a3b8'
  const mergeLabel = mergeStatus === 'merged' ? 'Merged' : mergeStatus === 'open' ? 'Open' : ''

  return (
    <div
      onClick={onSelect}
      className={`group relative mx-2 mb-0.5 rounded-lg px-3 py-2.5 cursor-pointer transition-all ${
        isSelected
          ? 'bg-accent/10 border border-accent/20'
          : 'hover:bg-panel-hover border border-transparent'
      }`}
    >
      {/* Branch name + merge dot */}
      <div className="flex items-center gap-2 pr-5">
        {/* Git tree indicator */}
        <div className="flex-shrink-0 flex flex-col items-center gap-px">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mergeColor }} title={mergeLabel} />
          <div className="w-px h-2.5 rounded-full" style={{ backgroundColor: mergeColor, opacity: 0.3 }} />
        </div>
        <div className={`text-sm font-medium leading-snug truncate ${isSelected ? 'text-accent' : 'text-ink'}`}>
          {shortBranch}
        </div>
      </div>

      {/* Repo · ticket · status badges */}
      <div className="flex items-center gap-1.5 mt-0.5 pl-5 flex-wrap">
        <span className="text-xs text-ink-3 truncate">{repo?.name ?? '—'}</span>
        {session.ticketId && (
          <>
            <span className="text-ink-4">·</span>
            <span
              className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                session.ticketId.startsWith('SC-')
                  ? 'bg-purple-100 text-purple-600'
                  : 'bg-blue-100 text-blue-600'
              }`}
            >
              #{session.ticketId.replace(/^[A-Z]+-/, '')}
            </span>
          </>
        )}
        {mergeStatus === 'merged' && (
          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: '#7c3aed', backgroundColor: '#f3e8ff' }}>
            merged
          </span>
        )}
        {/* Sync status badges — only shown for non-merged sessions */}
        {mergeStatus !== 'merged' && cardStatus && (
          <>
            {cardStatus.hasConflicts && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">⚠ conflict</span>
            )}
            {!cardStatus.hasConflicts && cardStatus.behindBy > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">↓{cardStatus.behindBy}</span>
            )}
            {!cardStatus.hasConflicts && cardStatus.aheadBy > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">↑{cardStatus.aheadBy}</span>
            )}
            {!cardStatus.hasConflicts && !cardStatus.isClean && cardStatus.aheadBy === 0 && cardStatus.behindBy === 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">dirty</span>
            )}
          </>
        )}
      </div>

      {/* Delete button — only on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-ink-3 hover:text-red-500 hover:bg-red-50 transition-all"
        title="Delete session"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
