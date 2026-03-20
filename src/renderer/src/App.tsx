import React, { useEffect } from 'react'
import { Sidebar } from './components/Layout/Sidebar'
import { MainPanel } from './components/Layout/MainPanel'
import { useAppStore } from './store/appStore'
import { useSessions } from './hooks/useSessions'
import { useRepos } from './hooks/useRepos'
import { Settings } from './types'

export const App: React.FC = () => {
  const { setSettings } = useAppStore()
  const { loadSessions } = useSessions()
  const { loadRepos } = useRepos()

  useEffect(() => {
    Promise.all([
      loadRepos(),
      loadSessions(),
      window.api.settings.get().then((s) => setSettings(s as Settings))
    ])
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-panel-bg">
      <div className="w-[280px] flex-shrink-0 flex flex-col">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0">
        <MainPanel />
      </div>
    </div>
  )
}
