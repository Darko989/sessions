import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { Settings, Repository, Session } from '../../types'
import { Button } from '../common/Button'
import * as api from '../../api'
import { openUrl } from '@tauri-apps/plugin-opener'

const inputCls =
  'w-full bg-panel-hover border border-panel-border rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/30'

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children
}) => (
  <div>
    <label className="block text-xs font-medium text-ink-2 mb-1.5">
      {label}
      {hint && <span className="ml-2 text-ink-3 font-normal">{hint}</span>}
    </label>
    {children}
  </div>
)

const INTEGRATION_LABELS: Record<string, string> = { jira: 'JIRA', shortcut: 'Shortcut', clickup: 'ClickUp' }

const IntegrationDropdown: React.FC<{
  value?: 'jira' | 'shortcut' | 'clickup'
  hasJira: boolean
  hasShortcut: boolean
  hasClickup: boolean
  onChange: (val: 'jira' | 'shortcut' | 'clickup' | undefined) => void
}> = ({ value, hasJira, hasShortcut, hasClickup, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const options: { value: string; label: string }[] = [{ value: '', label: 'None' }]
  if (hasJira) options.push({ value: 'jira', label: 'JIRA' })
  if (hasShortcut) options.push({ value: 'shortcut', label: 'Shortcut' })
  if (hasClickup) options.push({ value: 'clickup', label: 'ClickUp' })

  return (
    <div className="flex items-center gap-2 pt-1" ref={ref}>
      <span className="text-xs text-ink-3">Tickets:</span>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs bg-panel-card border border-panel-border rounded-lg px-2.5 py-1.5 text-ink hover:border-ink-3 transition-colors"
        >
          <span>{value ? INTEGRATION_LABELS[value] : 'None'}</span>
          <svg className={`w-3 h-3 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-panel-card border border-panel-border rounded-lg shadow-lg overflow-hidden min-w-[120px]">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange((opt.value || undefined) as 'jira' | 'shortcut' | 'clickup' | undefined)
                  setOpen(false)
                }}
                className={`w-full text-left text-xs px-3 py-2 transition-colors ${
                  (value || '') === opt.value
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-ink hover:bg-panel-hover'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const SettingsPanel: React.FC = () => {
  const { settings, setSettings, repos, setRepos, setSessions } = useAppStore()
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState<{ id: string; name: string } | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeIntegration, setRemoveIntegration] = useState<'jira' | 'shortcut' | 'clickup' | null>(null)
  const [removingIntegration, setRemovingIntegration] = useState(false)
  const [editingSymlinks, setEditingSymlinks] = useState<string | null>(null)
  const [symlinkInput, setSymlinkInput] = useState('')
  const [suggestedFiles, setSuggestedFiles] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({ ...settings })
    } else {
      api.settings.get().then((st) => {
        setSettings(st)
        setForm({ ...st })
      })
    }
  }, [settings, setSettings])

  if (!form) {
    return <div className="p-6 text-ink-3 text-sm">Loading settings...</div>
  }

  const update = (key: keyof Settings, value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      const updated = await api.settings.update(form)
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const pickSessionsDir = async () => {
    const dir = await api.settings.pickDirectory()
    if (dir) update('sessionsDirectory', dir)
  }

  const removeRepo = async () => {
    if (!removeConfirm) return
    setRemoving(true)
    try {
      await api.repos.remove(removeConfirm.id)
      const [allRepos, allSessions] = await Promise.all([
        api.repos.getAll(),
        api.sessions.getAll()
      ])
      setRepos(allRepos)
      setSessions(allSessions)
    } finally {
      setRemoving(false)
      setRemoveConfirm(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => useAppStore.getState().setView('sessions')}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-3 hover:text-ink hover:bg-panel-hover"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 className="text-xl font-bold text-ink">Settings</h2>
      </div>

      <div className="space-y-6">
        {/* General */}
        <section className="bg-panel-card rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">General</h3>
          <div className="space-y-4">
            <Field label="Sessions Directory" hint="Where worktrees are stored">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.sessionsDirectory}
                  onChange={(e) => update('sessionsDirectory', e.target.value)}
                  className={`${inputCls} flex-1 font-mono text-xs`}
                />
                <Button size="sm" variant="secondary" onClick={pickSessionsDir}>
                  Browse
                </Button>
              </div>
            </Field>
          </div>
        </section>

        {/* Repositories */}
        <section className="bg-panel-card rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Repositories</h3>
          {repos.length === 0 ? (
            <div className="text-sm text-slate-600">No repositories added yet.</div>
          ) : (
            <div className="space-y-3">
              {repos.map((r) => (
                <div key={r.id} className="bg-panel-hover rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }}/>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink">{r.name}</div>
                      <div className="text-xs font-mono text-ink-3 truncate">{r.path}</div>
                    </div>
                    <div className="text-xs text-slate-600 font-mono">{r.defaultBranch}</div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => setRemoveConfirm({ id: r.id, name: r.name })}
                    >
                      Remove
                    </Button>
                  </div>
                  {/* Ticket integration selector */}
                  <IntegrationDropdown
                    value={r.ticketIntegration}
                    hasJira={!!(form.jiraBaseUrl && form.jiraEmail && form.jiraApiToken)}
                    hasShortcut={!!form.shortcutApiToken}
                    hasClickup={!!(form.clickupApiToken && form.clickupTeamId)}
                    onChange={async (val) => {
                      const updated = await api.repos.update(r.id, {
                        ticketIntegration: val || undefined
                      })
                      setRepos(repos.map((repo) => repo.id === r.id ? updated : repo))
                    }}
                  />
                  {/* Linked Files (symlinks) */}
                  <div className="pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-3">Linked files:</span>
                      <button
                        onClick={async () => {
                          if (editingSymlinks === r.id) {
                            setEditingSymlinks(null)
                          } else {
                            setEditingSymlinks(r.id)
                            setSymlinkInput('')
                            setLoadingSuggestions(true)
                            try {
                              const suggested = await api.repos.suggestSymlinkFiles(r.path)
                              setSuggestedFiles(suggested)
                            } catch { setSuggestedFiles([]) }
                            finally { setLoadingSuggestions(false) }
                          }
                        }}
                        className="text-xs text-accent hover:text-accent/80 font-medium"
                      >
                        {editingSymlinks === r.id ? 'Done' : 'Manage'}
                      </button>
                    </div>
                    {r.symlinkFiles && r.symlinkFiles.length > 0 && editingSymlinks !== r.id && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.symlinkFiles.map((f) => (
                          <span key={f} className="text-[11px] font-mono bg-panel-card border border-panel-border rounded px-1.5 py-0.5 text-ink-2">{f}</span>
                        ))}
                      </div>
                    )}
                    {editingSymlinks === r.id && (
                      <div className="mt-2 space-y-2">
                        {(r.symlinkFiles || []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(r.symlinkFiles || []).map((f) => (
                              <span key={f} className="inline-flex items-center gap-1 text-[11px] font-mono bg-panel-card border border-panel-border rounded px-1.5 py-0.5 text-ink-2">
                                {f}
                                <button
                                  onClick={async () => {
                                    const updated = await api.repos.update(r.id, {
                                      symlinkFiles: (r.symlinkFiles || []).filter((x) => x !== f)
                                    })
                                    setRepos(repos.map((repo) => repo.id === r.id ? updated : repo))
                                  }}
                                  className="text-ink-3 hover:text-red-500"
                                >
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/>
                                  </svg>
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={symlinkInput}
                            onChange={(e) => setSymlinkInput(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && symlinkInput.trim()) {
                                const file = symlinkInput.trim()
                                if (!(r.symlinkFiles || []).includes(file)) {
                                  const updated = await api.repos.update(r.id, {
                                    symlinkFiles: [...(r.symlinkFiles || []), file]
                                  })
                                  setRepos(repos.map((repo) => repo.id === r.id ? updated : repo))
                                }
                                setSymlinkInput('')
                              }
                            }}
                            placeholder="Add file path (e.g. .env, node_modules)"
                            className="flex-1 text-xs font-mono bg-panel-card border border-panel-border rounded px-2 py-1 text-ink placeholder-ink-3 focus:outline-none focus:ring-1 focus:ring-accent/30"
                          />
                          <button
                            onClick={async () => {
                              if (symlinkInput.trim() && !(r.symlinkFiles || []).includes(symlinkInput.trim())) {
                                const updated = await api.repos.update(r.id, {
                                  symlinkFiles: [...(r.symlinkFiles || []), symlinkInput.trim()]
                                })
                                setRepos(repos.map((repo) => repo.id === r.id ? updated : repo))
                                setSymlinkInput('')
                              }
                            }}
                            className="text-xs text-accent hover:text-accent/80 font-medium px-2 py-1"
                          >
                            Add
                          </button>
                        </div>
                        {loadingSuggestions ? (
                          <div className="text-[11px] text-ink-3">Scanning...</div>
                        ) : suggestedFiles.filter((f) => !(r.symlinkFiles || []).includes(f)).length > 0 ? (
                          <div>
                            <div className="text-[11px] text-ink-3 mb-1">Detected in repo:</div>
                            <div className="flex flex-wrap gap-1">
                              {suggestedFiles.filter((f) => !(r.symlinkFiles || []).includes(f)).map((f) => (
                                <button
                                  key={f}
                                  onClick={async () => {
                                    const updated = await api.repos.update(r.id, {
                                      symlinkFiles: [...(r.symlinkFiles || []), f]
                                    })
                                    setRepos(repos.map((repo) => repo.id === r.id ? updated : repo))
                                  }}
                                  className="text-[11px] font-mono bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5 hover:bg-accent/20 transition-colors"
                                >
                                  + {f}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* JIRA */}
        <section className="bg-panel-card rounded-xl border border-panel-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">JIRA Integration</h3>
              <button
                onClick={() => openUrl('https://id.atlassian.com/manage-profile/security/api-tokens')}
                className="text-[11px] text-accent hover:text-accent-hover font-medium flex items-center gap-1"
              >
                Get API token
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
            </div>
            {(form.jiraBaseUrl || form.jiraEmail || form.jiraApiToken) && (
              <button
                onClick={() => setRemoveIntegration('jira')}
                className="text-xs text-red-500 hover:text-red-400 font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <div className="space-y-4">
            <Field label="Base URL" hint="e.g. https://yourcompany.atlassian.net">
              <input
                type="text"
                value={form.jiraBaseUrl}
                onChange={(e) => update('jiraBaseUrl', e.target.value)}
                className={inputCls}
                placeholder="https://yourcompany.atlassian.net"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.jiraEmail}
                onChange={(e) => update('jiraEmail', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="API Token">
              <input
                type="password"
                value={form.jiraApiToken}
                onChange={(e) => update('jiraApiToken', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* Shortcut */}
        <section className="bg-panel-card rounded-xl border border-panel-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">Shortcut Integration</h3>
              <button
                onClick={() => openUrl('https://app.shortcut.com/settings/account/api-tokens')}
                className="text-[11px] text-accent hover:text-accent-hover font-medium flex items-center gap-1"
              >
                Get API token
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
            </div>
            {form.shortcutApiToken && (
              <button
                onClick={() => setRemoveIntegration('shortcut')}
                className="text-xs text-red-500 hover:text-red-400 font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <Field label="API Token">
            <input
              type="password"
              value={form.shortcutApiToken}
              onChange={(e) => update('shortcutApiToken', e.target.value)}
              className={inputCls}
              placeholder="Token from app.shortcut.com/settings/api-tokens"
            />
          </Field>
        </section>

        {/* ClickUp */}
        <section className="bg-panel-card rounded-xl border border-panel-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">ClickUp Integration</h3>
              <button
                onClick={() => openUrl('https://app.clickup.com/settings/apps')}
                className="text-[11px] text-accent hover:text-accent-hover font-medium flex items-center gap-1"
              >
                Get API token
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
            </div>
            {(form.clickupApiToken || form.clickupTeamId) && (
              <button
                onClick={() => setRemoveIntegration('clickup')}
                className="text-xs text-red-500 hover:text-red-400 font-medium"
              >
                Remove
              </button>
            )}
          </div>
          <div className="space-y-4">
            <Field label="API Token">
              <input
                type="password"
                value={form.clickupApiToken}
                onChange={(e) => update('clickupApiToken', e.target.value)}
                className={inputCls}
                placeholder="pk_..."
              />
            </Field>
            <Field label="Team ID" hint="Found in your ClickUp workspace URL">
              <input
                type="text"
                value={form.clickupTeamId}
                onChange={(e) => update('clickupTeamId', e.target.value)}
                className={inputCls}
                placeholder="e.g. 12345678"
              />
            </Field>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pb-6">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save Settings
          </Button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </div>

      {/* Remove integration confirmation modal */}
      {removeIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !removingIntegration && setRemoveIntegration(null)}>
          <div className="bg-panel-card rounded-2xl shadow-xl border border-panel-border w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink">Remove {INTEGRATION_LABELS[removeIntegration]} integration</h3>
                <p className="text-[12px] text-ink-3 font-medium">This will clear all credentials</p>
              </div>
            </div>
            <p className="text-[13px] text-ink-2 font-medium leading-relaxed mb-5">
              Are you sure? Repositories using {INTEGRATION_LABELS[removeIntegration]} will be unlinked from this integration.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveIntegration(null)}
                disabled={removingIntegration}
                className="flex-1 text-[13px] font-semibold text-ink-3 hover:text-ink border border-panel-border rounded-xl py-2.5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setRemovingIntegration(true)
                  try {
                    const clearFields: Partial<Settings> = removeIntegration === 'jira'
                      ? { jiraBaseUrl: '', jiraEmail: '', jiraApiToken: '' }
                      : removeIntegration === 'shortcut'
                        ? { shortcutApiToken: '' }
                        : { clickupApiToken: '', clickupTeamId: '' }
                    const updated = await api.settings.update(clearFields)
                    setSettings(updated)
                    setForm({ ...updated })
                    let currentRepos = [...repos]
                    for (const r of currentRepos) {
                      if (r.ticketIntegration === removeIntegration) {
                        const updatedRepo = await api.repos.update(r.id, { ticketIntegration: undefined })
                        currentRepos = currentRepos.map((repo) => repo.id === r.id ? updatedRepo : repo)
                      }
                    }
                    setRepos(currentRepos)
                  } finally {
                    setRemovingIntegration(false)
                    setRemoveIntegration(null)
                  }
                }}
                disabled={removingIntegration}
                className="flex-1 text-[13px] font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 transition-colors shadow-sm disabled:opacity-50"
              >
                {removingIntegration ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove repo confirmation modal */}
      {removeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !removing && setRemoveConfirm(null)}>
          <div className="bg-panel-card rounded-2xl shadow-xl border border-panel-border w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-ink">Remove repository</h3>
                <p className="text-[12px] text-ink-3 font-medium">{removeConfirm.name}</p>
              </div>
            </div>
            <p className="text-[13px] text-ink-2 font-medium leading-relaxed mb-5">
              Are you sure? All sessions and worktrees for this repository will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveConfirm(null)}
                disabled={removing}
                className="flex-1 text-[13px] font-semibold text-ink-3 hover:text-ink border border-panel-border rounded-xl py-2.5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={removeRepo}
                disabled={removing}
                className="flex-1 text-[13px] font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 transition-colors shadow-sm disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
