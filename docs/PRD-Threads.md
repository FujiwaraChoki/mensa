# PRD: Threads — Multi-Conversation Management for mensa

**Version:** 1.0
**Author:** mensa team
**Date:** January 2026
**Status:** Draft

---

## Overview

Threads enable users to run multiple concurrent Claude Code conversations within mensa. Each thread represents an independent agent session that can work on different tasks simultaneously, with seamless navigation between them.

---

## Problem Statement

Power users often need to:
- Work on multiple tasks in parallel (e.g., debugging one feature while implementing another)
- Keep context-specific conversations isolated
- Switch between different workspaces or projects
- Reference previous conversations without losing current work

Currently, mensa supports only a single conversation, requiring users to either complete one task before starting another or lose their conversation history.

---

## Goals

1. **Parallel Productivity** — Run multiple Claude Code sessions concurrently
2. **Context Preservation** — Each thread maintains its own message history and tool state
3. **Seamless Navigation** — Quick switching between threads without losing state
4. **Resource Awareness** — Visual indication of active/background thread status
5. **Minimal UI Footprint** — Thread management shouldn't clutter the minimal interface

---

## User Stories

### Core Stories

1. **As a user**, I want to create a new conversation thread so I can start a fresh task without losing my current conversation.

2. **As a user**, I want to see all my active threads so I can quickly switch between ongoing tasks.

3. **As a user**, I want to know which threads are actively processing so I can monitor background work.

4. **As a user**, I want to close/archive threads I no longer need to keep my workspace clean.

5. **As a user**, I want threads to persist across app restarts so I don't lose my work.

### Advanced Stories

6. **As a user**, I want to rename threads so I can identify them by task.

7. **As a user**, I want to see a preview of each thread's last message so I know what each conversation is about.

8. **As a user**, I want to duplicate a thread to branch off a conversation.

---

## Proposed Solution

### Thread Model

```typescript
interface Thread {
  id: string;                    // Unique identifier
  title: string;                 // User-editable or auto-generated
  workspacePath: string;         // Associated workspace
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'idle' | 'archived';
  messages: Message[];           // Full conversation history
  toolActivity: ToolExecution[]; // Tool execution history
  preview: string;               // Last message snippet (50 chars)
  isStreaming: boolean;          // Currently receiving response
}
```

### UI Components

#### 1. Thread Sidebar (Left Panel)

A collapsible sidebar showing all threads, toggled via `⌘+T` or clicking a threads icon.

```
┌─────────────────────────────────────────────────┐
│  ● ● ●          mensa ▾                    ≡   │
├──────────┬──────────────────────────────────────┤
│ THREADS  │                                      │
│ + New    │                                      │
│──────────│         New conversation             │
│ ● Auth   │    Ask Claude to help with code      │
│   bug    │                                      │
│   12:34  │                                      │
│──────────│                                      │
│ ◌ Add    │                                      │
│   tests  │                                      │
│   11:20  │                                      │
│──────────│                                      │
│ ◌ Refac- │                                      │
│   tor    │                                      │
│   10:15  │                                      │
├──────────┴──────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ Message Claude...                       ➔   │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

● = Active/streaming
◌ = Idle
```

#### 2. Thread Indicators

- **Header breadcrumb**: Show current thread name in header
- **Activity badge**: Number indicator when background threads have updates
- **Status dot**: Green (active), gray (idle), pulsing (streaming)

#### 3. Thread Actions Menu

Right-click or hover menu on each thread:
- Rename
- Duplicate
- Archive
- Delete

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘+N` | New thread |
| `⌘+T` | Toggle thread sidebar |
| `⌘+W` | Close current thread |
| `⌘+1-9` | Switch to thread 1-9 |
| `⌘+[` | Previous thread |
| `⌘+]` | Next thread |

### Navigation Flow

```
[App Launch]
     │
     ▼
[Load persisted threads from storage]
     │
     ▼
[Show last active thread OR empty state]
     │
     ├─── [⌘+N] ──▶ Create new thread ──▶ Switch to it
     │
     ├─── [⌘+T] ──▶ Open thread sidebar ──▶ Select thread
     │
     └─── [⌘+1-9] ──▶ Direct switch to thread N
```

---

## Technical Architecture

### State Management

Extend the existing Svelte 5 runes-based store:

```typescript
// stores/threads.svelte.ts

interface ThreadsState {
  threads: Thread[];
  activeThreadId: string | null;
  sidebarOpen: boolean;
}

function createThreadsStore() {
  let state = $state<ThreadsState>({
    threads: [],
    activeThreadId: null,
    sidebarOpen: false
  });

  return {
    // Getters
    get all() { return state.threads; },
    get active() { return state.threads.find(t => t.id === state.activeThreadId); },
    get sidebarOpen() { return state.sidebarOpen; },

    // Actions
    create(workspacePath: string): Thread { /* ... */ },
    switch(threadId: string): void { /* ... */ },
    update(threadId: string, updates: Partial<Thread>): void { /* ... */ },
    archive(threadId: string): void { /* ... */ },
    delete(threadId: string): void { /* ... */ },
    toggleSidebar(): void { /* ... */ },

    // Persistence
    persist(): void { /* Save to localStorage/IndexedDB */ },
    restore(): void { /* Load from storage */ }
  };
}
```

### Agent SDK Integration

Each thread maintains its own Claude Agent SDK session:

```typescript
interface ThreadSession {
  threadId: string;
  agentProcess: ChildProcess | null;  // Spawned via Tauri shell
  isConnected: boolean;
}

// Multiple sessions can run concurrently
const sessions = new Map<string, ThreadSession>();

async function createSession(threadId: string, workspacePath: string) {
  // Spawn new agent process for this thread
  const process = await spawn('npx', ['claude-agent', '--workspace', workspacePath]);
  sessions.set(threadId, { threadId, agentProcess: process, isConnected: true });
}
```

### Persistence Strategy

1. **Messages**: Stored in IndexedDB for large datasets
2. **Thread metadata**: Stored in localStorage for quick access
3. **Tool activity**: Kept in memory, optionally persisted

```typescript
// Persistence schema
interface PersistedData {
  threads: Array<{
    id: string;
    title: string;
    workspacePath: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    preview: string;
  }>;
  activeThreadId: string | null;
}

// Messages stored separately in IndexedDB
// Key: thread:{threadId}:messages
// Value: Message[]
```

---

## UI/UX Specifications

### Thread Sidebar Design

```css
/* Minimal, monochromatic sidebar */
.thread-sidebar {
  width: 220px;
  background: var(--gray-50);
  border-right: 1px solid var(--gray-200);
}

.thread-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--gray-100);
  cursor: pointer;
}

.thread-item.active {
  background: var(--white);
  border-left: 2px solid var(--off-black);
}

.thread-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.thread-status.streaming {
  background: var(--off-black);
  animation: pulse 1s ease-in-out infinite;
}
```

### Empty State

When no threads exist:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                      ◈                          │
│                                                 │
│              No conversations yet               │
│                                                 │
│     Press ⌘N to start a new conversation        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Thread Creation Flow

1. User presses `⌘+N`
2. New thread created with auto-generated title ("New conversation")
3. Thread becomes active immediately
4. User starts typing — title auto-updates to first message snippet
5. User can manually rename via right-click menu

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Thread switch time | < 100ms |
| Thread creation time | < 50ms |
| Max concurrent threads | 10+ |
| Memory per idle thread | < 5MB |
| Persistence reliability | 99.9% |

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Thread data model and store
- [ ] Create/switch/delete threads
- [ ] Persist threads to storage
- [ ] Keyboard shortcuts (`⌘+N`, `⌘+T`)

### Phase 2: UI Polish
- [ ] Thread sidebar component
- [ ] Status indicators
- [ ] Thread preview snippets
- [ ] Rename functionality

### Phase 3: Advanced Features
- [ ] Concurrent agent sessions
- [ ] Background activity notifications
- [ ] Thread duplication
- [ ] Search across threads

### Phase 4: Performance
- [ ] Lazy loading for old messages
- [ ] IndexedDB for message storage
- [ ] Memory optimization for idle threads

---

## Open Questions

1. **Thread limits**: Should we cap the number of concurrent threads? (Suggested: 10)
2. **Auto-archive**: Should idle threads auto-archive after N days?
3. **Cross-workspace threads**: Can a thread switch workspaces, or is it locked?
4. **Export**: Should users be able to export thread history as markdown?

---

## Appendix

### Competitive Analysis

| App | Multi-conversation | Background processing |
|-----|-------------------|----------------------|
| ChatGPT | ✓ (sidebar) | ✗ |
| Claude.ai | ✓ (sidebar) | ✗ |
| Cursor | ✓ (tabs) | ✓ (limited) |
| Warp | ✓ (blocks) | ✓ |

### Related PRDs

- PRD: Workspace Management (planned)
- PRD: Command Palette (planned)
