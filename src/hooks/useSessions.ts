import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { CreateSessionInput, Session, GitStatus } from '../types'
import * as api from '../api'

export function useSessions() {
  const { sessions, selectedRepoId, setSessions, addSession, removeSession } = useAppStore()

  const loadSessions = useCallback(async () => {
    const all = await api.sessions.getAll()
    setSessions(all)
  }, [setSessions])

  const createSession = useCallback(async (input: CreateSessionInput) => {
    const session = await api.sessions.create(input)
    addSession(session)
    return session
  }, [addSession])

  const deleteSession = useCallback(async (id: string) => {
    await api.sessions.delete(id)
    removeSession(id)
  }, [removeSession])

  const refreshSession = useCallback(async (id: string) => {
    return api.sessions.refresh(id)
  }, [])

  const getStatus = useCallback(async (id: string) => {
    return api.sessions.getStatus(id)
  }, [])

  const openInVSCode = useCallback(async (id: string) => {
    await api.sessions.openInVSCode(id)
  }, [])

  const openInCursor = useCallback(async (id: string) => {
    await api.sessions.openInCursor(id)
  }, [])

  const openInTerminal = useCallback(async (id: string) => {
    await api.sessions.openInTerminal(id)
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
