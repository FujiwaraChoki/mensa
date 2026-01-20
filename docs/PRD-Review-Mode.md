# PRD: Review Mode

**Version:** 1.0
**Status:** Draft
**Author:** Mensa Team
**Date:** January 2026

---

## 1. Executive Summary

Review Mode transforms Mensa into an intelligent code review assistant that can analyze local diffs, open pull requests, or any code changes—providing actionable, prioritized feedback without modifying the codebase. Inspired by Codex CLI's `/review` functionality, this feature enables developers to get expert-level code reviews powered by Claude directly within the Mensa interface.

---

## 2. Problem Statement

### Current Pain Points

1. **No Built-in Review:** Users must manually describe code to Claude for review feedback
2. **PR Review Friction:** Reviewing PRs requires switching between GitHub, IDE, and chat tools
3. **Inconsistent Standards:** Code reviews vary in quality and focus areas
4. **Context Loss:** When reviewing PRs, users lose the codebase context that Claude has
5. **No Tracking:** Review comments aren't persisted or tracked for follow-up

### User Stories

- As a developer, I want to get a code review of my local changes before committing
- As a reviewer, I want to analyze a GitHub PR and get AI-powered insights
- As a team lead, I want to enforce consistent code review standards across the team
- As a developer, I want to focus reviews on specific areas (security, performance, etc.)
- As a developer, I want to see prioritized issues so I fix the most important things first

---

## 3. Goals & Success Metrics

### Goals

| Goal | Description |
|------|-------------|
| **G1** | Provide one-click code review for local diffs and PRs |
| **G2** | Surface prioritized, actionable feedback with severity levels |
| **G3** | Support customizable review presets (security, performance, etc.) |
| **G4** | Enable PR integration for remote review workflows |
| **G5** | Persist review findings for tracking and resolution |

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to initiate review | < 3 seconds |
| Issues caught before commit | +40% vs manual review |
| User satisfaction (review quality) | > 4.5/5 |
| Review preset usage | > 60% of reviews use presets |

---

## 4. Feature Specification

### 4.1 Review Mode Entry Points

Users can enter Review Mode through multiple paths:

```
┌─────────────────────────────────────────────────────────────┐
│ Start Review                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📂 Review Local Changes                                    │
│     Review uncommitted changes in your working directory    │
│                                                             │
│  📋 Review Staged Changes                                   │
│     Review only staged files ready for commit               │
│                                                             │
│  🔀 Review Branch                                           │
│     Compare current branch against base (e.g., main)        │
│                                                             │
│  🌐 Review Pull Request                                     │
│     Enter a GitHub PR URL or number to review               │
│     ┌─────────────────────────────────────────────────────┐ │
│     │ https://github.com/user/repo/pull/123              │ │
│     └─────────────────────────────────────────────────────┘ │
│                                                             │
│  📁 Review Specific Files                                   │
│     Select files to include in the review                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Review Presets

Pre-configured review focuses that tune Claude's analysis:

```
┌─────────────────────────────────────────────────────────────┐
│ Select Review Preset                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔍 Comprehensive (Default)                                 │
│     Full review: logic, style, security, performance        │
│                                                             │
│  🔒 Security Focus                                          │
│     OWASP Top 10, injection, auth, secrets exposure         │
│                                                             │
│  ⚡ Performance Focus                                        │
│     N+1 queries, memory leaks, algorithmic complexity       │
│                                                             │
│  📐 Architecture Focus                                       │
│     SOLID principles, coupling, separation of concerns      │
│                                                             │
│  ✨ Style & Consistency                                      │
│     Naming, formatting, code organization                   │
│                                                             │
│  🧪 Test Coverage                                            │
│     Missing tests, edge cases, test quality                 │
│                                                             │
│  ♿ Accessibility (Frontend)                                 │
│     ARIA labels, keyboard nav, color contrast               │
│                                                             │
│  ⚙️ Custom Preset...                                         │
│     Define your own review rules                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Preset Data Model

```typescript
interface ReviewPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  isBuiltIn: boolean;
  focus: ReviewFocus[];
  severity: 'all' | 'critical-only' | 'no-nitpicks';
  customRules?: string[];  // Natural language rules
  filePatterns?: string[]; // Glob patterns to include/exclude
}

type ReviewFocus =
  | 'logic'
  | 'security'
  | 'performance'
  | 'style'
  | 'architecture'
  | 'testing'
  | 'accessibility'
  | 'documentation'
  | 'error-handling'
  | 'types';

interface CustomRule {
  description: string;
  severity: 'error' | 'warning' | 'info';
  examples?: string[];
}
```

#### Built-in Presets Configuration

```typescript
const BUILT_IN_PRESETS: ReviewPreset[] = [
  {
    id: 'comprehensive',
    name: 'Comprehensive',
    icon: '🔍',
    description: 'Full review covering all aspects',
    isBuiltIn: true,
    focus: ['logic', 'security', 'performance', 'style', 'error-handling'],
    severity: 'all'
  },
  {
    id: 'security',
    name: 'Security Focus',
    icon: '🔒',
    description: 'OWASP Top 10, injection, authentication, secrets',
    isBuiltIn: true,
    focus: ['security'],
    severity: 'all',
    customRules: [
      'Check for SQL injection vulnerabilities',
      'Verify input sanitization and validation',
      'Look for hardcoded secrets or API keys',
      'Check authentication and authorization logic',
      'Identify XSS vulnerabilities in frontend code',
      'Review CSRF protection',
      'Check for insecure deserialization',
      'Verify secure communication (HTTPS, TLS)',
    ]
  },
  {
    id: 'performance',
    name: 'Performance Focus',
    icon: '⚡',
    description: 'N+1 queries, memory leaks, complexity',
    isBuiltIn: true,
    focus: ['performance'],
    severity: 'all',
    customRules: [
      'Identify N+1 query patterns in database code',
      'Check for memory leaks (unclosed resources, event listeners)',
      'Review algorithmic complexity (O(n²) or worse)',
      'Look for unnecessary re-renders in React/Svelte',
      'Check for blocking operations on main thread',
      'Identify missing caching opportunities',
      'Review bundle size impact of imports',
    ]
  },
  // ... more presets
];
```

### 4.3 Review Results Interface

The main review output display:

```
┌─────────────────────────────────────────────────────────────┐
│ Review Results                           [Export] [Share]   │
│ Preset: Security Focus | 5 files | 23 findings              │
├─────────────────────────────────────────────────────────────┤
│ Summary                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔴 3 Critical  🟠 8 Warnings  🔵 12 Suggestions         │ │
│ │                                                         │ │
│ │ Key Issues:                                             │ │
│ │ • SQL injection vulnerability in userService.ts:42     │ │
│ │ • Hardcoded API key in config.ts:15                    │ │
│ │ • Missing input validation in formHandler.ts           │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Findings                              [Filter ▼] [Sort ▼]  │
├─────────────────────────────────────────────────────────────┤
│ 🔴 CRITICAL | src/services/userService.ts:42               │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SQL Injection Vulnerability                             │ │
│ │                                                         │ │
│ │ The query uses string interpolation instead of         │ │
│ │ parameterized queries, allowing SQL injection.         │ │
│ │                                                         │ │
│ │ ```typescript                                           │ │
│ │ // Current (vulnerable)                                 │ │
│ │ const query = `SELECT * FROM users WHERE id = ${id}`;  │ │
│ │                                                         │ │
│ │ // Suggested fix                                        │ │
│ │ const query = 'SELECT * FROM users WHERE id = ?';      │ │
│ │ db.query(query, [id]);                                 │ │
│ │ ```                                                     │ │
│ │                                                         │ │
│ │ [View in Diff] [Apply Fix] [Dismiss] [Ask Claude]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🔴 CRITICAL | src/config.ts:15                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Hardcoded API Key                                       │ │
│ │                                                         │ │
│ │ API key is hardcoded in source code. This should be   │ │
│ │ moved to environment variables.                        │ │
│ │                                                         │ │
│ │ [View in Diff] [Apply Fix] [Dismiss] [Ask Claude]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🟠 WARNING | src/components/Form.svelte:78                 │
│ └─ Missing input validation for email field...             │
│                                                             │
│ 🟠 WARNING | src/api/handler.ts:23                         │
│ └─ Error message exposes internal stack trace...           │
│                                                             │
│ [Load More (19 remaining)]                                  │
├─────────────────────────────────────────────────────────────┤
│ Files Reviewed (5)                                          │
│   ✓ src/services/userService.ts    3 findings              │
│   ✓ src/config.ts                  1 finding               │
│   ✓ src/components/Form.svelte     2 findings              │
│   ✓ src/api/handler.ts             4 findings              │
│   ✓ src/utils/auth.ts              0 findings ✨           │
└─────────────────────────────────────────────────────────────┘
```

#### Finding Data Model

```typescript
interface ReviewFinding {
  id: string;
  severity: 'critical' | 'warning' | 'suggestion' | 'nitpick';
  category: ReviewFocus;
  title: string;
  description: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  codeSnippet: string;
  suggestedFix?: {
    description: string;
    code: string;
    isAutoApplicable: boolean;
  };
  references?: string[];  // Links to docs, OWASP, etc.
  status: 'open' | 'fixed' | 'dismissed' | 'wont-fix';
  dismissReason?: string;
}

interface ReviewResult {
  id: string;
  createdAt: Date;
  preset: ReviewPreset;
  source: ReviewSource;
  findings: ReviewFinding[];
  filesReviewed: string[];
  summary: string;
  stats: {
    critical: number;
    warnings: number;
    suggestions: number;
    nitpicks: number;
  };
}

type ReviewSource =
  | { type: 'local-changes' }
  | { type: 'staged' }
  | { type: 'branch'; base: string; head: string }
  | { type: 'pr'; url: string; number: number; repo: string }
  | { type: 'files'; paths: string[] };
```

### 4.4 Pull Request Review Integration

When reviewing a GitHub PR:

```
┌─────────────────────────────────────────────────────────────┐
│ Review PR #123: Add user authentication                     │
│ https://github.com/user/repo/pull/123                       │
├─────────────────────────────────────────────────────────────┤
│ PR Info                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Author: @johndoe                                        │ │
│ │ Branch: feature/auth → main                             │ │
│ │ Status: Open | +892 -124 | 12 files | 8 commits        │ │
│ │ Created: 2 days ago | Updated: 3 hours ago              │ │
│ │                                                         │ │
│ │ Description:                                            │ │
│ │ This PR adds JWT-based authentication with refresh     │ │
│ │ tokens and session management...                        │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Review Options                                              │
│                                                             │
│ Preset: [Security Focus ▼]                                  │
│                                                             │
│ ☑ Include existing PR comments in context                  │
│ ☑ Check against repository's CODEOWNERS rules              │
│ ☐ Review only files I'm assigned to                        │
│                                                             │
│                            [Cancel]  [Start Review 🔍]      │
└─────────────────────────────────────────────────────────────┘
```

#### PR Review Features

1. **Fetch PR Context:**
   - PR description and metadata
   - Existing review comments
   - CI/CD status
   - Related issues

2. **Review Output:**
   - Findings mapped to PR diff lines
   - Option to post comments directly to GitHub
   - Suggest approval/request changes

3. **GitHub Integration:**

```typescript
interface PRReviewOptions {
  prUrl: string;
  preset: ReviewPreset;
  includeExistingComments: boolean;
  respectCodeowners: boolean;
  onlyAssignedFiles: boolean;
}

interface PRComment {
  body: string;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
}

async function postReviewToGitHub(
  prUrl: string,
  findings: ReviewFinding[],
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
): Promise<void> {
  const comments: PRComment[] = findings.map(f => ({
    body: formatFindingAsComment(f),
    path: f.filePath,
    line: f.lineStart,
    side: 'RIGHT'
  }));

  // Use gh CLI to post review
  await exec('gh', [
    'pr', 'review', prUrl,
    '--event', verdict,
    '--body', generateReviewSummary(findings),
    ...comments.flatMap(c => ['--comment', JSON.stringify(c)])
  ]);
}
```

### 4.5 Custom Presets Editor

Allow users to create custom review presets:

```
┌─────────────────────────────────────────────────────────────┐
│ Create Custom Preset                                   [×]  │
├─────────────────────────────────────────────────────────────┤
│ Name:                                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Our Team Standards                                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Icon: [🏢 ▼]                                                │
│                                                             │
│ Focus Areas:                                                │
│ ☑ Logic & Correctness                                      │
│ ☑ Security                                                 │
│ ☐ Performance                                              │
│ ☑ Style & Consistency                                      │
│ ☐ Architecture                                             │
│ ☑ Error Handling                                           │
│ ☐ Testing                                                  │
│ ☐ Accessibility                                            │
│                                                             │
│ Severity Filter:                                            │
│ ○ All findings                                              │
│ ● No nitpicks (warnings and above)                         │
│ ○ Critical only                                             │
│                                                             │
│ Custom Rules (one per line):                                │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ All API endpoints must have rate limiting               │ │
│ │ Database queries must use transactions for writes       │ │
│ │ React components must have PropTypes or TypeScript      │ │
│ │ Error messages must not expose internal details         │ │
│ │ All user inputs must be sanitized                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ File Patterns (optional):                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Include: src/**/*.ts, src/**/*.tsx                      │ │
│ │ Exclude: **/*.test.ts, **/*.spec.ts                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                               [Cancel]  [Save Preset 💾]    │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Finding Actions

Each finding supports multiple actions:

| Action | Description |
|--------|-------------|
| **View in Diff** | Jump to the exact location in the diff viewer |
| **Apply Fix** | Auto-apply the suggested fix (if available) |
| **Dismiss** | Mark as won't fix with optional reason |
| **Ask Claude** | Start a conversation about this specific finding |
| **Copy** | Copy finding details to clipboard |
| **Create Issue** | Create a GitHub issue from the finding |

```typescript
async function applyFix(finding: ReviewFinding): Promise<void> {
  if (!finding.suggestedFix?.isAutoApplicable) {
    throw new Error('Fix cannot be auto-applied');
  }

  // Use Claude to apply the fix via Edit tool
  await queryClaude(`
    Apply this fix to ${finding.filePath}:

    Current code (lines ${finding.lineStart}-${finding.lineEnd}):
    \`\`\`
    ${finding.codeSnippet}
    \`\`\`

    Replace with:
    \`\`\`
    ${finding.suggestedFix.code}
    \`\`\`

    Use the Edit tool to make this change.
  `, {
    maxTurns: 3,
    permissionMode: 'acceptEdits'
  });
}
```

---

## 5. Technical Architecture

### 5.1 Review Engine

The core review logic using Claude Agent SDK:

```typescript
// src/lib/services/reviewService.ts

import { query } from '@anthropic-ai/claude-agent-sdk';

export async function performReview(
  source: ReviewSource,
  preset: ReviewPreset,
  options: ReviewOptions
): Promise<ReviewResult> {
  // 1. Gather diff content
  const diff = await getDiffContent(source);

  // 2. Build review prompt
  const prompt = buildReviewPrompt(diff, preset, options);

  // 3. Execute review via Claude
  const response = await executeReview(prompt, preset);

  // 4. Parse findings
  const findings = parseFindings(response);

  // 5. Construct result
  return {
    id: generateId(),
    createdAt: new Date(),
    preset,
    source,
    findings,
    filesReviewed: extractFiles(diff),
    summary: generateSummary(findings),
    stats: calculateStats(findings)
  };
}

function buildReviewPrompt(
  diff: string,
  preset: ReviewPreset,
  options: ReviewOptions
): string {
  return `You are an expert code reviewer. Analyze the following code changes and provide a detailed review.

## Review Configuration
- Focus areas: ${preset.focus.join(', ')}
- Severity threshold: ${preset.severity}
${preset.customRules ? `- Custom rules:\n${preset.customRules.map(r => `  • ${r}`).join('\n')}` : ''}

## Instructions
1. Analyze each change for issues related to the focus areas
2. For each issue found, provide:
   - Severity: critical | warning | suggestion | nitpick
   - Category: ${preset.focus.join(' | ')}
   - Title: Brief description (max 60 chars)
   - Description: Detailed explanation of the issue
   - File and line numbers
   - Code snippet showing the problem
   - Suggested fix with corrected code (if applicable)
   - Whether the fix can be auto-applied

3. Prioritize issues by severity
4. Be specific and actionable
5. Don't flag style issues unless "style" is in focus areas
6. Reference relevant documentation or standards when applicable

## Output Format
Return findings as a JSON array:
\`\`\`json
[
  {
    "severity": "critical",
    "category": "security",
    "title": "SQL Injection Vulnerability",
    "description": "...",
    "filePath": "src/db.ts",
    "lineStart": 42,
    "lineEnd": 45,
    "codeSnippet": "...",
    "suggestedFix": {
      "description": "Use parameterized queries",
      "code": "...",
      "isAutoApplicable": true
    },
    "references": ["https://owasp.org/..."]
  }
]
\`\`\`

## Code Changes to Review
\`\`\`diff
${diff}
\`\`\`

Provide your review findings:`;
}

async function executeReview(
  prompt: string,
  preset: ReviewPreset
): Promise<string> {
  let response = '';

  for await (const message of query({
    prompt,
    options: {
      maxTurns: 1,  // Single-turn for review
      permissionMode: 'default',  // Read-only, no file modifications
      systemPrompt: {
        type: 'custom',
        content: getReviewSystemPrompt(preset)
      }
    }
  })) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text') {
          response += block.text;
        }
      }
    }
  }

  return response;
}

function getReviewSystemPrompt(preset: ReviewPreset): string {
  return `You are an expert code reviewer specializing in ${preset.focus.join(', ')}.

Your role is to:
- Identify issues in code changes
- Provide actionable, specific feedback
- Prioritize by severity and impact
- Suggest concrete fixes when possible

You must NOT:
- Make any file modifications
- Execute any commands
- Access external resources

Focus on being helpful, specific, and constructive.`;
}
```

### 5.2 Diff Acquisition

Getting diff content from various sources:

```typescript
// src/lib/services/diffService.ts

async function getDiffContent(source: ReviewSource): Promise<string> {
  switch (source.type) {
    case 'local-changes':
      return await invoke('git_diff', {
        workingDir: getWorkspace(),
        staged: false
      });

    case 'staged':
      return await invoke('git_diff', {
        workingDir: getWorkspace(),
        staged: true
      });

    case 'branch':
      return await invoke('git_diff_branch', {
        workingDir: getWorkspace(),
        base: source.base,
        head: source.head
      });

    case 'pr':
      return await fetchPRDiff(source.url);

    case 'files':
      return await invoke('git_diff_files', {
        workingDir: getWorkspace(),
        paths: source.paths
      });
  }
}

async function fetchPRDiff(prUrl: string): Promise<string> {
  // Use gh CLI to fetch PR diff
  const { stdout } = await invoke('run_command', {
    command: 'gh',
    args: ['pr', 'diff', prUrl],
    cwd: getWorkspace()
  });

  return stdout;
}
```

### 5.3 Backend Commands (Tauri)

New Tauri commands for review functionality:

```rust
// src-tauri/src/review.rs

#[tauri::command]
async fn git_diff_branch(
    working_dir: String,
    base: String,
    head: String
) -> Result<String, String> {
    let output = Command::new("git")
        .args(&["diff", &format!("{}...{}", base, head)])
        .current_dir(&working_dir)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn fetch_pr_info(pr_url: String) -> Result<PRInfo, String> {
    // Parse PR URL
    let (owner, repo, number) = parse_pr_url(&pr_url)?;

    // Use gh CLI to get PR info
    let output = Command::new("gh")
        .args(&[
            "pr", "view", &number.to_string(),
            "--repo", &format!("{}/{}", owner, repo),
            "--json", "title,body,author,state,additions,deletions,files,commits"
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    let info: PRInfo = serde_json::from_slice(&output.stdout)
        .map_err(|e| e.to_string())?;

    Ok(info)
}

#[tauri::command]
async fn post_pr_review(
    pr_url: String,
    findings: Vec<ReviewFinding>,
    verdict: String
) -> Result<(), String> {
    // Post review via gh CLI
    // Implementation details...
    Ok(())
}

#[derive(Serialize, Deserialize)]
struct PRInfo {
    title: String,
    body: String,
    author: PRAuthor,
    state: String,
    additions: u32,
    deletions: u32,
    files: Vec<PRFile>,
    commits: Vec<PRCommit>,
}
```

### 5.4 Frontend Components

```
src/lib/
├── components/
│   ├── review/
│   │   ├── ReviewPanel.svelte       # Main review interface
│   │   ├── ReviewLauncher.svelte    # Entry point / source selector
│   │   ├── PresetSelector.svelte    # Preset picker
│   │   ├── PresetEditor.svelte      # Custom preset creation
│   │   ├── FindingCard.svelte       # Individual finding display
│   │   ├── FindingsList.svelte      # Findings list with filters
│   │   ├── ReviewSummary.svelte     # Stats and summary
│   │   ├── PRInfoCard.svelte        # PR metadata display
│   │   └── ReviewHistory.svelte     # Past reviews list
│   └── ...
├── stores/
│   └── reviewStore.ts               # Review state management
├── services/
│   └── reviewService.ts             # Review logic
└── types/
    └── review.ts                    # TypeScript interfaces
```

### 5.5 State Management

```typescript
// src/lib/stores/reviewStore.ts

interface ReviewStore {
  isReviewing: boolean;
  currentReview: ReviewResult | null;
  reviewHistory: ReviewResult[];
  presets: ReviewPreset[];
  selectedPreset: ReviewPreset;
  source: ReviewSource | null;
  error: string | null;
}

export const reviewStore = writable<ReviewStore>({
  isReviewing: false,
  currentReview: null,
  reviewHistory: [],
  presets: BUILT_IN_PRESETS,
  selectedPreset: BUILT_IN_PRESETS[0],
  source: null,
  error: null
});

// Actions
export async function startReview(source: ReviewSource): Promise<void> {
  reviewStore.update(s => ({ ...s, isReviewing: true, source, error: null }));

  try {
    const preset = get(reviewStore).selectedPreset;
    const result = await performReview(source, preset, {});

    reviewStore.update(s => ({
      ...s,
      isReviewing: false,
      currentReview: result,
      reviewHistory: [result, ...s.reviewHistory].slice(0, 50)
    }));

    // Persist history
    await saveReviewHistory(get(reviewStore).reviewHistory);
  } catch (error) {
    reviewStore.update(s => ({
      ...s,
      isReviewing: false,
      error: error.message
    }));
  }
}

export function updateFindingStatus(
  findingId: string,
  status: ReviewFinding['status'],
  reason?: string
): void {
  reviewStore.update(s => {
    if (!s.currentReview) return s;

    const findings = s.currentReview.findings.map(f =>
      f.id === findingId
        ? { ...f, status, dismissReason: reason }
        : f
    );

    return {
      ...s,
      currentReview: { ...s.currentReview, findings }
    };
  });
}
```

---

## 6. User Experience

### 6.1 Access Points

1. **Sidebar button:** Dedicated "Review" button in sidebar
2. **Keyboard shortcut:** `Cmd/Ctrl + R` opens review launcher
3. **Git panel integration:** "Review Changes" button in Git status
4. **Chat command:** Type `/review` in chat input
5. **Context menu:** Right-click on tool execution → "Review these changes"

### 6.2 Review Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Select    │ ──▶ │   Select    │ ──▶ │   Review    │
│   Source    │     │   Preset    │     │  Running... │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Apply     │ ◀── │   Review    │ ◀── │   View      │
│   Fixes     │     │   Finding   │     │  Results    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 6.3 Progress Indication

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Reviewing 12 files...                                    │
│ ████████████░░░░░░░░ 60%                                    │
│                                                             │
│ Currently analyzing: src/services/authService.ts            │
│ Found: 5 critical, 12 warnings so far                       │
│                                                             │
│                                            [Cancel Review]  │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Integration with Visual Git Integration

Review Mode integrates tightly with the Visual Git Integration feature:

### 7.1 Pre-Commit Review

```typescript
// In CommitDialog.svelte
async function handleCommit() {
  // Offer review before commit
  if (await shouldOfferReview()) {
    const userWantsReview = await confirmDialog(
      'Would you like to review changes before committing?'
    );

    if (userWantsReview) {
      await startReview({ type: 'staged' });
      return; // Don't commit yet
    }
  }

  // Proceed with commit
  await createCommit();
}
```

### 7.2 Finding Navigation

Clicking "View in Diff" in a review finding opens the diff viewer from Git Integration:

```typescript
function viewFindingInDiff(finding: ReviewFinding) {
  // Update git store to show the file
  gitStore.update(s => ({
    ...s,
    selectedFile: finding.filePath,
    highlightLines: {
      start: finding.lineStart,
      end: finding.lineEnd
    }
  }));

  // Switch to Git panel
  activatePanel('git');
}
```

### 7.3 Review from Git Panel

The Git status panel includes a "Review" button:

```svelte
<!-- In GitStatus.svelte -->
<div class="git-status-actions">
  <button on:click={() => startReview({ type: 'local-changes' })}>
    🔍 Review Changes
  </button>
  <button on:click={openCommitDialog}>
    Commit
  </button>
</div>
```

---

## 8. Storage & Persistence

### 8.1 Review History

Store review history locally:

```typescript
// Location: ~/.mensa/reviews/
interface StoredReview {
  id: string;
  createdAt: string;
  workspacePath: string;
  preset: string;
  source: ReviewSource;
  stats: ReviewStats;
  findingsCount: number;
}

// Full review data stored separately
// ~/.mensa/reviews/{id}.json
```

### 8.2 Custom Presets

```typescript
// Location: ~/.mensa/presets.json
interface PresetsConfig {
  customPresets: ReviewPreset[];
  defaultPresetId: string;
}
```

### 8.3 Workspace Settings

```typescript
// Location: {workspace}/.mensa/review-config.json
interface WorkspaceReviewConfig {
  defaultPreset?: string;
  customRules?: string[];
  ignorePaths?: string[];
  requireReviewBeforeCommit?: boolean;
}
```

---

## 9. Implementation Phases

### Phase 1: Core Review Engine (Week 1-2)
- [ ] Review service with Claude integration
- [ ] Basic review prompt engineering
- [ ] Finding parser
- [ ] Local diff review support
- [ ] Basic UI (launcher, results list)

### Phase 2: Presets & Configuration (Week 3)
- [ ] Built-in presets implementation
- [ ] Custom preset editor
- [ ] Preset persistence
- [ ] Severity filtering

### Phase 3: PR Integration (Week 4)
- [ ] GitHub PR fetching via `gh` CLI
- [ ] PR info display
- [ ] Post review comments to GitHub
- [ ] PR-specific review options

### Phase 4: Actions & Polish (Week 5)
- [ ] Apply fix functionality
- [ ] Finding dismissal with reasons
- [ ] "Ask Claude" for findings
- [ ] Review history
- [ ] Keyboard shortcuts

### Phase 5: Git Integration (Week 6)
- [ ] Integration with Visual Git feature
- [ ] Pre-commit review prompts
- [ ] Finding → Diff navigation
- [ ] Export/share reviews

---

## 10. Security Considerations

### 10.1 Read-Only Mode

- Review mode should NEVER modify files automatically
- Apply Fix requires explicit user action
- Claude runs with `permissionMode: 'default'` (no auto-accept)

### 10.2 Sensitive Code

- Warn when reviewing files with sensitive patterns
- Don't include secrets in review history
- Sanitize findings before sharing

### 10.3 PR Access

- Use existing `gh` CLI authentication
- Respect repository access permissions
- Don't store PR tokens

---

## 11. Open Questions

1. **Review caching:** Should we cache reviews to avoid re-running on same diff?
2. **Team presets:** How to share presets across a team? Git-committed config?
3. **CI integration:** Should Mensa provide a headless review mode for CI?
4. **Language-specific presets:** Should we have language-aware presets (Python, TypeScript, etc.)?
5. **Learning from dismissals:** Should Claude learn from dismissed findings to reduce false positives?

---

## 12. Appendix

### A. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + R` | Open review launcher |
| `Cmd/Ctrl + Shift + R` | Review staged changes |
| `J` / `K` | Next/previous finding |
| `Enter` | Expand finding details |
| `A` | Apply fix (if available) |
| `D` | Dismiss finding |
| `V` | View in diff |
| `?` | Ask Claude about finding |

### B. Review Prompt Examples

**Security Review:**
```
Focus: SQL injection, XSS, authentication bypass, secrets exposure
Ignore: Style issues, minor performance concerns
Severity: Critical and warnings only
```

**Performance Review:**
```
Focus: N+1 queries, unnecessary re-renders, memory leaks
Check: Database queries, React/Svelte components, event listeners
Severity: All levels
```

### C. Related Documentation

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [GitHub CLI PR Commands](https://cli.github.com/manual/gh_pr)
- [Conventional Comments](https://conventionalcomments.org/)
