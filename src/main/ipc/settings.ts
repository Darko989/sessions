import { ipcMain, dialog } from 'electron'
import { SettingsStore } from '../services/SettingsStore'

export function registerSettingsIpc(settingsStore: SettingsStore): void {
  ipcMain.handle('settings:get', () => settingsStore.get())

  ipcMain.handle('settings:update', (_e, partial: Parameters<SettingsStore['update']>[0]) =>
    settingsStore.update(partial)
  )

  ipcMain.handle('settings:pickDirectory', async (_e, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath
    })
    return result.canceled ? null : result.filePaths[0]
  })
}
