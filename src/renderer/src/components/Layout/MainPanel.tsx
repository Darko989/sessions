import React from 'react'
import { useAppStore } from '../../store/appStore'
import { SessionDetail } from '../Sessions/SessionDetail'
import { SettingsPanel } from '../Settings/SettingsPanel'

export const MainPanel: React.FC = () => {
  const { sessions, selectedSessionId, view } = useAppStore()

  if (view === 'settings') return <SettingsPanel />

  if (!selectedSessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 select-none">
        <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-sm font-medium text-ink-2">Select a session</p>
        <p className="text-xs mt-1">or create a new one from the sidebar</p>
      </div>
    )
  }

  const session = sessions.find((s) => s.id === selectedSessionId)
  if (!session) return null

  return <SessionDetail session={session} />
}
