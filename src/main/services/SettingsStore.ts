import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface Settings {
  defaultBaseBranch: string
  defaultEditor: 'vscode' | 'cursor' | 'pycharm' | 'zed'
  sessionsDirectory: string
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
  shortcutApiToken: string
  clickupApiToken: string
  clickupTeamId: string
  mcpServerUrl: string
  mcpServerToken: string
}

const DEFAULT_SETTINGS: Settings = {
  defaultBaseBranch: 'main',
  defaultEditor: 'vscode',
  sessionsDirectory: path.join(app.getPath('home'), '.branchless', 'workspaces'),
  jiraBaseUrl: '',
  jiraEmail: '',
  jiraApiToken: '',
  shortcutApiToken: '',
  clickupApiToken: '',
  clickupTeamId: '',
  mcpServerUrl: '',
  mcpServerToken: ''
}

export class SettingsStore {
  private readonly filePath: string
  private data: Settings

  constructor() {
    const dir = path.join(app.getPath('home'), '.branchless')
    fs.mkdirSync(dir, { recursive: true })
    this.filePath = path.join(dir, 'settings.json')
    this.data = this.load()
  }

  private load(): Settings {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      }
    } catch {
      // ignore corrupt file, use defaults
    }
    return { ...DEFAULT_SETTINGS }
  }

  private persist(): void {
    const tmp = `${this.filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    fs.renameSync(tmp, this.filePath)
  }

  get(): Settings {
    return { ...this.data }
  }

  update(partial: Partial<Settings>): Settings {
    this.data = { ...this.data, ...partial }
    this.persist()
    return this.get()
  }
}
