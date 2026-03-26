use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub default_branch: String,
    pub added_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub jira_project_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ticket_integration: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symlink_files: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_manager: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uses_docker: Option<bool>,
}

pub struct RepoManager {
    file_path: PathBuf,
    repos: Vec<Repository>,
}

const COLORS: &[&str] = &["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

impl RepoManager {
    pub fn new() -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".branchless");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("repos.json");
        let mut repos = Self::load_from(&file_path);

        // Backfill auto-detection
        let mut dirty = false;
        for repo in &mut repos {
            if repo.project_type.is_none() {
                repo.project_type = Some(detect_project_type(&repo.path));
                dirty = true;
            }
            if repo.package_manager.is_none() {
                repo.package_manager = detect_package_manager(&repo.path);
                dirty = true;
            }
            if repo.uses_docker.is_none() {
                repo.uses_docker = Some(detect_docker(&repo.path));
                dirty = true;
            }
        }
        let mgr = Self { file_path, repos };
        if dirty { mgr.persist(); }
        mgr
    }

    fn load_from(path: &PathBuf) -> Vec<Repository> {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(repos) = serde_json::from_str(&content) {
                return repos;
            }
        }
        Vec::new()
    }

    fn persist(&self) {
        if let Ok(json) = serde_json::to_string_pretty(&self.repos) {
            let _ = fs::write(&self.file_path, &json);
        }
    }

    pub fn get_all(&self) -> Vec<Repository> {
        self.repos.clone()
    }

    pub fn get_by_id(&self, id: &str) -> Option<Repository> {
        self.repos.iter().find(|r| r.id == id).cloned()
    }

    pub fn add(&mut self, repo_path: &str, name: String, default_branch: String) -> Result<Repository, String> {
        let normalized = fs::canonicalize(repo_path)
            .map_err(|e| format!("Invalid path: {}", e))?
            .to_string_lossy()
            .to_string();

        if self.repos.iter().any(|r| r.path == normalized) {
            return Err(format!("Repository already added: {}", normalized));
        }

        let color = COLORS[self.repos.len() % COLORS.len()].to_string();
        let project_type = detect_project_type(&normalized);
        let package_manager = detect_package_manager(&normalized);
        let uses_docker = detect_docker(&normalized);

        // Auto-configure symlink files from .gitignore + known patterns
        let symlink_files = auto_detect_symlink_files(&normalized);

        let repo = Repository {
            id: format!("repo_{}_{}", chrono::Utc::now().timestamp_millis(), rand_suffix()),
            name,
            path: normalized,
            default_branch,
            added_at: chrono::Utc::now().to_rfc3339(),
            color: Some(color),
            jira_project_key: None,
            ticket_integration: None,
            symlink_files: if symlink_files.is_empty() { None } else { Some(symlink_files) },
            project_type: Some(project_type),
            package_manager,
            uses_docker: Some(uses_docker),
        };

        self.repos.push(repo.clone());
        self.persist();
        Ok(repo)
    }

    pub fn remove(&mut self, id: &str) {
        self.repos.retain(|r| r.id != id);
        self.persist();
    }

    pub fn update(&mut self, id: &str, partial: serde_json::Value) -> Result<Repository, String> {
        let idx = self.repos.iter().position(|r| r.id == id)
            .ok_or_else(|| format!("Repo not found: {}", id))?;

        if let Ok(mut val) = serde_json::to_value(&self.repos[idx]) {
            if let Some(obj) = partial.as_object() {
                if let Some(cur) = val.as_object_mut() {
                    for (k, v) in obj {
                        cur.insert(k.clone(), v.clone());
                    }
                }
            }
            if let Ok(updated) = serde_json::from_value(val) {
                self.repos[idx] = updated;
                self.persist();
            }
        }
        Ok(self.repos[idx].clone())
    }
}

/// Auto-detect files to symlink from .gitignore + known patterns.
/// This is the KEY auto-configuration feature — when you add a repo,
/// it scans .gitignore for ignored files/dirs that exist and should be shared.
pub fn auto_detect_symlink_files(repo_path: &str) -> Vec<String> {
    let rp = Path::new(repo_path);
    let mut files = Vec::new();

    // Known patterns that should always be symlinked when they exist
    let known = [
        "node_modules", ".env", ".env.local", ".env.development", ".env.development.local",
        ".venv", "venv", "vendor", "__pycache__", ".gradle", ".turbo", ".cache",
        ".parcel-cache", ".idea", ".vscode",
    ];

    // Check which known files exist in the repo
    for f in &known {
        if rp.join(f).exists() {
            files.push(f.to_string());
        }
    }

    // Parse .gitignore for additional candidates — files that are ignored AND exist
    // These are great symlink candidates (build outputs, env files, caches, etc.)
    if let Ok(gitignore) = fs::read_to_string(rp.join(".gitignore")) {
        for line in gitignore.lines() {
            let trimmed = line.trim();
            // Skip comments and empty lines
            if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
                continue;
            }
            // Clean up the pattern
            let clean = trimmed.trim_start_matches('/').trim_end_matches('/');
            // Skip wildcard patterns and root-level git patterns
            if clean.contains('*') || clean == ".git" || clean.is_empty() {
                continue;
            }
            // Check if this file/dir actually exists and isn't already in our list
            if rp.join(clean).exists() && !files.contains(&clean.to_string()) {
                // Only include files that look like config/build/deps (not source code)
                let is_config_or_build = clean.starts_with('.')
                    || clean.contains("node_modules")
                    || clean.contains("vendor")
                    || clean.contains("dist")
                    || clean.contains("build")
                    || clean.contains("target")
                    || clean.contains("coverage")
                    || clean.contains("cache")
                    || clean.contains("env")
                    || clean.contains("log")
                    || clean.contains("tmp");
                if is_config_or_build {
                    files.push(clean.to_string());
                }
            }
        }
    }

    files.sort();
    files.dedup();
    files
}

/// Suggest symlink files — scans repo for common candidates
pub fn suggest_symlink_files(repo_path: &str) -> Vec<String> {
    let rp = Path::new(repo_path);
    let candidates = [
        ".env", ".env.local", ".env.development", ".env.development.local",
        "node_modules", ".venv", "vendor", ".idea", ".vscode", ".gradle",
        "build", "dist", "target", "__pycache__", ".next", ".nuxt",
        ".turbo", ".cache",
    ];

    let mut found: Vec<String> = candidates.iter()
        .filter(|f| rp.join(f).exists())
        .map(|f| f.to_string())
        .collect();

    // Also parse .gitignore for suggestions
    if let Ok(gitignore) = fs::read_to_string(rp.join(".gitignore")) {
        for line in gitignore.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') || trimmed.contains('*') {
                continue;
            }
            let clean = trimmed.trim_start_matches('/').trim_end_matches('/');
            if !clean.is_empty() && clean != ".git" && rp.join(clean).exists() && !found.contains(&clean.to_string()) {
                found.push(clean.to_string());
            }
        }
    }

    found.sort();
    found.dedup();
    found
}

pub fn detect_project_type(repo_path: &str) -> String {
    let rp = Path::new(repo_path);
    if rp.join("package.json").exists() {
        if let Ok(content) = fs::read_to_string(rp.join("package.json")) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                let deps = pkg.get("dependencies").and_then(|v| v.as_object());
                let dev_deps = pkg.get("devDependencies").and_then(|v| v.as_object());
                let has_next = deps.map(|d| d.contains_key("next")).unwrap_or(false)
                    || dev_deps.map(|d| d.contains_key("next")).unwrap_or(false);
                if has_next { return "nextjs".to_string(); }
            }
        }
        return "node".to_string();
    }
    if rp.join("requirements.txt").exists() || rp.join("pyproject.toml").exists() || rp.join("setup.py").exists() || rp.join("Pipfile").exists() {
        return "python".to_string();
    }
    if rp.join("composer.json").exists() { return "php".to_string(); }
    if rp.join("Gemfile").exists() { return "ruby".to_string(); }
    if rp.join("go.mod").exists() { return "go".to_string(); }
    if rp.join("Cargo.toml").exists() { return "rust".to_string(); }
    if rp.join("pom.xml").exists() || rp.join("build.gradle").exists() || rp.join("build.gradle.kts").exists() {
        return "java".to_string();
    }
    "other".to_string()
}

pub fn detect_package_manager(repo_path: &str) -> Option<String> {
    let rp = Path::new(repo_path);
    if rp.join("pnpm-lock.yaml").exists() { return Some("pnpm".to_string()); }
    if rp.join("yarn.lock").exists() { return Some("yarn".to_string()); }
    if rp.join("bun.lockb").exists() || rp.join("bun.lock").exists() { return Some("bun".to_string()); }
    if rp.join("package-lock.json").exists() { return Some("npm".to_string()); }
    if rp.join("poetry.lock").exists() { return Some("poetry".to_string()); }
    if rp.join("Pipfile.lock").exists() || rp.join("requirements.txt").exists() { return Some("pip".to_string()); }
    if rp.join("composer.lock").exists() { return Some("composer".to_string()); }
    if rp.join("Gemfile.lock").exists() { return Some("bundler".to_string()); }
    None
}

pub fn detect_docker(repo_path: &str) -> bool {
    let rp = Path::new(repo_path);
    ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]
        .iter()
        .any(|f| rp.join(f).exists())
}

fn rand_suffix() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..5).map(|_| {
        let idx = rng.gen_range(0..36);
        if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
    }).collect()
}
