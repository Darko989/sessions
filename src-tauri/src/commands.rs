use tauri::State;
use crate::AppState;
use crate::sessions::CreateSessionInput;

// ── Repos ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn repos_get_all(state: State<'_, AppState>) -> Result<Vec<crate::repos::Repository>, String> {
    Ok(state.repos.lock().unwrap().get_all())
}

#[tauri::command]
pub async fn repos_add(state: State<'_, AppState>, repo_path: String) -> Result<crate::repos::Repository, String> {
    let name = state.git.get_repo_name(&repo_path);
    let default_branch = state.git.get_default_branch(&repo_path);
    let repo = state.repos.lock().unwrap().add(&repo_path, name.clone(), default_branch)?;
    state.activity.lock().unwrap().add("repo_added", &format!("Added repository \"{}\"", name), None, Some(repo.id.clone()));
    Ok(repo)
}

#[tauri::command]
pub async fn repos_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let repo = state.repos.lock().unwrap().get_by_id(&id);
    let sessions: Vec<crate::sessions::Session> = state.sessions.lock().unwrap().get_all()
        .into_iter().filter(|s| s.repo_id == id).collect();
    for session in &sessions {
        let _ = state.sessions.lock().unwrap().delete(&session.id, &state.git);
    }
    let name = repo.as_ref().map(|r| r.name.clone()).unwrap_or_default();
    state.repos.lock().unwrap().remove(&id);
    state.activity.lock().unwrap().add(
        "repo_removed",
        &format!("Removed repository \"{}\" and {} session(s)", name, sessions.len()),
        None, Some(id),
    );
    Ok(())
}

#[tauri::command]
pub async fn repos_update(state: State<'_, AppState>, id: String, partial: serde_json::Value) -> Result<crate::repos::Repository, String> {
    state.repos.lock().unwrap().update(&id, partial)
}

#[tauri::command]
pub async fn repos_get_branches(state: State<'_, AppState>, repo_path: String) -> Result<Vec<String>, String> {
    state.git.list_branches(&repo_path)
}

#[tauri::command]
pub async fn repos_get_default_branch(state: State<'_, AppState>, repo_path: String) -> Result<String, String> {
    Ok(state.git.get_default_branch(&repo_path))
}

#[tauri::command]
pub async fn repos_fetch_origin(state: State<'_, AppState>, repo_path: String) -> Result<(), String> {
    state.git.fetch_origin(&repo_path)
}

#[tauri::command]
pub async fn repos_suggest_symlink_files(repo_path: String) -> Result<Vec<String>, String> {
    Ok(crate::repos::suggest_symlink_files(&repo_path))
}

// ── Sessions ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sessions_get_all(state: State<'_, AppState>) -> Result<Vec<crate::sessions::Session>, String> {
    Ok(state.sessions.lock().unwrap().get_all())
}

#[tauri::command]
pub async fn sessions_create(state: State<'_, AppState>, input: CreateSessionInput) -> Result<crate::sessions::Session, String> {
    let repo = state.repos.lock().unwrap().get_by_id(&input.repo_id);
    let session = state.sessions.lock().unwrap().create(input, &state.git, repo.as_ref())?;
    state.activity.lock().unwrap().add(
        "session_created",
        &format!("Created session \"{}\"", session.name),
        Some(session.id.clone()), Some(session.repo_id.clone()),
    );
    Ok(session)
}

#[tauri::command]
pub async fn sessions_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().get_by_id(&id);
    state.sessions.lock().unwrap().delete(&id, &state.git)?;
    if let Some(s) = session {
        state.activity.lock().unwrap().add(
            "session_deleted",
            &format!("Deleted session \"{}\"", s.name),
            Some(id), Some(s.repo_id),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn sessions_archive(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.sessions.lock().unwrap().archive(&id)
}

#[tauri::command]
pub async fn sessions_pin(state: State<'_, AppState>, id: String) -> Result<crate::sessions::Session, String> {
    state.sessions.lock().unwrap().pin(&id)
}

#[tauri::command]
pub async fn sessions_unpin(state: State<'_, AppState>, id: String) -> Result<crate::sessions::Session, String> {
    state.sessions.lock().unwrap().unpin(&id)
}

#[tauri::command]
pub async fn sessions_get_status(state: State<'_, AppState>, session_id: String) -> Result<crate::git::GitStatus, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    state.git.get_status(&session.worktree_path)
}

#[tauri::command]
pub async fn sessions_refresh(state: State<'_, AppState>, session_id: String) -> Result<crate::git::RebaseResult, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    let result = state.git.fetch_and_rebase(&session.worktree_path, &session.base_branch);
    state.activity.lock().unwrap().add(
        "session_synced",
        &format!("Synced session \"{}\"", session.name),
        Some(session_id), Some(session.repo_id),
    );
    Ok(result)
}

#[tauri::command]
pub async fn sessions_push(state: State<'_, AppState>, session_id: String) -> Result<crate::git::PushResult, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    let result = state.git.push_branch(&session.worktree_path, &session.branch);
    if result.success {
        state.activity.lock().unwrap().add(
            "session_synced",
            &format!("Pushed \"{}\" to origin", session.branch),
            Some(session_id), Some(session.repo_id),
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn sessions_get_pr_url(state: State<'_, AppState>, session_id: String) -> Result<Option<String>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_pr_url(&session.repo_path, &session.branch, &session.base_branch))
}

#[tauri::command]
pub async fn sessions_get_pr_info(state: State<'_, AppState>, session_id: String) -> Result<Option<crate::git::PrInfo>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_pr_info(&session.repo_path, &session.branch))
}

#[tauri::command]
pub async fn sessions_get_log(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::CommitEntry>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_commit_log(&session.worktree_path, Some(&session.base_branch)))
}

#[tauri::command]
pub async fn sessions_get_changed_files(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::ChangedFile>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_changed_files(&session.worktree_path))
}

#[tauri::command]
pub async fn sessions_get_file_diff(state: State<'_, AppState>, session_id: String, file: String) -> Result<String, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_file_diff(&session.worktree_path, &file))
}

#[tauri::command]
pub async fn sessions_get_diff_compare(state: State<'_, AppState>, session_id: String) -> Result<String, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_diff_compare(&session.worktree_path, &session.base_branch))
}

#[tauri::command]
pub async fn sessions_get_diff_stats(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::DiffStat>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_diff_stats(&session.worktree_path, &session.base_branch))
}

#[tauri::command]
pub async fn sessions_get_file_diff_vs_base(state: State<'_, AppState>, session_id: String, file: String) -> Result<String, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_file_diff_vs_base(&session.worktree_path, &session.base_branch, &file))
}

#[tauri::command]
pub async fn sessions_get_conflict_risk(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::ConflictRisk>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.get_conflict_risk(&session.worktree_path, &session.base_branch))
}

#[tauri::command]
pub async fn sessions_repair_symlinks(state: State<'_, AppState>, id: String) -> Result<crate::sessions::RepairResult, String> {
    let repo_id = state.sessions.lock().unwrap().get_by_id(&id).map(|s| s.repo_id.clone());
    let repo = repo_id.and_then(|rid| state.repos.lock().unwrap().get_by_id(&rid));
    state.sessions.lock().unwrap().repair_symlinks(&id, repo.as_ref())
}

#[tauri::command]
pub async fn sessions_repair_all_symlinks(state: State<'_, AppState>, repo_id: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let repo_mgr = state.repos.lock().unwrap();
    Ok(state.sessions.lock().unwrap().repair_all_symlinks(repo_id.as_deref(), &repo_mgr))
}

#[tauri::command]
pub async fn sessions_run_health_checks(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::HealthCheck>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.run_health_checks(&session.worktree_path))
}

#[tauri::command]
pub async fn sessions_analyze_codebase(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::git::CodeFinding>, String> {
    let session = state.sessions.lock().unwrap().get_by_id(&session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok(state.git.analyze_codebase(&session.worktree_path, &session.base_branch))
}

// ── Open in editor/terminal ──────────────────────────────────────────────────

fn get_session_path(state: &State<AppState>, session_id: &str) -> Result<(String, String), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get_by_id(session_id)
        .ok_or_else(|| "Session not found".to_string())?;
    Ok((session.worktree_path.clone(), session.name.clone()))
}

fn spawn_with_shell(cmd: &str, args: &[&str], cwd: Option<&str>) {
    let mut command;
    if cfg!(target_os = "linux") {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let full_cmd = std::iter::once(cmd.to_string())
            .chain(args.iter().map(|a| format!("\"{}\"", a.replace('"', "\\\""))))
            .collect::<Vec<_>>()
            .join(" ");
        command = std::process::Command::new(shell);
        command.args(["-lc", &full_cmd]);
    } else {
        command = std::process::Command::new(cmd);
        command.args(args);
    }
    if let Some(d) = cwd { command.current_dir(d); }
    command.stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let _ = command.spawn();
}

fn open_terminal_with_cmd(cwd: &str, run_first: Option<&str>) {
    let init_cmd = run_first.map(|c| format!("cd \"{}\" && {}; exec bash", cwd, c));
    let cd_only = format!("cd \"{}\"; exec bash", cwd);

    if cfg!(target_os = "macos") {
        let script = run_first
            .map(|c| format!("cd {} && {}", cwd.replace('"', "\\\""), c))
            .unwrap_or_else(|| format!("cd {}", cwd.replace('"', "\\\"")));
        let _ = std::process::Command::new("osascript")
            .args(["-e", &format!("tell application \"Terminal\" to do script \"{}\"", script),
                   "-e", "tell application \"Terminal\" to activate"])
            .spawn();
        return;
    }

    if cfg!(target_os = "windows") {
        let cmd = run_first
            .map(|c| format!("cd /d \"{}\" && {}", cwd, c))
            .unwrap_or_else(|| format!("cd /d \"{}\"", cwd));
        let _ = std::process::Command::new("cmd.exe")
            .args(["/c", "start", "cmd.exe", "/K", &cmd])
            .spawn();
        return;
    }

    // Linux
    let bash_cmd = init_cmd.as_deref().unwrap_or(&cd_only);
    let terminals: Vec<(&str, Vec<String>)> = vec![
        ("gnome-terminal", vec!["--".to_string(), "bash".to_string(), "-c".to_string(), bash_cmd.to_string()]),
        ("konsole", vec!["-e".to_string(), "bash".to_string(), "-c".to_string(), bash_cmd.to_string()]),
        ("xfce4-terminal", vec!["-e".to_string(), format!("bash -c '{}'", bash_cmd)]),
        ("xterm", vec!["-e".to_string(), format!("bash -c \"{}\"", bash_cmd)]),
    ];

    for (term, args) in &terminals {
        if std::process::Command::new("which").arg(term).output()
            .map(|o| o.status.success()).unwrap_or(false)
        {
            let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            let _ = std::process::Command::new(term).args(&str_args)
                .current_dir(cwd)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();
            return;
        }
    }
}

fn open_tui_in_terminal(cwd: &str, tui_cmd: &str) {
    open_terminal_with_cmd(cwd, Some(&format!("{}; exec bash", tui_cmd)));
}

#[tauri::command]
pub async fn sessions_open_in_vscode(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    spawn_with_shell("code", &[&path], None);
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in VS Code", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_cursor(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    spawn_with_shell("cursor", &[&path], None);
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in Cursor", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_claude(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    open_tui_in_terminal(&path, "claude");
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in Claude Code", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_intellij(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    spawn_with_shell("idea", &[&path], None);
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in IntelliJ IDEA", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_codex(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    open_tui_in_terminal(&path, "codex");
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in Codex CLI", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_terminal(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, name) = get_session_path(&state, &session_id)?;
    let repo = {
        let sessions = state.sessions.lock().unwrap();
        let session = sessions.get_by_id(&session_id);
        session.and_then(|s| state.repos.lock().unwrap().get_by_id(&s.repo_id))
    };
    let setup_cmd = state.sessions.lock().unwrap().get_setup_cmd(&session_id, repo.as_ref());
    open_terminal_with_cmd(&path, setup_cmd.as_deref());
    state.sessions.lock().unwrap().mark_opened(&session_id);
    state.activity.lock().unwrap().add("session_opened", &format!("Opened \"{}\" in Terminal", name), Some(session_id), None);
    Ok(())
}

#[tauri::command]
pub async fn sessions_open_in_finder(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let (path, _) = get_session_path(&state, &session_id)?;
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    } else if cfg!(target_os = "windows") {
        let _ = std::process::Command::new("explorer").arg(&path).spawn();
    } else {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    Ok(())
}

// ── Settings ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn settings_get(state: State<'_, AppState>) -> Result<crate::settings::Settings, String> {
    Ok(state.settings.lock().unwrap().get())
}

#[tauri::command]
pub async fn settings_update(state: State<'_, AppState>, partial: serde_json::Value) -> Result<crate::settings::Settings, String> {
    Ok(state.settings.lock().unwrap().update(partial))
}

#[tauri::command]
pub async fn settings_pick_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file();
    if let Some(home) = dirs::home_dir() {
        builder = builder.set_directory(home);
    }
    let result = builder.blocking_pick_folder();
    Ok(result.map(|p| p.to_string()))
}

// ── Activity ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn activity_get_all(state: State<'_, AppState>, limit: Option<usize>) -> Result<Vec<crate::activity::ActivityEntry>, String> {
    Ok(state.activity.lock().unwrap().get_all(limit.unwrap_or(100)))
}

#[tauri::command]
pub async fn activity_get_for_session(state: State<'_, AppState>, session_id: String) -> Result<Vec<crate::activity::ActivityEntry>, String> {
    Ok(state.activity.lock().unwrap().get_for_session(&session_id))
}

// ── Git ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_get_branch_merge_status(state: State<'_, AppState>, repo_path: String, branch: String, base_branch: String) -> Result<String, String> {
    Ok(state.git.get_branch_merge_status(&repo_path, &branch, &base_branch))
}

// ── Tickets ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn tickets_fetch_all(state: State<'_, AppState>, project_key: Option<String>, integration: Option<String>) -> Result<Vec<crate::tickets::Ticket>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_all(&settings, project_key.as_deref(), integration.as_deref()).await
}

#[tauri::command]
pub async fn tickets_search_jira(state: State<'_, AppState>, query: String, project_key: Option<String>) -> Result<Vec<crate::tickets::Ticket>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.search_jira(&settings, &query, project_key.as_deref()).await
}

#[tauri::command]
pub async fn tickets_search_shortcut(state: State<'_, AppState>, query: String) -> Result<Vec<crate::tickets::Ticket>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.search_shortcut(&settings, &query).await
}

#[tauri::command]
pub async fn tickets_search_clickup(state: State<'_, AppState>, query: String) -> Result<Vec<crate::tickets::Ticket>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.search_clickup(&settings, &query).await
}

#[tauri::command]
pub async fn tickets_fetch_jira_projects(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_jira_projects(&settings).await
}

#[tauri::command]
pub async fn tickets_fetch_jira_issue_types(state: State<'_, AppState>, project_key: String) -> Result<Vec<crate::tickets::JiraIssueTypeMeta>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_jira_issue_types(&settings, &project_key).await
}

#[tauri::command]
pub async fn tickets_fetch_jira_assignable_users(state: State<'_, AppState>, project_key: String) -> Result<Vec<crate::tickets::JiraUser>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_jira_assignable_users(&settings, &project_key).await
}

#[tauri::command]
pub async fn tickets_create_jira(state: State<'_, AppState>, project_key: String, summary: String, issue_type_id: String, extra_fields: serde_json::Value) -> Result<crate::tickets::Ticket, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.create_jira_ticket(&settings, &project_key, &summary, &issue_type_id, extra_fields).await
}

#[tauri::command]
pub async fn tickets_fetch_shortcut_projects(state: State<'_, AppState>) -> Result<Vec<crate::tickets::ShortcutProject>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_shortcut_projects(&settings).await
}

#[tauri::command]
pub async fn tickets_fetch_shortcut_workflow_states(state: State<'_, AppState>) -> Result<Vec<crate::tickets::ShortcutWorkflowState>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_shortcut_workflow_states(&settings).await
}

#[tauri::command]
pub async fn tickets_create_shortcut(state: State<'_, AppState>, name: String, project_id: i64, story_type: String, description: Option<String>, workflow_state_id: Option<i64>) -> Result<crate::tickets::Ticket, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.create_shortcut_story(&settings, &name, project_id, &story_type, description.as_deref(), workflow_state_id).await
}

#[tauri::command]
pub async fn tickets_fetch_clickup_spaces(state: State<'_, AppState>) -> Result<Vec<crate::tickets::ClickUpSpace>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_clickup_spaces(&settings).await
}

#[tauri::command]
pub async fn tickets_fetch_clickup_lists(state: State<'_, AppState>, space_id: String) -> Result<Vec<crate::tickets::ClickUpList>, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.fetch_clickup_lists(&settings, &space_id).await
}

#[tauri::command]
pub async fn tickets_create_clickup(state: State<'_, AppState>, list_id: String, name: String, description: Option<String>) -> Result<crate::tickets::Ticket, String> {
    let settings = state.settings.lock().unwrap().get();
    let svc = crate::tickets::TicketService::new();
    svc.create_clickup_task(&settings, &list_id, &name, description.as_deref()).await
}

#[tauri::command]
pub async fn tickets_is_jira_configured(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().unwrap().get();
    Ok(crate::tickets::TicketService::is_jira_configured(&settings))
}

#[tauri::command]
pub async fn tickets_is_shortcut_configured(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().unwrap().get();
    Ok(crate::tickets::TicketService::is_shortcut_configured(&settings))
}

#[tauri::command]
pub async fn tickets_is_clickup_configured(state: State<'_, AppState>) -> Result<bool, String> {
    let settings = state.settings.lock().unwrap().get();
    Ok(crate::tickets::TicketService::is_clickup_configured(&settings))
}
