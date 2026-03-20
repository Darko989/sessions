import { create } from 'zustand'
import { Repository, Session, Settings } from '../types'

interface AppState {
  repos: Repository[]
  sessions: Session[]
  selectedRepoId: string | null
  selectedSessionId: string | null
  settings: Settings | null
  view: 'sessions' | 'settings' | 'activity'
  isLoadingRepos: boolean
  isLoadingSessions: boolean

  setRepos: (repos: Repository[]) => void
  setSessions: (sessions: Session[]) => void
  setSelectedRepo: (id: string | null) => void
  setSelectedSession: (id: string | null) => void
  setSettings: (settings: Settings) => void
  setView: (view: AppState['view']) => void
  setLoadingRepos: (v: boolean) => void
  setLoadingSessions: (v: boolean) => void

  addRepo: (repo: Repository) => void
  removeRepo: (id: string) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  repos: [],
  sessions: [],
  selectedRepoId: null,
  selectedSessionId: null,
  settings: null,
  view: 'sessions',
  isLoadingRepos: false,
  isLoadingSessions: false,

  setRepos: (repos) => set({ repos }),
  setSessions: (sessions) => set({ sessions }),
  setSelectedRepo: (id) => set({ selectedRepoId: id, selectedSessionId: null }),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSettings: (settings) => set({ settings }),
  setView: (view) => set({ view }),
  setLoadingRepos: (v) => set({ isLoadingRepos: v }),
  setLoadingSessions: (v) => set({ isLoadingSessions: v }),

  addRepo: (repo) => set((s) => ({ repos: [...s.repos, repo] })),
  removeRepo: (id) => set((s) => ({ repos: s.repos.filter((r) => r.id !== id) })),
  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }))
}))
