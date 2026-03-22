import { ipcMain } from 'electron'
import { TicketService } from '../services/TicketService'

export function registerTicketIpc(ticketService: TicketService): void {
  // Combined
  ipcMain.handle('tickets:fetchAll', (_e, projectKey?: string) => ticketService.fetchAll(projectKey))

  // JIRA
  ipcMain.handle('tickets:fetchJira', (_e, projectKey?: string) => ticketService.fetchJiraTickets(projectKey))
  ipcMain.handle('tickets:searchJira', (_e, query: string, projectKey?: string) => ticketService.searchJira(query, projectKey))
  ipcMain.handle('tickets:getJiraBaseUrl', () => ticketService.getJiraBaseUrl())
  ipcMain.handle('tickets:isJiraConfigured', () => ticketService.isJiraConfigured())
  ipcMain.handle('tickets:fetchJiraProjects', () => ticketService.fetchJiraProjects())
  ipcMain.handle('tickets:fetchJiraIssueTypes', (_e, projectKey: string) => ticketService.fetchJiraIssueTypes(projectKey))
  ipcMain.handle('tickets:fetchJiraAssignableUsers', (_e, projectKey: string) => ticketService.fetchJiraAssignableUsers(projectKey))
  ipcMain.handle('tickets:createJira', (_e, projectKey: string, summary: string, issueTypeId: string, extraFields: Record<string, unknown>) =>
    ticketService.createJiraTicket(projectKey, summary, issueTypeId, extraFields)
  )

  // Shortcut
  ipcMain.handle('tickets:fetchShortcut', () => ticketService.fetchShortcutTickets())
  ipcMain.handle('tickets:searchShortcut', (_e, query: string) => ticketService.searchShortcut(query))
  ipcMain.handle('tickets:fetchShortcutProjects', () => ticketService.fetchShortcutProjects())
  ipcMain.handle('tickets:fetchShortcutWorkflowStates', () => ticketService.fetchShortcutWorkflowStates())
  ipcMain.handle('tickets:createShortcut', (_e, name: string, projectId: number, storyType: string, description?: string, workflowStateId?: number) =>
    ticketService.createShortcutStory(name, projectId, storyType, description, workflowStateId)
  )
  ipcMain.handle('tickets:isShortcutConfigured', () => ticketService.isShortcutConfigured())

  // ClickUp
  ipcMain.handle('tickets:fetchClickup', () => ticketService.fetchClickupTasks())
  ipcMain.handle('tickets:searchClickup', (_e, query: string) => ticketService.searchClickup(query))
  ipcMain.handle('tickets:fetchClickupSpaces', () => ticketService.fetchClickupSpaces())
  ipcMain.handle('tickets:fetchClickupLists', (_e, spaceId: string) => ticketService.fetchClickupLists(spaceId))
  ipcMain.handle('tickets:createClickup', (_e, listId: string, name: string, description?: string) =>
    ticketService.createClickupTask(listId, name, description)
  )
  ipcMain.handle('tickets:isClickupConfigured', () => ticketService.isClickupConfigured())
}
