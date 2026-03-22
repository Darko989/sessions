import https from 'https'
import http from 'http'
import { SettingsStore } from './SettingsStore'

export interface Ticket {
  id: string
  key: string
  title: string
  status: string
  type: 'jira' | 'shortcut' | 'clickup'
  url?: string
}

export interface JiraFieldMeta {
  fieldId: string
  name: string
  required: boolean
  schema: { type: string; system?: string; items?: string }
  allowedValues?: Array<{ id: string; name: string; value?: string; iconUrl?: string }>
}

export interface JiraIssueTypeMeta {
  id: string
  name: string
  iconUrl?: string
  fields: JiraFieldMeta[]
}

export interface JiraUser {
  accountId: string
  displayName: string
  avatarUrl?: string
}

export interface ShortcutProject {
  id: number
  name: string
}

export interface ShortcutWorkflowState {
  id: number
  name: string
  type: string // 'unstarted' | 'started' | 'done'
}

export interface ClickUpSpace {
  id: string
  name: string
}

export interface ClickUpList {
  id: string
  name: string
  space?: { id: string; name: string }
  folder?: { id: string; name: string }
}

export class TicketService {
  private settings: SettingsStore

  constructor(settings: SettingsStore) {
    this.settings = settings
  }

  private request(method: string, url: string, headers: Record<string, string>, body?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const lib = parsed.protocol === 'https:' ? https : http
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body).toString() } : {})
        }
      }
      const req = lib.request(options, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk.toString() })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            let detail = ''
            try { detail = JSON.parse(data)?.message ?? JSON.parse(data)?.errorMessages?.[0] ?? JSON.parse(data)?.errors ? JSON.stringify(JSON.parse(data).errors) : '' } catch { detail = data.slice(0, 200) }
            reject(new Error(`HTTP ${status}${detail ? ': ' + detail : ''}`))
            return
          }
          try { resolve(JSON.parse(data)) } catch { resolve({}) }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      if (body) req.write(body)
      req.end()
    })
  }

  private get(url: string, headers: Record<string, string>): Promise<unknown> {
    return this.request('GET', url, headers)
  }

  private post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    return this.request('POST', url, headers, JSON.stringify(body))
  }

  // ── JIRA ────────────────────────────────────────────────────────────────────

  private baseUrl(): string {
    return this.settings.get().jiraBaseUrl.replace(/\/+$/, '')
  }

  private jiraAuth(): string {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    return Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')
  }

  private jiraHeaders(): Record<string, string> {
    return { Authorization: `Basic ${this.jiraAuth()}`, Accept: 'application/json' }
  }

  async fetchJiraTickets(projectKey?: string): Promise<Ticket[]> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const projectFilter = projectKey ? `project = "${projectKey}" AND ` : ''
    const jql = encodeURIComponent(`${projectFilter}statusCategory != Done ORDER BY updated DESC`)
    const url = `${base}/rest/api/3/search/jql?jql=${jql}&maxResults=100&fields=summary,status,issuetype`

    const data = await this.get(url, this.jiraHeaders()) as {
      issues?: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; issuetype: { name: string } } }>
    }

    return (data.issues ?? []).map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      type: 'jira' as const,
      url: `${base}/browse/${issue.key}`
    }))
  }

  async searchJira(query: string, projectKey?: string): Promise<Ticket[]> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const projectFilter = projectKey ? `project = "${projectKey}" AND ` : ''
    const jql = encodeURIComponent(`${projectFilter}text ~ "${query.replace(/"/g, '')}" ORDER BY updated DESC`)
    const url = `${base}/rest/api/3/search/jql?jql=${jql}&maxResults=20&fields=summary,status,issuetype`

    const data = await this.get(url, this.jiraHeaders()) as {
      issues?: Array<{ id: string; key: string; fields: { summary: string; status: { name: string } } }>
    }

    return (data.issues ?? []).map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      type: 'jira' as const,
      url: `${base}/browse/${issue.key}`
    }))
  }

  async fetchJiraProjects(): Promise<Array<{ key: string; name: string }>> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const data = await this.get(
      `${base}/rest/api/3/project/search?maxResults=100&orderBy=name`,
      this.jiraHeaders()
    ) as { values?: Array<{ key: string; name: string }> }

    return (data.values ?? []).map((p) => ({ key: p.key, name: p.name }))
  }

  async fetchJiraIssueTypes(projectKey: string): Promise<JiraIssueTypeMeta[]> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const typesData = await this.get(
      `${base}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
      this.jiraHeaders()
    ) as { issueTypes?: Array<{ id: string; name: string; iconUrl?: string }> }

    const issueTypes = typesData.issueTypes ?? []

    const results = await Promise.allSettled(
      issueTypes.map(async (it) => {
        const fieldsData = await this.get(
          `${base}/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${it.id}`,
          this.jiraHeaders()
        ) as { fields?: Array<{
          fieldId: string
          name: string
          required: boolean
          schema: { type: string; system?: string; items?: string }
          allowedValues?: Array<{ id: string; name: string; value?: string; iconUrl?: string }>
        }> }

        return {
          id: it.id,
          name: it.name,
          iconUrl: it.iconUrl,
          fields: (fieldsData.fields ?? []).filter((f) =>
            ['string', 'number', 'option', 'priority', 'user', 'array', 'date', 'datetime'].includes(f.schema.type) ||
            f.schema.system === 'description'
          )
        } as JiraIssueTypeMeta
      })
    )

    return results
      .filter((r): r is PromiseFulfilledResult<JiraIssueTypeMeta> => r.status === 'fulfilled')
      .map((r) => r.value)
  }

  async fetchJiraAssignableUsers(projectKey: string): Promise<JiraUser[]> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const data = await this.get(
      `${base}/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=100`,
      this.jiraHeaders()
    ) as Array<{ accountId: string; displayName: string; avatarUrls?: Record<string, string> }>

    return (data ?? []).map((u) => ({
      accountId: u.accountId,
      displayName: u.displayName,
      avatarUrl: u.avatarUrls?.['24x24']
    }))
  }

  async createJiraTicket(
    projectKey: string,
    summary: string,
    issueTypeId: string,
    extraFields: Record<string, unknown>
  ): Promise<Ticket> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) throw new Error('JIRA not configured')

    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { id: issueTypeId },
      ...extraFields
    }

    const result = await this.post(
      `${base}/rest/api/3/issue`,
      this.jiraHeaders(),
      { fields }
    ) as { id: string; key: string }

    return {
      id: result.id,
      key: result.key,
      title: summary,
      status: 'To Do',
      type: 'jira' as const,
      url: `${base}/browse/${result.key}`
    }
  }

  isJiraConfigured(): boolean {
    const { jiraBaseUrl, jiraEmail, jiraApiToken } = this.settings.get()
    return !!(jiraBaseUrl && jiraEmail && jiraApiToken)
  }

  getJiraBaseUrl(): string {
    return this.baseUrl()
  }

  // ── Shortcut ────────────────────────────────────────────────────────────────

  private shortcutHeaders(): Record<string, string> {
    const { shortcutApiToken } = this.settings.get()
    return { 'Shortcut-Token': shortcutApiToken, 'Content-Type': 'application/json' }
  }

  async fetchShortcutTickets(): Promise<Ticket[]> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) return []

    const data = await this.get(
      'https://api.app.shortcut.com/api/v3/search/stories?query=is:assigned+!is:done&page_size=50',
      this.shortcutHeaders()
    ) as { data?: Array<{ id: number; name: string; story_type: string; app_url: string }> }

    return (data.data ?? []).map((story) => ({
      id: String(story.id),
      key: `SC-${story.id}`,
      title: story.name,
      status: 'In Progress',
      type: 'shortcut' as const,
      url: story.app_url
    }))
  }

  async searchShortcut(query: string): Promise<Ticket[]> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) return []

    const data = await this.get(
      `https://api.app.shortcut.com/api/v3/search/stories?query=${encodeURIComponent(query + ' !is:done')}&page_size=20`,
      this.shortcutHeaders()
    ) as { data?: Array<{ id: number; name: string; story_type: string; app_url: string }> }

    return (data.data ?? []).map((story) => ({
      id: String(story.id),
      key: `SC-${story.id}`,
      title: story.name,
      status: 'Active',
      type: 'shortcut' as const,
      url: story.app_url
    }))
  }

  async fetchShortcutProjects(): Promise<ShortcutProject[]> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) return []

    const data = await this.get(
      'https://api.app.shortcut.com/api/v3/projects',
      this.shortcutHeaders()
    ) as Array<{ id: number; name: string }>

    return (data ?? []).map((p) => ({ id: p.id, name: p.name }))
  }

  async fetchShortcutWorkflowStates(): Promise<ShortcutWorkflowState[]> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) return []

    const workflows = await this.get(
      'https://api.app.shortcut.com/api/v3/workflows',
      this.shortcutHeaders()
    ) as Array<{ states: Array<{ id: number; name: string; type: string }> }>

    // Flatten all states from all workflows
    const states: ShortcutWorkflowState[] = []
    for (const wf of workflows ?? []) {
      for (const s of wf.states ?? []) {
        states.push({ id: s.id, name: s.name, type: s.type })
      }
    }
    return states
  }

  async createShortcutStory(
    name: string,
    projectId: number,
    storyType: string,
    description?: string,
    workflowStateId?: number
  ): Promise<Ticket> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) throw new Error('Shortcut not configured')

    const body: Record<string, unknown> = {
      name,
      project_id: projectId,
      story_type: storyType
    }
    if (description) body.description = description
    if (workflowStateId) body.workflow_state_id = workflowStateId

    const result = await this.post(
      'https://api.app.shortcut.com/api/v3/stories',
      this.shortcutHeaders(),
      body
    ) as { id: number; name: string; app_url: string }

    return {
      id: String(result.id),
      key: `SC-${result.id}`,
      title: name,
      status: 'Unstarted',
      type: 'shortcut' as const,
      url: result.app_url
    }
  }

  isShortcutConfigured(): boolean {
    const { shortcutApiToken } = this.settings.get()
    return !!shortcutApiToken
  }

  // ── ClickUp ─────────────────────────────────────────────────────────────────

  private clickupHeaders(): Record<string, string> {
    const { clickupApiToken } = this.settings.get()
    return { Authorization: clickupApiToken, 'Content-Type': 'application/json' }
  }

  async fetchClickupTasks(): Promise<Ticket[]> {
    const { clickupApiToken, clickupTeamId } = this.settings.get()
    if (!clickupApiToken || !clickupTeamId) return []

    // Fetch tasks assigned to the authenticated user that are not closed
    const data = await this.get(
      `https://api.clickup.com/api/v2/team/${clickupTeamId}/task?statuses[]=open&statuses[]=in+progress&statuses[]=to+do&subtasks=true&include_closed=false&order_by=updated&reverse=true&page=0`,
      this.clickupHeaders()
    ) as { tasks?: Array<{ id: string; name: string; status: { status: string }; url: string; custom_id?: string }> }

    return (data.tasks ?? []).map((t) => ({
      id: t.id,
      key: t.custom_id || `CU-${t.id.slice(-6)}`,
      title: t.name,
      status: t.status.status,
      type: 'clickup' as const,
      url: t.url
    }))
  }

  async searchClickup(query: string): Promise<Ticket[]> {
    const { clickupApiToken, clickupTeamId } = this.settings.get()
    if (!clickupApiToken || !clickupTeamId) return []

    const data = await this.get(
      `https://api.clickup.com/api/v2/team/${clickupTeamId}/task?name=${encodeURIComponent(query)}&include_closed=false&page=0`,
      this.clickupHeaders()
    ) as { tasks?: Array<{ id: string; name: string; status: { status: string }; url: string; custom_id?: string }> }

    return (data.tasks ?? []).map((t) => ({
      id: t.id,
      key: t.custom_id || `CU-${t.id.slice(-6)}`,
      title: t.name,
      status: t.status.status,
      type: 'clickup' as const,
      url: t.url
    }))
  }

  async fetchClickupSpaces(): Promise<ClickUpSpace[]> {
    const { clickupApiToken, clickupTeamId } = this.settings.get()
    if (!clickupApiToken || !clickupTeamId) return []

    const data = await this.get(
      `https://api.clickup.com/api/v2/team/${clickupTeamId}/space?archived=false`,
      this.clickupHeaders()
    ) as { spaces?: Array<{ id: string; name: string }> }

    return (data.spaces ?? []).map((s) => ({ id: s.id, name: s.name }))
  }

  async fetchClickupLists(spaceId: string): Promise<ClickUpList[]> {
    const { clickupApiToken } = this.settings.get()
    if (!clickupApiToken) return []

    // Get folderless lists
    const folderlessData = await this.get(
      `https://api.clickup.com/api/v2/space/${spaceId}/list?archived=false`,
      this.clickupHeaders()
    ) as { lists?: Array<{ id: string; name: string }> }

    const lists: ClickUpList[] = (folderlessData.lists ?? []).map((l) => ({
      id: l.id, name: l.name
    }))

    // Get folders and their lists
    const foldersData = await this.get(
      `https://api.clickup.com/api/v2/space/${spaceId}/folder?archived=false`,
      this.clickupHeaders()
    ) as { folders?: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }> }

    for (const folder of foldersData.folders ?? []) {
      for (const l of folder.lists ?? []) {
        lists.push({ id: l.id, name: l.name, folder: { id: folder.id, name: folder.name } })
      }
    }

    return lists
  }

  async createClickupTask(
    listId: string,
    name: string,
    description?: string
  ): Promise<Ticket> {
    const { clickupApiToken } = this.settings.get()
    if (!clickupApiToken) throw new Error('ClickUp not configured')

    const body: Record<string, unknown> = { name }
    if (description) body.description = description

    const result = await this.post(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      this.clickupHeaders(),
      body
    ) as { id: string; name: string; url: string; custom_id?: string }

    return {
      id: result.id,
      key: result.custom_id || `CU-${result.id.slice(-6)}`,
      title: name,
      status: 'Open',
      type: 'clickup' as const,
      url: result.url
    }
  }

  isClickupConfigured(): boolean {
    const { clickupApiToken, clickupTeamId } = this.settings.get()
    return !!(clickupApiToken && clickupTeamId)
  }

  // ── Combined ────────────────────────────────────────────────────────────────

  async fetchAll(projectKey?: string, integration?: 'jira' | 'shortcut' | 'clickup'): Promise<Ticket[]> {
    if (integration === 'jira') return this.fetchJiraTickets(projectKey)
    if (integration === 'shortcut') return this.fetchShortcutTickets()
    if (integration === 'clickup') return this.fetchClickupTasks()
    // No integration specified — fetch all configured
    const [jira, shortcut, clickup] = await Promise.allSettled([
      this.fetchJiraTickets(projectKey),
      this.fetchShortcutTickets(),
      this.fetchClickupTasks()
    ])
    if (jira.status === 'rejected') throw jira.reason
    return [
      ...jira.value,
      ...(shortcut.status === 'fulfilled' ? shortcut.value : []),
      ...(clickup.status === 'fulfilled' ? clickup.value : [])
    ]
  }
}
