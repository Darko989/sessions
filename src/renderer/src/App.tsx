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
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; releaseUrl: string; canAutoUpdate: boolean } | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'ready'>('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)

  useEffect(() => {
    Promise.all([
      loadRepos(),
      loadSessions(),
      window.api.settings.get().then((s) => setSettings(s as Settings))
    ])
    window.api.app.onUpdateAvailable((info) => setUpdateInfo(info))
    window.api.app.onUpdateProgress((info) => setDownloadPercent(info.percent))
    window.api.app.onUpdateReady(() => setDownloadState('ready'))
  }, [])

  const handleDownload = async () => {
    if (!updateInfo) return
    if (updateInfo.canAutoUpdate) {
      setDownloadState('downloading')
      setDownloadPercent(0)
      try {
        await window.api.app.downloadUpdate()
      } catch {
        // Fallback to GitHub if auto-update fails
        window.api.shell.openExternal(updateInfo.releaseUrl)
        setDownloadState('idle')
      }
    } else {
      window.api.shell.openExternal(updateInfo.releaseUrl)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-panel-bg">
      {updateInfo && (
        <div className="flex items-center justify-between gap-4 px-4 py-2 bg-accent text-white text-xs flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="whitespace-nowrap">✦ Branchless {updateInfo.latestVersion} is available</span>
            {downloadState === 'downloading' && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                </div>
                <span className="text-[10px] font-medium opacity-80 tabular-nums">{downloadPercent}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {downloadState === 'idle' && (
              <button onClick={handleDownload} className="underline font-semibold hover:opacity-80">
                {updateInfo.canAutoUpdate ? 'Download & Install' : 'Download'}
              </button>
            )}
            {downloadState === 'ready' && (
              <button onClick={() => window.api.app.installUpdate()} className="font-semibold bg-white text-accent px-2.5 py-0.5 rounded-md hover:opacity-90">
                Restart to update
              </button>
            )}
            {downloadState !== 'downloading' && (
              <button onClick={() => setUpdateInfo(null)} className="opacity-70 hover:opacity-100">✕</button>
            )}
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
