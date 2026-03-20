import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { CreateSessionInput } from '../types'

export function useSessions() {
  const { sessions, selectedRepoId, setSessions, addSession, removeSession } = useAppStore()

  const loadSessions = useCallback(async () => {
    const all = await window.api.sessions.getAll() as import('../types').Session[]
    setSessions(all)
  }, [setSessions])

  const createSession = useCallback(async (input: CreateSessionInput) => {
    const session = await window.api.sessions.create(input) as import('../types').Session
    addSession(session)
    return session
  }, [addSession])

  const deleteSession = useCallback(async (id: string) => {
    await window.api.sessions.delete(id)
    removeSession(id)
  }, [removeSession])

  const refreshSession = useCallback(async (id: string) => {
    return window.api.sessions.refresh(id) as Promise<{ success: boolean; output: string; hasConflicts: boolean }>
  }, [])

  const getStatus = useCallback(async (id: string) => {
    return window.api.sessions.getStatus(id) as Promise<import('../types').GitStatus>
  }, [])

  const openInVSCode = useCallback(async (id: string) => {
    await window.api.sessions.openInVSCode(id)
  }, [])

  const openInCursor = useCallback(async (id: string) => {
    await window.api.sessions.openInCursor(id)
  }, [])

  const openInTerminal = useCallback(async (id: string) => {
    await window.api.sessions.openInTerminal(id)
  }, [])

  const activeSessions = selectedRepoId
    ? sessions.filter((s) => s.repoId === selectedRepoId && s.status === 'active')
    : sessions.filter((s) => s.status === 'active')

  return {
    sessions: activeSessions,
    allSessions: sessions,
    loadSessions,
    createSession,
    deleteSession,
    refreshSession,
    getStatus,
    openInVSCode,
    openInCursor,
    openInTerminal
  }
}
