import { create } from 'zustand'
import { Repository, Session, Settings } from '../types'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('branchless-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch { /* ignore */ }
  return 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try { localStorage.setItem('branchless-theme', theme) } catch { /* ignore */ }
}

// Apply on load
applyTheme(getInitialTheme())

interface AppState {
  repos: Repository[]
  sessions: Session[]
  selectedRepoId: string | null
  selectedSessionId: string | null
  settings: Settings | null
  view: 'sessions' | 'settings' | 'activity'
  theme: Theme
  isLoadingRepos: boolean
  isLoadingSessions: boolean

  setRepos: (repos: Repository[]) => void
  setSessions: (sessions: Session[]) => void
  setSelectedRepo: (id: string | null) => void
  setSelectedSession: (id: string | null) => void
  setSettings: (settings: Settings) => void
  setView: (view: AppState['view']) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
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
  theme: getInitialTheme(),
  isLoadingRepos: false,
  isLoadingSessions: false,

  setRepos: (repos) => set({ repos }),
  setSessions: (sessions) => set({ sessions }),
  setSelectedRepo: (id) => set({ selectedRepoId: id, selectedSessionId: null }),
  setSelectedSession: (id) => set({ selectedSessionId: id }),
  setSettings: (settings) => set({ settings }),
  setView: (view) => set({ view }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => set((s) => { const next = s.theme === 'light' ? 'dark' : 'light' as Theme; applyTheme(next); return { theme: next } }),
  setLoadingRepos: (v) => set({ isLoadingRepos: v }),
  setLoadingSessions: (v) => set({ isLoadingSessions: v }),

  addRepo: (repo) => set((s) => ({ repos: [...s.repos, repo] })),
  removeRepo: (id) => set((s) => ({ repos: s.repos.filter((r) => r.id !== id) })),
  addSession: (session) => set((s) => ({ sessions: [...s.sessions, session] })),
  removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }))
}))
