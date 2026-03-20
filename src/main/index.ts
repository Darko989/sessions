import { app, BrowserWindow, nativeTheme, dialog } from 'electron'

// Required on Linux when running without a properly configured SUID sandbox
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
}
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
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

// ── Auto-update (production only) ────────────────────────────────────────────
if (!is.dev) {
  autoUpdater.checkForUpdatesAndNotify()

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'A new version of Branchless has been downloaded.',
        detail: 'Restart now to apply the update.',
        buttons: ['Restart', 'Later'],
        defaultId: 0
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })
}
