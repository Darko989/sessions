import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Settings, Repository } from '../../types'
import { Button } from '../common/Button'

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

export const SettingsPanel: React.FC = () => {
  const { settings, setSettings, repos, setRepos } = useAppStore()
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({ ...settings })
    } else {
      window.api.settings.get().then((s) => {
        const st = s as Settings
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
      const updated = (await window.api.settings.update(form)) as Settings
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const pickSessionsDir = async () => {
    const dir = (await window.api.settings.pickDirectory(form.sessionsDirectory)) as string | null
    if (dir) update('sessionsDirectory', dir)
  }

  const removeRepo = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? Sessions won't be deleted.`)) return
    await window.api.repos.remove(id)
    const all = (await window.api.repos.getAll()) as Repository[]
    setRepos(all)
  }

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-ink mb-6">Settings</h2>

      <div className="space-y-6">
        {/* General */}
        <section className="bg-white rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">General</h3>
          <div className="space-y-4">
            <Field label="Default Base Branch">
              <input
                type="text"
                value={form.defaultBaseBranch}
                onChange={(e) => update('defaultBaseBranch', e.target.value)}
                className={inputCls}
                placeholder="main"
              />
            </Field>
            <Field label="Default Editor">
              <select
                value={form.defaultEditor}
                onChange={(e) => update('defaultEditor', e.target.value)}
                className={inputCls}
              >
                <option value="vscode">VS Code</option>
                <option value="cursor">Cursor</option>
                <option value="pycharm">PyCharm</option>
                <option value="zed">Zed</option>
              </select>
            </Field>
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
        <section className="bg-white rounded-xl border border-panel-border p-5">
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
                      onClick={() => removeRepo(r.id, r.name)}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-panel-border">
                    <label className="text-xs text-ink-3 flex-shrink-0 w-28">JIRA project key</label>
                    <input
                      type="text"
                      placeholder="e.g. PROJ"
                      defaultValue={r.jiraProjectKey ?? ''}
                      onBlur={async (e) => {
                        const val = e.target.value.trim().toUpperCase()
                        await window.api.repos.update(r.id, { jiraProjectKey: val || undefined } as never)
                        const all = await window.api.repos.getAll() as Repository[]
                        setRepos(all)
                      }}
                      className="flex-1 bg-white border border-panel-border rounded px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent/40"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* JIRA */}
        <section className="bg-white rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">JIRA Integration</h3>
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
            <Field label="API Token" hint="Create at id.atlassian.com/manage-profile/security">
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
        <section className="bg-white rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">Shortcut Integration</h3>
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

        {/* MCP */}
        <section className="bg-white rounded-xl border border-panel-border p-5">
          <h3 className="text-sm font-semibold text-ink mb-4">MCP Integration</h3>
          <div className="space-y-4">
            <Field label="Server URL">
              <input
                type="text"
                value={form.mcpServerUrl}
                onChange={(e) => update('mcpServerUrl', e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Token">
              <input
                type="password"
                value={form.mcpServerToken}
                onChange={(e) => update('mcpServerToken', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pb-6">
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Save Settings
          </Button>
          {saved && <span className="text-sm text-green-600">✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
