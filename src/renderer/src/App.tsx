import React, { useEffect, useState } from 'react'
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
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; releaseUrl: string } | null>(null)

  useEffect(() => {
    Promise.all([
      loadRepos(),
      loadSessions(),
      window.api.settings.get().then((s) => setSettings(s as Settings))
    ])
    window.api.app.onUpdateAvailable((info) => setUpdateInfo(info))
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-panel-bg">
      {updateInfo && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-accent text-white text-xs flex-shrink-0">
          <span>
            ✦ Branchless {updateInfo.latestVersion} is available
          </span>
          <div className="flex items-center gap-3">
            <a
              href={updateInfo.releaseUrl}
              onClick={(e) => { e.preventDefault(); window.api.shell.openExternal(updateInfo.releaseUrl) }}
              className="underline font-semibold hover:opacity-80"
            >
              Download
            </a>
            <button onClick={() => setUpdateInfo(null)} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <div className="w-[280px] flex-shrink-0 flex flex-col">
          <Sidebar />
        </div>
        <div className="flex-1 min-w-0">
          <MainPanel />
        </div>
      </div>
    </div>
  )
}
