import React from 'react'
import { useAppStore } from '../../store/appStore'
import { SessionDetail } from '../Sessions/SessionDetail'
import { SettingsPanel } from '../Settings/SettingsPanel'

export const MainPanel: React.FC = () => {
  const { sessions, selectedSessionId, view } = useAppStore()

  if (view === 'settings') return <SettingsPanel />

  if (!selectedSessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 select-none px-8">
        <svg className="w-14 h-14 mb-5 opacity-15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
            d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3.314-5.373 6-12 6" />
        </svg>
        <p className="text-[15px] font-semibold text-ink-2">No session selected</p>
        <p className="text-[13px] mt-2 text-center leading-relaxed max-w-xs">
          Pick a session from the sidebar, or create a new one by selecting a repo and base branch.
        </p>
        <div className="mt-5 flex items-center gap-4 text-[11px] text-ink-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
            <span>Active sessions are listed on the left</span>
          </div>
        </div>
      </div>
    )
  }

  const session = sessions.find((s) => s.id === selectedSessionId)
  if (!session) return null

  return <SessionDetail session={session} />
}
