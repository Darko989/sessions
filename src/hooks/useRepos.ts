import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import * as api from '../api'

export function useRepos() {
  const { repos, setRepos, addRepo, removeRepo, setSelectedRepo } = useAppStore()

  const loadRepos = useCallback(async () => {
    const all = await api.repos.getAll()
    setRepos(all)
  }, [setRepos])

  const addRepository = useCallback(async (repoPath: string) => {
    const repo = await api.repos.add(repoPath)
    addRepo(repo)
    return repo
  }, [addRepo])

  const removeRepository = useCallback(async (id: string) => {
    await api.repos.remove(id)
    removeRepo(id)
  }, [removeRepo])

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    return api.settings.pickDirectory()
  }, [])

  return { repos, loadRepos, addRepository, removeRepository, pickDirectory, setSelectedRepo }
}
