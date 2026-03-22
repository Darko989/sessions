import { app, BrowserWindow, nativeTheme, ipcMain, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

// Auto-update: works on Windows (NSIS) and Linux (AppImage).
// macOS requires code signing — fallback to GitHub.
// On Linux .deb/.rpm, electron-updater will fail gracefully → renderer falls back to GitHub.
const canAutoUpdate = process.platform !== 'darwin'
import { GitService } from './services/GitService'
import { RepoManager } from './services/RepoManager'
import { SessionManager } from './services/SessionManager'
import { SettingsStore } from './services/SettingsStore'
import { ActivityLog } from './services/ActivityLog'
import { TicketService } from './services/TicketService'
import { registerAllIpc } from './ipc'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.branchless.app')
  nativeTheme.themeSource = 'dark'

  // Wire up services
  const gitService = new GitService()
  const settingsStore = new SettingsStore()
  const repoManager = new RepoManager(gitService)
  const sessionManager = new SessionManager(gitService, settingsStore)
  const activityLog = new ActivityLog()
  const ticketService = new TicketService(settingsStore)

  registerAllIpc({ sessionManager, repoManager, gitService, settingsStore, activityLog, ticketService })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Update check via GitHub releases API (works on all platforms) ─────────────
function checkForUpdate(mainWindow: BrowserWindow): void {
  const currentVersion = app.getVersion()
  const req = net.request({
    method: 'GET',
    url: 'https://api.github.com/repos/Darko989/sessions/releases/latest',
    headers: { 'User-Agent': 'Branchless' }
  })
  req.on('response', (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk })
    res.on('end', () => {
      try {
        const data = JSON.parse(body)
        const latestVersion: string = (data.tag_name ?? '').replace(/^v/, '')
        const releaseUrl: string = data.html_url ?? 'https://github.com/Darko989/sessions/releases/latest'
        if (latestVersion && latestVersion !== currentVersion) {
          mainWindow.webContents.send('app:updateAvailable', { latestVersion, releaseUrl, canAutoUpdate })
        }
      } catch { /* ignore parse errors */ }
    })
  })
  req.on('error', () => { /* ignore network errors */ })
  req.end()
}

ipcMain.handle('app:dismissUpdate', () => { /* no-op, state handled in renderer */ })

// ── Auto-update for Windows + Linux AppImage ─────────────────────────────────
if (!is.dev && canAutoUpdate) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('download-progress', (progress) => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    if (mainWindow) {
      mainWindow.webContents.send('app:updateProgress', { percent: Math.round(progress.percent) })
    }
  })

  autoUpdater.on('update-downloaded', () => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    if (mainWindow) {
      mainWindow.webContents.send('app:updateReady')
    }
  })

  ipcMain.handle('app:downloadUpdate', async () => {
    await autoUpdater.downloadUpdate()
  })

  ipcMain.handle('app:installUpdate', () => {
    autoUpdater.quitAndInstall()
  })
}

// ── Update check (production only) ───────────────────────────────────────────
if (!is.dev) {
  app.whenReady().then(() => {
    const [mainWindow] = BrowserWindow.getAllWindows()
    if (mainWindow) {
      const doCheck = () => {
        // GitHub API check for all platforms (shows banner)
        checkForUpdate(mainWindow)
        // electron-updater check for auto-update platforms
        if (canAutoUpdate) autoUpdater.checkForUpdates().catch(() => {})
      }
      setTimeout(doCheck, 5000)
      setInterval(doCheck, 4 * 60 * 60 * 1000)
    }
  })
}
