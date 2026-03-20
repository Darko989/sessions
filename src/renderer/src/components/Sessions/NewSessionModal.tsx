import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { useAppStore } from '../../store/appStore'
import { Ticket } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (input: import('../../types').CreateSessionInput) => Promise<void>
}

const BUG_PATTERN = /\b(bug|fix|hotfix|patch|defect|issue|error|crash|broken|regression)\b/i

/** Derives the branch name preview from a ticket — mirrors SessionManager logic */
function deriveBranchPreview(ticket: Ticket): string {
  const ticketNum = ticket.key.match(/(\d+)$/)?.[1] ?? ticket.key.toLowerCase().replace(/[^a-z0-9]/g, '')
  const titleSlug = ticket.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 25)
    .replace(/-$/, '')
  const prefix = BUG_PATTERN.test(ticket.title) ? 'bugfix' : 'feature'
  return `${prefix}/${ticketNum}-${titleSlug}`
}

export const NewSessionModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { repos, selectedRepoId } = useAppStore()

  const [repoId, setRepoId] = useState(selectedRepoId ?? '')
  const [name, setName] = useState('')
  const [baseBranch, setBaseBranch] = useState('')
  const [branchName, setBranchName] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Ticket search state
  const [ticketSearch, setTicketSearch] = useState('')
  const [ticketResults, setTicketResults] = useState<Ticket[]>([])
  const [myTickets, setMyTickets] = useState<Ticket[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [jiraBaseUrl, setJiraBaseUrl] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedRepo = repos.find((r) => r.id === repoId)
  const isNonDefaultBranch = !!baseBranch && !!selectedRepo && baseBranch !== selectedRepo.defaultBranch

  // Reset on open
  useEffect(() => {
    if (!open) return
    setRepoId(selectedRepoId ?? repos[0]?.id ?? '')
    setName('')
    setBranchName('')
    setTicketSearch('')
    setSelectedTicket(null)
    setTicketResults([])
    setShowDropdown(false)
    setError('')

    window.api.tickets.fetchAll()
      .then((t) => setMyTickets(t as Ticket[]))
      .catch(() => setMyTickets([]))

    window.api.tickets.getJiraBaseUrl()
      .then((url) => setJiraBaseUrl(url as string))
      .catch(() => setJiraBaseUrl(''))
  }, [open, selectedRepoId, repos])

  // Load branches when repo changes
  useEffect(() => {
    if (!selectedRepo) return
    setBaseBranch(selectedRepo.defaultBranch)
    window.api.repos.getBranches(selectedRepo.path).then((b) => setBranches(b as string[]))
  }, [selectedRepo])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced JIRA search
  const handleSearchChange = useCallback((value: string) => {
    setTicketSearch(value)
    setShowDropdown(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!value.trim()) {
      setTicketResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await window.api.tickets.searchJira(value) as Ticket[]
        setTicketResults(results)
      } catch {
        setTicketResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }, [])

  const handleTicketSelect = (ticket: Ticket) => {
    setSelectedTicket(ticket)
    setTicketSearch(`${ticket.key} — ${ticket.title}`)
    setShowDropdown(false)
    if (!name) setName(ticket.title.slice(0, 60))
    // Auto-fill branch name immediately so user sees the prefix + format
    setBranchName(deriveBranchPreview(ticket))
  }

  const clearTicket = () => {
    setSelectedTicket(null)
    setTicketSearch('')
    setTicketResults([])
    setBranchName('')
  }

  // What to show in dropdown
  const displayedResults = ticketSearch.trim() ? ticketResults : myTickets

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRepo || !name.trim() || !baseBranch) return
    setLoading(true)
    setError('')
    try {
      await onCreated({
        name: name.trim(),
        repoId: selectedRepo.id,
        repoPath: selectedRepo.path,
        baseBranch,
        branchName: branchName.trim() || undefined,
        ticketId: selectedTicket?.key,
        ticketTitle: selectedTicket?.title
      })
      onClose()
    } catch (err: unknown) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <Modal open={open} onClose={onClose} title="New Session" width="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Repo selector */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Repository</label>
          <select
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            className={inputCls}
          >
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Ticket search */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-400">
              Ticket
              <span className="ml-1.5 text-slate-600 font-normal">optional</span>
            </label>
            {jiraBaseUrl && (
              <a
                href={`${jiraBaseUrl}/issues/?jql=assignee%3DcurrentUser()%20AND%20statusCategory%20!%3D%20Done`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 11.513H8a5.506 5.506 0 0 0 5.5 5.5 5.506 5.506 0 0 0 5.5-5.5h-3.571a1.93 1.93 0 0 1-1.929 1.928 1.93 1.93 0 0 1-1.929-1.928zM12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
                </svg>
                Open JIRA
              </a>
            )}
          </div>

          <div className="relative" ref={searchRef}>
            {/* Selected ticket pill */}
            {selectedTicket ? (
              <div className="flex items-center gap-2 bg-surface-900 border border-brand-500/40 rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-brand-400 flex-shrink-0">{selectedTicket.key}</span>
                <span className="text-sm text-white truncate flex-1">{selectedTicket.title}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${selectedTicket.type === 'jira' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                  {selectedTicket.type}
                </span>
                {selectedTicket.url && (
                  <a
                    href={selectedTicket.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                    title="Open in JIRA"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                <button type="button" onClick={clearTicket} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search tickets or browse assigned…"
                  className="w-full bg-surface-900 border border-surface-600 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {searchLoading && (
                  <svg className="animate-spin absolute right-3 top-2.5 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
              </div>
            )}

            {/* Dropdown */}
            {showDropdown && !selectedTicket && (
              <div className="absolute z-20 mt-1 w-full bg-surface-800 border border-surface-600 rounded-xl shadow-2xl overflow-hidden">
                <div className="px-3 py-2 border-b border-surface-700 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {ticketSearch.trim() ? 'Search results' : 'Assigned to me'}
                  </span>
                  {displayedResults.length > 0 && (
                    <span className="text-xs text-slate-600">{displayedResults.length} tickets</span>
                  )}
                </div>

                <div className="max-h-52 overflow-y-auto">
                  {displayedResults.length === 0 && !searchLoading ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-600">
                      {ticketSearch.trim()
                        ? 'No tickets found'
                        : 'No assigned tickets — configure JIRA in Settings'}
                    </div>
                  ) : (
                    displayedResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTicketSelect(t)}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-700 transition-colors border-b border-surface-700/50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500 flex-shrink-0 w-20 truncate">{t.key}</span>
                          <span className="text-sm text-slate-200 flex-1 truncate">{t.title}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs text-slate-600">{t.status}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${t.type === 'jira' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                              {t.type}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Session name */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Session Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fix login redirect bug"
            required
            className={inputCls}
          />
        </div>

        {/* Base branch + branch name — side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Base Branch
            </label>
            <select
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              className={`${inputCls} ${isNonDefaultBranch ? 'border-amber-500/60 focus:ring-amber-500' : ''}`}
            >
              {branches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {isNonDefaultBranch && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-xs text-amber-400">
                  Not the default branch ({selectedRepo?.defaultBranch})
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Branch Name
              <span className="ml-1.5 text-slate-600 font-normal">auto if empty</span>
            </label>
            <input
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="feature/my-feature"
              className={`${inputCls} font-mono text-xs`}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!name.trim() || !repoId}>
            Create Session
          </Button>
        </div>
      </form>
    </Modal>
  )
}
