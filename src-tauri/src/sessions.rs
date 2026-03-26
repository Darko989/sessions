use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::git::GitService;
use crate::repos::Repository;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub name: String,
    pub repo_id: String,
    pub repo_path: String,
    pub worktree_path: String,
    pub branch: String,
    pub base_branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_title: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_at: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionInput {
    pub name: String,
    pub repo_id: String,
    pub repo_path: String,
    pub base_branch: String,
    pub branch_name: Option<String>,
    pub ticket_id: Option<String>,
    pub ticket_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairResult {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}

pub struct SessionManager {
    file_path: PathBuf,
    sessions: Vec<Session>,
    sessions_dir: String,
}

fn is_bug_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    ["bug", "fix", "hotfix", "patch", "defect", "issue", "error", "crash", "broken", "regression"]
        .iter()
        .any(|w| lower.contains(w))
}

fn rand_suffix() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..5).map(|_| {
        let idx = rng.gen_range(0..36);
        if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
    }).collect()
}

/// Common files/dirs to auto-symlink
const AUTO_SYMLINK: &[&str] = &[
    "node_modules", ".env", ".env.local", ".env.development", ".env.development.local",
    ".venv", "venv", "vendor", "__pycache__", ".gradle", ".turbo", ".cache",
    ".parcel-cache", ".idea", ".vscode",
];

/// Dirs that must never be symlinked in Next.js projects
const NEXTJS_NO_SYMLINK: &[&str] = &["node_modules", ".next", ".nuxt"];

impl SessionManager {
    pub fn new(sessions_dir: String) -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".branchless");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("sessions.json");
        let sessions = Self::load_from(&file_path);
        Self { file_path, sessions, sessions_dir }
    }

    fn load_from(path: &PathBuf) -> Vec<Session> {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(all) = serde_json::from_str::<Vec<Session>>(&content) {
                // Filter out sessions whose worktree no longer exists (unless archived)
                return all.into_iter()
                    .filter(|s| s.status == "archived" || Path::new(&s.worktree_path).exists())
                    .collect();
            }
        }
        Vec::new()
    }

    fn persist(&self) {
        let tmp = format!("{}.tmp", self.file_path.display());
        if let Ok(json) = serde_json::to_string_pretty(&self.sessions) {
            let _ = fs::write(&tmp, &json);
            let _ = fs::rename(&tmp, &self.file_path);
        }
    }

    pub fn get_all(&self) -> Vec<Session> {
        self.sessions.clone()
    }

    pub fn get_by_id(&self, id: &str) -> Option<Session> {
        self.sessions.iter().find(|s| s.id == id).cloned()
    }

    pub fn get_by_repo(&self, repo_id: &str) -> Vec<Session> {
        self.sessions.iter()
            .filter(|s| s.repo_id == repo_id && s.status == "active")
            .cloned()
            .collect()
    }

    pub fn create(&mut self, input: CreateSessionInput, git: &GitService, repo: Option<&Repository>) -> Result<Session, String> {
        let session_id = format!("sess_{}_{}", chrono::Utc::now().timestamp_millis(), rand_suffix());
        let suffix = format!("{:x}", chrono::Utc::now().timestamp_millis() & 0xFFFF);

        let branch = input.branch_name.unwrap_or_else(|| {
            if let Some(ticket_id) = &input.ticket_id {
                let ticket_num = ticket_id.chars().rev().take_while(|c| c.is_ascii_digit()).collect::<String>().chars().rev().collect::<String>();
                let ticket_num = if ticket_num.is_empty() { ticket_id.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "") } else { ticket_num };
                let raw = input.ticket_title.as_deref().unwrap_or(ticket_id);
                let slug: String = raw.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "-");
                let slug = slug.trim_matches('-');
                let slug: String = slug.chars().take(25).collect();
                let slug = slug.trim_end_matches('-');
                let prefix = if is_bug_title(raw) { "bugfix" } else { "feature" };
                format!("{}/{}-{}-{}", prefix, ticket_num, slug, suffix)
            } else {
                let slug: String = input.name.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "-");
                let slug = slug.trim_matches('-');
                let slug: String = slug.chars().take(30).collect();
                let slug = slug.trim_end_matches('-');
                let prefix = if is_bug_title(&input.name) { "bugfix" } else { "feature" };
                format!("{}/{}-{}", prefix, slug, suffix)
            }
        });

        let worktree_path = Path::new(&self.sessions_dir).join(&session_id).to_string_lossy().to_string();

        git.create_worktree(&input.repo_path, &worktree_path, &branch, &input.base_branch)?;

        // Auto-configure: create symlinks from repo root into worktree
        self.create_symlinks(&session_id, &worktree_path, &input.repo_path, repo);

        // Copy .env if exists and wasn't symlinked
        let global_env = Path::new(&input.repo_path).join(".env");
        let wt_env = Path::new(&worktree_path).join(".env");
        if global_env.exists() && !wt_env.exists() {
            let _ = fs::copy(&global_env, &wt_env);
        }

        // Auto-install deps for Next.js projects in background
        let is_next = repo.map(|r| r.project_type.as_deref() == Some("nextjs")).unwrap_or(false)
            || is_nextjs(&input.repo_path);
        if is_next && !Path::new(&worktree_path).join("node_modules").exists() {
            let pm = repo.and_then(|r| r.package_manager.as_deref())
                .map(|p| install_cmd_from_manager(p))
                .unwrap_or_else(|| detect_install_cmd(&input.repo_path));
            install_deps_async(&worktree_path, &pm);
        }

        let session = Session {
            id: session_id,
            name: input.name,
            repo_id: input.repo_id,
            repo_path: input.repo_path,
            worktree_path,
            branch,
            base_branch: input.base_branch,
            ticket_id: input.ticket_id,
            ticket_title: input.ticket_title,
            created_at: chrono::Utc::now().to_rfc3339(),
            last_opened_at: None,
            pinned_at: None,
            status: "active".to_string(),
            notes: None,
        };

        self.sessions.push(session.clone());
        self.persist();
        Ok(session)
    }

    pub fn delete(&mut self, id: &str, git: &GitService) -> Result<(), String> {
        let session = self.get_by_id(id).ok_or_else(|| format!("Session not found: {}", id))?;

        // Remove worktree
        let _ = git.remove_worktree(&session.repo_path, &session.worktree_path);
        // Try to delete branch
        let _ = git.delete_branch(&session.repo_path, &session.branch);

        self.sessions.retain(|s| s.id != id);
        self.persist();
        Ok(())
    }

    pub fn archive(&mut self, id: &str) -> Result<(), String> {
        let session = self.sessions.iter_mut().find(|s| s.id == id)
            .ok_or_else(|| format!("Session not found: {}", id))?;
        session.status = "archived".to_string();
        self.persist();
        Ok(())
    }

    pub fn pin(&mut self, id: &str) -> Result<Session, String> {
        let idx = self.sessions.iter().position(|s| s.id == id)
            .ok_or_else(|| format!("Session not found: {}", id))?;
        self.sessions[idx].pinned_at = Some(chrono::Utc::now().to_rfc3339());
        self.persist();
        Ok(self.sessions[idx].clone())
    }

    pub fn unpin(&mut self, id: &str) -> Result<Session, String> {
        let idx = self.sessions.iter().position(|s| s.id == id)
            .ok_or_else(|| format!("Session not found: {}", id))?;
        self.sessions[idx].pinned_at = None;
        self.persist();
        Ok(self.sessions[idx].clone())
    }

    pub fn mark_opened(&mut self, id: &str) {
        if let Some(session) = self.sessions.iter_mut().find(|s| s.id == id) {
            session.last_opened_at = Some(chrono::Utc::now().to_rfc3339());
            self.persist();
        }
    }

    /// Create symlinks from repo root into worktree. Zero-config — auto-detects everything.
    fn create_symlinks(&self, _session_id: &str, worktree_path: &str, repo_path: &str, repo: Option<&Repository>) {
        let extra = repo.and_then(|r| r.symlink_files.as_ref())
            .map(|v| v.iter().map(|s| s.as_str()).collect::<Vec<_>>())
            .unwrap_or_default();

        let mut all_files: Vec<String> = AUTO_SYMLINK.iter().map(|s| s.to_string()).collect();
        for f in &extra {
            if !all_files.contains(&f.to_string()) {
                all_files.push(f.to_string());
            }
        }

        let is_next = repo.map(|r| r.project_type.as_deref() == Some("nextjs")).unwrap_or(false)
            || is_nextjs(repo_path);

        for rel_path in &all_files {
            if is_next && NEXTJS_NO_SYMLINK.contains(&rel_path.as_str()) {
                continue;
            }
            symlink_one(repo_path, worktree_path, rel_path);
        }
    }

    pub fn repair_symlinks(&self, id: &str, repo: Option<&Repository>) -> Result<RepairResult, String> {
        let session = self.get_by_id(id).ok_or_else(|| format!("Session not found: {}", id))?;
        if session.status == "archived" {
            return Ok(RepairResult { created: vec![], skipped: vec![] });
        }

        let extra = repo.and_then(|r| r.symlink_files.as_ref())
            .map(|v| v.iter().map(|s| s.as_str()).collect::<Vec<_>>())
            .unwrap_or_default();

        let mut all_files: Vec<String> = AUTO_SYMLINK.iter().map(|s| s.to_string()).collect();
        for f in &extra {
            if !all_files.contains(&f.to_string()) {
                all_files.push(f.to_string());
            }
        }

        let is_next = repo.map(|r| r.project_type.as_deref() == Some("nextjs")).unwrap_or(false)
            || is_nextjs(&session.repo_path);

        let mut created = Vec::new();
        let mut skipped = Vec::new();

        for rel_path in &all_files {
            if is_next && NEXTJS_NO_SYMLINK.contains(&rel_path.as_str()) { continue; }
            if symlink_one(&session.repo_path, &session.worktree_path, rel_path) {
                created.push(rel_path.clone());
            } else {
                skipped.push(rel_path.clone());
            }
        }

        // Next.js: install deps in background if missing
        if is_next && !Path::new(&session.worktree_path).join("node_modules").exists() {
            let pm = repo.and_then(|r| r.package_manager.as_deref())
                .map(|p| install_cmd_from_manager(p))
                .unwrap_or_else(|| detect_install_cmd(&session.repo_path));
            install_deps_async(&session.worktree_path, &pm);
            created.push("node_modules (installing...)".to_string());
        }

        Ok(RepairResult { created, skipped })
    }

    pub fn repair_all_symlinks(&self, repo_id: Option<&str>, repo_mgr: &crate::repos::RepoManager) -> Vec<serde_json::Value> {
        let targets: Vec<Session> = match repo_id {
            Some(id) => self.sessions.iter().filter(|s| s.repo_id == id && s.status == "active").cloned().collect(),
            None => self.sessions.iter().filter(|s| s.status == "active").cloned().collect(),
        };

        let mut results = Vec::new();
        for s in &targets {
            let repo = repo_mgr.get_by_id(&s.repo_id);
            if let Ok(r) = self.repair_symlinks(&s.id, repo.as_ref()) {
                if !r.created.is_empty() {
                    results.push(serde_json::json!({ "sessionId": s.id, "created": r.created }));
                }
            }
        }
        results
    }

    pub fn get_setup_cmd(&self, session_id: &str, repo: Option<&Repository>) -> Option<String> {
        let session = self.get_by_id(session_id)?;
        let mut cmds = Vec::new();

        let is_next = repo.map(|r| r.project_type.as_deref() == Some("nextjs")).unwrap_or(false)
            || is_nextjs(&session.repo_path);

        if is_next && !Path::new(&session.worktree_path).join("node_modules").exists() {
            let cmd = repo.and_then(|r| r.package_manager.as_deref())
                .map(|p| install_cmd_from_manager(p))
                .unwrap_or_else(|| detect_install_cmd(&session.repo_path));
            cmds.push(cmd);
        }

        if repo.map(|r| r.uses_docker == Some(true)).unwrap_or(false) {
            if find_compose_file(&session.worktree_path).is_some() {
                let project_name = session_id.replace(|c: char| !c.is_alphanumeric() && c != '-', "-").to_lowercase();
                cmds.push(format!("docker compose -p {} up -d", project_name));
            }
        }

        if cmds.is_empty() { None } else { Some(cmds.join(" && ")) }
    }
}

fn symlink_one(repo_path: &str, worktree_path: &str, rel_path: &str) -> bool {
    let source = Path::new(repo_path).join(rel_path);
    let target = Path::new(worktree_path).join(rel_path);

    if !source.exists() { return false; }

    // Already a symlink — skip
    if target.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
        return false;
    }

    // Create parent dirs
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Remove existing file/dir at target
    if target.exists() {
        if target.is_dir() {
            let _ = fs::remove_dir_all(&target);
        } else {
            let _ = fs::remove_file(&target);
        }
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&source, &target).is_ok()
    }
    #[cfg(windows)]
    {
        if source.is_dir() {
            std::os::windows::fs::symlink_dir(&source, &target).is_ok()
        } else {
            std::os::windows::fs::symlink_file(&source, &target).is_ok()
        }
    }
}

fn is_nextjs(repo_path: &str) -> bool {
    let pkg_path = Path::new(repo_path).join("package.json");
    if let Ok(content) = fs::read_to_string(pkg_path) {
        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
            let deps = pkg.get("dependencies").and_then(|v| v.as_object());
            let dev = pkg.get("devDependencies").and_then(|v| v.as_object());
            return deps.map(|d| d.contains_key("next")).unwrap_or(false)
                || dev.map(|d| d.contains_key("next")).unwrap_or(false);
        }
    }
    false
}

fn detect_install_cmd(repo_path: &str) -> String {
    let rp = Path::new(repo_path);
    if rp.join("pnpm-lock.yaml").exists() { return "pnpm install --frozen-lockfile".to_string(); }
    if rp.join("yarn.lock").exists() { return "yarn install --frozen-lockfile".to_string(); }
    if rp.join("bun.lockb").exists() || rp.join("bun.lock").exists() { return "bun install --frozen-lockfile".to_string(); }
    if rp.join("package-lock.json").exists() { return "npm ci".to_string(); }
    "npm install".to_string()
}

fn install_cmd_from_manager(pm: &str) -> String {
    match pm {
        "pnpm" => "pnpm install --frozen-lockfile".to_string(),
        "yarn" => "yarn install --frozen-lockfile".to_string(),
        "bun" => "bun install --frozen-lockfile".to_string(),
        "npm" => "npm ci".to_string(),
        _ => "npm install".to_string(),
    }
}

fn install_deps_async(worktree_path: &str, cmd: &str) {
    let parts: Vec<&str> = cmd.split_whitespace().collect();
    if let Some((bin, args)) = parts.split_first() {
        let _ = std::process::Command::new(bin)
            .args(args)
            .current_dir(worktree_path)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
}

fn find_compose_file(dir: &str) -> Option<String> {
    for name in &["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"] {
        if Path::new(dir).join(name).exists() { return Some(name.to_string()); }
    }
    None
}
