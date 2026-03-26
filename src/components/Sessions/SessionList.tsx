import React, { useState } from 'react'
import { SessionCard } from './SessionCard'
import { useAppStore } from '../../store/appStore'
import { useSessions } from '../../hooks/useSessions'
import { Session } from '../../types'
import * as api from '../../api'

const DeleteConfirmModal: React.FC<{
  session: Session
  onConfirm: () => void
  onCancel: () => void
}> = ({ session, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative z-10 w-full max-w-sm mx-4 bg-panel-card rounded-2xl shadow-2xl border border-panel-border overflow-hidden">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ink mb-1">Delete session?</h3>
            <p className="text-xs text-ink-3 leading-relaxed">
              This will permanently delete <span className="font-medium text-ink">"{session.name}"</span> and remove its git worktree. This action cannot be undone.
            </p>
            {session.branch && (
              <p className="mt-2 text-xs font-mono text-ink-3 bg-panel-hover rounded px-2 py-1 truncate">
                {session.branch}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-ink-2 bg-panel-hover border border-panel-border rounded-lg hover:bg-panel-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
)

export const SessionList: React.FC = () => {
  const { selectedSessionId, setSelectedSession, setSessions } = useAppStore()
  const { sessions, allSessions, deleteSession } = useSessions()
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmSession, setConfirmSession] = useState<Session | null>(null)

  const handleTogglePin = async (session: Session) => {
    const updated = session.pinnedAt
      ? await api.sessions.unpin(session.id)
      : await api.sessions.pin(session.id)
    setSessions(allSessions.map((s) => s.id === session.id ? updated : s))
  }

  const filtered = sessions
    .filter(
      (s) =>
        s.branch.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.ticketId?.toLowerCase().includes(search.toLowerCase()) ?? false)
    )
    .sort((a, b) => {
      if (a.pinnedAt && !b.pinnedAt) return -1
      if (!a.pinnedAt && b.pinnedAt) return 1
      if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt)
      return b.createdAt.localeCompare(a.createdAt)
    })

  const handleDeleteRequest = (session: Session) => {
    setConfirmSession(session)
  }

  const handleDeleteConfirm = async () => {
    if (!confirmSession) return
    const id = confirmSession.id
    setConfirmSession(null)
    setDeletingId(id)
    try {
      await deleteSession(id)
      if (selectedSessionId === id) setSelectedSession(null)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-panel-hover border border-panel-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-ink-3">
            {search ? 'No sessions match' : 'No sessions yet'}
          </div>
        ) : (
          filtered.map((session) => (
            <div
              key={session.id}
              className={deletingId === session.id ? 'opacity-40 pointer-events-none' : ''}
            >
              <SessionCard
                session={session}
                isSelected={selectedSessionId === session.id}
                onSelect={() => setSelectedSession(session.id)}
                onDelete={() => handleDeleteRequest(session)}
                onTogglePin={() => handleTogglePin(session)}
              />
            </div>
          ))
        )}
      </div>

      {confirmSession && (
        <DeleteConfirmModal
          session={confirmSession}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmSession(null)}
        />
      )}
    </div>
  )
}
