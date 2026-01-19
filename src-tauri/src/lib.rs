// mensa - Tauri backend

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

/// Active query tracking for cancellation support
pub struct ActiveQuery {
    pub child: tokio::process::Child,
    pub started_at: std::time::Instant,
}

/// Application state for managing concurrent queries
#[derive(Default)]
pub struct AppState {
    pub active_queries: Arc<Mutex<HashMap<String, ActiveQuery>>>,
}

/// Payload wrapper for stream events with query ID
#[derive(Clone, Serialize)]
struct StreamPayload {
    query_id: String,
    data: String,
}

/// Find the node binary in common macOS installation locations.
/// When launched from Finder/Launchpad, macOS apps don't inherit shell PATH,
/// so we need to check common locations directly.
fn find_node_binary() -> String {
    let home = std::env::var("HOME").unwrap_or_default();

    // Common node installation paths on macOS
    let common_paths = [
        // Homebrew Apple Silicon
        "/opt/homebrew/bin/node",
        // Homebrew Intel
        "/usr/local/bin/node",
        // System
        "/usr/bin/node",
    ];

    // Check common paths first
    for path in &common_paths {
        if Path::new(path).exists() {
            return path.to_string();
        }
    }

    // Check nvm installations (common versions)
    if !home.is_empty() {
        let nvm_base = PathBuf::from(&home).join(".nvm/versions/node");
        if nvm_base.exists() {
            // Try to find any installed node version
            if let Ok(entries) = std::fs::read_dir(&nvm_base) {
                let mut versions: Vec<_> = entries
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir())
                    .collect();
                // Sort by name descending to get latest version first
                versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                for entry in versions {
                    let node_path = entry.path().join("bin/node");
                    if node_path.exists() {
                        return node_path.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    // Fallback to PATH-based resolution
    "node".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionEntry {
    session_id: String,
    first_prompt: String,
    message_count: u32,
    created: String,
    modified: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SessionsIndex {
    entries: Vec<SessionEntry>,
}

#[tauri::command]
async fn delete_session(workspace_path: String, session_id: String) -> Result<bool, String> {
    let sanitized = workspace_path.replace("/", "-");
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let sessions_index_path = format!("{}/.claude/projects/{}/sessions-index.json", home, sanitized);
    let session_file_path = format!("{}/.claude/projects/{}/{}.jsonl", home, sanitized, session_id);

    // Remove from sessions-index.json
    let index_path = Path::new(&sessions_index_path);
    if index_path.exists() {
        let content = tokio::fs::read_to_string(index_path)
            .await
            .map_err(|e| format!("Failed to read sessions index: {}", e))?;

        let mut index: SessionsIndex = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse sessions index: {}", e))?;

        // Filter out the session to delete
        index.entries.retain(|e| e.session_id != session_id);

        // Write back
        let updated_content = serde_json::to_string_pretty(&index)
            .map_err(|e| format!("Failed to serialize sessions index: {}", e))?;

        tokio::fs::write(index_path, updated_content)
            .await
            .map_err(|e| format!("Failed to write sessions index: {}", e))?;
    }

    // Delete the session file
    let session_path = Path::new(&session_file_path);
    if session_path.exists() {
        tokio::fs::remove_file(session_path)
            .await
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
    }

    Ok(true)
}

#[tauri::command]
async fn list_sessions(workspace_path: String) -> Result<Vec<SessionEntry>, String> {
    // Convert workspace path to Claude's project directory name
    let sanitized = workspace_path.replace("/", "-");
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let sessions_path = format!("{}/.claude/projects/{}/sessions-index.json", home, sanitized);

    let path = Path::new(&sessions_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Failed to read sessions: {}", e))?;

    let index: SessionsIndex = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions: {}", e))?;

    // Sort by modified date descending and take recent ones
    let mut entries = index.entries;
    entries.sort_by(|a, b| b.modified.cmp(&a.modified));
    entries.truncate(50);

    Ok(entries)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionMessage {
    role: String,
    content: String,
    timestamp: String,
    tools: Option<Vec<SessionToolExecution>>,
    blocks: Option<Vec<SessionBlock>>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum SessionBlock {
    Text { content: String, order: u64 },
    Tool {
        #[serde(rename = "toolId")]
        tool_id: String,
        order: u64
    },
    Image {
        #[serde(rename = "mediaType")]
        media_type: String,
        data: String,
        order: u64
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionToolExecution {
    id: String,
    tool: String,
    tool_use_id: Option<String>,
    status: String,
    input: Option<String>,
    output: Option<String>,
    started_at: String,
    completed_at: Option<String>,
}

#[tauri::command]
async fn load_session_messages(
    workspace_path: String,
    session_id: String,
) -> Result<Vec<SessionMessage>, String> {
    // Convert workspace path to Claude's project directory name
    let sanitized = workspace_path.replace("/", "-");
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let session_path = format!("{}/.claude/projects/{}/{}.jsonl", home, sanitized, session_id);

    let path = Path::new(&session_path);
    if !path.exists() {
        return Ok(vec![]);
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Failed to read session: {}", e))?;

    let mut messages: Vec<SessionMessage> = Vec::new();
    let mut tool_index: HashMap<String, (usize, usize)> = HashMap::new();
    let mut anonymous_tool_counter: u32 = 0;
    let mut global_block_order: u64 = 0;

    for line in content.lines() {
        if line.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

        // Only process user/assistant messages
        if msg_type != "user" && msg_type != "assistant" {
            continue;
        }

        let timestamp = parsed.get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let message = match parsed.get("message") {
            Some(m) => m,
            None => continue,
        };

        let role = message.get("role")
            .and_then(|v| v.as_str())
            .unwrap_or(msg_type)
            .to_string();

        let content_value = message.get("content");
        let mut content_texts: Vec<String> = Vec::new();
        let mut tools: Vec<SessionToolExecution> = Vec::new();
        let mut blocks: Vec<SessionBlock> = Vec::new();
        let mut tool_id_mappings: Vec<(String, usize)> = Vec::new();

        match content_value {
            Some(Value::String(s)) => {
                if !s.trim().is_empty() {
                    content_texts.push(s.clone());
                    global_block_order += 1;
                    blocks.push(SessionBlock::Text { content: s.clone(), order: global_block_order });
                }
            }
            Some(Value::Array(arr)) => {
                for block in arr {
                    let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match block_type {
                        "text" => {
                            if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                                if !text.trim().is_empty() {
                                    content_texts.push(text.to_string());
                                    global_block_order += 1;
                                    blocks.push(SessionBlock::Text { content: text.to_string(), order: global_block_order });
                                }
                            }
                        }
                        "image" => {
                            // Handle image blocks with base64 data
                            if let Some(source) = block.get("source") {
                                let media_type = source.get("media_type")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("image/png")
                                    .to_string();
                                if let Some(data) = source.get("data").and_then(|v| v.as_str()) {
                                    global_block_order += 1;
                                    blocks.push(SessionBlock::Image {
                                        media_type,
                                        data: data.to_string(),
                                        order: global_block_order
                                    });
                                }
                            }
                        }
                        "tool_use" if msg_type == "assistant" => {
                            let name = block.get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let tool_use_id = block.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
                            let input_value = block.get("input");
                            let input = match input_value {
                                Some(Value::String(s)) => Some(s.clone()),
                                Some(v) => serde_json::to_string_pretty(v).ok(),
                                None => None,
                            };

                            let tool_id = tool_use_id.clone().unwrap_or_else(|| {
                                anonymous_tool_counter += 1;
                                format!("tool-{}", anonymous_tool_counter)
                            });

                            let tool_entry = SessionToolExecution {
                                id: tool_id.clone(),
                                tool: name,
                                tool_use_id: tool_use_id.clone(),
                                status: "running".to_string(),
                                input,
                                output: None,
                                started_at: timestamp.clone(),
                                completed_at: None,
                            };

                            tools.push(tool_entry);
                            global_block_order += 1;
                            blocks.push(SessionBlock::Tool { tool_id: tool_id.clone(), order: global_block_order });
                            if let Some(id) = tool_use_id {
                                tool_id_mappings.push((id, tools.len() - 1));
                            }
                        }
                        "tool_result" if msg_type == "user" => {
                            if let Some(tool_use_id) = block.get("tool_use_id").and_then(|v| v.as_str()) {
                                if let Some((msg_idx, tool_idx)) = tool_index.get(tool_use_id).cloned() {
                                    if let Some(message) = messages.get_mut(msg_idx) {
                                        if let Some(message_tools) = message.tools.as_mut() {
                                            if let Some(tool) = message_tools.get_mut(tool_idx) {
                                                let output_value = block.get("content");
                                                let output = match output_value {
                                                    Some(Value::String(s)) => Some(s.clone()),
                                                    Some(Value::Array(arr)) => {
                                                        let texts: Vec<String> = arr.iter()
                                                            .filter_map(|b| {
                                                                let t = b.get("type").and_then(|v| v.as_str());
                                                                if t == Some("text") {
                                                                    b.get("text").and_then(|v| v.as_str()).map(|s| s.to_string())
                                                                } else {
                                                                    None
                                                                }
                                                            })
                                                            .collect();
                                                        if texts.is_empty() {
                                                            serde_json::to_string_pretty(output_value.unwrap()).ok()
                                                        } else {
                                                            Some(texts.join("\n"))
                                                        }
                                                    }
                                                    Some(v) => serde_json::to_string_pretty(v).ok(),
                                                    None => None,
                                                };

                                                let is_error = block.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                                                tool.status = if is_error { "error".to_string() } else { "completed".to_string() };
                                                tool.output = output;
                                                tool.completed_at = Some(timestamp.clone());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }

        let content_text = content_texts.join("\n");
        let has_tools = !tools.is_empty();
        let has_blocks = !blocks.is_empty();

        // Skip empty messages (no text, no tools, no blocks like images)
        if content_text.trim().is_empty() && !has_tools && !has_blocks {
            continue;
        }

        // Group consecutive assistant messages
        if role == "assistant" && !messages.is_empty() {
            let last_idx = messages.len() - 1;
            if messages[last_idx].role == "assistant" {
                let last = messages
                    .get_mut(last_idx)
                    .ok_or_else(|| "Failed to read previous assistant message".to_string())?;

                if !content_text.trim().is_empty() {
                    if !last.content.is_empty() {
                        last.content.push('\n');
                    }
                    last.content.push_str(&content_text);
                }

                if has_tools {
                    let existing_len = last.tools.as_ref().map(|t| t.len()).unwrap_or(0);
                    if last.tools.is_none() {
                        last.tools = Some(Vec::new());
                    }
                    if let Some(last_tools) = last.tools.as_mut() {
                        last_tools.extend(tools);
                    }
                    for (id, idx) in tool_id_mappings {
                        tool_index.insert(id, (last_idx, existing_len + idx));
                    }
                }

                if has_blocks {
                    if last.blocks.is_none() {
                        last.blocks = Some(Vec::new());
                    }
                    if let Some(last_blocks) = last.blocks.as_mut() {
                        last_blocks.extend(blocks);
                    }
                }

                last.timestamp = timestamp;
                continue;
            }
        }

        // Group consecutive user messages
        if role == "user" && !messages.is_empty() {
            let last_idx = messages.len() - 1;
            if messages[last_idx].role == "user" {
                let last = messages
                    .get_mut(last_idx)
                    .ok_or_else(|| "Failed to read previous user message".to_string())?;

                if !content_text.trim().is_empty() {
                    if !last.content.is_empty() {
                        last.content.push('\n');
                    }
                    last.content.push_str(&content_text);
                }

                if has_blocks {
                    if last.blocks.is_none() {
                        last.blocks = Some(Vec::new());
                    }
                    if let Some(last_blocks) = last.blocks.as_mut() {
                        last_blocks.extend(blocks);
                    }
                }

                last.timestamp = timestamp;
                continue;
            }
        }

        let msg_idx = messages.len();
        messages.push(SessionMessage {
            role,
            content: content_text,
            timestamp,
            tools: if has_tools { Some(tools) } else { None },
            blocks: if blocks.is_empty() { None } else { Some(blocks) },
        });
        for (id, idx) in tool_id_mappings {
            tool_index.insert(id, (msg_idx, idx));
        }
    }

    Ok(messages)
}

#[tauri::command]
async fn query_claude(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    prompt: String,
    working_dir: String,
    config: Option<String>,
    resume_session: Option<String>,
    has_attachments: Option<bool>,
    tool_result: Option<String>,
) -> Result<String, String> {
    // Generate unique query ID
    let query_id = Uuid::new_v4().to_string();

    // Validate working directory exists
    let path = Path::new(&working_dir);
    if !path.exists() {
        return Err(format!("Working directory does not exist: {}", working_dir));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", working_dir));
    }

    // Use Node.js script with Claude Agent SDK
    // Try multiple locations for the script
    let mut possible_paths: Vec<PathBuf> = vec![];

    // 1. Tauri resource directory (for bundled app)
    if let Ok(resource_dir) = app.path().resource_dir() {
        // Tauri v2 puts "../scripts" into "_up_/scripts" to preserve relative paths
        possible_paths.push(resource_dir.join("_up_/scripts/claude-query.mjs"));
        possible_paths.push(resource_dir.join("scripts/claude-query.mjs"));
    }

    // 2. Relative to executable (for development/bundled)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            // macOS .app bundle structure: Contents/MacOS/binary -> Contents/Resources
            // Tauri v2 puts "../scripts" into "_up_/scripts"
            possible_paths.push(parent.join("../Resources/_up_/scripts/claude-query.mjs"));
            possible_paths.push(parent.join("../Resources/scripts/claude-query.mjs"));
        }
    }

    // 3. Current working directory (for development)
    if let Ok(cwd) = std::env::current_dir() {
        possible_paths.push(cwd.join("scripts/claude-query.mjs"));
    }

    let script = possible_paths
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "Could not find claude-query.mjs script. Please ensure the app is installed correctly.".to_string())?;

    let mut args = vec![
        script.to_string_lossy().to_string(),
        "--cwd".to_string(),
        working_dir.clone(),
        "--prompt".to_string(),
        prompt,
        "--query-id".to_string(),
        query_id.clone(),
    ];

    if let Some(config_json) = config {
        args.push("--config".to_string());
        args.push(config_json);
    }

    if let Some(session_id) = resume_session {
        args.push("--resume".to_string());
        args.push(session_id);
    }

    if has_attachments == Some(true) {
        args.push("--has-attachments".to_string());
    }

    if let Some(tr) = tool_result {
        args.push("--tool-result".to_string());
        args.push(tr);
    }

    let node_binary = find_node_binary();
    let mut child = Command::new(&node_binary)
        .args(&args)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn node at '{}': {}. Make sure Node.js is installed.", node_binary, e))?;

    // Store the child process for potential cancellation
    let query_id_for_storage = query_id.clone();
    let active_queries = state.active_queries.clone();

    // Read stderr in background for error messages
    let stderr = child.stderr.take();
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Store child in active queries (we need to move child ownership)
    {
        let mut queries = active_queries.lock().await;
        queries.insert(query_id_for_storage.clone(), ActiveQuery {
            child,
            started_at: std::time::Instant::now(),
        });
    }

    let app_clone = app.clone();
    let query_id_for_stderr = query_id.clone();
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if !line.is_empty() {
                    let payload = StreamPayload {
                        query_id: query_id_for_stderr.clone(),
                        data: line,
                    };
                    let _ = app_clone.emit("claude-stderr", payload);
                }
            }
        });
    }

    let mut reader = BufReader::new(stdout).lines();
    let query_id_for_stream = query_id.clone();

    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        if !line.is_empty() {
            let payload = StreamPayload {
                query_id: query_id_for_stream.clone(),
                data: line,
            };
            app.emit("claude-stream", payload).map_err(|e| e.to_string())?;
        }
    }

    // Wait for process completion and clean up
    let status = {
        let mut queries = active_queries.lock().await;
        if let Some(mut active_query) = queries.remove(&query_id_for_storage) {
            active_query.child.wait().await.map_err(|e| e.to_string())?
        } else {
            // Query was cancelled, return early
            return Ok(query_id);
        }
    };

    let done_payload = serde_json::json!({
        "query_id": query_id,
        "code": status.code().unwrap_or(-1)
    });
    app.emit("claude-done", done_payload)
        .map_err(|e| e.to_string())?;

    Ok(query_id)
}

#[tauri::command]
async fn cancel_query(state: State<'_, AppState>, query_id: String) -> Result<bool, String> {
    let mut queries = state.active_queries.lock().await;

    if let Some(mut active_query) = queries.remove(&query_id) {
        // Try to kill the process
        #[cfg(unix)]
        {
            use nix::sys::signal::{kill, Signal};
            use nix::unistd::Pid;

            if let Some(pid) = active_query.child.id() {
                // Send SIGTERM first for graceful shutdown
                let _ = kill(Pid::from_raw(pid as i32), Signal::SIGTERM);

                // Wait a bit then force kill if still running
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Check if still running and force kill
                match active_query.child.try_wait() {
                    Ok(None) => {
                        // Still running, force kill
                        let _ = active_query.child.kill().await;
                    }
                    _ => {}
                }
            } else {
                // No PID, just try to kill
                let _ = active_query.child.kill().await;
            }
        }

        #[cfg(not(unix))]
        {
            // On non-Unix systems, just kill directly
            let _ = active_query.child.kill().await;
        }

        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
async fn list_active_queries(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let queries = state.active_queries.lock().await;
    Ok(queries.keys().cloned().collect())
}

#[tauri::command]
async fn read_plan_file(_workspace_path: String, plan_filename: String) -> Result<String, String> {
    // Claude Code writes plan files to ~/.claude/plans/ (user's home directory)
    let home = std::env::var("HOME").map_err(|_| "Could not determine home directory")?;
    let plan_path = Path::new(&home)
        .join(".claude")
        .join("plans")
        .join(&plan_filename);

    tokio::fs::read_to_string(&plan_path)
        .await
        .map_err(|e| format!("Failed to read plan file: {}", e))
}

#[tauri::command]
async fn list_plan_files(_workspace_path: String) -> Result<Vec<String>, String> {
    // Claude Code writes plan files to ~/.claude/plans/ (user's home directory)
    let home = std::env::var("HOME").map_err(|_| "Could not determine home directory")?;
    let plans_dir = Path::new(&home)
        .join(".claude")
        .join("plans");

    if !plans_dir.exists() {
        return Ok(vec![]);
    }

    let mut entries = tokio::fs::read_dir(&plans_dir)
        .await
        .map_err(|e| format!("Failed to read plans directory: {}", e))?;

    // Collect files with their modification times
    let mut plan_files_with_time: Vec<(String, std::time::SystemTime)> = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            if let Some(name) = path.file_name() {
                if let Ok(metadata) = entry.metadata().await {
                    if let Ok(modified) = metadata.modified() {
                        plan_files_with_time.push((name.to_string_lossy().to_string(), modified));
                    }
                }
            }
        }
    }

    // Sort by modification time (most recent first)
    plan_files_with_time.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(plan_files_with_time.into_iter().map(|(name, _)| name).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            query_claude,
            cancel_query,
            list_active_queries,
            list_sessions,
            delete_session,
            load_session_messages,
            read_plan_file,
            list_plan_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
