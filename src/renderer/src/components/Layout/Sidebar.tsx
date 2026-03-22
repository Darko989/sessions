import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { useRepos } from '../../hooks/useRepos'
import { useSessions } from '../../hooks/useSessions'
import { SessionList } from '../Sessions/SessionList'
import { Repository, Ticket } from '../../types'

// ── Logos ──────────────────────────────────────────────────────────────────────
import iconJira from '../../assets/icons/jira.png'
import iconShortcut from '../../assets/icons/shortcut.png'

const JiraLogo = ({ size = 14 }: { size?: number }) => (
  <img src={iconJira} alt="JIRA" width={size} height={size} className="object-contain flex-shrink-0" draggable={false}/>
)

const ShortcutLogo = ({ size = 14 }: { size?: number }) => (
  <img src={iconShortcut} alt="Shortcut" width={size} height={size} className="object-contain flex-shrink-0" draggable={false}/>
)

const ClickUpLogo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
    <path d="M4 17.5l4-3.5c1.7 2 3.3 3 4 3 .7 0 2.3-1 4-3l4 3.5c-2.3 3-5 4.5-8 4.5s-5.7-1.5-8-4.5z" fill="#7B68EE"/>
    <path d="M12 6l-7.5 6.5 3 2.5L12 11l4.5 4 3-2.5L12 6z" fill="#49CCF9"/>
  </svg>
)

// ── Branch modal ───────────────────────────────────────────────────────────────

interface BranchEntry { repo: Repository; branch: string }

const BranchModal: React.FC<{
  repos: Repository[]
  selectedRepoId: string | null
  currentBranch: string
  onSelect: (repo: Repository, branch: string) => void
  onClose: () => void
}> = ({ repos, selectedRepoId, currentBranch, onSelect, onClose }) => {
  const [search, setSearch] = useState('')
  const [entries, setEntries] = useState<BranchEntry[]>([])
  const [loading, setLoading] = useState(true)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const all: BranchEntry[] = []
      const reposToFetch = selectedRepoId
        ? repos.filter(r => r.id === selectedRepoId)
        : repos
      for (const repo of reposToFetch) {
        try {
          const branches = await window.api.repos.getBranches(repo.path) as string[]
          for (const b of branches) all.push({ repo, branch: b })
        } catch { /* skip */ }
      }
      setEntries(all)
      setLoading(false)
    }
    fetchAll()
  }, [repos.length, selectedRepoId])

  const filtered = search.trim()
    ? entries.filter(e =>
        e.branch.toLowerCase().includes(search.toLowerCase()) ||
        e.repo.name.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-panel-card rounded-2xl shadow-2xl border border-panel-border w-[520px] max-h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-panel-border">
          <div>
            <span className="text-sm font-semibold text-ink">Select base branch</span>
            <p className="text-xs text-ink-3 mt-0.5">The new session branch will be created from this</p>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="px-4 py-2 border-b border-panel-border">
          <div className="relative">
            <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter branches…"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-panel-hover border border-panel-border rounded-lg text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-ink-3">Loading branches…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-3">No branches found</div>
          ) : (
            filtered.map((e, i) => {
              const isActive = e.repo.id === selectedRepoId && e.branch === currentBranch
              return (
                <button
                  key={i}
                  onClick={() => { onSelect(e.repo, e.branch); onClose() }}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-panel-hover border-b border-panel-border/30 last:border-0 ${isActive ? 'bg-accent/5' : ''}`}
                >
                  <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3.314-5.373 6-12 6"/>
                  </svg>
                  <span className="text-[13px] font-semibold text-ink flex-1 truncate">{e.branch}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: e.repo.color, backgroundColor: e.repo.color + '20' }}>
                    {e.repo.name}
                  </span>
                  {isActive && (
                    <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ── Ticket modal ───────────────────────────────────────────────────────────────

const TicketRow: React.FC<{ ticket: Ticket; onSelect: () => void }> = ({ ticket: t, onSelect }) => (
  <button
    onClick={onSelect}
    className="w-full text-left px-5 py-2.5 hover:bg-panel-hover border-b border-panel-border/30 last:border-0 flex items-start gap-3"
  >
    <span className="mt-0.5 flex-shrink-0">
      {t.type === 'jira' ? <JiraLogo size={13}/> : t.type === 'shortcut' ? <ShortcutLogo size={13}/> : <ClickUpLogo size={13}/>}
    </span>
    <div className="flex-1 min-w-0">
      <span className={`text-xs font-mono font-bold ${t.type === 'jira' ? 'text-blue-500' : t.type === 'shortcut' ? 'text-purple-500' : 'text-indigo-500'}`}>
        {t.key}
      </span>
      <p className="text-sm text-ink leading-snug truncate mt-0.5">{t.title}</p>
    </div>
  </button>
)

const STATUS_ORDER = ['In Progress', 'In Development', 'In Review', 'Code Review', 'To Do', 'Open', 'Backlog', 'Selected for Development']

function groupByStatus(tickets: Ticket[]): { status: string; tickets: Ticket[] }[] {
  const map = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const s = t.status
    if (!map.has(s)) map.set(s, [])
    map.get(s)!.push(t)
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ai = STATUS_ORDER.indexOf(a)
      const bi = STATUS_ORDER.indexOf(b)
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .map(([status, tickets]) => ({ status, tickets }))
}

// ── Custom select dropdown (matches repo dropdown style) ──────────────────────

const CustomSelect: React.FC<{
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
}> = ({ value, options, onChange, placeholder, searchable }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && searchable) {
      setSearch('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, searchable])

  const filtered = searchable && search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 bg-panel-card border border-panel-border rounded-xl pl-3 pr-8 py-2 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 shadow-sm hover:border-ink-4 transition-colors"
      >
        <span className="text-[13px] font-semibold text-ink truncate">
          {selected?.label ?? placeholder ?? 'Select…'}
        </span>
      </button>
      <svg className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-ink-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
      </svg>
      {open && (
        <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-panel-card border border-panel-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-56">
          {searchable && (
            <div className="px-2 py-1.5 border-b border-panel-border flex-shrink-0">
              <div className="relative">
                <svg className="absolute left-2 top-1.5 w-3.5 h-3.5 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-7 pr-2 py-1 text-xs bg-panel-hover border border-panel-border rounded-lg text-ink placeholder-ink-3 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-ink-3 text-center">No results</div>
            ) : filtered.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-panel-hover transition-colors ${value === o.value ? 'bg-accent/5' : ''}`}
              >
                <span className="text-[13px] font-medium text-ink truncate flex-1">{o.label}</span>
                {value === o.value && (
                  <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── In-app ticket creation form ────────────────────────────────────────────────

interface JiraFieldMeta {
  fieldId: string
  name: string
  required: boolean
  schema: { type: string; system?: string; items?: string }
  allowedValues?: Array<{ id: string; name: string; value?: string }>
}

interface JiraIssueTypeMeta {
  id: string
  name: string
  fields: JiraFieldMeta[]
}

// Fields to skip — handled separately or not renderable
const SKIP_FIELDS = new Set(['summary', 'issuetype', 'project', 'reporter', 'attachment', 'issuelinks', 'subtasks', 'watches', 'votes'])

const Spinner = () => (
  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
)

const CreateTicketForm: React.FC<{
  defaultProjectKey?: string
  onCreated: (t: Ticket) => void
  onBack: () => void
}> = ({ defaultProjectKey, onCreated, onBack }) => {
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([])
  const [projectKey, setProjectKey] = useState(defaultProjectKey ?? '')
  const [loadingProjects, setLoadingProjects] = useState(true)

  const [issueTypes, setIssueTypes] = useState<JiraIssueTypeMeta[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [loadingTypes, setLoadingTypes] = useState(false)

  const [summary, setSummary] = useState('')
  // Dynamic field values keyed by fieldId
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [assigneeId, setAssigneeId] = useState('')
  const [assignableUsers, setAssignableUsers] = useState<Array<{ accountId: string; displayName: string; avatarUrl?: string }>>([])

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  // Load projects on mount
  useEffect(() => {
    window.api.tickets.fetchJiraProjects()
      .then((p) => {
        const list = p as Array<{ key: string; name: string }>
        setProjects(list)
        const key = defaultProjectKey && list.find(x => x.key === defaultProjectKey) ? defaultProjectKey : list[0]?.key ?? ''
        setProjectKey(key)
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false))
  }, [])

  // Load issue types and assignable users when project changes
  useEffect(() => {
    if (!projectKey) return
    setIssueTypes([])
    setSelectedTypeId('')
    setFieldValues({})
    setAssigneeId('')
    setLoadingTypes(true)
    window.api.tickets.fetchJiraIssueTypes(projectKey)
      .then((types) => {
        const list = types as JiraIssueTypeMeta[]
        setIssueTypes(list)
        if (list.length > 0) setSelectedTypeId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingTypes(false))
    window.api.tickets.fetchJiraAssignableUsers(projectKey)
      .then((users) => setAssignableUsers(users as Array<{ accountId: string; displayName: string; avatarUrl?: string }>))
      .catch(() => setAssignableUsers([]))
  }, [projectKey])

  const selectedType = issueTypes.find(t => t.id === selectedTypeId)
  const fields = (selectedType?.fields ?? []).filter(f => !SKIP_FIELDS.has(f.fieldId) && !SKIP_FIELDS.has(f.schema.system ?? ''))

  const setField = (fieldId: string, value: string) => setFieldValues(prev => ({ ...prev, [fieldId]: value }))

  const buildExtraFields = (): Record<string, unknown> => {
    const extra: Record<string, unknown> = {}
    if (assigneeId) extra.assignee = { id: assigneeId }
    for (const f of fields) {
      const val = fieldValues[f.fieldId]
      if (!val) continue
      if (f.schema.type === 'string' || f.schema.system === 'description') {
        if (f.schema.system === 'description') {
          extra[f.fieldId] = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: val }] }] }
        } else {
          extra[f.fieldId] = val
        }
      } else if (f.schema.type === 'number') {
        extra[f.fieldId] = Number(val)
      } else if (f.schema.type === 'option') {
        extra[f.fieldId] = { id: val }
      } else if (f.schema.type === 'priority') {
        extra[f.fieldId] = { id: val }
      } else if (f.schema.type === 'array' && f.schema.items === 'string') {
        extra[f.fieldId] = val.split(',').map(s => s.trim()).filter(Boolean)
      }
    }
    return extra
  }

  const requiredMet = fields.filter(f => f.required).every(f => !!fieldValues[f.fieldId])
  const canCreate = !!summary.trim() && !!projectKey && !!selectedTypeId && requiredMet

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    setError('')
    try {
      const ticket = await window.api.tickets.createJira(
        projectKey, summary.trim(), selectedTypeId, buildExtraFields()
      ) as Ticket
      onCreated(ticket)
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, '').slice(0, 300))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-panel-border">
        <button onClick={onBack} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <JiraLogo size={16}/>
        <span className="text-sm font-semibold text-ink">Create ticket</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Project */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Project</label>
          {loadingProjects ? (
            <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner/>Loading projects…</div>
          ) : projects.length > 0 ? (
            <CustomSelect
              value={projectKey}
              options={projects.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}` }))}
              onChange={setProjectKey}
              placeholder="Select project…"
              searchable
            />
          ) : (
            <input autoFocus type="text" value={projectKey} onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              placeholder="e.g. PROJ"
              className="w-full text-sm font-mono bg-panel-card border border-panel-border rounded-xl px-3 py-2 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}
        </div>

        {/* Issue type */}
        {projectKey && (
          <div>
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Issue Type</label>
            {loadingTypes ? (
              <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner/>Loading issue types…</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {issueTypes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTypeId(t.id); setFieldValues({}) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      selectedTypeId === t.id
                        ? 'bg-accent text-white border-accent'
                        : 'bg-panel-hover text-ink-2 border-panel-border hover:border-ink-3'
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Summary — always first */}
        {selectedTypeId && (
          <div>
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">
              Summary <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        )}

        {/* Assignee */}
        {selectedTypeId && assignableUsers.length > 0 && (
          <div>
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Assignee</label>
            <CustomSelect
              value={assigneeId}
              options={[{ value: '', label: 'Unassigned' }, ...assignableUsers.map((u) => ({ value: u.accountId, label: u.displayName }))]}
              onChange={setAssigneeId}
              placeholder="Unassigned"
              searchable
            />
          </div>
        )}

        {/* Dynamic fields from JIRA create metadata */}
        {fields.map((f) => {
          const val = fieldValues[f.fieldId] ?? ''
          const label = (
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">
              {f.name}{f.required && <span className="text-red-400 ml-1">*</span>}
            </label>
          )

          // Select field (option, priority, or array of options)
          if ((f.schema.type === 'option' || f.schema.type === 'priority') && f.allowedValues?.length) {
            return (
              <div key={f.fieldId}>
                {label}
                <div className="flex flex-wrap gap-1.5">
                  {f.allowedValues.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setField(f.fieldId, val === v.id ? '' : v.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                        val === v.id
                          ? 'bg-accent text-white border-accent'
                          : 'bg-panel-hover text-ink-2 border-panel-border hover:border-ink-3'
                      }`}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          }

          // Description (ADF)
          if (f.schema.system === 'description') {
            return (
              <div key={f.fieldId}>
                {label}
                <textarea value={val} onChange={(e) => setField(f.fieldId, e.target.value)}
                  placeholder="Add details…" rows={4}
                  className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                />
              </div>
            )
          }

          // Number
          if (f.schema.type === 'number') {
            return (
              <div key={f.fieldId}>
                {label}
                <input type="number" value={val} onChange={(e) => setField(f.fieldId, e.target.value)}
                  className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )
          }

          // Date
          if (f.schema.type === 'date' || f.schema.type === 'datetime') {
            return (
              <div key={f.fieldId}>
                {label}
                <input type="date" value={val} onChange={(e) => setField(f.fieldId, e.target.value)}
                  className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )
          }

          // Default: text
          if (f.schema.type === 'string') {
            return (
              <div key={f.fieldId}>
                {label}
                <input type="text" value={val} onChange={(e) => setField(f.fieldId, e.target.value)}
                  className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
            )
          }

          return null
        })}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">{error}</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-panel-border flex gap-2 justify-end">
        <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-ink-2 bg-panel-hover border border-panel-border rounded-lg hover:bg-panel-border transition-colors">
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={creating || !canCreate}
          className="px-5 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          {creating ? <Spinner/> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
          )}
          {creating ? 'Creating…' : 'Create Ticket'}
        </button>
      </div>
    </div>
  )
}

// ── Shortcut ticket creation form ────────────────────────────────────────────

const STORY_TYPES = ['feature', 'bug', 'chore']

const CreateShortcutForm: React.FC<{
  onCreated: (t: Ticket) => void
  onBack: () => void
}> = ({ onCreated, onBack }) => {
  const [projects, setProjects] = useState<Array<{ id: number; name: string }>>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [workflowStates, setWorkflowStates] = useState<Array<{ id: number; name: string; type: string }>>([])
  const [workflowStateId, setWorkflowStateId] = useState<number | null>(null)
  const [storyType, setStoryType] = useState('feature')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.tickets.fetchShortcutProjects(),
      window.api.tickets.fetchShortcutWorkflowStates()
    ]).then(([p, s]) => {
      const pl = p as Array<{ id: number; name: string }>
      const sl = s as Array<{ id: number; name: string; type: string }>
      setProjects(pl)
      if (pl.length > 0) setProjectId(pl[0].id)
      setWorkflowStates(sl)
      const unstarted = sl.find(st => st.type === 'unstarted')
      if (unstarted) setWorkflowStateId(unstarted.id)
    }).catch(() => {}).finally(() => setLoadingProjects(false))
  }, [])

  const handleCreate = async () => {
    if (!name.trim() || !projectId) return
    setCreating(true)
    setError('')
    try {
      const ticket = await window.api.tickets.createShortcut(
        name.trim(), projectId, storyType, description.trim() || undefined, workflowStateId ?? undefined
      ) as Ticket
      onCreated(ticket)
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, '').slice(0, 300))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-panel-border">
        <button onClick={onBack} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <ShortcutLogo size={16}/>
        <span className="text-sm font-semibold text-ink">Create Shortcut story</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Project */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Project</label>
          {loadingProjects ? (
            <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner/>Loading…</div>
          ) : (
            <CustomSelect
              value={String(projectId ?? '')}
              options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
              onChange={(v) => setProjectId(Number(v))}
              placeholder="Select project…"
              searchable
            />
          )}
        </div>

        {/* Story type */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Type</label>
          <div className="flex flex-wrap gap-1.5">
            {STORY_TYPES.map((t) => (
              <button key={t} onClick={() => setStoryType(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
                  storyType === t ? 'bg-accent text-white border-accent' : 'bg-panel-hover text-ink-2 border-panel-border hover:border-ink-3'
                }`}>{t}</button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">
            Name <span className="text-red-400">*</span>
          </label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"/>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details…" rows={3}
            className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"/>
        </div>

        {/* Workflow state */}
        {workflowStates.length > 0 && (
          <div>
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">State</label>
            <CustomSelect
              value={String(workflowStateId ?? '')}
              options={workflowStates.map((s) => ({ value: String(s.id), label: s.name }))}
              onChange={(v) => setWorkflowStateId(Number(v))}
              placeholder="Select state…"
            />
          </div>
        )}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">{error}</div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-panel-border flex gap-2 justify-end">
        <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-ink-2 bg-panel-hover border border-panel-border rounded-lg hover:bg-panel-border transition-colors">Cancel</button>
        <button onClick={handleCreate} disabled={creating || !name.trim() || !projectId}
          className="px-5 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
          {creating ? <Spinner/> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
          )}
          {creating ? 'Creating…' : 'Create Story'}
        </button>
      </div>
    </div>
  )
}

// ── ClickUp task creation form ──────────────────────────────────────────────

const CreateClickupForm: React.FC<{
  onCreated: (t: Ticket) => void
  onBack: () => void
}> = ({ onCreated, onBack }) => {
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string }>>([])
  const [spaceId, setSpaceId] = useState('')
  const [lists, setLists] = useState<Array<{ id: string; name: string; folder?: { id: string; name: string } }>>([])
  const [listId, setListId] = useState('')
  const [loadingSpaces, setLoadingSpaces] = useState(true)
  const [loadingLists, setLoadingLists] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.tickets.fetchClickupSpaces()
      .then((s) => {
        const sl = s as Array<{ id: string; name: string }>
        setSpaces(sl)
        if (sl.length > 0) setSpaceId(sl[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingSpaces(false))
  }, [])

  useEffect(() => {
    if (!spaceId) return
    setLists([])
    setListId('')
    setLoadingLists(true)
    window.api.tickets.fetchClickupLists(spaceId)
      .then((l) => {
        const ll = l as Array<{ id: string; name: string; folder?: { id: string; name: string } }>
        setLists(ll)
        if (ll.length > 0) setListId(ll[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingLists(false))
  }, [spaceId])

  const handleCreate = async () => {
    if (!name.trim() || !listId) return
    setCreating(true)
    setError('')
    try {
      const ticket = await window.api.tickets.createClickup(
        listId, name.trim(), description.trim() || undefined
      ) as Ticket
      onCreated(ticket)
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, '').slice(0, 300))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-panel-border">
        <button onClick={onBack} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <ClickUpLogo size={16}/>
        <span className="text-sm font-semibold text-ink">Create ClickUp task</span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Space */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Space</label>
          {loadingSpaces ? (
            <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner/>Loading…</div>
          ) : (
            <CustomSelect
              value={spaceId}
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setSpaceId}
              placeholder="Select space…"
              searchable
            />
          )}
        </div>

        {/* List */}
        {spaceId && (
          <div>
            <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">List</label>
            {loadingLists ? (
              <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner/>Loading…</div>
            ) : (
              <CustomSelect
                value={listId}
                options={lists.map((l) => ({ value: l.id, label: l.folder ? `${l.folder.name} / ${l.name}` : l.name }))}
                onChange={setListId}
                searchable
                placeholder="Select list…"
              />
            )}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">
            Task name <span className="text-red-400">*</span>
          </label>
          <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"/>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-bold tracking-wider text-ink-3 uppercase block mb-1.5">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details…" rows={3}
            className="w-full text-sm bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"/>
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">{error}</div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-panel-border flex gap-2 justify-end">
        <button onClick={onBack} className="px-4 py-2 text-sm font-medium text-ink-2 bg-panel-hover border border-panel-border rounded-lg hover:bg-panel-border transition-colors">Cancel</button>
        <button onClick={handleCreate} disabled={creating || !name.trim() || !listId}
          className="px-5 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors">
          {creating ? <Spinner/> : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
          )}
          {creating ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </div>
  )
}

// ── Ticket modal ────────────────────────────────────────────────────────────────

const TicketModal: React.FC<{
  projectKey?: string
  onSelect: (t: Ticket) => void
  onClose: () => void
  hasJira: boolean
  hasShortcut: boolean
  hasClickup: boolean
}> = ({ projectKey, onSelect, onClose, hasJira, hasShortcut, hasClickup }) => {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'create-jira' | 'create-shortcut' | 'create-clickup'>('list')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const integrationCount = [hasJira, hasShortcut, hasClickup].filter(Boolean).length

  useEffect(() => {
    window.api.tickets.fetchAll(projectKey)
      .then((t) => { setTickets(t as Ticket[]); setLoading(false) })
      .catch((e) => { setError(String(e)); setLoading(false) })
  }, [projectKey])

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const searches: Promise<Ticket[]>[] = []
        if (hasJira) searches.push(window.api.tickets.searchJira(value, projectKey) as Promise<Ticket[]>)
        if (hasShortcut) searches.push(window.api.tickets.searchShortcut(value) as Promise<Ticket[]>)
        if (hasClickup) searches.push(window.api.tickets.searchClickup(value) as Promise<Ticket[]>)
        const all = await Promise.allSettled(searches)
        const merged = all.flatMap(r => r.status === 'fulfilled' ? r.value : [])
        setResults(merged)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
  }, [projectKey, hasJira, hasShortcut, hasClickup])

  const handleCreated = (t: Ticket) => {
    setTickets((prev) => [t, ...prev])
    onSelect(t)
    onClose()
  }

  const displayed = search.trim() ? results : tickets
  const groups = search.trim() ? null : groupByStatus(tickets)

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-panel-card rounded-2xl shadow-2xl border border-panel-border w-[580px] h-[72vh] flex flex-col overflow-hidden">

        {view === 'create-jira' ? (
          <CreateTicketForm defaultProjectKey={projectKey} onCreated={handleCreated} onBack={() => setView('list')}/>
        ) : view === 'create-shortcut' ? (
          <CreateShortcutForm onCreated={handleCreated} onBack={() => setView('list')}/>
        ) : view === 'create-clickup' ? (
          <CreateClickupForm onCreated={handleCreated} onBack={() => setView('list')}/>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-panel-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">Select ticket</span>
              </div>
              <div className="flex items-center gap-2">
                {integrationCount === 1 ? (
                  <button
                    onClick={() => setView(hasJira ? 'create-jira' : hasShortcut ? 'create-shortcut' : 'create-clickup')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
                    </svg>
                    New Ticket
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    {hasJira && (
                      <button onClick={() => setView('create-jira')} title="New JIRA ticket"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors">
                        <JiraLogo size={11}/> New
                      </button>
                    )}
                    {hasShortcut && (
                      <button onClick={() => setView('create-shortcut')} title="New Shortcut story"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors">
                        <ShortcutLogo size={11}/> New
                      </button>
                    )}
                    {hasClickup && (
                      <button onClick={() => setView('create-clickup')} title="New ClickUp task"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors">
                        <ClickUpLogo size={11}/> New
                      </button>
                    )}
                  </div>
                )}
                <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-panel-border">
              <div className="relative">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search tickets…"
                  className="w-full pl-10 pr-10 py-2 text-sm bg-panel-hover border border-panel-border rounded-xl text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                {(loading || searching) && (
                  <svg className="animate-spin absolute right-3 top-2.5 w-4 h-4 text-ink-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!loading && error ? (
                <div className="px-5 py-8 text-center">
                  <div className="text-sm text-red-600 mb-2">Failed to load tickets</div>
                  <div className="text-xs text-ink-3 font-mono bg-red-50 rounded px-3 py-2">{error}</div>
                  <div className="text-xs text-ink-3 mt-3">Check credentials in Settings</div>
                </div>
              ) : !loading && displayed.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="text-sm text-ink-2 mb-2">{search ? 'No results found' : 'No tickets found'}</div>
                  <div className="text-xs text-ink-3 leading-relaxed">
                    {search ? 'Try a different search term' : 'Configure integrations in Settings'}
                  </div>
                  {!search && (
                    <button
                      onClick={() => { onClose(); useAppStore.getState().setView('settings') }}
                      className="mt-3 text-xs text-accent font-medium hover:underline"
                    >Open Settings →</button>
                  )}
                </div>
              ) : search.trim() ? (
                (displayed as Ticket[]).map((t) => <TicketRow key={t.id} ticket={t} onSelect={() => { onSelect(t); onClose() }}/>)
              ) : (
                (groups ?? []).map(({ status, tickets: group }) => (
                  <div key={status}>
                    <div className="px-5 py-1.5 bg-panel-bg border-b border-panel-border sticky top-0">
                      <span className="text-[10px] font-bold tracking-wider text-ink-3 uppercase">{status}</span>
                      <span className="ml-2 text-[10px] text-ink-4">{group.length}</span>
                    </div>
                    {group.map((t) => <TicketRow key={t.id} ticket={t} onSelect={() => { onSelect(t); onClose() }}/>)}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── branch name auto-generator ─────────────────────────────────────────────────
function makeBranchName(ticket: Ticket | null, baseBranch: string): string {
  if (ticket) {
    const slug = ticket.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    return `${ticket.key.toLowerCase()}-${slug}`
  }
  const suffix = Date.now().toString(36).slice(-4)
  return `${baseBranch}-session-${suffix}`
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export const Sidebar: React.FC = () => {
  const { repos, selectedRepoId, setSelectedRepo, settings, theme, toggleTheme } = useAppStore()
  const { addRepository, pickDirectory } = useRepos()
  const { createSession } = useSessions()
  const { setSelectedSession } = useAppStore()

  const [addingRepo, setAddingRepo] = useState(false)

  const [selectedRepo, setSelectedRepoLocal] = useState<Repository | null>(null)
  const [baseBranch, setBaseBranch] = useState('')
  const [branchName, setBranchName] = useState('')
  const [branchEdited, setBranchEdited] = useState(false) // user manually typed a name

  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchDone, setFetchDone] = useState(false)

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [showRepoDropdown, setShowRepoDropdown] = useState(false)
  const repoDropdownRef = useRef<HTMLDivElement>(null)

  // Auto-select when only one repo
  useEffect(() => {
    if (repos.length === 1 && !selectedRepoId) {
      setSelectedRepo(repos[0].id)
    }
  }, [repos.length])

  // Close repo dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setShowRepoDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sync selectedRepo with store
  useEffect(() => {
    const r = repos.find((r) => r.id === selectedRepoId) ?? null
    setSelectedRepoLocal(r)
    if (r) setBaseBranch(r.defaultBranch)
  }, [selectedRepoId, repos])

  // Auto-update branch name whenever ticket or base branch changes (unless user typed their own)
  useEffect(() => {
    if (!branchEdited) {
      setBranchName(makeBranchName(selectedTicket, baseBranch))
    }
  }, [selectedTicket, baseBranch, branchEdited])

  const handleFetchOrigin = async () => {
    if (!selectedRepo || fetching) return
    setFetching(true)
    setFetchDone(false)
    try {
      await window.api.repos.fetchOrigin(selectedRepo.path)
      setFetchDone(true)
      setTimeout(() => setFetchDone(false), 2000)
    } catch { /* silent */ }
    finally { setFetching(false) }
  }

  const handleCreateSession = async () => {
    if (!selectedRepo || !baseBranch) return
    setCreating(true)
    setCreateError('')
    try {
      const name = selectedTicket?.title.slice(0, 60) ?? branchName

      const session = await createSession({
        name,
        repoId: selectedRepo.id,
        repoPath: selectedRepo.path,
        baseBranch,
        branchName,
        ticketId: selectedTicket?.key,
        ticketTitle: selectedTicket?.title
      })
      setSelectedSession(session.id)
      setSelectedTicket(null)
      setBranchEdited(false)
    } catch (err) {
      setCreateError(String(err).replace(/^Error:\s*/, '').slice(0, 140))
      setTimeout(() => setCreateError(''), 8000)
    } finally {
      setCreating(false)
    }
  }

  const handleAddRepo = async () => {
    setAddingRepo(true)
    try {
      const dir = await pickDirectory()
      if (dir) {
        await addRepository(dir as string)
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setAddingRepo(false)
    }
  }

  const handleBranchSelect = (repo: Repository, branch: string) => {
    setSelectedRepo(repo.id)
    setSelectedRepoLocal(repo)
    setBaseBranch(branch)
  }

  const handleTicketSelect = (t: Ticket) => {
    setSelectedTicket(t)
    setBranchEdited(false) // reset so auto-name kicks in from ticket
  }

  return (
    <div className="flex flex-col h-full bg-panel-sidebar border-r border-panel-border overflow-hidden">

      {/* Title bar */}
      <div className="titlebar-drag h-10 flex items-center justify-between px-3 flex-shrink-0">
        <span className="no-drag text-[11px] font-bold text-ink-3 tracking-widest uppercase">Branchless</span>
        <div className="no-drag flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
              </svg>
            )}
          </button>
          {/* Settings */}
          <button
            onClick={() => useAppStore.getState().setView(
              useAppStore.getState().view === 'settings' ? 'sessions' : 'settings'
            )}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover"
            title="Settings"
          >
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Repo selector */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1" ref={repoDropdownRef}>
            <button
              onClick={() => setShowRepoDropdown(!showRepoDropdown)}
              className="w-full flex items-center gap-2 bg-panel-card border border-panel-border rounded-xl pl-3 pr-8 py-2.5 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/30 shadow-sm hover:border-ink-4 transition-colors"
            >
              {selectedRepoId && repos.find(r => r.id === selectedRepoId) ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: repos.find(r => r.id === selectedRepoId)?.color ?? '#6c51cf' }}/>
                  <span className="text-[13px] font-semibold text-ink truncate">{repos.find(r => r.id === selectedRepoId)?.name}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                  </svg>
                  <span className="text-[13px] font-semibold text-ink">All repos</span>
                </>
              )}
            </button>
            <svg className="absolute right-2.5 top-3 w-3.5 h-3.5 text-ink-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
            </svg>

            {showRepoDropdown && (
              <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-panel-card border border-panel-border rounded-xl shadow-xl overflow-hidden">
                {repos.length > 1 && (
                  <button
                    onClick={() => { setSelectedRepo(null); setShowRepoDropdown(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-panel-hover transition-colors ${!selectedRepoId ? 'bg-accent/5' : ''}`}
                  >
                    <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                    </svg>
                    <span className="text-[13px] font-medium text-ink">All repos</span>
                    {!selectedRepoId && (
                      <svg className="w-3.5 h-3.5 text-accent ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </button>
                )}
                {repos.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRepo(r.id); setShowRepoDropdown(false) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-panel-hover transition-colors border-t border-panel-border/50 ${selectedRepoId === r.id ? 'bg-accent/5' : ''}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.color ?? '#6c51cf' }}/>
                    <span className="text-[13px] font-medium text-ink truncate flex-1">{r.name}</span>
                    <span className="text-[10px] text-ink-3 font-mono truncate max-w-[80px]">{r.path.split('/').pop()}</span>
                    {selectedRepoId === r.id && (
                      <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleAddRepo}
            disabled={addingRepo}
            title="Add repository"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover border border-panel-border hover:border-ink-4 transition-colors disabled:opacity-40"
          >
            {addingRepo ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── New session form ── */}
      <div className="px-3 pb-3 flex-shrink-0 space-y-2">

        {/* Base branch + refresh */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowBranchModal(true)}
            disabled={repos.length === 0}
            className="flex-1 flex items-center gap-2 px-3 py-2 bg-panel-card border border-panel-border rounded-xl shadow-sm hover:border-ink-4 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
          >
            <svg className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9c0 3.314-5.373 6-12 6"/>
            </svg>
            <span className="text-[13px] font-semibold text-ink flex-1 truncate">
              {baseBranch || 'pick base branch…'}
            </span>
            <svg className="w-3 h-3 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
            </svg>
          </button>

          <button
            onClick={handleFetchOrigin}
            disabled={!selectedRepo || fetching}
            title={fetchDone ? 'Up to date!' : 'Fetch latest from origin'}
            className={`w-[30px] h-[30px] flex-shrink-0 rounded-lg flex items-center justify-center transition-all ${
              fetchDone
                ? 'bg-green-500 text-white shadow-sm'
                : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm disabled:opacity-40'
            }`}
          >
            {fetchDone ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            ) : (
              <svg className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            )}
          </button>
        </div>

        {/* New branch name — editable, auto-filled */}
        <div>
          <label className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider block mb-1">
            New branch name
          </label>
          <div className="relative">
            <input
              type="text"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value.replace(/\s+/g, '-').toLowerCase())
                setBranchEdited(true)
              }}
              placeholder="feature/my-branch"
              className="w-full text-[13px] font-semibold bg-panel-card border border-panel-border rounded-xl px-3 py-2.5 text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30 pr-7 shadow-sm"
            />
            {branchEdited && (
              <button
                onClick={() => { setBranchEdited(false) }}
                title="Reset to auto-generated name"
                className="absolute right-2 top-1.5 text-ink-3 hover:text-ink"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Ticket picker */}
        <button
          onClick={() => setShowTicketModal(true)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all shadow-sm ${
            selectedTicket
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-panel-hover border-panel-border text-ink-2 hover:border-ink-3 hover:text-ink'
          }`}
        >
          {selectedTicket ? (
            <>
              {selectedTicket.type === 'jira' ? <JiraLogo size={12}/> : selectedTicket.type === 'shortcut' ? <ShortcutLogo size={12}/> : <ClickUpLogo size={12}/>}
              <span className="font-mono text-[11px] font-semibold flex-1 text-left truncate">{selectedTicket.key}</span>
              <span className="text-xs text-ink-3 truncate flex-1">{selectedTicket.title.slice(0, 25)}…</span>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedTicket(null); setBranchEdited(false) }}
                className="hover:text-red-500 flex-shrink-0"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </>
          ) : (
            <>
              {settings?.clickupApiToken && !settings?.jiraBaseUrl && !settings?.shortcutApiToken ? <ClickUpLogo size={13}/> : settings?.shortcutApiToken && !settings?.jiraBaseUrl ? <ShortcutLogo size={13}/> : <JiraLogo size={13}/>}
              <span className="flex-1 text-left text-[13px] font-medium">
                {(() => {
                  const integrations: string[] = []
                  if (settings?.jiraBaseUrl) integrations.push('JIRA')
                  if (settings?.shortcutApiToken) integrations.push('Shortcut')
                  if (settings?.clickupApiToken) integrations.push('ClickUp')
                  return integrations.length > 0 ? `Link ${integrations.join(' / ')} ticket` : 'Link ticket'
                })()}
              </span>
              <svg className="w-3 h-3 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
              </svg>
            </>
          )}
        </button>

        {createError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 leading-relaxed">
            {createError}
          </div>
        )}

        {/* New Session button */}
        <button
          onClick={handleCreateSession}
          disabled={creating || !selectedRepo || !baseBranch || !branchName}
          className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
        >
          {creating ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
          )}
          {creating ? 'Creating…' : 'New Session'}
        </button>

        {/* Summary line */}
        {selectedRepo && baseBranch && branchName && !creating && (
          <div className="text-[10px] text-ink-3 text-center leading-relaxed">
            Creates <span className="font-mono text-[11px] font-semibold text-ink-2">{branchName}</span> from <span className="font-mono text-[11px] font-semibold text-ink-2">{baseBranch}</span>
          </div>
        )}
      </div>

      {/* Sessions label */}
      <div className="px-4 pb-1.5 flex-shrink-0">
        <span className="text-[10px] font-bold tracking-widest text-ink-3 uppercase">Sessions</span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-hidden">
        <SessionList />
      </div>

      {/* Modals */}
      {showBranchModal && (
        <BranchModal
          repos={repos}
          selectedRepoId={selectedRepoId}
          currentBranch={baseBranch}
          onSelect={handleBranchSelect}
          onClose={() => setShowBranchModal(false)}
        />
      )}
      {showTicketModal && (
        <TicketModal
          projectKey={selectedRepo?.jiraProjectKey}
          onSelect={handleTicketSelect}
          onClose={() => setShowTicketModal(false)}
          hasJira={!!(settings?.jiraBaseUrl && settings?.jiraEmail && settings?.jiraApiToken)}
          hasShortcut={!!settings?.shortcutApiToken}
          hasClickup={!!(settings?.clickupApiToken && settings?.clickupTeamId)}
        />
      )}
    </div>
  )
}
