use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    #[serde(rename = "aheadBy")]
    pub ahead_by: i32,
    #[serde(rename = "behindBy")]
    pub behind_by: i32,
    #[serde(rename = "hasConflicts")]
    pub has_conflicts: bool,
    #[serde(rename = "isClean")]
    pub is_clean: bool,
    #[serde(rename = "modifiedFiles")]
    pub modified_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub commit: String,
    #[serde(rename = "isLocked")]
    pub is_locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitEntry {
    pub hash: String,
    #[serde(rename = "shortHash")]
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    pub status: String,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStat {
    pub file: String,
    pub additions: i32,
    pub deletions: i32,
    pub binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseResult {
    pub success: bool,
    pub output: String,
    #[serde(rename = "hasConflicts")]
    pub has_conflicts: bool,
    #[serde(rename = "conflictingFiles")]
    pub conflicting_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub success: bool,
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrInfo {
    pub number: i64,
    pub url: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictRisk {
    pub file: String,
    #[serde(rename = "mainCommits")]
    pub main_commits: i32,
    pub authors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheck {
    pub check: String,
    pub status: String,
    pub output: String,
    pub duration: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeFinding {
    pub severity: String,
    pub file: String,
    pub detail: String,
    pub recommendation: String,
}

pub struct GitService;

impl GitService {
    pub fn new() -> Self {
        Self
    }

    fn git(&self, cwd: &str, args: &[&str]) -> Result<String, String> {
        let output = Command::new("git")
            .args(args)
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;

        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Err(if stderr.is_empty() { stdout } else { stderr })
        }
    }

    pub fn is_git_repo(&self, dir: &str) -> bool {
        self.git(dir, &["rev-parse", "--git-dir"]).is_ok()
    }

    pub fn get_repo_name(&self, repo_path: &str) -> String {
        if let Ok(url) = self.git(repo_path, &["remote", "get-url", "origin"]) {
            if let Some(name) = url.split('/').last() {
                return name.trim_end_matches(".git").to_string();
            }
        }
        Path::new(repo_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    }

    pub fn get_default_branch(&self, repo_path: &str) -> String {
        if let Ok(result) = self.git(repo_path, &["symbolic-ref", "refs/remotes/origin/HEAD", "--short"]) {
            return result.replace("origin/", "");
        }
        if let Ok(branches) = self.git(repo_path, &["branch", "-r"]) {
            if branches.contains("origin/main") { return "main".to_string(); }
            if branches.contains("origin/master") { return "master".to_string(); }
        }
        "main".to_string()
    }

    pub fn list_branches(&self, repo_path: &str) -> Result<Vec<String>, String> {
        let default_branch = self.get_default_branch(repo_path);
        let merge_ref = if self.git(repo_path, &["rev-parse", "--verify", &format!("origin/{}", default_branch)]).is_ok() {
            format!("origin/{}", default_branch)
        } else {
            default_branch.clone()
        };

        let protected = ["main", "master", "develop", "development", "staging", "release"];

        let output = self.git(repo_path, &["branch", "-a", "--no-merged", &merge_ref, "--format=%(refname:short)"])?;
        let mut branches: Vec<String> = output
            .lines()
            .map(|b| b.trim().trim_start_matches("origin/").to_string())
            .filter(|b| !b.is_empty() && b != "HEAD")
            .collect();
        branches.dedup();

        if !branches.contains(&default_branch) {
            branches.insert(0, default_branch.clone());
        }

        if let Ok(all) = self.git(repo_path, &["branch", "-a", "--format=%(refname:short)"]) {
            let all_set: std::collections::HashSet<String> = all
                .lines()
                .map(|b| b.trim().trim_start_matches("origin/").to_string())
                .collect();
            for pb in &protected {
                let pb_str = pb.to_string();
                if all_set.contains(&pb_str) && !branches.contains(&pb_str) {
                    let idx = branches.iter().position(|b| b == &default_branch).unwrap_or(0);
                    branches.insert(idx + 1, pb_str);
                }
            }
        }

        Ok(branches)
    }

    pub fn create_worktree(&self, repo_path: &str, worktree_path: &str, branch: &str, base_branch: &str) -> Result<(), String> {
        // Ensure parent dir exists
        if let Some(parent) = Path::new(worktree_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
        }

        // Fetch latest (best-effort)
        let _ = self.git(repo_path, &["fetch", "origin", base_branch]);

        // Determine start point
        let remote_ref = format!("origin/{}", base_branch);
        let start_point = if self.git(repo_path, &["show-ref", "--verify", "--quiet", &format!("refs/remotes/{}", remote_ref)]).is_ok() {
            remote_ref
        } else {
            base_branch.to_string()
        };

        // Check if branch exists
        let branch_exists = self.git(repo_path, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{}", branch)]).is_ok();

        if branch_exists {
            let worktrees = self.list_worktrees(repo_path)?;
            if worktrees.iter().any(|wt| wt.branch == branch) {
                return Err(format!("Branch \"{}\" is already checked out in another worktree. Delete that session first or use a different branch name.", branch));
            }
            self.git(repo_path, &["worktree", "add", worktree_path, branch])?;
        } else {
            self.git(repo_path, &["worktree", "add", "-b", branch, worktree_path, &start_point])?;
        }

        Ok(())
    }

    pub fn remove_worktree(&self, repo_path: &str, worktree_path: &str) -> Result<(), String> {
        if self.git(repo_path, &["worktree", "remove", worktree_path, "--force"]).is_err() {
            self.git(repo_path, &["worktree", "prune"])?;
        }
        Ok(())
    }

    pub fn delete_branch(&self, repo_path: &str, branch: &str) -> Result<(), String> {
        self.git(repo_path, &["branch", "-D", branch]).map(|_| ())
    }

    pub fn list_worktrees(&self, repo_path: &str) -> Result<Vec<WorktreeInfo>, String> {
        let output = self.git(repo_path, &["worktree", "list", "--porcelain"])?;
        let mut worktrees = Vec::new();
        for block in output.split("\n\n").filter(|b| !b.is_empty()) {
            let mut path = String::new();
            let mut branch = String::new();
            let mut commit = String::new();
            let mut is_locked = false;
            for line in block.lines() {
                if let Some(p) = line.strip_prefix("worktree ") { path = p.to_string(); }
                else if let Some(c) = line.strip_prefix("HEAD ") { commit = c.to_string(); }
                else if let Some(b) = line.strip_prefix("branch ") { branch = b.replace("refs/heads/", ""); }
                else if line == "locked" { is_locked = true; }
            }
            if !path.is_empty() {
                worktrees.push(WorktreeInfo { path, branch, commit, is_locked });
            }
        }
        Ok(worktrees)
    }

    pub fn get_status(&self, worktree_path: &str) -> Result<GitStatus, String> {
        let branch_output = self.git(worktree_path, &["status", "--porcelain=v2", "--branch"]).unwrap_or_default();
        let status_output = self.git(worktree_path, &["status", "--porcelain"]).unwrap_or_default();

        let mut branch = "unknown".to_string();
        let mut ahead_by = 0;
        let mut behind_by = 0;

        for line in branch_output.lines() {
            if let Some(b) = line.strip_prefix("# branch.head ") { branch = b.to_string(); }
            if line.starts_with("# branch.ab ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    ahead_by = parts[2].trim_start_matches('+').parse().unwrap_or(0);
                    behind_by = parts[3].trim_start_matches('-').parse().unwrap_or(0);
                }
            }
        }

        let mut modified_files = Vec::new();
        let mut has_conflicts = false;
        for line in status_output.lines().filter(|l| !l.is_empty()) {
            let xy = &line[..2.min(line.len())];
            let file = line.get(3..).unwrap_or("").to_string();
            if xy == "UU" || xy == "AA" || xy == "DD" { has_conflicts = true; }
            modified_files.push(file);
        }

        Ok(GitStatus {
            branch,
            ahead_by,
            behind_by,
            has_conflicts,
            is_clean: modified_files.is_empty(),
            modified_files,
        })
    }

    pub fn fetch_and_rebase(&self, worktree_path: &str, base_branch: &str) -> RebaseResult {
        let remote = "origin";
        let _ = self.git(worktree_path, &["fetch", remote, base_branch]);

        // Preflight — detect overlapping files
        let mut conflicting_files = Vec::new();
        if let Ok(mb) = self.git(worktree_path, &["merge-base", "HEAD", &format!("{}/{}", remote, base_branch)]) {
            let upstream = self.git(worktree_path, &["diff", "--name-only", &mb, &format!("{}/{}", remote, base_branch)]).unwrap_or_default();
            let session = self.git(worktree_path, &["diff", "--name-only", &mb, "HEAD"]).unwrap_or_default();
            let up_files: std::collections::HashSet<&str> = upstream.lines().collect();
            let sess_files: std::collections::HashSet<&str> = session.lines().collect();
            conflicting_files = up_files.intersection(&sess_files).map(|s| s.to_string()).collect();
        }

        match self.git(worktree_path, &["rebase", &format!("{}/{}", remote, base_branch)]) {
            Ok(output) => RebaseResult {
                success: true,
                output,
                has_conflicts: false,
                conflicting_files,
            },
            Err(err) => {
                let has_conflicts = err.to_lowercase().contains("conflict");
                if has_conflicts {
                    let _ = self.git(worktree_path, &["rebase", "--abort"]);
                }
                RebaseResult {
                    success: false,
                    output: err.chars().take(500).collect(),
                    has_conflicts,
                    conflicting_files,
                }
            }
        }
    }

    pub fn push_branch(&self, worktree_path: &str, branch: &str) -> PushResult {
        let output = Command::new("git")
            .args(["push", "--set-upstream", "origin", branch])
            .current_dir(worktree_path)
            .output();

        match output {
            Ok(o) => {
                let stdout = String::from_utf8_lossy(&o.stdout).to_string();
                let stderr = String::from_utf8_lossy(&o.stderr).to_string();
                let combined = format!("{}{}", stdout, stderr).trim().to_string();
                PushResult {
                    success: o.status.success(),
                    output: combined.chars().take(500).collect(),
                }
            }
            Err(e) => PushResult {
                success: false,
                output: e.to_string(),
            },
        }
    }

    pub fn fetch_origin(&self, repo_path: &str) -> Result<(), String> {
        self.git(repo_path, &["fetch", "origin", "--prune"]).map(|_| ())
    }

    pub fn get_commit_log(&self, worktree_path: &str, base_branch: Option<&str>) -> Vec<CommitEntry> {
        let range = match base_branch {
            Some(b) => format!("origin/{}..HEAD", b),
            None => "--max-count=30".to_string(),
        };
        let out = self.git(worktree_path, &["log", &range, "--pretty=format:%H|%h|%s|%an|%ar"]).unwrap_or_default();
        out.lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.splitn(5, '|').collect();
                CommitEntry {
                    hash: parts.first().unwrap_or(&"").to_string(),
                    short_hash: parts.get(1).unwrap_or(&"").to_string(),
                    subject: parts.get(2).unwrap_or(&"").to_string(),
                    author: parts.get(3).unwrap_or(&"").to_string(),
                    date: parts.get(4).unwrap_or(&"").to_string(),
                }
            })
            .collect()
    }

    pub fn get_changed_files(&self, worktree_path: &str) -> Vec<ChangedFile> {
        let out = self.git(worktree_path, &["status", "--porcelain"]).unwrap_or_default();
        out.lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let status = line.get(..2).unwrap_or("?").trim().to_string();
                let status = if status.is_empty() { "?".to_string() } else { status };
                let file = line.get(3..).unwrap_or("").to_string();
                ChangedFile { status, file }
            })
            .collect()
    }

    pub fn get_file_diff(&self, worktree_path: &str, file: &str) -> String {
        self.git(worktree_path, &["diff", "HEAD", "--", file])
            .or_else(|_| self.git(worktree_path, &["show", &format!(":{}", file)]))
            .unwrap_or_default()
    }

    pub fn get_diff_compare(&self, worktree_path: &str, base_branch: &str) -> String {
        let _ = self.git(worktree_path, &["fetch", "origin", base_branch, "--quiet"]);
        self.git(worktree_path, &["diff", &format!("origin/{}...HEAD", base_branch)])
            .or_else(|_| self.git(worktree_path, &["diff", &format!("{}...HEAD", base_branch)]))
            .unwrap_or_else(|_| "Unable to compute diff.".to_string())
    }

    pub fn get_diff_stats(&self, worktree_path: &str, base_branch: &str) -> Vec<DiffStat> {
        let _ = self.git(worktree_path, &["fetch", "origin", base_branch, "--quiet"]);
        let out = self.git(worktree_path, &["diff", "--numstat", &format!("origin/{}...HEAD", base_branch)]).unwrap_or_default();
        out.lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                let binary = parts.first().map(|s| *s == "-").unwrap_or(false);
                DiffStat {
                    file: parts.get(2..).map(|p| p.join("\t")).unwrap_or_default(),
                    additions: if binary { 0 } else { parts.first().and_then(|s| s.parse().ok()).unwrap_or(0) },
                    deletions: if binary { 0 } else { parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0) },
                    binary,
                }
            })
            .collect()
    }

    pub fn get_file_diff_vs_base(&self, worktree_path: &str, base_branch: &str, file: &str) -> String {
        self.git(worktree_path, &["diff", &format!("origin/{}...HEAD", base_branch), "--", file])
            .or_else(|_| self.git(worktree_path, &["diff", &format!("{}...HEAD", base_branch), "--", file]))
            .unwrap_or_default()
    }

    pub fn get_branch_merge_status(&self, repo_path: &str, branch: &str, base_branch: &str) -> String {
        // Check if branch was pushed
        if self.git(repo_path, &["rev-parse", "--verify", &format!("origin/{}", branch)]).is_err() {
            return "unknown".to_string();
        }
        let _ = self.git(repo_path, &["fetch", "origin", base_branch, "--quiet"]);
        if let Ok(merged) = self.git(repo_path, &["branch", "-r", "--merged", &format!("origin/{}", base_branch)]) {
            if merged.lines().any(|b| b.trim() == format!("origin/{}", branch)) {
                return "merged".to_string();
            }
            return "open".to_string();
        }
        "unknown".to_string()
    }

    pub fn get_pr_info(&self, repo_path: &str, branch: &str) -> Option<PrInfo> {
        let output = Command::new("gh")
            .args(["pr", "view", branch, "--json", "number,url,state", "--jq", "."])
            .current_dir(repo_path)
            .output()
            .ok()?;

        if !output.status.success() { return None; }
        let stdout = String::from_utf8_lossy(&output.stdout);
        let data: serde_json::Value = serde_json::from_str(stdout.trim()).ok()?;
        let state_raw = data["state"].as_str().unwrap_or("").to_uppercase();
        let state = match state_raw.as_str() {
            "MERGED" => "merged",
            "OPEN" => "open",
            _ => "closed",
        };
        Some(PrInfo {
            number: data["number"].as_i64().unwrap_or(0),
            url: data["url"].as_str().unwrap_or("").to_string(),
            state: state.to_string(),
        })
    }

    pub fn get_pr_url(&self, repo_path: &str, branch: &str, base_branch: &str) -> Option<String> {
        let remote_url = self.git(repo_path, &["remote", "get-url", "origin"]).ok()?;
        let normalised = remote_url
            .replace("git@github.com:", "https://github.com/")
            .replace("git@gitlab.com:", "https://gitlab.com/")
            .trim_end_matches(".git")
            .to_string();

        let enc = |s: &str| urlencoding::encode(s).to_string();

        if normalised.contains("github.com") {
            Some(format!("{}/compare/{}...{}?expand=1", normalised, enc(base_branch), enc(branch)))
        } else if normalised.contains("gitlab") {
            Some(format!("{}/-/merge_requests/new?merge_request[source_branch]={}&merge_request[target_branch]={}", normalised, enc(branch), enc(base_branch)))
        } else if normalised.contains("bitbucket.org") {
            Some(format!("{}/pull-requests/new?source={}&dest={}", normalised, enc(branch), enc(base_branch)))
        } else {
            Some(normalised)
        }
    }

    pub fn get_conflict_risk(&self, worktree_path: &str, base_branch: &str) -> Vec<ConflictRisk> {
        let remote = "origin";
        // Get session files
        let session_files: Vec<String> = self.git(worktree_path, &["diff", "--name-only", &format!("{}/{}...HEAD", remote, base_branch)])
            .or_else(|_| self.git(worktree_path, &["diff", "--name-only", &format!("{}...HEAD", base_branch)]))
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.is_empty())
            .map(|s| s.to_string())
            .collect();

        if session_files.is_empty() { return Vec::new(); }

        let since = chrono::Utc::now() - chrono::Duration::days(30);
        let since_str = since.format("%Y-%m-%d").to_string();
        let _ = self.git(worktree_path, &["fetch", remote, base_branch]);
        let main_log = self.git(worktree_path, &["log", &format!("{}/{}", remote, base_branch), "--since", &since_str, "--name-only", "--pretty=format:%an"])
            .unwrap_or_default();

        let mut file_info: std::collections::HashMap<String, (i32, std::collections::HashSet<String>)> = std::collections::HashMap::new();
        let mut current_author = String::new();
        for line in main_log.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() { continue; }
            if trimmed.contains('/') || trimmed.contains('.') {
                let entry = file_info.entry(trimmed.to_string()).or_insert((0, std::collections::HashSet::new()));
                entry.0 += 1;
                if !current_author.is_empty() { entry.1.insert(current_author.clone()); }
            } else {
                current_author = trimmed.to_string();
            }
        }

        let mut risks: Vec<ConflictRisk> = session_files.iter()
            .filter_map(|f| {
                file_info.get(f).map(|(commits, authors)| ConflictRisk {
                    file: f.clone(),
                    main_commits: *commits,
                    authors: authors.iter().cloned().collect(),
                })
            })
            .filter(|r| r.main_commits > 0)
            .collect();

        risks.sort_by(|a, b| b.main_commits.cmp(&a.main_commits));
        risks
    }

    pub fn run_health_checks(&self, worktree_path: &str) -> Vec<HealthCheck> {
        let mut results = Vec::new();
        let wt = Path::new(worktree_path);

        let has_pkg = wt.join("package.json").exists();
        let has_cargo = wt.join("Cargo.toml").exists();
        let has_go = wt.join("go.mod").exists();

        // Detect package manager
        let pm = if wt.join("pnpm-lock.yaml").exists() { "pnpm" }
            else if wt.join("yarn.lock").exists() { "yarn" }
            else if wt.join("bun.lockb").exists() || wt.join("bun.lock").exists() { "bun" }
            else { "npm" };

        let run_check = |check: &str, cmd: &str, args: &[&str]| -> HealthCheck {
            let start = std::time::Instant::now();
            match Command::new(cmd).args(args).current_dir(worktree_path)
                .env("CI", "true").env("NO_COLOR", "1").env("FORCE_COLOR", "0")
                .output() {
                Ok(o) => {
                    let combined = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
                    HealthCheck {
                        check: check.to_string(),
                        status: if o.status.success() { "pass" } else { "fail" }.to_string(),
                        output: combined.chars().rev().take(1500).collect::<String>().chars().rev().collect(),
                        duration: start.elapsed().as_millis() as u64,
                    }
                }
                Err(e) => HealthCheck {
                    check: check.to_string(),
                    status: "skip".to_string(),
                    output: e.to_string(),
                    duration: 0,
                }
            }
        };

        if has_pkg {
            // Read scripts
            let pkg_scripts: std::collections::HashSet<String> = std::fs::read_to_string(wt.join("package.json"))
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v["scripts"].as_object().map(|o| o.keys().cloned().collect()))
                .unwrap_or_default();

            if !wt.join("node_modules").exists() {
                results.push(run_check("Install dependencies", pm, &["install"]));
                if results.last().map(|r| r.status == "fail").unwrap_or(false) { return results; }
            }
            if pkg_scripts.contains("typecheck") {
                results.push(run_check("TypeScript", pm, &["run", "typecheck"]));
            } else if wt.join("tsconfig.json").exists() {
                results.push(run_check("TypeScript", "npx", &["tsc", "--noEmit"]));
            }
            if pkg_scripts.contains("lint") {
                results.push(run_check("Lint", pm, &["run", "lint"]));
            }
            if pkg_scripts.contains("build") {
                results.push(run_check("Build", pm, &["run", "build"]));
            }
            if pkg_scripts.contains("test") {
                results.push(run_check("Tests", pm, &["run", "test"]));
            }
        }

        if has_cargo {
            results.push(run_check("Build", "cargo", &["check"]));
            results.push(run_check("Lint", "cargo", &["clippy", "--", "-D", "warnings"]));
            results.push(run_check("Tests", "cargo", &["test", "--no-fail-fast"]));
        }

        if has_go {
            results.push(run_check("Build", "go", &["build", "./..."]));
            results.push(run_check("Tests", "go", &["test", "./...", "-short"]));
        }

        if results.is_empty() {
            results.push(HealthCheck {
                check: "Detection".to_string(),
                status: "skip".to_string(),
                output: "No supported project type detected".to_string(),
                duration: 0,
            });
        }
        results
    }

    pub fn analyze_codebase(&self, worktree_path: &str, base_branch: &str) -> Vec<CodeFinding> {
        let remote = "origin";
        let changed_files: Vec<String> = self.git(worktree_path, &["diff", "--name-only", &format!("{}/{}...HEAD", remote, base_branch)])
            .or_else(|_| self.git(worktree_path, &["diff", "--name-only", &format!("{}...HEAD", base_branch)]))
            .unwrap_or_default()
            .lines()
            .filter(|l| !l.is_empty())
            .map(|s| s.to_string())
            .collect();

        let mut findings = Vec::new();

        // Check for deleted files still imported
        for file in &changed_files {
            let full_path = Path::new(worktree_path).join(file);
            if !full_path.exists() {
                // File was deleted — check if others import it
                let base = Path::new(file).file_stem().unwrap_or_default().to_string_lossy();
                if let Ok(output) = Command::new("grep").args(["-rl", "--include=*.ts", "--include=*.tsx", "--include=*.js", &base.to_string(), "."]).current_dir(worktree_path).output() {
                    let matches: Vec<String> = String::from_utf8_lossy(&output.stdout).lines()
                        .map(|l| l.trim_start_matches("./").to_string())
                        .filter(|l| !changed_files.contains(l))
                        .collect();
                    if !matches.is_empty() {
                        findings.push(CodeFinding {
                            severity: "must_fix".to_string(),
                            file: matches.first().unwrap_or(&String::new()).clone(),
                            detail: format!("Imports from \"{}\" which was deleted. This will cause a build error.", file),
                            recommendation: format!("Update imports in {} files that reference {}", matches.len(), file),
                        });
                    }
                }
            }
        }
        findings
    }
}
