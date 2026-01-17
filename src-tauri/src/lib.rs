// mensa - Tauri backend

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionEntry {
    session_id: String,
    first_prompt: String,
    message_count: u32,
    created: String,
    modified: String,
}

#[derive(Debug, Deserialize)]
struct SessionsIndex {
    entries: Vec<SessionEntry>,
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
    prompt: String,
    working_dir: String,
    config: Option<String>,
    resume_session: Option<String>,
    has_attachments: Option<bool>,
) -> Result<(), String> {
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
    let possible_paths = [
        std::env::current_dir().ok().map(|p| p.join("scripts/claude-query.mjs")),
        std::env::current_exe().ok().and_then(|p| {
            p.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .map(|p| p.join("scripts/claude-query.mjs"))
        }),
        Some(std::path::PathBuf::from("/Users/choki/Developer/playground/mensa/scripts/claude-query.mjs")),
    ];

    let script = possible_paths
        .into_iter()
        .flatten()
        .find(|p| p.exists())
        .ok_or_else(|| "Could not find claude-query.mjs script".to_string())?;

    let mut args = vec![
        script.to_string_lossy().to_string(),
        "--cwd".to_string(),
        working_dir.clone(),
        "--prompt".to_string(),
        prompt,
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

    let mut child = Command::new("node")
        .args(&args)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}. Make sure Claude CLI is installed.", e))?;

    // Read stderr in background for error messages
    let stderr = child.stderr.take();
    let app_clone = app.clone();
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if !line.is_empty() {
                    let _ = app_clone.emit("claude-stderr", line);
                }
            }
        });
    }

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let mut reader = BufReader::new(stdout).lines();

    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        if !line.is_empty() {
            app.emit("claude-stream", line).map_err(|e| e.to_string())?;
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;

    app.emit("claude-done", status.code().unwrap_or(-1))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![query_claude, list_sessions, load_session_messages])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
