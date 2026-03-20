import { ipcMain } from 'electron'
import { TicketService } from '../services/TicketService'

export function registerTicketIpc(ticketService: TicketService): void {
  ipcMain.handle('tickets:fetchAll', (_e, projectKey?: string) => ticketService.fetchAll(projectKey))
  ipcMain.handle('tickets:fetchJira', (_e, projectKey?: string) => ticketService.fetchJiraTickets(projectKey))
  ipcMain.handle('tickets:fetchShortcut', () => ticketService.fetchShortcutTickets())
  ipcMain.handle('tickets:searchJira', (_e, query: string, projectKey?: string) => ticketService.searchJira(query, projectKey))
  ipcMain.handle('tickets:getJiraBaseUrl', () => ticketService.getJiraBaseUrl())
  ipcMain.handle('tickets:isJiraConfigured', () => ticketService.isJiraConfigured())
  ipcMain.handle('tickets:fetchJiraProjects', () => ticketService.fetchJiraProjects())
  ipcMain.handle('tickets:fetchJiraIssueTypes', (_e, projectKey: string) => ticketService.fetchJiraIssueTypes(projectKey))
  ipcMain.handle('tickets:createJira', (_e, projectKey: string, summary: string, issueTypeId: string, extraFields: Record<string, unknown>) =>
    ticketService.createJiraTicket(projectKey, summary, issueTypeId, extraFields)
  )
}
