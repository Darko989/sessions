import https from 'https'
import http from 'http'
import { SettingsStore } from './SettingsStore'

export interface Ticket {
  id: string
  key: string
  title: string
  status: string
  type: 'jira' | 'shortcut'
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

  async fetchShortcutTickets(): Promise<Ticket[]> {
    const { shortcutApiToken } = this.settings.get()
    if (!shortcutApiToken) return []

    const data = await this.get(
      'https://api.app.shortcut.com/api/v3/search/stories?query=is:assigned+!is:done&page_size=50',
      { 'Shortcut-Token': shortcutApiToken, 'Content-Type': 'application/json' }
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

    // Fetch issue types for the project
    const typesData = await this.get(
      `${base}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
      this.jiraHeaders()
    ) as { issueTypes?: Array<{ id: string; name: string; iconUrl?: string }> }

    const issueTypes = typesData.issueTypes ?? []

    // Fetch fields for each issue type in parallel
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
            // Only include renderable field types
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

  async fetchAll(projectKey?: string): Promise<Ticket[]> {
    const [jira, shortcut] = await Promise.allSettled([
      this.fetchJiraTickets(projectKey),
      this.fetchShortcutTickets()
    ])
    if (jira.status === 'rejected') throw jira.reason
    return [
      ...jira.value,
      ...(shortcut.status === 'fulfilled' ? shortcut.value : [])
    ]
  }
}
