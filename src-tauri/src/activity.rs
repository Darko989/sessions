use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_id: Option<String>,
    pub message: String,
    pub timestamp: String,
}

pub struct ActivityLog {
    file_path: PathBuf,
    entries: Vec<ActivityEntry>,
}

impl ActivityLog {
    pub fn new() -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".branchless");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("activity.json");
        let entries = Self::load_from(&file_path);
        Self { file_path, entries }
    }

    fn load_from(path: &PathBuf) -> Vec<ActivityEntry> {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(entries) = serde_json::from_str(&content) {
                return entries;
            }
        }
        Vec::new()
    }

    fn persist(&self) {
        if let Ok(json) = serde_json::to_string_pretty(&self.entries) {
            let _ = fs::write(&self.file_path, &json);
        }
    }

    pub fn add(
        &mut self,
        activity_type: &str,
        message: &str,
        session_id: Option<String>,
        repo_id: Option<String>,
    ) -> ActivityEntry {
        let entry = ActivityEntry {
            id: format!("act_{}_{}", chrono::Utc::now().timestamp_millis(), rand_suffix()),
            activity_type: activity_type.to_string(),
            session_id,
            repo_id,
            message: message.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };
        self.entries.insert(0, entry.clone());
        if self.entries.len() > 500 {
            self.entries.truncate(500);
        }
        self.persist();
        entry
    }

    pub fn get_all(&self, limit: usize) -> Vec<ActivityEntry> {
        self.entries.iter().take(limit).cloned().collect()
    }

    pub fn get_for_session(&self, session_id: &str) -> Vec<ActivityEntry> {
        self.entries
            .iter()
            .filter(|e| e.session_id.as_deref() == Some(session_id))
            .cloned()
            .collect()
    }
}

fn rand_suffix() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..5)
        .map(|_| {
            let idx = rng.gen_range(0..36);
            if idx < 10 { (b'0' + idx) as char } else { (b'a' + idx - 10) as char }
        })
        .collect()
}
