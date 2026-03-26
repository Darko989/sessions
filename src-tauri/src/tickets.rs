use serde::{Deserialize, Serialize};


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ticket {
    pub id: String,
    pub key: String,
    pub title: String,
    pub status: String,
    #[serde(rename = "type")]
    pub ticket_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraIssueTypeMeta {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    pub fields: Vec<JiraFieldMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraFieldMeta {
    pub field_id: String,
    pub name: String,
    pub required: bool,
    pub schema: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_values: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JiraUser {
    pub account_id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutProject {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutWorkflowState {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub state_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickUpSpace {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickUpList {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<ClickUpFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClickUpFolder {
    pub id: String,
    pub name: String,
}

pub struct TicketService {
    client: reqwest::Client,
}

impl TicketService {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    // ── HTTP helpers ─────────────────────────────────────────────────────────

    async fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<serde_json::Value, String> {
        let mut req = self.client.get(url);
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("HTTP {}: {}", status, &body[..body.len().min(200)]));
        }
        serde_json::from_str(&body).map_err(|_| "Invalid JSON response".to_string())
    }

    async fn post(&self, url: &str, headers: &[(&str, &str)], body: &serde_json::Value) -> Result<serde_json::Value, String> {
        let mut req = self.client.post(url).json(body);
        for (k, v) in headers {
            req = req.header(*k, *v);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("HTTP {}: {}", status, &text[..text.len().min(200)]));
        }
        Ok(serde_json::from_str::<serde_json::Value>(&text)
            .unwrap_or_else(|_| serde_json::json!({})))

    }

    // ── JIRA ─────────────────────────────────────────────────────────────────

    fn jira_auth(settings: &crate::settings::Settings) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", settings.jira_email, settings.jira_api_token))
    }

    fn jira_base(settings: &crate::settings::Settings) -> String {
        settings.jira_base_url.trim_end_matches('/').to_string()
    }

    fn jira_headers(settings: &crate::settings::Settings) -> Vec<(&'static str, String)> {
        vec![
            ("Authorization", format!("Basic {}", Self::jira_auth(settings))),
            ("Accept", "application/json".to_string()),
        ]
    }

    pub async fn fetch_jira_tickets(&self, settings: &crate::settings::Settings, project_key: Option<&str>) -> Result<Vec<Ticket>, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() || settings.jira_email.is_empty() || settings.jira_api_token.is_empty() {
            return Ok(vec![]);
        }
        let project_filter = project_key.map(|k| format!("project = \"{}\" AND ", k)).unwrap_or_default();
        let jql_raw = format!("{}statusCategory != Done ORDER BY updated DESC", project_filter);
        let jql = urlencoding::encode(&jql_raw);
        let url = format!("{}/rest/api/3/search/jql?jql={}&maxResults=100&fields=summary,status,issuetype", base, jql);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let issues = data["issues"].as_array().cloned().unwrap_or_default();
        Ok(issues.iter().map(|issue| Ticket {
            id: issue["id"].as_str().unwrap_or("").to_string(),
            key: issue["key"].as_str().unwrap_or("").to_string(),
            title: issue["fields"]["summary"].as_str().unwrap_or("").to_string(),
            status: issue["fields"]["status"]["name"].as_str().unwrap_or("").to_string(),
            ticket_type: "jira".to_string(),
            url: Some(format!("{}/browse/{}", base, issue["key"].as_str().unwrap_or(""))),
        }).collect())
    }

    pub async fn search_jira(&self, settings: &crate::settings::Settings, query: &str, project_key: Option<&str>) -> Result<Vec<Ticket>, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() || settings.jira_email.is_empty() || settings.jira_api_token.is_empty() {
            return Ok(vec![]);
        }
        let project_filter = project_key.map(|k| format!("project = \"{}\" AND ", k)).unwrap_or_default();
        let clean_query = query.replace('"', "");
        let jql_raw = format!("{}text ~ \"{}\" ORDER BY updated DESC", project_filter, clean_query);
        let jql = urlencoding::encode(&jql_raw);
        let url = format!("{}/rest/api/3/search/jql?jql={}&maxResults=20&fields=summary,status,issuetype", base, jql);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let issues = data["issues"].as_array().cloned().unwrap_or_default();
        Ok(issues.iter().map(|issue| Ticket {
            id: issue["id"].as_str().unwrap_or("").to_string(),
            key: issue["key"].as_str().unwrap_or("").to_string(),
            title: issue["fields"]["summary"].as_str().unwrap_or("").to_string(),
            status: issue["fields"]["status"]["name"].as_str().unwrap_or("").to_string(),
            ticket_type: "jira".to_string(),
            url: Some(format!("{}/browse/{}", base, issue["key"].as_str().unwrap_or(""))),
        }).collect())
    }

    pub async fn fetch_jira_projects(&self, settings: &crate::settings::Settings) -> Result<Vec<serde_json::Value>, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() { return Ok(vec![]); }
        let url = format!("{}/rest/api/3/project/search?maxResults=100&orderBy=name", base);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;
        Ok(data["values"].as_array().cloned().unwrap_or_default()
            .iter()
            .map(|p| serde_json::json!({ "key": p["key"], "name": p["name"] }))
            .collect())
    }

    pub async fn fetch_jira_issue_types(&self, settings: &crate::settings::Settings, project_key: &str) -> Result<Vec<JiraIssueTypeMeta>, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() { return Ok(vec![]); }
        let url = format!("{}/rest/api/3/issue/createmeta/{}/issuetypes", base, project_key);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let issue_types = data["issueTypes"].as_array().cloned().unwrap_or_default();
        let mut results = Vec::new();
        for it in &issue_types {
            let it_id = it["id"].as_str().unwrap_or("").to_string();
            let it_name = it["name"].as_str().unwrap_or("").to_string();
            let it_icon = it["iconUrl"].as_str().map(|s| s.to_string());

            let fields_url = format!("{}/rest/api/3/issue/createmeta/{}/issuetypes/{}", base, project_key, it_id);
            let fields_data = self.get(&fields_url, &h).await.unwrap_or(serde_json::json!({}));
            let fields = fields_data["fields"].as_array().cloned().unwrap_or_default();

            results.push(JiraIssueTypeMeta {
                id: it_id,
                name: it_name,
                icon_url: it_icon,
                fields: fields.iter().filter_map(|f| {
                    let schema_type = f["schema"]["type"].as_str().unwrap_or("");
                    let system = f["schema"]["system"].as_str().unwrap_or("");
                    let valid = ["string", "number", "option", "priority", "user", "array", "date", "datetime"].contains(&schema_type)
                        || system == "description";
                    if valid {
                        Some(JiraFieldMeta {
                            field_id: f["fieldId"].as_str().unwrap_or("").to_string(),
                            name: f["name"].as_str().unwrap_or("").to_string(),
                            required: f["required"].as_bool().unwrap_or(false),
                            schema: f["schema"].clone(),
                            allowed_values: f["allowedValues"].as_array().cloned(),
                        })
                    } else {
                        None
                    }
                }).collect(),
            });
        }
        Ok(results)
    }

    pub async fn fetch_jira_assignable_users(&self, settings: &crate::settings::Settings, project_key: &str) -> Result<Vec<JiraUser>, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() { return Ok(vec![]); }
        let url = format!("{}/rest/api/3/user/assignable/search?project={}&maxResults=100", base, project_key);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let users = data.as_array().cloned().unwrap_or_default();
        Ok(users.iter().map(|u| JiraUser {
            account_id: u["accountId"].as_str().unwrap_or("").to_string(),
            display_name: u["displayName"].as_str().unwrap_or("").to_string(),
            avatar_url: u["avatarUrls"]["24x24"].as_str().map(|s| s.to_string()),
        }).collect())
    }

    pub async fn create_jira_ticket(&self, settings: &crate::settings::Settings, project_key: &str, summary: &str, issue_type_id: &str, extra_fields: serde_json::Value) -> Result<Ticket, String> {
        let base = Self::jira_base(settings);
        if base.is_empty() { return Err("JIRA not configured".to_string()); }

        let mut fields = serde_json::json!({
            "project": { "key": project_key },
            "summary": summary,
            "issuetype": { "id": issue_type_id }
        });
        if let Some(extra) = extra_fields.as_object() {
            if let Some(obj) = fields.as_object_mut() {
                for (k, v) in extra {
                    obj.insert(k.clone(), v.clone());
                }
            }
        }

        let url = format!("{}/rest/api/3/issue", base);
        let hdrs = Self::jira_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let result = self.post(&url, &h, &serde_json::json!({ "fields": fields })).await?;

        let key = result["key"].as_str().unwrap_or("").to_string();
        Ok(Ticket {
            id: result["id"].as_str().unwrap_or("").to_string(),
            key: key.clone(),
            title: summary.to_string(),
            status: "To Do".to_string(),
            ticket_type: "jira".to_string(),
            url: Some(format!("{}/browse/{}", base, key)),
        })
    }

    pub fn is_jira_configured(settings: &crate::settings::Settings) -> bool {
        !settings.jira_base_url.is_empty() && !settings.jira_email.is_empty() && !settings.jira_api_token.is_empty()
    }

    // ── Shortcut ─────────────────────────────────────────────────────────────

    fn shortcut_headers(settings: &crate::settings::Settings) -> Vec<(&'static str, String)> {
        vec![
            ("Shortcut-Token", settings.shortcut_api_token.clone()),
            ("Content-Type", "application/json".to_string()),
        ]
    }

    pub async fn fetch_shortcut_tickets(&self, settings: &crate::settings::Settings) -> Result<Vec<Ticket>, String> {
        if settings.shortcut_api_token.is_empty() { return Ok(vec![]); }
        let hdrs = Self::shortcut_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(
            "https://api.app.shortcut.com/api/v3/search/stories?query=is:assigned+!is:done&page_size=50",
            &h,
        ).await?;

        let stories = data["data"].as_array().cloned().unwrap_or_default();
        Ok(stories.iter().map(|s| Ticket {
            id: s["id"].to_string(),
            key: format!("SC-{}", s["id"]),
            title: s["name"].as_str().unwrap_or("").to_string(),
            status: "In Progress".to_string(),
            ticket_type: "shortcut".to_string(),
            url: s["app_url"].as_str().map(|u| u.to_string()),
        }).collect())
    }

    pub async fn search_shortcut(&self, settings: &crate::settings::Settings, query: &str) -> Result<Vec<Ticket>, String> {
        if settings.shortcut_api_token.is_empty() { return Ok(vec![]); }
        let query_raw = format!("{} !is:done", query);
        let encoded = urlencoding::encode(&query_raw);
        let url = format!("https://api.app.shortcut.com/api/v3/search/stories?query={}&page_size=20", encoded);
        let hdrs = Self::shortcut_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let stories = data["data"].as_array().cloned().unwrap_or_default();
        Ok(stories.iter().map(|s| Ticket {
            id: s["id"].to_string(),
            key: format!("SC-{}", s["id"]),
            title: s["name"].as_str().unwrap_or("").to_string(),
            status: "Active".to_string(),
            ticket_type: "shortcut".to_string(),
            url: s["app_url"].as_str().map(|u| u.to_string()),
        }).collect())
    }

    pub async fn fetch_shortcut_projects(&self, settings: &crate::settings::Settings) -> Result<Vec<ShortcutProject>, String> {
        if settings.shortcut_api_token.is_empty() { return Ok(vec![]); }
        let hdrs = Self::shortcut_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get("https://api.app.shortcut.com/api/v3/projects", &h).await?;

        let projects = data.as_array().cloned().unwrap_or_default();
        Ok(projects.iter().map(|p| ShortcutProject {
            id: p["id"].as_i64().unwrap_or(0),
            name: p["name"].as_str().unwrap_or("").to_string(),
        }).collect())
    }

    pub async fn fetch_shortcut_workflow_states(&self, settings: &crate::settings::Settings) -> Result<Vec<ShortcutWorkflowState>, String> {
        if settings.shortcut_api_token.is_empty() { return Ok(vec![]); }
        let hdrs = Self::shortcut_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get("https://api.app.shortcut.com/api/v3/workflows", &h).await?;

        let workflows = data.as_array().cloned().unwrap_or_default();
        let mut states = Vec::new();
        for wf in &workflows {
            for s in wf["states"].as_array().cloned().unwrap_or_default() {
                states.push(ShortcutWorkflowState {
                    id: s["id"].as_i64().unwrap_or(0),
                    name: s["name"].as_str().unwrap_or("").to_string(),
                    state_type: s["type"].as_str().unwrap_or("").to_string(),
                });
            }
        }
        Ok(states)
    }

    pub async fn create_shortcut_story(&self, settings: &crate::settings::Settings, name: &str, project_id: i64, story_type: &str, description: Option<&str>, workflow_state_id: Option<i64>) -> Result<Ticket, String> {
        if settings.shortcut_api_token.is_empty() { return Err("Shortcut not configured".to_string()); }
        let mut body = serde_json::json!({
            "name": name,
            "project_id": project_id,
            "story_type": story_type
        });
        if let Some(desc) = description {
            body["description"] = serde_json::json!(desc);
        }
        if let Some(ws_id) = workflow_state_id {
            body["workflow_state_id"] = serde_json::json!(ws_id);
        }

        let hdrs = Self::shortcut_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let result = self.post("https://api.app.shortcut.com/api/v3/stories", &h, &body).await?;

        Ok(Ticket {
            id: result["id"].to_string(),
            key: format!("SC-{}", result["id"]),
            title: name.to_string(),
            status: "Unstarted".to_string(),
            ticket_type: "shortcut".to_string(),
            url: result["app_url"].as_str().map(|u| u.to_string()),
        })
    }

    pub fn is_shortcut_configured(settings: &crate::settings::Settings) -> bool {
        !settings.shortcut_api_token.is_empty()
    }

    // ── ClickUp ──────────────────────────────────────────────────────────────

    fn clickup_headers(settings: &crate::settings::Settings) -> Vec<(&'static str, String)> {
        vec![
            ("Authorization", settings.clickup_api_token.clone()),
            ("Content-Type", "application/json".to_string()),
        ]
    }

    pub async fn fetch_clickup_tasks(&self, settings: &crate::settings::Settings) -> Result<Vec<Ticket>, String> {
        if settings.clickup_api_token.is_empty() || settings.clickup_team_id.is_empty() { return Ok(vec![]); }
        let url = format!(
            "https://api.clickup.com/api/v2/team/{}/task?statuses[]=open&statuses[]=in+progress&statuses[]=to+do&subtasks=true&include_closed=false&order_by=updated&reverse=true&page=0",
            settings.clickup_team_id
        );
        let hdrs = Self::clickup_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let tasks = data["tasks"].as_array().cloned().unwrap_or_default();
        Ok(tasks.iter().map(|t| {
            let id = t["id"].as_str().unwrap_or("").to_string();
            Ticket {
                key: t["custom_id"].as_str().map(|s| s.to_string())
                    .unwrap_or_else(|| format!("CU-{}", &id[id.len().saturating_sub(6)..])),
                id,
                title: t["name"].as_str().unwrap_or("").to_string(),
                status: t["status"]["status"].as_str().unwrap_or("").to_string(),
                ticket_type: "clickup".to_string(),
                url: t["url"].as_str().map(|u| u.to_string()),
            }
        }).collect())
    }

    pub async fn search_clickup(&self, settings: &crate::settings::Settings, query: &str) -> Result<Vec<Ticket>, String> {
        if settings.clickup_api_token.is_empty() || settings.clickup_team_id.is_empty() { return Ok(vec![]); }
        let url = format!(
            "https://api.clickup.com/api/v2/team/{}/task?name={}&include_closed=false&page=0",
            settings.clickup_team_id, urlencoding::encode(query)
        );
        let hdrs = Self::clickup_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let tasks = data["tasks"].as_array().cloned().unwrap_or_default();
        Ok(tasks.iter().map(|t| {
            let id = t["id"].as_str().unwrap_or("").to_string();
            Ticket {
                key: t["custom_id"].as_str().map(|s| s.to_string())
                    .unwrap_or_else(|| format!("CU-{}", &id[id.len().saturating_sub(6)..])),
                id,
                title: t["name"].as_str().unwrap_or("").to_string(),
                status: t["status"]["status"].as_str().unwrap_or("").to_string(),
                ticket_type: "clickup".to_string(),
                url: t["url"].as_str().map(|u| u.to_string()),
            }
        }).collect())
    }

    pub async fn fetch_clickup_spaces(&self, settings: &crate::settings::Settings) -> Result<Vec<ClickUpSpace>, String> {
        if settings.clickup_api_token.is_empty() || settings.clickup_team_id.is_empty() { return Ok(vec![]); }
        let url = format!("https://api.clickup.com/api/v2/team/{}/space?archived=false", settings.clickup_team_id);
        let hdrs = Self::clickup_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let data = self.get(&url, &h).await?;

        let spaces = data["spaces"].as_array().cloned().unwrap_or_default();
        Ok(spaces.iter().map(|s| ClickUpSpace {
            id: s["id"].as_str().unwrap_or("").to_string(),
            name: s["name"].as_str().unwrap_or("").to_string(),
        }).collect())
    }

    pub async fn fetch_clickup_lists(&self, settings: &crate::settings::Settings, space_id: &str) -> Result<Vec<ClickUpList>, String> {
        if settings.clickup_api_token.is_empty() { return Ok(vec![]); }
        let hdrs = Self::clickup_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();

        // Folderless lists
        let folderless_url = format!("https://api.clickup.com/api/v2/space/{}/list?archived=false", space_id);
        let folderless = self.get(&folderless_url, &h).await.unwrap_or(serde_json::json!({}));
        let mut lists: Vec<ClickUpList> = folderless["lists"].as_array().cloned().unwrap_or_default()
            .iter()
            .map(|l| ClickUpList {
                id: l["id"].as_str().unwrap_or("").to_string(),
                name: l["name"].as_str().unwrap_or("").to_string(),
                folder: None,
            })
            .collect();

        // Folders and their lists
        let folders_url = format!("https://api.clickup.com/api/v2/space/{}/folder?archived=false", space_id);
        let folders_data = self.get(&folders_url, &h).await.unwrap_or(serde_json::json!({}));
        for folder in folders_data["folders"].as_array().cloned().unwrap_or_default() {
            let folder_id = folder["id"].as_str().unwrap_or("").to_string();
            let folder_name = folder["name"].as_str().unwrap_or("").to_string();
            for l in folder["lists"].as_array().cloned().unwrap_or_default() {
                lists.push(ClickUpList {
                    id: l["id"].as_str().unwrap_or("").to_string(),
                    name: l["name"].as_str().unwrap_or("").to_string(),
                    folder: Some(ClickUpFolder { id: folder_id.clone(), name: folder_name.clone() }),
                });
            }
        }
        Ok(lists)
    }

    pub async fn create_clickup_task(&self, settings: &crate::settings::Settings, list_id: &str, name: &str, description: Option<&str>) -> Result<Ticket, String> {
        if settings.clickup_api_token.is_empty() { return Err("ClickUp not configured".to_string()); }
        let mut body = serde_json::json!({ "name": name });
        if let Some(desc) = description {
            body["description"] = serde_json::json!(desc);
        }
        let url = format!("https://api.clickup.com/api/v2/list/{}/task", list_id);
        let hdrs = Self::clickup_headers(settings);
        let h: Vec<(&str, &str)> = hdrs.iter().map(|(k, v)| (*k, v.as_str())).collect();
        let result = self.post(&url, &h, &body).await?;

        let id = result["id"].as_str().unwrap_or("").to_string();
        Ok(Ticket {
            key: result["custom_id"].as_str().map(|s| s.to_string())
                .unwrap_or_else(|| format!("CU-{}", &id[id.len().saturating_sub(6)..])),
            id,
            title: name.to_string(),
            status: "Open".to_string(),
            ticket_type: "clickup".to_string(),
            url: result["url"].as_str().map(|u| u.to_string()),
        })
    }

    pub fn is_clickup_configured(settings: &crate::settings::Settings) -> bool {
        !settings.clickup_api_token.is_empty() && !settings.clickup_team_id.is_empty()
    }

    // ── Combined ─────────────────────────────────────────────────────────────

    pub async fn fetch_all(&self, settings: &crate::settings::Settings, project_key: Option<&str>, integration: Option<&str>) -> Result<Vec<Ticket>, String> {
        match integration {
            Some("jira") => self.fetch_jira_tickets(settings, project_key).await,
            Some("shortcut") => self.fetch_shortcut_tickets(settings).await,
            Some("clickup") => self.fetch_clickup_tasks(settings).await,
            _ => {
                let jira = self.fetch_jira_tickets(settings, project_key).await.unwrap_or_default();
                let shortcut = self.fetch_shortcut_tickets(settings).await.unwrap_or_default();
                let clickup = self.fetch_clickup_tasks(settings).await.unwrap_or_default();
                let mut all = jira;
                all.extend(shortcut);
                all.extend(clickup);
                Ok(all)
            }
        }
    }
}
