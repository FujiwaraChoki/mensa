// mensa - Git Integration Module
// Provides Tauri commands for Git operations using git2

use git2::{BranchType, DiffOptions, Repository, Signature, StatusOptions};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    pub status: String, // "added" | "modified" | "deleted" | "renamed" | "untracked"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<GitFile>,
    pub modified: Vec<GitFile>,
    pub untracked: Vec<GitFile>,
    pub deleted: Vec<GitFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub current: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub recent_branches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PRCreationOptions {
    pub base: String,
    pub head: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reviewers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPRInfo {
    pub title: String,
    pub body: String,
    pub author: String,
    pub state: String, // "OPEN" | "CLOSED" | "MERGED"
    pub additions: u32,
    pub deletions: u32,
    pub changed_files: u32,
    pub commits: u32,
    pub base_ref_name: String,
    pub head_ref_name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPRListItem {
    pub number: u32,
    pub title: String,
    pub author: String,
    pub state: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub url: String,
    pub is_draft: bool,
}

// ============================================================================
// Helper Functions
// ============================================================================

fn open_repo(working_dir: &str) -> Result<Repository, String> {
    Repository::open(working_dir).map_err(|e| format!("Failed to open repository: {}", e))
}

fn get_branch_ahead_behind(repo: &Repository) -> (u32, u32) {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return (0, 0),
    };

    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return (0, 0),
    };

    // Try to get upstream branch
    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return (0, 0),
    };

    let branch = match repo.find_branch(branch_name, BranchType::Local) {
        Ok(b) => b,
        Err(_) => return (0, 0),
    };

    let upstream = match branch.upstream() {
        Ok(u) => u,
        Err(_) => return (0, 0),
    };

    let upstream_oid = match upstream.get().target() {
        Some(oid) => oid,
        None => return (0, 0),
    };

    match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok((ahead, behind)) => (ahead as u32, behind as u32),
        Err(_) => (0, 0),
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Get the current git status of the repository
#[tauri::command]
pub async fn git_status(working_dir: String) -> Result<GitStatus, String> {
    let repo = open_repo(&working_dir)?;

    // Get current branch name
    let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let branch = head
        .shorthand()
        .unwrap_or("HEAD")
        .to_string();

    // Get upstream info
    let upstream = if let Ok(local_branch) = repo.find_branch(&branch, BranchType::Local) {
        local_branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(String::from))
    } else {
        None
    };

    // Get ahead/behind counts
    let (ahead, behind) = get_branch_ahead_behind(&repo);

    // Get file statuses
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to get statuses: {}", e))?;

    let mut staged = Vec::new();
    let mut modified = Vec::new();
    let mut untracked = Vec::new();
    let mut deleted = Vec::new();

    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("").to_string();
        let status = entry.status();

        // Check index (staged) changes
        if status.is_index_new() {
            staged.push(GitFile {
                path: path.clone(),
                status: "added".to_string(),
                old_path: None,
            });
        } else if status.is_index_modified() {
            staged.push(GitFile {
                path: path.clone(),
                status: "modified".to_string(),
                old_path: None,
            });
        } else if status.is_index_deleted() {
            staged.push(GitFile {
                path: path.clone(),
                status: "deleted".to_string(),
                old_path: None,
            });
        } else if status.is_index_renamed() {
            staged.push(GitFile {
                path: path.clone(),
                status: "renamed".to_string(),
                old_path: entry.head_to_index().and_then(|d| {
                    d.old_file().path().map(|p| p.to_string_lossy().to_string())
                }),
            });
        }

        // Check working tree changes (not staged)
        if status.is_wt_new() {
            untracked.push(GitFile {
                path: path.clone(),
                status: "untracked".to_string(),
                old_path: None,
            });
        } else if status.is_wt_modified() {
            modified.push(GitFile {
                path: path.clone(),
                status: "modified".to_string(),
                old_path: None,
            });
        } else if status.is_wt_deleted() {
            deleted.push(GitFile {
                path: path.clone(),
                status: "deleted".to_string(),
                old_path: None,
            });
        }
    }

    Ok(GitStatus {
        branch,
        upstream,
        ahead,
        behind,
        staged,
        modified,
        untracked,
        deleted,
    })
}

/// Get the diff for a specific file or the entire working tree
#[tauri::command]
pub async fn git_diff(
    working_dir: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<String, String> {
    let repo = open_repo(&working_dir)?;

    let mut opts = DiffOptions::new();
    opts.context_lines(3);

    if let Some(ref path) = file_path {
        opts.pathspec(path);
    }

    let diff = if staged {
        // Staged changes: compare HEAD to index
        let head_tree = repo
            .head()
            .ok()
            .and_then(|h| h.peel_to_tree().ok());

        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
            .map_err(|e| format!("Failed to get staged diff: {}", e))?
    } else {
        // Unstaged changes: compare index to working tree
        repo.diff_index_to_workdir(None, Some(&mut opts))
            .map_err(|e| format!("Failed to get diff: {}", e))?
    };

    let mut diff_str = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' | '-' | ' ' => line.origin(),
            _ => ' ',
        };
        if prefix != ' ' || !line.content().is_empty() {
            if prefix != ' ' {
                diff_str.push(prefix);
            }
            diff_str.push_str(&String::from_utf8_lossy(line.content()));
        }
        true
    })
    .map_err(|e| format!("Failed to print diff: {}", e))?;

    Ok(diff_str)
}

/// Stage files for commit
#[tauri::command]
pub async fn git_stage(working_dir: String, paths: Vec<String>) -> Result<bool, String> {
    let repo = open_repo(&working_dir)?;
    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to get index: {}", e))?;

    for path in &paths {
        let file_path = Path::new(path);

        // Check if file exists - if not, it might be a deletion
        let full_path = Path::new(&working_dir).join(file_path);
        if full_path.exists() {
            index
                .add_path(file_path)
                .map_err(|e| format!("Failed to stage {}: {}", path, e))?;
        } else {
            // File was deleted, remove from index
            index
                .remove_path(file_path)
                .map_err(|e| format!("Failed to stage deletion of {}: {}", path, e))?;
        }
    }

    index
        .write()
        .map_err(|e| format!("Failed to write index: {}", e))?;

    Ok(true)
}

/// Unstage files
#[tauri::command]
pub async fn git_unstage(working_dir: String, paths: Vec<String>) -> Result<bool, String> {
    let repo = open_repo(&working_dir)?;

    let head = repo
        .head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Failed to get HEAD commit: {}", e))?;

    repo.reset_default(Some(&head_commit.as_object()), paths.iter().map(|s| Path::new(s)))
        .map_err(|e| format!("Failed to unstage: {}", e))?;

    Ok(true)
}

/// Get branch information
#[tauri::command]
pub async fn git_branch_info(working_dir: String) -> Result<BranchInfo, String> {
    let repo = open_repo(&working_dir)?;

    // Get current branch
    let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
    let current = head
        .shorthand()
        .unwrap_or("HEAD")
        .to_string();

    // Get upstream
    let upstream = if let Ok(branch) = repo.find_branch(&current, BranchType::Local) {
        branch
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(String::from))
    } else {
        None
    };

    // Get ahead/behind
    let (ahead, behind) = get_branch_ahead_behind(&repo);

    // Get recent branches (local branches sorted by last commit time)
    let mut recent_branches = Vec::new();
    if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
        let mut branch_times: Vec<(String, i64)> = Vec::new();

        for branch_result in branches {
            if let Ok((branch, _)) = branch_result {
                // Clone the name before moving branch
                let name = branch.name().ok().flatten().map(|s| s.to_string());
                if let Some(name) = name {
                    if let Ok(reference) = branch.into_reference().peel_to_commit() {
                        branch_times.push((name, reference.time().seconds()));
                    }
                }
            }
        }

        branch_times.sort_by(|a, b| b.1.cmp(&a.1));
        recent_branches = branch_times.into_iter().take(10).map(|(name, _)| name).collect();
    }

    Ok(BranchInfo {
        current,
        upstream,
        ahead,
        behind,
        recent_branches,
    })
}

/// Create a commit with the staged changes
#[tauri::command]
pub async fn git_commit(
    working_dir: String,
    message: String,
    paths: Option<Vec<String>>,
) -> Result<String, String> {
    let repo = open_repo(&working_dir)?;

    // Stage specific paths if provided
    if let Some(ref file_paths) = paths {
        git_stage(working_dir.clone(), file_paths.clone()).await?;
    }

    // Get the index
    let mut index = repo
        .index()
        .map_err(|e| format!("Failed to get index: {}", e))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("Failed to write tree: {}", e))?;

    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("Failed to find tree: {}", e))?;

    // Get signature from git config
    let signature = repo
        .signature()
        .or_else(|_| Signature::now("Mensa User", "user@mensa.local"))
        .map_err(|e| format!("Failed to create signature: {}", e))?;

    // Get parent commit (HEAD)
    let parent = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok());

    let parents: Vec<&git2::Commit> = parent.as_ref().map(|p| vec![p]).unwrap_or_default();

    let commit_oid = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            &message,
            &tree,
            &parents,
        )
        .map_err(|e| format!("Failed to create commit: {}", e))?;

    Ok(commit_oid.to_string())
}

/// Push changes to remote
#[tauri::command]
pub async fn git_push(
    working_dir: String,
    set_upstream: bool,
    branch: Option<String>,
) -> Result<bool, String> {
    // Use git CLI for push as it handles authentication better
    let mut args = vec!["push".to_string()];

    if set_upstream {
        args.push("-u".to_string());
        args.push("origin".to_string());

        if let Some(ref b) = branch {
            args.push(b.clone());
        } else {
            // Get current branch name
            let repo = open_repo(&working_dir)?;
            let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
            let branch_name = head.shorthand().unwrap_or("HEAD").to_string();
            args.push(branch_name);
        }
    }

    let output = Command::new("git")
        .args(&args)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute git push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Push failed: {}", stderr));
    }

    Ok(true)
}

/// Get recent commits
#[tauri::command]
pub async fn git_log(
    working_dir: String,
    limit: u32,
    branch: Option<String>,
) -> Result<Vec<GitCommit>, String> {
    let repo = open_repo(&working_dir)?;

    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;

    // Start from specified branch or HEAD
    if let Some(ref branch_name) = branch {
        let reference = repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|e| format!("Branch not found: {}", e))?;
        revwalk
            .push(reference.get().target().ok_or("Invalid branch target")?)
            .map_err(|e| format!("Failed to push branch: {}", e))?;
    } else {
        revwalk
            .push_head()
            .map_err(|e| format!("Failed to push HEAD: {}", e))?;
    }

    let mut commits = Vec::new();

    for (i, oid_result) in revwalk.enumerate() {
        if i >= limit as usize {
            break;
        }

        let oid = oid_result.map_err(|e| format!("Failed to get OID: {}", e))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| format!("Failed to find commit: {}", e))?;

        // Get diff stats for this commit
        let (files_changed, insertions, deletions) = if commit.parent_count() > 0 {
            if let Ok(parent) = commit.parent(0) {
                if let (Ok(parent_tree), Ok(commit_tree)) =
                    (parent.tree(), commit.tree())
                {
                    if let Ok(diff) = repo.diff_tree_to_tree(
                        Some(&parent_tree),
                        Some(&commit_tree),
                        None,
                    ) {
                        if let Ok(stats) = diff.stats() {
                            (
                                stats.files_changed() as u32,
                                stats.insertions() as u32,
                                stats.deletions() as u32,
                            )
                        } else {
                            (0, 0, 0)
                        }
                    } else {
                        (0, 0, 0)
                    }
                } else {
                    (0, 0, 0)
                }
            } else {
                (0, 0, 0)
            }
        } else {
            (0, 0, 0)
        };

        commits.push(GitCommit {
            hash: oid.to_string(),
            short_hash: oid.to_string()[..7].to_string(),
            message: commit.message().unwrap_or("").trim().to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            email: commit.author().email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            files_changed,
            insertions,
            deletions,
        });
    }

    Ok(commits)
}

/// Fetch from remote
#[tauri::command]
pub async fn git_fetch(working_dir: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["fetch", "--all", "--prune"])
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute git fetch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Fetch failed: {}", stderr));
    }

    Ok(true)
}

/// Pull from remote
#[tauri::command]
pub async fn git_pull(working_dir: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["pull"])
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute git pull: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pull failed: {}", stderr));
    }

    Ok(true)
}

/// Discard changes in a file (restore to HEAD)
#[tauri::command]
pub async fn git_discard(working_dir: String, file_path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(["checkout", "--", &file_path])
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute git checkout: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Discard failed: {}", stderr));
    }

    Ok(true)
}

/// Check if gh CLI is available and authenticated
#[tauri::command]
pub async fn check_gh_cli_available() -> Result<bool, String> {
    let output = Command::new("gh")
        .args(["auth", "status"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match output {
        Ok(result) => Ok(result.status.success()),
        Err(_) => Ok(false),
    }
}

/// Create a pull request using gh CLI
#[tauri::command]
pub async fn create_pull_request(
    working_dir: String,
    options: PRCreationOptions,
) -> Result<String, String> {
    let mut args = vec![
        "pr".to_string(),
        "create".to_string(),
        "--base".to_string(),
        options.base,
        "--head".to_string(),
        options.head,
        "--title".to_string(),
        options.title,
        "--body".to_string(),
        options.body,
    ];

    if options.draft {
        args.push("--draft".to_string());
    }

    if let Some(reviewers) = options.reviewers {
        if !reviewers.is_empty() {
            args.push("--reviewer".to_string());
            args.push(reviewers.join(","));
        }
    }

    if let Some(labels) = options.labels {
        if !labels.is_empty() {
            args.push("--label".to_string());
            args.push(labels.join(","));
        }
    }

    let output = Command::new("gh")
        .args(&args)
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute gh pr create: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PR creation failed: {}", stderr));
    }

    let pr_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(pr_url)
}

/// Get list of available branches
#[tauri::command]
pub async fn git_list_branches(working_dir: String) -> Result<Vec<String>, String> {
    let repo = open_repo(&working_dir)?;

    let mut branches = Vec::new();

    // Get local branches
    if let Ok(branch_iter) = repo.branches(Some(BranchType::Local)) {
        for branch_result in branch_iter {
            if let Ok((branch, _)) = branch_result {
                if let Some(name) = branch.name().ok().flatten() {
                    branches.push(name.to_string());
                }
            }
        }
    }

    branches.sort();
    Ok(branches)
}

/// Get the diff between two commits or branches
#[tauri::command]
pub async fn git_diff_commits(
    working_dir: String,
    base: String,
    head: String,
) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &format!("{}...{}", base, head)])
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute git diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Diff failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ============================================================================
// PR Review Commands
// ============================================================================

/// Parse a GitHub PR URL to extract owner, repo, and PR number
fn parse_pr_url(pr_url: &str) -> Result<(String, String, String), String> {
    // Match patterns like:
    // https://github.com/owner/repo/pull/123
    // github.com/owner/repo/pull/123
    let re = Regex::new(r"(?:https?://)?github\.com/([^/]+)/([^/]+)/pull/(\d+)")
        .map_err(|e| format!("Invalid regex: {}", e))?;

    if let Some(caps) = re.captures(pr_url) {
        let owner = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        let repo = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
        let pr_number = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();

        if !owner.is_empty() && !repo.is_empty() && !pr_number.is_empty() {
            return Ok((owner, repo, pr_number));
        }
    }

    Err(format!("Invalid PR URL format: {}", pr_url))
}

/// List PRs for the current repository using gh CLI
#[tauri::command]
pub async fn list_prs(working_dir: String, state: Option<String>) -> Result<Vec<GhPRListItem>, String> {
    let pr_state = state.unwrap_or_else(|| "open".to_string());

    let output = Command::new("gh")
        .args([
            "pr",
            "list",
            "--state",
            &pr_state,
            "--json",
            "number,title,author,state,headRefName,baseRefName,createdAt,updatedAt,url,isDraft",
            "--limit",
            "50",
        ])
        .current_dir(&working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute gh pr list: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to list PRs: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);

    let json: Vec<serde_json::Value> = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse PR list JSON: {}", e))?;

    let prs: Vec<GhPRListItem> = json
        .iter()
        .map(|pr| GhPRListItem {
            number: pr["number"].as_u64().unwrap_or(0) as u32,
            title: pr["title"].as_str().unwrap_or("").to_string(),
            author: pr["author"]["login"].as_str().unwrap_or("").to_string(),
            state: pr["state"].as_str().unwrap_or("OPEN").to_string(),
            head_ref_name: pr["headRefName"].as_str().unwrap_or("").to_string(),
            base_ref_name: pr["baseRefName"].as_str().unwrap_or("").to_string(),
            created_at: pr["createdAt"].as_str().unwrap_or("").to_string(),
            updated_at: pr["updatedAt"].as_str().unwrap_or("").to_string(),
            url: pr["url"].as_str().unwrap_or("").to_string(),
            is_draft: pr["isDraft"].as_bool().unwrap_or(false),
        })
        .collect();

    Ok(prs)
}

/// Fetch PR information using gh CLI
#[tauri::command]
pub async fn fetch_pr_info(pr_url: String) -> Result<GhPRInfo, String> {
    let (owner, repo, pr_number) = parse_pr_url(&pr_url)?;

    let output = Command::new("gh")
        .args([
            "pr",
            "view",
            &pr_number,
            "--repo",
            &format!("{}/{}", owner, repo),
            "--json",
            "title,body,author,state,additions,deletions,changedFiles,commits,baseRefName,headRefName,createdAt,updatedAt",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute gh pr view: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch PR info: {}", stderr));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);

    // Parse the JSON response
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse PR info JSON: {}", e))?;

    Ok(GhPRInfo {
        title: json["title"].as_str().unwrap_or("").to_string(),
        body: json["body"].as_str().unwrap_or("").to_string(),
        author: json["author"]["login"].as_str().unwrap_or("").to_string(),
        state: json["state"].as_str().unwrap_or("OPEN").to_string(),
        additions: json["additions"].as_u64().unwrap_or(0) as u32,
        deletions: json["deletions"].as_u64().unwrap_or(0) as u32,
        changed_files: json["changedFiles"].as_u64().unwrap_or(0) as u32,
        commits: json["commits"]["totalCount"].as_u64()
            .or_else(|| json["commits"].as_u64())
            .unwrap_or(0) as u32,
        base_ref_name: json["baseRefName"].as_str().unwrap_or("").to_string(),
        head_ref_name: json["headRefName"].as_str().unwrap_or("").to_string(),
        created_at: json["createdAt"].as_str().unwrap_or("").to_string(),
        updated_at: json["updatedAt"].as_str().unwrap_or("").to_string(),
    })
}

/// Fetch PR diff using gh CLI
#[tauri::command]
pub async fn fetch_pr_diff(pr_url: String) -> Result<String, String> {
    let (owner, repo, pr_number) = parse_pr_url(&pr_url)?;

    let output = Command::new("gh")
        .args([
            "pr",
            "diff",
            &pr_number,
            "--repo",
            &format!("{}/{}", owner, repo),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute gh pr diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch PR diff: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Post a review to a GitHub PR using gh CLI
#[tauri::command]
pub async fn post_pr_review(
    pr_url: String,
    verdict: String, // "approve" | "request-changes" | "comment"
    body: String,
) -> Result<(), String> {
    let (owner, repo, pr_number) = parse_pr_url(&pr_url)?;

    let verdict_flag = match verdict.as_str() {
        "approve" => "--approve",
        "request-changes" => "--request-changes",
        "comment" => "--comment",
        _ => return Err(format!("Invalid review verdict: {}", verdict)),
    };

    let output = Command::new("gh")
        .args([
            "pr",
            "review",
            &pr_number,
            "--repo",
            &format!("{}/{}", owner, repo),
            verdict_flag,
            "--body",
            &body,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute gh pr review: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to post PR review: {}", stderr));
    }

    Ok(())
}
