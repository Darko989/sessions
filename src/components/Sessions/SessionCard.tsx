import React, { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-shell'
import { Session } from '../../types'
import { useAppStore } from '../../store/appStore'
import * as api from '../../api'

interface Props {
  session: Session
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
}

interface PrInfo {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
}

interface CardStatus {
  aheadBy: number
  behindBy: number
  isClean: boolean
  hasConflicts: boolean
}

export const SessionCard: React.FC<Props> = ({ session, isSelected, onSelect, onDelete, onTogglePin }) => {
  const { repos, settings } = useAppStore()
  const repo = repos.find((r) => r.id === session.repoId)

  const [prInfo, setPrInfo] = useState<PrInfo | null>(null)
  const [cardStatus, setCardStatus] = useState<CardStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    api.sessions.getPrInfo(session.id)
      .then((info) => { if (!cancelled) setPrInfo(info as PrInfo | null) })
      .catch(() => {})

    const t = setTimeout(() => {
      api.sessions.getStatus(session.id)
        .then((s) => {
          if (!cancelled) {
            setCardStatus({ aheadBy: s.aheadBy, behindBy: s.behindBy, isClean: s.isClean, hasConflicts: s.hasConflicts })
          }
        })
        .catch(() => {})
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [session.repoPath, session.branch, session.baseBranch, session.id])

  const effectiveIntegration = repo?.ticketIntegration
    ?? (settings?.jiraBaseUrl && settings?.jiraEmail && settings?.jiraApiToken ? 'jira'
      : settings?.shortcutApiToken ? 'shortcut'
      : settings?.clickupApiToken && settings?.clickupTeamId ? 'clickup'
      : null)

  const ticketUrl = (() => {
    if (!session.ticketId || !effectiveIntegration) return null
    if (effectiveIntegration === 'jira' && settings?.jiraBaseUrl)
      return `${settings.jiraBaseUrl}/browse/${session.ticketId}`
    if (effectiveIntegration === 'shortcut') {
      const id = session.ticketId.replace(/^SC-/i, '')
      return `https://app.shortcut.com/story/${id}`
    }
    return null
  })()

  const shortBranch = session.branch.length > 34
    ? session.branch.slice(0, 34) + '…'
    : session.branch

  const mergeStatus = prInfo?.state === 'merged' ? 'merged' : prInfo?.state === 'open' ? 'open' : 'unknown'
  const mergeColor = mergeStatus === 'merged' ? '#7c3aed' : mergeStatus === 'open' ? '#16a34a' : '#94a3b8'
  const mergeLabel = mergeStatus === 'merged' ? 'Merged' : mergeStatus === 'open' ? 'PR open' : ''
  const isPinned = !!session.pinnedAt

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
      <div className="flex items-center gap-2 pr-12">
        <div className="flex-shrink-0 flex flex-col items-center gap-px">
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: mergeColor }} title={mergeLabel} />
          <div className="w-px h-2.5 rounded-full" style={{ backgroundColor: mergeColor, opacity: 0.3 }} />
        </div>
        <div className={`text-sm font-medium leading-snug truncate ${isSelected ? 'text-accent' : 'text-ink'}`}>
          {shortBranch}
        </div>
      </div>

      {/* Repo · ticket · PR · status badges */}
      <div className="flex items-center gap-1.5 mt-0.5 pl-5 flex-wrap">
        <span className="text-xs text-ink-3 truncate">{repo?.name ?? '—'}</span>
        {session.ticketId && (
          <>
            <span className="text-ink-4">·</span>
            {ticketUrl ? (
              <span
                className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-opacity hover:opacity-70 ${
                  session.ticketId.startsWith('SC-')
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
                onClick={(e) => { e.stopPropagation(); open(ticketUrl) }}
                title={`Open ${session.ticketId}`}
              >
                #{session.ticketId.replace(/^[A-Z]+-/, '')}
              </span>
            ) : (
              <span
                className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                  session.ticketId.startsWith('SC-')
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                #{session.ticketId.replace(/^[A-Z]+-/, '')}
              </span>
            )}
          </>
        )}
        {prInfo && prInfo.state === 'open' && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 cursor-pointer hover:bg-green-200 transition-colors"
            onClick={(e) => { e.stopPropagation(); open(prInfo.url) }}
            title={`Open PR #${prInfo.number}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 3v12m0 0a3 3 0 103 3M6 15a3 3 0 01-3 3m12-12v6m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3" />
            </svg>
            #{prInfo.number}
          </span>
        )}
        {prInfo && prInfo.state === 'merged' && (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
            style={{ color: '#7c3aed', backgroundColor: '#f3e8ff' }}
            onClick={(e) => { e.stopPropagation(); open(prInfo.url) }}
            title={`Open PR #${prInfo.number}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 3v12m0 0a3 3 0 103 3M6 15a3 3 0 01-3 3m12-12v6m0 0a3 3 0 103 3m-3-3a3 3 0 01-3 3" />
            </svg>
            #{prInfo.number}
          </span>
        )}
        {/* Sync status badges */}
        {mergeStatus !== 'merged' && cardStatus && (
          <>
            {cardStatus.hasConflicts && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">conflict</span>
            )}
            {!cardStatus.hasConflicts && cardStatus.behindBy > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{cardStatus.behindBy}</span>
            )}
            {!cardStatus.hasConflicts && cardStatus.aheadBy > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">{cardStatus.aheadBy}</span>
            )}
            {!cardStatus.hasConflicts && !cardStatus.isClean && cardStatus.aheadBy === 0 && cardStatus.behindBy === 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">dirty</span>
            )}
          </>
        )}
      </div>

      {/* Pin + Delete buttons */}
      <div className="absolute right-2 top-2 flex items-center gap-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin() }}
          className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
            isPinned
              ? 'text-amber-500 opacity-100'
              : 'text-ink-3 hover:text-amber-500 opacity-0 group-hover:opacity-100'
          }`}
          title={isPinned ? 'Unpin session' : 'Pin session'}
        >
          <svg className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-5 h-5 rounded flex items-center justify-center text-ink-3 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
          title="Delete session"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
