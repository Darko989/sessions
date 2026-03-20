import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'

export function useRepos() {
  const { repos, setRepos, addRepo, removeRepo, setSelectedRepo } = useAppStore()

  const loadRepos = useCallback(async () => {
    const all = await window.api.repos.getAll() as import('../types').Repository[]
    setRepos(all)
  }, [setRepos])

  const addRepository = useCallback(async (repoPath: string) => {
    const repo = await window.api.repos.add(repoPath) as import('../types').Repository
    addRepo(repo)
    return repo
  }, [addRepo])

  const removeRepository = useCallback(async (id: string) => {
    await window.api.repos.remove(id)
    removeRepo(id)
  }, [removeRepo])

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    return window.api.settings.pickDirectory() as Promise<string | null>
  }, [])

  return { repos, loadRepos, addRepository, removeRepository, pickDirectory, setSelectedRepo }
}
