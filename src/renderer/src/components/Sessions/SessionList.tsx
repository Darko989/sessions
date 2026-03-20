import React, { useState } from 'react'
import { SessionCard } from './SessionCard'
import { useAppStore } from '../../store/appStore'
import { useSessions } from '../../hooks/useSessions'

export const SessionList: React.FC = () => {
  const { selectedSessionId, setSelectedSession } = useAppStore()
  const { sessions, deleteSession } = useSessions()
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtered = sessions.filter(
    (s) =>
      s.branch.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.ticketId?.toLowerCase().includes(search.toLowerCase()) ?? false)
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session and its worktree?')) return
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
      {/* Search */}
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
                onDelete={() => handleDelete(session.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
