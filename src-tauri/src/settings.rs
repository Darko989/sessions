use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub default_base_branch: String,
    pub default_editor: String,
    pub sessions_directory: String,
    pub jira_base_url: String,
    pub jira_email: String,
    pub jira_api_token: String,
    pub shortcut_api_token: String,
    pub clickup_api_token: String,
    pub clickup_team_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        let sessions_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".branchless")
            .join("workspaces");
        Self {
            default_base_branch: "main".to_string(),
            default_editor: "vscode".to_string(),
            sessions_directory: sessions_dir.to_string_lossy().to_string(),
            jira_base_url: String::new(),
            jira_email: String::new(),
            jira_api_token: String::new(),
            shortcut_api_token: String::new(),
            clickup_api_token: String::new(),
            clickup_team_id: String::new(),
        }
    }
}

pub struct SettingsStore {
    file_path: PathBuf,
    data: Settings,
}

impl SettingsStore {
    pub fn new() -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".branchless");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("settings.json");
        let data = Self::load_from(&file_path);
        Self { file_path, data }
    }

    fn load_from(path: &PathBuf) -> Settings {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(settings) = serde_json::from_str(&content) {
                return settings;
            }
        }
        Settings::default()
    }

    fn persist(&self) {
        let tmp = format!("{}.tmp", self.file_path.display());
        if let Ok(json) = serde_json::to_string_pretty(&self.data) {
            let _ = fs::write(&tmp, &json);
            let _ = fs::rename(&tmp, &self.file_path);
        }
    }

    pub fn get(&self) -> Settings {
        self.data.clone()
    }

    pub fn update(&mut self, partial: serde_json::Value) -> Settings {
        if let Ok(mut current) = serde_json::to_value(&self.data) {
            if let Some(obj) = partial.as_object() {
                if let Some(cur_obj) = current.as_object_mut() {
                    for (k, v) in obj {
                        cur_obj.insert(k.clone(), v.clone());
                    }
                }
            }
            if let Ok(updated) = serde_json::from_value(current) {
                self.data = updated;
                self.persist();
            }
        }
        self.data.clone()
    }
}
