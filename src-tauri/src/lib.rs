mod git;
mod repos;
mod sessions;
mod settings;
mod activity;
mod tickets;
mod commands;

use std::sync::Mutex;

pub struct AppState {
    pub git: git::GitService,
    pub repos: Mutex<repos::RepoManager>,
    pub sessions: Mutex<sessions::SessionManager>,
    pub settings: Mutex<settings::SettingsStore>,
    pub activity: Mutex<activity::ActivityLog>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = settings::SettingsStore::new();
    let git = git::GitService::new();
    let repos = repos::RepoManager::new();
    let sessions = sessions::SessionManager::new(settings.get().sessions_directory.clone());
    let activity = activity::ActivityLog::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            git,
            repos: Mutex::new(repos),
            sessions: Mutex::new(sessions),
            settings: Mutex::new(settings),
            activity: Mutex::new(activity),
        })
        .invoke_handler(tauri::generate_handler![
            // Repos
            commands::repos_get_all,
            commands::repos_add,
            commands::repos_remove,
            commands::repos_update,
            commands::repos_get_branches,
            commands::repos_get_default_branch,
            commands::repos_fetch_origin,
            commands::repos_suggest_symlink_files,
            // Sessions
            commands::sessions_get_all,
            commands::sessions_create,
            commands::sessions_delete,
            commands::sessions_archive,
            commands::sessions_pin,
            commands::sessions_unpin,
            commands::sessions_get_status,
            commands::sessions_refresh,
            commands::sessions_push,
            commands::sessions_get_pr_url,
            commands::sessions_get_pr_info,
            commands::sessions_get_log,
            commands::sessions_get_changed_files,
            commands::sessions_get_file_diff,
            commands::sessions_get_diff_compare,
            commands::sessions_get_diff_stats,
            commands::sessions_get_file_diff_vs_base,
            commands::sessions_get_conflict_risk,
            commands::sessions_repair_symlinks,
            commands::sessions_repair_all_symlinks,
            commands::sessions_run_health_checks,
            commands::sessions_analyze_codebase,
            // Open in
            commands::sessions_open_in_vscode,
            commands::sessions_open_in_cursor,
            commands::sessions_open_in_claude,
            commands::sessions_open_in_intellij,
            commands::sessions_open_in_codex,
            commands::sessions_open_in_terminal,
            commands::sessions_open_in_finder,
            // Settings
            commands::settings_get,
            commands::settings_update,
            commands::settings_pick_directory,
            // Activity
            commands::activity_get_all,
            commands::activity_get_for_session,
            // Git
            commands::git_get_branch_merge_status,
            // Tickets
            commands::tickets_fetch_all,
            commands::tickets_search_jira,
            commands::tickets_search_shortcut,
            commands::tickets_search_clickup,
            commands::tickets_fetch_jira_projects,
            commands::tickets_fetch_jira_issue_types,
            commands::tickets_fetch_jira_assignable_users,
            commands::tickets_create_jira,
            commands::tickets_fetch_shortcut_projects,
            commands::tickets_fetch_shortcut_workflow_states,
            commands::tickets_create_shortcut,
            commands::tickets_fetch_clickup_spaces,
            commands::tickets_fetch_clickup_lists,
            commands::tickets_create_clickup,
            commands::tickets_is_jira_configured,
            commands::tickets_is_shortcut_configured,
            commands::tickets_is_clickup_configured,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
