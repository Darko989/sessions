import { net } from 'electron'
import { SettingsStore } from './SettingsStore'

export interface Ticket {
  id: string
  key: string
  title: string
  status: string
  type: 'jira' | 'shortcut'
  url?: string
}

export class TicketService {
  private settings: SettingsStore

  constructor(settings: SettingsStore) {
    this.settings = settings
  }

  private async httpGet(url: string, headers: Record<string, string>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'GET' })
      for (const [key, val] of Object.entries(headers)) {
        request.setHeader(key, val)
      }
      let data = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { data += chunk.toString() })
        response.on('end', () => {
          const status = response.statusCode ?? 0
          if (status < 200 || status >= 300) {
            let detail = ''
            try { detail = JSON.parse(data)?.message ?? JSON.parse(data)?.errorMessages?.[0] ?? '' } catch { detail = data.slice(0, 200) }
            reject(new Error(`HTTP ${status}${detail ? ': ' + detail : ''}`))
            return
          }
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`Failed to parse response: ${data.slice(0, 200)}`))
          }
        })
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end()
    })
  }

  private async httpPost(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'POST' })
      const payload = JSON.stringify(body)
      for (const [key, val] of Object.entries(headers)) {
        request.setHeader(key, val)
      }
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('Content-Length', Buffer.byteLength(payload).toString())
      let data = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => { data += chunk.toString() })
        response.on('end', () => {
          const status = response.statusCode ?? 0
          if (status < 200 || status >= 300) {
            let detail = ''
            try { detail = JSON.parse(data)?.message ?? JSON.parse(data)?.errorMessages?.[0] ?? '' } catch { detail = data.slice(0, 200) }
            reject(new Error(`HTTP ${status}${detail ? ': ' + detail : ''}`))
            return
          }
          try { resolve(JSON.parse(data)) } catch { resolve({}) }
        })
        response.on('error', reject)
      })
      request.on('error', reject)
      request.write(payload)
      request.end()
    })
  }

  private baseUrl(): string {
    return this.settings.get().jiraBaseUrl.replace(/\/+$/, '') // strip trailing slash
  }

  async fetchJiraTickets(projectKey?: string): Promise<Ticket[]> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) return []

    const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')
    const projectFilter = projectKey ? `project = "${projectKey}" AND ` : ''
    const jql = encodeURIComponent(`${projectFilter}statusCategory != Done ORDER BY updated DESC`)
    const url = `${base}/rest/api/3/search/jql?jql=${jql}&maxResults=100&fields=summary,status,issuetype`

    const data = await this.httpGet(url, {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json'
    }) as { issues?: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; issuetype: { name: string } } }> }

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

    const data = await this.httpGet('https://api.app.shortcut.com/api/v3/search/stories?query=is:assigned+!is:done&page_size=50', {
      'Shortcut-Token': shortcutApiToken,
      'Content-Type': 'application/json'
    }) as { data?: Array<{ id: number; name: string; story_type: string; app_url: string; workflow_state_id: number }> }

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

    const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')
    const projectFilter = projectKey ? `project = "${projectKey}" AND ` : ''
    const jql = encodeURIComponent(
      `${projectFilter}text ~ "${query.replace(/"/g, '')}" ORDER BY updated DESC`
    )
    const url = `${base}/rest/api/3/search/jql?jql=${jql}&maxResults=20&fields=summary,status,issuetype`

    const data = await this.httpGet(url, {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json'
    }) as { issues?: Array<{ id: string; key: string; fields: { summary: string; status: { name: string } } }> }

    return (data.issues ?? []).map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      type: 'jira' as const,
      url: `${base}/browse/${issue.key}`
    }))
  }

  async createJiraTicket(
    projectKey: string,
    summary: string,
    issueType: string,
    priority?: string,
    description?: string
  ): Promise<Ticket> {
    const { jiraEmail, jiraApiToken } = this.settings.get()
    const base = this.baseUrl()
    if (!base || !jiraEmail || !jiraApiToken) throw new Error('JIRA not configured')

    const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')
    const fields: Record<string, unknown> = {
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType }
    }
    if (priority) fields.priority = { name: priority }
    if (description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
      }
    }

    const result = await this.httpPost(
      `${base}/rest/api/3/issue`,
      { Authorization: `Basic ${auth}`, Accept: 'application/json' },
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
