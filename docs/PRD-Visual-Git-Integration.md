# PRD: Visual Git Integration

**Version:** 1.0
**Status:** Draft
**Author:** Mensa Team
**Date:** January 2026

---

## 1. Executive Summary

Visual Git Integration brings comprehensive Git workflow capabilities directly into Mensa's GUI, enabling users to view diffs, manage commits, create pull requests, and visualize branch changes—all without leaving the application. This feature transforms Mensa from a chat interface into a full-fledged development companion that understands and visualizes code changes in context.

---

## 2. Problem Statement

### Current Pain Points

1. **Context Switching:** Users must switch between Mensa and terminal/IDE to view Git status, diffs, and manage commits
2. **Blind Changes:** When Claude makes file edits, users see tool executions but lack visual context of what actually changed
3. **Manual Workflow:** Creating commits and PRs requires copy-pasting AI-generated summaries into separate Git tools
4. **No Branch Awareness:** Users can't easily see which files Claude modified across a session or branch

### User Stories

- As a developer, I want to see a visual diff of changes Claude made so I can review before committing
- As a developer, I want to create commits with AI-generated messages directly from Mensa
- As a developer, I want to create PRs with auto-generated summaries without leaving the app
- As a developer, I want to see which files were modified by Claude during my session
- As a team lead, I want to add inline comments on diffs before committing

---

## 3. Goals & Success Metrics

### Goals

| Goal | Description |
|------|-------------|
| **G1** | Reduce context switching by 80% for Git operations |
| **G2** | Enable one-click commit/PR creation with AI summaries |
| **G3** | Provide visual branch history showing Claude's changes |
| **G4** | Support inline commenting on diffs for review workflows |

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to commit after Claude edits | < 10 seconds |
| PR creation time | < 30 seconds |
| User satisfaction (Git workflow) | > 4.5/5 |
| Feature adoption rate | > 70% of active users |

---

## 4. Feature Specification

### 4.1 Git Status Panel

A collapsible panel showing the current repository state.

#### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ 🌿 main ↑2 ↓0                              [Fetch] [Pull]   │
├─────────────────────────────────────────────────────────────┤
│ STAGED (3)                                      [Unstage All]│
│   ✓ M  src/lib/components/Chat.svelte              [Unstage]│
│   ✓ A  src/lib/services/gitService.ts              [Unstage]│
│   ✓ M  package.json                                [Unstage]│
├─────────────────────────────────────────────────────────────┤
│ MODIFIED (2)                                    [Stage All] │
│   M  src/routes/+page.svelte                        [Stage] │
│   M  README.md                                      [Stage] │
├─────────────────────────────────────────────────────────────┤
│ UNTRACKED (1)                                               │
│   ?  src/lib/types/git.ts                           [Stage] │
└─────────────────────────────────────────────────────────────┘
```

#### Functionality

- **Branch indicator:** Shows current branch with ahead/behind counts
- **File status:** Grouped by staged, modified, untracked, deleted
- **Quick actions:** Stage/unstage individual files or all
- **Click to diff:** Clicking a file opens the diff viewer
- **Claude badge:** Files modified by Claude in current session get a sparkle badge ✨

#### Data Model

```typescript
interface GitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  modified: GitFile[];
  untracked: GitFile[];
  deleted: GitFile[];
}

interface GitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  oldPath?: string;  // For renames
  modifiedByClaude: boolean;
  modifiedAt?: Date;
}
```

### 4.2 Visual Diff Viewer

Enhanced diff viewing with inline commenting capabilities.

#### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│ src/lib/components/Chat.svelte                    [×]       │
│ +42 -18 lines changed                      [Split] [Unified]│
├─────────────────────────────────────────────────────────────┤
│ 142 │ -  const oldFunction = () => {                        │
│     │ +  const newFunction = async () => {        [Comment] │
│ 143 │     // Implementation                                 │
│ 144 │ -    return result;                                   │
│     │ +    return await processResult(result);    [Comment] │
│     │                                                       │
│     │  💬 @claude: Consider adding error handling here      │
│     │     [Reply] [Resolve]                                 │
├─────────────────────────────────────────────────────────────┤
│                              [Discard Changes] [Stage File] │
└─────────────────────────────────────────────────────────────┘
```

#### Features

- **Split/Unified view toggle:** User preference for diff display
- **Syntax highlighting:** Language-aware highlighting in diffs
- **Inline comments:** Add comments on specific lines
- **Comment threads:** Reply and resolve comment threads
- **Hunk-level actions:** Stage/discard individual hunks
- **Navigation:** Jump between changes with keyboard shortcuts
- **AI explanation:** "Explain this change" button that asks Claude

#### Inline Comments Data Model

```typescript
interface DiffComment {
  id: string;
  filePath: string;
  lineNumber: number;
  side: 'old' | 'new';
  author: 'user' | 'claude';
  content: string;
  createdAt: Date;
  resolved: boolean;
  replies: DiffComment[];
}
```

### 4.3 One-Click Commit

Streamlined commit creation with AI-generated messages.

#### UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Create Commit                                          [×]  │
├─────────────────────────────────────────────────────────────┤
│ ✨ AI-Generated Message                      [Regenerate 🔄]│
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ feat(git): Add visual Git integration panel            │ │
│ │                                                         │ │
│ │ - Add GitStatus component with file staging            │ │
│ │ - Implement diff viewer with inline comments           │ │
│ │ - Add one-click commit functionality                   │ │
│ │                                                         │ │
│ │ Co-Authored-By: Claude <noreply@anthropic.com>         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [Edit Message]                                              │
├─────────────────────────────────────────────────────────────┤
│ Files to commit (5):                                        │
│   ☑ src/lib/components/GitStatus.svelte                    │
│   ☑ src/lib/components/DiffViewer.svelte                   │
│   ☑ src/lib/services/gitService.ts                         │
│   ☑ src-tauri/src/git.rs                                   │
│   ☐ README.md (uncheck to skip)                            │
├─────────────────────────────────────────────────────────────┤
│ ○ Commit only   ● Commit & Push                             │
│                                                             │
│                               [Cancel]  [Commit & Push 🚀]  │
└─────────────────────────────────────────────────────────────┘
```

#### AI Commit Message Generation

The commit message is generated by analyzing:
1. **Diff content:** What actually changed in the code
2. **Session context:** What the user asked Claude to do
3. **Conventional commits:** Follow project's commit style (feat/fix/refactor/etc.)
4. **Recent commits:** Match the repository's existing style

**Prompt Template for Claude:**
```
Analyze the following git diff and conversation context to generate a commit message.

Rules:
- Use conventional commits format if the project uses it
- First line: 50 chars max, imperative mood
- Body: Explain WHY, not just WHAT (wrap at 72 chars)
- Include Co-Authored-By for Claude if AI contributed

Git Diff:
{diff}

Session Context:
{user_messages_summary}

Recent Commit Style:
{recent_commits}
```

### 4.4 Pull Request Creation

Direct PR creation from Mensa with AI-generated descriptions.

#### UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Create Pull Request                                    [×]  │
├─────────────────────────────────────────────────────────────┤
│ Base: main ▼        ←  Compare: feature/git-integration ▼   │
├─────────────────────────────────────────────────────────────┤
│ Title:                                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ feat: Visual Git Integration for Mensa                  │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Description:                              [✨ AI Generate]  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ## Summary                                              │ │
│ │ This PR adds comprehensive Git integration to Mensa,   │ │
│ │ enabling visual diff viewing, one-click commits, and   │ │
│ │ PR creation directly from the application.             │ │
│ │                                                         │ │
│ │ ## Changes                                              │ │
│ │ - Git status panel with file staging                   │ │
│ │ - Visual diff viewer with inline commenting            │ │
│ │ - AI-powered commit message generation                 │ │
│ │ - Direct PR creation via GitHub API                    │ │
│ │                                                         │ │
│ │ ## Test Plan                                            │ │
│ │ - [ ] Verify diff viewer shows correct changes         │ │
│ │ - [ ] Test commit creation with various file types     │ │
│ │ - [ ] Confirm PR is created on GitHub                  │ │
│ │                                                         │ │
│ │ 🤖 Generated with Mensa + Claude                       │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Commits (3):                                                │
│   abc1234 - feat(git): Add status panel                    │
│   def5678 - feat(git): Add diff viewer                     │
│   ghi9012 - feat(git): Add PR creation                     │
├─────────────────────────────────────────────────────────────┤
│ Reviewers:      Labels:           Draft PR:                 │
│ [@teammate] ▼   [enhancement] ▼   ☐                        │
│                                                             │
│                               [Cancel]  [Create PR 🚀]      │
└─────────────────────────────────────────────────────────────┘
```

#### GitHub Integration

```typescript
interface PRCreationOptions {
  base: string;
  head: string;
  title: string;
  body: string;
  draft: boolean;
  reviewers?: string[];
  labels?: string[];
  assignees?: string[];
}

interface GitHubConfig {
  // Uses existing gh CLI authentication or GitHub token
  authMethod: 'gh-cli' | 'token' | 'oauth';
  token?: string;
  defaultReviewers?: string[];
  prTemplate?: string;
}
```

### 4.5 Branch Visualization

Visual timeline showing Claude's changes across the branch.

#### UI Component

```
┌─────────────────────────────────────────────────────────────┐
│ Branch: feature/git-integration                             │
│ Based on: main (3 commits ahead)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ○ HEAD - feat: Add PR creation (2 min ago)                │
│  │   └─ 3 files changed: +180 -12                          │
│  │      ✨ src/lib/components/PRCreator.svelte             │
│  │                                                          │
│  ○ feat: Add diff viewer (1 hour ago)                      │
│  │   └─ 2 files changed: +340 -0                           │
│  │      ✨ src/lib/components/DiffViewer.svelte            │
│  │      ✨ src/lib/services/diffService.ts                 │
│  │                                                          │
│  ○ feat: Add status panel (2 hours ago)                    │
│  │   └─ 4 files changed: +220 -15                          │
│  │      ✨ src/lib/components/GitStatus.svelte             │
│  │                                                          │
│  ● main (base)                                              │
│                                                             │
│  ✨ = Modified by Claude in this session                   │
└─────────────────────────────────────────────────────────────┘
```

#### Features

- **Commit timeline:** Visual representation of commits on branch
- **Claude attribution:** Highlight commits/files where Claude contributed
- **Expandable details:** Click commit to see full diff
- **Compare view:** Select two commits to compare
- **Session correlation:** Link commits to chat session messages

---

## 5. Technical Architecture

### 5.1 Backend (Tauri/Rust)

New Tauri commands for Git operations:

```rust
// src-tauri/src/git.rs

#[tauri::command]
async fn git_status(working_dir: String) -> Result<GitStatus, String>;

#[tauri::command]
async fn git_diff(
    working_dir: String,
    file_path: Option<String>,
    staged: bool
) -> Result<String, String>;

#[tauri::command]
async fn git_stage(
    working_dir: String,
    paths: Vec<String>
) -> Result<bool, String>;

#[tauri::command]
async fn git_unstage(
    working_dir: String,
    paths: Vec<String>
) -> Result<bool, String>;

#[tauri::command]
async fn git_commit(
    working_dir: String,
    message: String,
    paths: Option<Vec<String>>
) -> Result<String, String>; // Returns commit hash

#[tauri::command]
async fn git_push(
    working_dir: String,
    set_upstream: bool
) -> Result<bool, String>;

#[tauri::command]
async fn git_log(
    working_dir: String,
    limit: u32,
    branch: Option<String>
) -> Result<Vec<GitCommit>, String>;

#[tauri::command]
async fn git_branch_info(
    working_dir: String
) -> Result<BranchInfo, String>;

#[tauri::command]
async fn create_pull_request(
    working_dir: String,
    options: PRCreationOptions
) -> Result<String, String>; // Returns PR URL
```

### 5.2 Git Library Integration

Use `git2` crate for native Git operations:

```toml
# Cargo.toml
[dependencies]
git2 = "0.18"
```

For GitHub API and `gh` CLI integration:

```rust
// Use gh CLI for PR creation (already authenticated)
async fn create_pr_via_gh(
    working_dir: &str,
    options: &PRCreationOptions
) -> Result<String, String> {
    let output = Command::new("gh")
        .args(&[
            "pr", "create",
            "--base", &options.base,
            "--head", &options.head,
            "--title", &options.title,
            "--body", &options.body,
        ])
        .current_dir(working_dir)
        .output()
        .await?;

    // Parse PR URL from output
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
```

### 5.3 Frontend (Svelte)

New components and stores:

```
src/lib/
├── components/
│   ├── git/
│   │   ├── GitPanel.svelte          # Main Git panel container
│   │   ├── GitStatus.svelte         # File status list
│   │   ├── DiffViewer.svelte        # Enhanced diff with comments
│   │   ├── CommitDialog.svelte      # Commit creation modal
│   │   ├── PRDialog.svelte          # PR creation modal
│   │   ├── BranchTimeline.svelte    # Visual branch history
│   │   └── InlineComment.svelte     # Comment component
│   └── ...
├── stores/
│   └── gitStore.ts                   # Git state management
├── services/
│   └── gitService.ts                 # Tauri command wrappers
└── types/
    └── git.ts                        # TypeScript interfaces
```

### 5.4 State Management

```typescript
// src/lib/stores/gitStore.ts
import { writable, derived } from 'svelte/store';

interface GitStore {
  status: GitStatus | null;
  currentDiff: string | null;
  selectedFile: string | null;
  comments: Map<string, DiffComment[]>;
  claudeModifiedFiles: Set<string>;  // Track files Claude edited
  isLoading: boolean;
  error: string | null;
}

export const gitStore = writable<GitStore>({
  status: null,
  currentDiff: null,
  selectedFile: null,
  comments: new Map(),
  claudeModifiedFiles: new Set(),
  isLoading: false,
  error: null
});

// Derived store for files modified by Claude
export const claudeChanges = derived(
  [gitStore, toolActivity],
  ([$git, $tools]) => {
    // Cross-reference tool executions (Write, Edit) with git status
    const claudeFiles = new Set<string>();
    for (const tool of $tools) {
      if ((tool.name === 'Write' || tool.name === 'Edit') && tool.input?.file_path) {
        claudeFiles.add(tool.input.file_path);
      }
    }
    return claudeFiles;
  }
);
```

### 5.5 AI Integration for Commit/PR Messages

Leverage existing Claude query infrastructure:

```typescript
// src/lib/services/gitService.ts

export async function generateCommitMessage(
  diff: string,
  sessionContext: string
): Promise<string> {
  const prompt = `Generate a git commit message for these changes.

## Git Diff
\`\`\`diff
${diff}
\`\`\`

## Context
${sessionContext}

Requirements:
- Use conventional commits format (feat/fix/refactor/docs/etc.)
- First line: imperative mood, max 50 chars
- Body: explain the "why", wrap at 72 chars
- Add "Co-Authored-By: Claude <noreply@anthropic.com>" if AI contributed

Return ONLY the commit message, no explanation.`;

  // Use existing query infrastructure with single-turn mode
  const response = await queryClaude(prompt, {
    maxTurns: 1,
    permissionMode: 'default'
  });

  return response;
}

export async function generatePRDescription(
  commits: GitCommit[],
  diff: string,
  sessionContext: string
): Promise<{ title: string; body: string }> {
  const prompt = `Generate a pull request title and description.

## Commits
${commits.map(c => `- ${c.hash.slice(0,7)} ${c.message}`).join('\n')}

## Full Diff Summary
${summarizeDiff(diff)}

## Session Context
${sessionContext}

Return as JSON: { "title": "...", "body": "..." }
Use markdown in body with ## Summary, ## Changes, ## Test Plan sections.`;

  const response = await queryClaude(prompt, {
    maxTurns: 1,
    permissionMode: 'default'
  });

  return JSON.parse(response);
}
```

---

## 6. Integration with Existing Features

### 6.1 Tool Execution Tracking

When Claude executes `Write` or `Edit` tools, track the files:

```typescript
// In Chat.svelte or toolActivity store
function onToolExecution(tool: ToolExecution) {
  if (tool.name === 'Write' || tool.name === 'Edit') {
    gitStore.update(s => ({
      ...s,
      claudeModifiedFiles: s.claudeModifiedFiles.add(tool.input.file_path)
    }));
  }
}
```

### 6.2 Session Context for AI Messages

Include relevant chat context when generating commit/PR messages:

```typescript
function getSessionContext(): string {
  const recentMessages = messages
    .filter(m => m.role === 'user')
    .slice(-5)
    .map(m => m.content)
    .join('\n');

  return recentMessages;
}
```

### 6.3 Diff Viewer Enhancement

Extend existing `DiffViewer.svelte` component (using `@pierre/diffs`):

```svelte
<!-- Enhanced DiffViewer.svelte -->
<script lang="ts">
  import { Diff } from '@pierre/diffs';
  import InlineComment from './InlineComment.svelte';

  export let diff: string;
  export let filePath: string;
  export let comments: DiffComment[] = [];

  let viewMode: 'split' | 'unified' = 'unified';
</script>

<div class="diff-viewer">
  <header>
    <span class="file-path">{filePath}</span>
    <div class="controls">
      <button on:click={() => explainWithClaude()}>🤖 Explain</button>
      <button class:active={viewMode === 'split'} on:click={() => viewMode = 'split'}>
        Split
      </button>
      <button class:active={viewMode === 'unified'} on:click={() => viewMode = 'unified'}>
        Unified
      </button>
    </div>
  </header>

  <Diff {diff} mode={viewMode}>
    {#each comments as comment}
      <InlineComment {comment} line={comment.lineNumber} />
    {/each}
  </Diff>

  <footer>
    <button on:click={discardChanges}>Discard</button>
    <button on:click={stageFile}>Stage</button>
  </footer>
</div>
```

---

## 7. User Experience

### 7.1 Access Points

1. **Git Panel:** Collapsible panel in sidebar or bottom bar
2. **Keyboard shortcuts:**
   - `Cmd/Ctrl + G` - Open Git panel
   - `Cmd/Ctrl + K` - Quick commit
   - `Cmd/Ctrl + Shift + P` - Create PR
3. **Tool badges:** After Claude edits files, show "View Changes" button
4. **Context menu:** Right-click on file in tool execution to view diff

### 7.2 Workflow Example

1. User asks Claude to "Add a dark mode toggle"
2. Claude executes Write/Edit tools on multiple files
3. Mensa shows toast: "5 files modified • View Changes"
4. User clicks → Git panel opens with staged changes
5. User reviews diffs, adds a comment on one line
6. User clicks "Commit" → AI generates message
7. User tweaks message, clicks "Commit & Push"
8. User clicks "Create PR" → AI generates description
9. PR created, URL shown in Mensa

---

## 8. Security Considerations

### 8.1 Sensitive Files

- Never auto-stage `.env`, credentials, or secret files
- Warn user if attempting to commit sensitive patterns
- Use `.gitignore` patterns for detection

### 8.2 GitHub Authentication

- Prefer `gh` CLI (user's existing auth)
- If using tokens, store securely (OS keychain via Tauri)
- Never log or display tokens

### 8.3 Commit Signing

- Support GPG signing if user has it configured
- Pass through Git's signing configuration

---

## 9. Implementation Phases

### Phase 1: Core Git Operations (Week 1-2)
- [ ] Git status panel with file listing
- [ ] Stage/unstage functionality
- [ ] Basic diff viewer (extend existing)
- [ ] Tauri commands for Git operations

### Phase 2: Commit Workflow (Week 3)
- [ ] Commit dialog UI
- [ ] AI commit message generation
- [ ] Claude file tracking integration
- [ ] Push functionality

### Phase 3: PR Creation (Week 4)
- [ ] PR creation dialog
- [ ] AI PR description generation
- [ ] GitHub API integration via `gh` CLI
- [ ] Branch visualization

### Phase 4: Advanced Features (Week 5-6)
- [ ] Inline diff comments
- [ ] Comment persistence
- [ ] Split/unified view toggle
- [ ] Keyboard shortcuts
- [ ] Settings (default reviewers, templates)

---

## 10. Dependencies

### New Dependencies

```toml
# Cargo.toml
git2 = "0.18"           # Native Git operations
```

```json
// package.json
{
  "devDependencies": {
    "@pierre/diffs": "^x.x.x"  // Already present
  }
}
```

### External Tools

- `gh` CLI (for GitHub operations) - optional but recommended
- Git (system installation)

---

## 11. Open Questions

1. **Multi-repo support:** Should we support workspaces with multiple Git repos?
2. **Conflict resolution:** How to handle merge conflicts in the UI?
3. **Git providers:** Support GitLab/Bitbucket in addition to GitHub?
4. **Comment persistence:** Store inline comments locally or in Git notes?
5. **Offline mode:** How to handle Git operations when offline?

---

## 12. Appendix

### A. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + G` | Toggle Git panel |
| `Cmd/Ctrl + K` | Quick commit |
| `Cmd/Ctrl + Shift + P` | Create PR |
| `Cmd/Ctrl + D` | View diff of selected file |
| `]` / `[` | Next/previous change in diff |
| `S` | Stage selected file |
| `U` | Unstage selected file |

### B. Conventional Commits Reference

```
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Formatting, semicolons, etc.
refactor: Code restructuring
perf:     Performance improvement
test:     Adding tests
chore:    Maintenance tasks
```

### C. Related Documentation

- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [git2-rs Documentation](https://docs.rs/git2)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [Conventional Commits](https://www.conventionalcommits.org/)
