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

    // Dev: press Ctrl+Shift+U to test update modal
    const devTestUpdate = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'U') {
        setUpdateInfo({ latestVersion: '99.0.0', releaseUrl: '#', canAutoUpdate: true })
      }
    }
    window.addEventListener('keydown', devTestUpdate)
    return () => window.removeEventListener('keydown', devTestUpdate)
  }, [])

  const handleDownload = async () => {
    if (!updateInfo) return
    if (updateInfo.canAutoUpdate) {
      setDownloadState('downloading')
      setDownloadPercent(0)
      try {
        await window.api.app.downloadUpdate()
      } catch {
        window.api.shell.openExternal(updateInfo.releaseUrl)
        setDownloadState('idle')
      }
    } else {
      window.api.shell.openExternal(updateInfo.releaseUrl)
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-panel-bg">
      <div className="flex flex-1 min-h-0">
        <div className="w-[280px] flex-shrink-0 flex flex-col">
          <Sidebar />
        </div>
        <div className="flex-1 min-w-0">
          <MainPanel />
        </div>
      </div>

      {/* Update modal */}
      {updateInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => downloadState !== 'downloading' && setUpdateInfo(null)}>
          <div className="bg-panel-card rounded-2xl shadow-xl border border-panel-border w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink">Update Available</h3>
                <p className="text-[12px] text-ink-3 font-medium">Branchless {updateInfo.latestVersion}</p>
              </div>
            </div>

            {downloadState === 'downloading' && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-ink-2 font-medium">Downloading...</span>
                  <span className="text-xs text-ink-3 font-medium tabular-nums">{downloadPercent}%</span>
                </div>
                <div className="w-full h-2 bg-panel-bg rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                </div>
              </div>
            )}

            {downloadState === 'ready' && (
              <p className="text-[13px] text-green-600 font-medium mb-5">Download complete. Restart to apply the update.</p>
            )}

            {downloadState === 'idle' && (
              <p className="text-[13px] text-ink-2 font-medium leading-relaxed mb-5">A new version is ready. {updateInfo.canAutoUpdate ? 'Download and install it now?' : 'Download it from GitHub?'}</p>
            )}

            <div className="flex gap-3">
              {downloadState === 'idle' && (
                <>
                  <button onClick={() => setUpdateInfo(null)} className="flex-1 text-[13px] font-semibold text-ink-3 hover:text-ink border border-panel-border rounded-xl py-2.5 transition-colors">
                    Later
                  </button>
                  <button onClick={handleDownload} className="flex-1 text-[13px] font-semibold bg-accent hover:bg-accent/90 text-white rounded-xl py-2.5 transition-colors shadow-sm">
                    {updateInfo.canAutoUpdate ? 'Download & Install' : 'Download'}
                  </button>
                </>
              )}
              {downloadState === 'ready' && (
                <button onClick={() => window.api.app.installUpdate()} className="w-full text-[13px] font-semibold bg-green-500 hover:bg-green-600 text-white rounded-xl py-2.5 transition-colors shadow-sm">
                  Restart to update
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
