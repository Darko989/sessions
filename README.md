# Branchless

Work on multiple tasks in parallel — no branch switching, no stashing, no context loss.

Branchless creates isolated Git workspaces (via `git worktree`) for each task you're working on. Each session is its own directory with its own branch. Open five features at once. Switch between them instantly.

![Branchless UI](docs/screenshot.png)

---

## What it does

- **Sessions** — each session is a git worktree: isolated branch, isolated directory, no interference
- **Parallel work** — open unlimited sessions simultaneously in VS Code, Cursor, PyCharm, or Terminal
- **One-click sync** — fetch + rebase onto your base branch per session
- **Ticket integration** — pull tickets from JIRA or Shortcut, auto-generate branch names
- **Activity log** — track what you opened, synced, and created
- **Local-first** — everything stored in `~/.branchless/`, no cloud required

---

## Install

### macOS / Linux — one command

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/branchless/main/install.sh | bash
```

### Download manually

Go to [Releases](https://github.com/YOUR_USER/branchless/releases) and download:

| Platform | File |
|---|---|
| macOS Apple Silicon | `Branchless-x.x.x-arm64.dmg` |
| macOS Intel | `Branchless-x.x.x-x64.dmg` |
| Linux | `Branchless-x.x.x-x86_64.AppImage` |
| Windows | `Branchless-Setup-x.x.x.exe` |

---

## Build from source

**Requirements:** Node.js 20+, Git, npm

```bash
git clone https://github.com/YOUR_USER/branchless.git
cd branchless
npm install
npm run dev
```

That's it. The app opens.

### Production build

```bash
# macOS
npm run package:mac    # → dist/Branchless-x.x.x-arm64.dmg

# Linux
npm run package:linux  # → dist/Branchless-x.x.x-x86_64.AppImage

# Windows
npm run package:win    # → dist/Branchless-Setup-x.x.x.exe
```

---

## How sessions work

Branchless uses `git worktree` under the hood:

```bash
# what the app runs when you create a session
git worktree add ~/.branchless/workspaces/sess_123 -b feature/my-task origin/main
```

Each session lives at `~/.branchless/workspaces/<session-id>` — a full checkout of the repo on its own branch. You can have ten of these open at the same time without touching your main clone.

When you hit **Sync**, it runs:

```bash
git fetch origin main
git rebase origin/main
```

---

## Data storage

All data is stored locally in `~/.branchless/`:

```
~/.branchless/
├── sessions.json     # session metadata
├── repos.json        # registered repositories
├── settings.json     # app settings + API tokens
├── activity.json     # activity log
└── workspaces/       # git worktrees live here
    ├── sess_abc123/
    └── sess_def456/
```

No account required. No telemetry. Nothing leaves your machine.

---

## Ticket integration

In **Settings**, add your JIRA or Shortcut API token. When creating a session, Branchless fetches your assigned tickets and auto-generates the branch name:

- `SC-50231 Fix login redirect` → `feature/sc-50231-fix-login-redirect`
- `PROJ-42 Add dark mode` → `feature/proj-42-add-dark-mode`

---

## Publishing a release

```bash
# bump version in package.json, then:
git tag v1.0.0
git push origin main --tags
```

GitHub Actions builds for all platforms automatically and uploads assets to the release.

Before your first publish, update two lines:

- `electron-builder.yml` → `owner: YOUR_GITHUB_USERNAME`
- `install.sh` → `REPO="YOUR_GITHUB_USERNAME/branchless"`

---

## Tech stack

- **Electron** + **React** + **TypeScript**
- **electron-vite** for fast builds
- **Tailwind CSS** for styling
- **Zustand** for state
- **git CLI** for all git operations (no libgit2)
- **electron-updater** for auto-updates

---

## License

MIT
