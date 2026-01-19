<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { uiState, appConfig, pendingAttachments, slashCommands } from '$lib/stores/app.svelte';
  import { getEffectiveTheme } from '$lib/services/theme';
  import type { Theme } from '$lib/types';
  import { sessionStore } from '$lib/stores/sessions.svelte';
  import { queryClaudeStreaming, type ClaudeStreamEvent, type ClaudeQueryConfig } from '$lib/services/claude';
  import { openFilePicker, processFile, handlePasteImage, handleDroppedFiles, buildMessageContent, formatFileSize } from '$lib/services/attachments';
  import type { Attachment, ContentBlock, Message, MessageBlock, MentionItem } from '$lib/types';
  import { listWorkspaceFiles, filterMentionItems } from '$lib/services/files';
  import Markdown from './Markdown.svelte';
  import Settings from './Settings.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import InlineTool from './InlineTool.svelte';
  import SubagentGroup from './SubagentGroup.svelte';
  import SessionTabs from './SessionTabs.svelte';
  import QuestionCard from './QuestionCard.svelte';
  import PlanApproval from './PlanApproval.svelte';

  let inputValue = $state('');
  let showSettings = $state(false);
  let showCommandPalette = $state(false);
  let showSessionPicker = $state(false);
  let sessionPickerIndex = $state(0);
  let lightboxImage = $state<{ src: string; alt: string } | null>(null);
  let inputEl: HTMLTextAreaElement;
  let messagesEl: HTMLDivElement;
  let showWorkspaceMenu = $state(false);
  let resumeSessionId = $state<string | null>(null);
  let loadingSession = $state(false);
  let isDragging = $state(false);

  // Derived state from session store
  const currentSession = $derived(sessionStore.activeSession);
  const currentMessages = $derived(currentSession?.messages ?? []);
  const isStreaming = $derived(currentSession?.status === 'streaming');
  const currentSubagentGroups = $derived(currentSession?.subagentGroups ?? []);

  // Theme derived state
  const effectiveTheme = $derived(getEffectiveTheme(appConfig.theme));
  // Before user interacts: show effective theme icon (sun/moon) even for system mode
  // After user interacts: show actual setting icon (sun/moon/monitor)
  const showSystemIcon = $derived(appConfig.themeUserSet && appConfig.theme === 'system');
  const themeTitle = $derived(
    appConfig.theme === 'system'
      ? `System · ${effectiveTheme === 'light' ? 'Light' : 'Dark'}`
      : effectiveTheme === 'light' ? 'Light' : 'Dark'
  );

  // Plan mode state
  const isPlanMode = $derived(currentSession?.planMode ?? false);
  const hasPendingQuestion = $derived(currentSession?.pendingQuestion != null);
  const hasPlanApprovalPending = $derived(currentSession?.planApprovalPending ?? false);

  function togglePlanMode() {
    let sessionId = sessionStore.activeSessionId;

    // Create a session if one doesn't exist
    if (!sessionId) {
      sessionId = sessionStore.createSession();
      sessionStore.switchToSession(sessionId);
    }

    const session = sessionStore.getSession(sessionId);
    if (session) {
      sessionStore.setPlanMode(sessionId, !session.planMode);
    }
  }

  async function handleQuestionAnswer(answers: string[]) {
    if (!currentSession?.pendingQuestion || !currentSession.pendingQuestionToolUseId) return;

    const sessionId = currentSession.id;
    const answer = answers.join(', ');

    // Set resume session ID to continue the Claude conversation
    if (currentSession.claudeSessionId) {
      resumeSessionId = currentSession.claudeSessionId;
    }

    // Clear the pending question
    sessionStore.clearPendingQuestion(sessionId);

    // Add the user's answer as a message
    sessionStore.addMessage(sessionId, { role: 'user', content: answer, blocks: [] });

    // Continue the query with the answer - resuming the same Claude session
    await queryClaudeReal(sessionId, answer);
  }

  async function handleApprovePlan() {
    if (!currentSession) return;

    const sessionId = currentSession.id;

    // Set resume session ID to continue the Claude conversation
    if (currentSession.claudeSessionId) {
      resumeSessionId = currentSession.claudeSessionId;
    }

    // Mark plan as approved and exit plan mode
    sessionStore.approvePlan(sessionId);

    // Add a message indicating plan approval
    sessionStore.addMessage(sessionId, { role: 'user', content: 'Plan approved. Proceeding with implementation.', blocks: [] });

    // Continue with execution mode (acceptEdits) - resuming the same Claude session
    await queryClaudeReal(sessionId, 'The user has approved the plan. Please proceed with the implementation.');
  }

  function handleRejectPlan() {
    if (!currentSession) return;

    const sessionId = currentSession.id;

    // Reject the plan but stay in plan mode
    sessionStore.rejectPlan(sessionId);

    // Add a message indicating plan rejection
    sessionStore.addMessage(sessionId, { role: 'assistant', content: 'Plan rejected. You can provide additional guidance or start a new plan.', blocks: [] });
  }

  // Helper to get subagent group by task tool ID from current session
  function getGroupByTaskToolId(taskToolId: string) {
    return currentSubagentGroups.find(g => g.taskToolId === taskToolId);
  }

  // Slash command autocomplete state
  let showSlashMenu = $state(false);
  let slashMenuIndex = $state(0);
  let slashFilter = $state('');

  // @ mention autocomplete state
  let showMentionMenu = $state(false);

  // Request notification permission on mount
  $effect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  });

  // Send system notification when assistant is done (only if app is in background)
  function sendCompletionNotification() {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Mensa', {
        body: 'Assistant has finished responding',
        icon: '/favicon.png'
      });
    }
  }
  let mentionMenuIndex = $state(0);
  let mentionFilter = $state('');
  let mentionStartIndex = $state(-1); // Position of @ in input
  let mentionCurrentPath = $state(''); // Current directory being browsed
  let mentionItems = $state<MentionItem[]>([]);

  // Computed: filtered slash commands based on input
  const filteredSlashCommands = $derived(() => {
    if (!slashFilter) return slashCommands.all;
    const filter = slashFilter.toLowerCase();
    return slashCommands.all.filter(cmd =>
      cmd.name.toLowerCase().includes(filter) ||
      cmd.description?.toLowerCase().includes(filter)
    );
  });

  // Computed: combined mention items (files + skills)
  const filteredMentionItems = $derived(() => {
    // Convert skills to mention items
    const skillItems: MentionItem[] = slashCommands.all.map(cmd => ({
      type: 'skill' as const,
      value: cmd.name,
      displayName: cmd.name,
    }));

    // Combine and filter
    const allItems = [...mentionItems, ...skillItems];
    return filterMentionItems(allItems, mentionFilter);
  });

  interface SessionMessage {
    role: string;
    content: string;
    timestamp: string;
    tools?: Array<{
      id: string;
      tool: string;
      toolUseId?: string;
      status: 'running' | 'completed' | 'error';
      input?: string;
      output?: string;
      startedAt: string;
      completedAt?: string;
    }>;
    blocks?: Array<
      | { type: 'text'; content: string; order: number }
      | { type: 'tool'; toolId: string; order: number }
      | { type: 'image'; mediaType: string; data: string; order: number }
    >;
  }

  async function loadSessionHistory(claudeSessionId: string) {
    loadingSession = true;
    try {
      const workspacePath = appConfig.workspace?.path || '.';
      const sessionMessages = await invoke<SessionMessage[]>('load_session_messages', {
        workspacePath,
        sessionId: claudeSessionId
      });

      // Create or get a session for this Claude session
      const newSessionId = sessionStore.createSession();
      sessionStore.switchToSession(newSessionId);
      sessionStore.setClaudeSessionId(newSessionId, claudeSessionId);

      // Convert to our message format and add to store
      for (const msg of sessionMessages) {
        sessionStore.addMessage(newSessionId, {
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: new Date(msg.timestamp),
          tools: msg.tools?.map(tool => ({
            ...tool,
            startedAt: new Date(tool.startedAt),
            completedAt: tool.completedAt ? new Date(tool.completedAt) : undefined
          })),
          blocks: msg.blocks
        });
      }

      await tick();
      scrollToBottom();
    } catch (e) {
      console.error('Failed to load session history:', e);
    } finally {
      loadingSession = false;
    }
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function hasToolBlock(message: Message, toolId: string): boolean {
    if (!message.blocks || !toolId) return false;
    return message.blocks.some(block => {
      if (block.type !== 'tool') return false;
      return (block as { type: 'tool'; toolId: string; order: number }).toolId === toolId;
    });
  }

  function sortedBlocks(message: Message): MessageBlock[] {
    if (!message.blocks || message.blocks.length === 0) return [];
    return [...message.blocks].sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Infinity;
      const orderB = typeof b.order === 'number' ? b.order : Infinity;
      return orderA - orderB;
    });
  }

  async function handleInput() {
    const value = inputValue;

    // Check for slash command trigger (at start of input)
    if (value.startsWith('/') && !value.includes(' ')) {
      showSlashMenu = slashCommands.count > 0;
      slashFilter = value.slice(1);
      slashMenuIndex = 0;
      showMentionMenu = false;
      return;
    } else {
      showSlashMenu = false;
      slashFilter = '';
    }

    // Check for @ mention trigger
    // Find the last @ that isn't already completed (no space after the mention text)
    const atMatch = value.match(/@([^\s@]*)$/);
    if (atMatch) {
      const filterText = atMatch[1];
      mentionStartIndex = value.length - atMatch[0].length;
      mentionFilter = filterText;
      mentionMenuIndex = 0;

      // Check if filter contains a path separator - load that directory
      const lastSlashIdx = filterText.lastIndexOf('/');
      if (lastSlashIdx >= 0) {
        const dirPath = filterText.substring(0, lastSlashIdx);
        if (dirPath !== mentionCurrentPath) {
          mentionCurrentPath = dirPath;
          await loadMentionFiles(dirPath);
        }
        // Update filter to just the part after the last /
        mentionFilter = filterText.substring(lastSlashIdx + 1);
      } else if (mentionCurrentPath !== '') {
        // Reset to root if no path separator
        mentionCurrentPath = '';
        await loadMentionFiles('');
      } else if (mentionItems.length === 0) {
        // Initial load
        await loadMentionFiles('');
      }

      showMentionMenu = true;
    } else {
      showMentionMenu = false;
      mentionFilter = '';
      mentionStartIndex = -1;
    }
  }

  async function loadMentionFiles(relativePath: string) {
    const workspacePath = appConfig.workspace?.path;
    if (!workspacePath) {
      mentionItems = [];
      return;
    }
    mentionItems = await listWorkspaceFiles(workspacePath, relativePath);
  }

  function selectSlashCommand(commandName: string) {
    inputValue = '/' + commandName + ' ';
    showSlashMenu = false;
    slashFilter = '';
    inputEl?.focus();
  }

  async function selectMention(item: MentionItem) {
    // If it's a directory, navigate into it
    if (item.isDirectory) {
      const newPath = mentionCurrentPath ? `${mentionCurrentPath}/${item.displayName}` : item.displayName;
      // Replace the current @ mention with the directory path
      const beforeAt = inputValue.substring(0, mentionStartIndex);
      inputValue = beforeAt + '@' + newPath + '/';
      mentionCurrentPath = newPath;
      mentionFilter = '';
      mentionMenuIndex = 0;
      await loadMentionFiles(newPath);
      inputEl?.focus();
      return;
    }

    // For files and skills, insert the completed mention
    const beforeAt = inputValue.substring(0, mentionStartIndex);
    const prefix = item.type === 'file' ? '' : '/';
    inputValue = beforeAt + prefix + item.value + ' ';

    showMentionMenu = false;
    mentionFilter = '';
    mentionStartIndex = -1;
    mentionCurrentPath = '';
    inputEl?.focus();
  }

  async function handleKeydown(e: KeyboardEvent) {
    // Shift+Tab to toggle plan mode
    if (e.key === 'Tab' && e.shiftKey && !isStreaming) {
      e.preventDefault();
      togglePlanMode();
      return;
    }

    // Handle slash menu navigation
    if (showSlashMenu) {
      const commands = filteredSlashCommands();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slashMenuIndex = Math.min(slashMenuIndex + 1, commands.length - 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slashMenuIndex = Math.max(slashMenuIndex - 1, 0);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && commands.length > 0) {
        e.preventDefault();
        selectSlashCommand(commands[slashMenuIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        showSlashMenu = false;
        return;
      }
    }

    // Handle mention menu navigation
    if (showMentionMenu) {
      const items = filteredMentionItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionMenuIndex = Math.min(mentionMenuIndex + 1, items.length - 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionMenuIndex = Math.max(mentionMenuIndex - 1, 0);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items.length > 0) {
        e.preventDefault();
        await selectMention(items[mentionMenuIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        showMentionMenu = false;
        mentionCurrentPath = '';
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await sendMessage();
    }
  }

  async function sendMessage() {
    const content = inputValue.trim();
    const attachments = [...pendingAttachments.all];

    if ((!content && attachments.length === 0) || isStreaming) return;

    // Ensure we have an active session, or create one
    let sessionId = sessionStore.activeSessionId;
    if (!sessionId) {
      sessionId = sessionStore.createSession();
      sessionStore.switchToSession(sessionId);
    }

    // Add message with attachments for display
    sessionStore.addMessage(sessionId, { role: 'user', content, attachments: attachments.length > 0 ? attachments : undefined });
    inputValue = '';
    pendingAttachments.clear();

    await tick();
    scrollToBottom();

    // Build content blocks for Claude if there are attachments
    const messageContent = attachments.length > 0
      ? buildMessageContent(content, attachments)
      : content;

    await queryClaudeReal(sessionId, messageContent);
  }

  async function queryClaudeReal(sessionId: string, prompt: string | ContentBlock[]) {
    const logPrompt = typeof prompt === 'string' ? prompt.substring(0, 50) : '[content blocks]';
    console.log('[queryClaudeReal] CALLED with prompt:', logPrompt, 'session:', sessionId);

    // Set session to streaming
    sessionStore.setStatus(sessionId, 'streaming');
    sessionStore.addMessage(sessionId, { role: 'assistant', content: '', blocks: [] });

    const workingDir = appConfig.workspace?.path || '.';
    const session = sessionStore.getSession(sessionId);
    const config: ClaudeQueryConfig = {
      // Use plan mode if session is in plan mode, otherwise use app config
      permissionMode: session?.planMode ? 'plan' : appConfig.claude.permissionMode,
      maxTurns: appConfig.claude.maxTurns,
      mcpServers: appConfig.claude.mcpServers,
      // Skills configuration
      enableSkills: appConfig.claude.skills.enabled,
      settingSources: appConfig.claude.skills.enabled
        ? appConfig.claude.skills.settingSources
        : []
    };

    // Capture resume session ID and clear it
    const currentResumeSession = resumeSessionId;
    resumeSessionId = null;

    try {
      let blockOrder = 0;
      // Note: The service layer (claude.ts) already filters events by queryId,
      // so we don't need to filter here. Each callback only receives its own events.
      const handle = await queryClaudeStreaming(prompt, workingDir, (event: ClaudeStreamEvent) => {
        console.log('[chat] RECEIVED event:', event.type, 'for session:', sessionId);

        switch (event.type) {
          case 'text':
            if (event.content) {
              sessionStore.appendTextToLast(sessionId, event.content, ++blockOrder);
              scrollToBottom();
            }
            break;

          case 'tool_use':
            console.log('[chat] RECEIVED tool_use:', event);
            if (event.tool) {
              console.log('[chat] Adding tool:', event.tool.name, 'input:', event.tool.input);
              const toolKey = event.tool.id || event.tool.name;
              const toolInput = typeof event.tool.input === 'string'
                ? event.tool.input
                : JSON.stringify(event.tool.input, null, 2);

              // Check if this is a Task tool (subagent)
              const isTaskTool = event.tool.name === 'Task';
              let parentSubagentId: string | undefined;

              if (isTaskTool) {
                // Parse Task input to get description and subagent_type
                let description = '';
                let subagentType = 'Task';
                try {
                  const parsed = typeof event.tool.input === 'string'
                    ? JSON.parse(event.tool.input)
                    : event.tool.input;
                  description = parsed?.description || '';
                  subagentType = parsed?.subagent_type || 'Task';
                } catch {
                  // Ignore parse errors
                }

                // Start a new subagent group
                sessionStore.startSubagent(
                  sessionId,
                  event.tool.id || toolKey,
                  description,
                  subagentType
                );
              } else {
                // Check if there's an active subagent for this session
                const activeSubagent = sessionStore.getActiveSubagent(sessionId);
                if (activeSubagent) {
                  parentSubagentId = activeSubagent.id;
                }
              }

              // Add pending tool mapping
              const messageToolId = sessionStore.addToolToLast(sessionId, {
                tool: event.tool.name,
                status: 'running',
                input: toolInput,
                toolUseId: event.tool.id
              }, true, ++blockOrder, parentSubagentId);

              if (messageToolId) {
                sessionStore.addPendingTool(sessionId, toolKey, messageToolId);

                // Track child tool in subagent group
                if (parentSubagentId) {
                  sessionStore.addChildToolToSubagent(sessionId, parentSubagentId, messageToolId);
                }
              }
            } else {
              console.log('[chat] WARNING: event.tool is falsy!');
            }
            break;

          case 'tool_result':
            console.log('[chat] RECEIVED tool_result:', event);
            if (event.tool?.name) {
              const toolKey = event.tool.id || event.tool.name;
              const toolId = sessionStore.popPendingTool(sessionId, toolKey);
              console.log('[chat] Looking for pending tool:', event.tool.name, 'found id:', toolId);

              if (toolId) {
                sessionStore.completeTool(sessionId, toolId, event.tool.result);

                // If this is a Task tool completing, complete the subagent group
                const session = sessionStore.sessions.get(sessionId);
                const tool = session?.tools.find(t => t.id === toolId);
                if (tool?.tool === 'Task') {
                  sessionStore.completeSubagent(sessionId, event.tool.id || toolKey);
                }
              }
            }
            break;

          case 'error':
            console.log('[chat] RECEIVED error:', event.error);
            sessionStore.updateLastMessage(sessionId, `Error: ${event.error}`);
            sessionStore.setStatus(sessionId, 'error', event.error);
            break;

          case 'cancelled':
            console.log('[chat] RECEIVED cancelled:', event.reason);
            sessionStore.setStatus(sessionId, 'cancelled');
            break;

          case 'system_init':
            console.log('[chat] RECEIVED system_init, slash commands:', event.slashCommands?.length, 'sessionId:', event.sessionId);
            if (event.slashCommands && event.slashCommands.length > 0) {
              slashCommands.set(event.slashCommands);
            }
            // Store the Claude session ID for resume functionality
            if (event.sessionId) {
              sessionStore.setClaudeSessionId(sessionId, event.sessionId);
            }
            break;

          case 'ask_user_question':
            console.log('[chat] RECEIVED ask_user_question:', event.questions);
            if (event.questions && event.questions.length > 0 && event.toolUseId) {
              // Store the first question (we handle one at a time)
              sessionStore.setPendingQuestion(sessionId, event.questions[0], event.toolUseId);
              scrollToBottom();
            }
            break;

          case 'exit_plan_mode':
            console.log('[chat] RECEIVED exit_plan_mode:', event.allowedPrompts, 'planContent length:', event.planContent?.length);
            // Use plan content from event if available, otherwise try to read from file
            if (event.planContent) {
              sessionStore.setPlanFile(sessionId, 'plan.md', event.planContent);
              sessionStore.setPlanApprovalPending(sessionId, true, event.allowedPrompts);
              scrollToBottom();
            } else {
              // Fallback: read the most recent plan file from ~/.claude/plans/
              invoke<string[]>('list_plan_files', { workspacePath: workingDir })
                .then(planFiles => {
                  if (planFiles.length > 0) {
                    console.log('[chat] Found plan files:', planFiles.slice(0, 3));
                    return invoke<string>('read_plan_file', {
                      workspacePath: workingDir,
                      planFilename: planFiles[0]
                    }).then(planContent => {
                      console.log('[chat] Read plan content, length:', planContent.length);
                      sessionStore.setPlanFile(sessionId, planFiles[0], planContent);
                      sessionStore.setPlanApprovalPending(sessionId, true, event.allowedPrompts);
                      scrollToBottom();
                    });
                  } else {
                    console.warn('[chat] No plan files found in ~/.claude/plans/');
                    // Still show approval UI with a message about missing plan
                    sessionStore.setPlanFile(sessionId, 'plan.md', '*Plan file not found. Claude may still be writing it, or it was not created.*');
                    sessionStore.setPlanApprovalPending(sessionId, true, event.allowedPrompts);
                    scrollToBottom();
                  }
                })
                .catch(e => {
                  console.error('[chat] Failed to read plan file:', e);
                  // Show error in plan approval UI
                  sessionStore.setPlanFile(sessionId, 'plan.md', `*Error reading plan: ${e}*`);
                  sessionStore.setPlanApprovalPending(sessionId, true, event.allowedPrompts);
                  scrollToBottom();
                });
            }
            break;

          case 'done':
            console.log('[chat] RECEIVED done');
            // Clear pending tools for this session
            sessionStore.clearPendingTools(sessionId);
            // Complete any remaining active subagent groups
            const activeGroup = sessionStore.getActiveSubagent(sessionId);
            if (activeGroup) {
              sessionStore.completeSubagent(sessionId, activeGroup.taskToolId);
            }
            // Mark session as completed (unless it's already in error/cancelled state)
            const currentSession = sessionStore.sessions.get(sessionId);
            if (currentSession?.status === 'streaming') {
              sessionStore.setStatus(sessionId, 'completed');
              sendCompletionNotification();
            }
            break;
        }
      }, config, currentResumeSession || undefined);

      // Store the query handle for cancellation
      sessionStore.setQueryHandle(sessionId, handle);

    } catch (error) {
      sessionStore.updateLastMessage(sessionId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      sessionStore.setStatus(sessionId, 'error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function autoResize(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
  }

  function toggleWorkspaceMenu() {
    showWorkspaceMenu = !showWorkspaceMenu;
  }

  function closeWorkspaceMenu() {
    showWorkspaceMenu = false;
  }

  async function selectNewWorkspace() {
    closeWorkspaceMenu();
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select workspace folder'
      });

      if (selected && typeof selected === 'string') {
        const name = selected.split('/').pop() || selected;
        appConfig.setWorkspace({
          path: selected,
          name,
          lastOpened: new Date()
        });
        // Clear all sessions when switching workspace
        sessionStore.clearAll();
      }
    } catch (e) {
      console.error('Failed to select directory:', e);
    }
  }

  function startNewThread() {
    // Create a new session and switch to it
    const sessionId = sessionStore.createSession();
    sessionStore.switchToSession(sessionId);
    pendingAttachments.clear();
    resumeSessionId = null;
  }

  function cycleTheme() {
    const themes: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(appConfig.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    appConfig.setTheme(themes[nextIndex]);
  }

  // Attachment handlers
  async function handleAddAttachment() {
    if (!pendingAttachments.canAdd || isStreaming) return;

    const paths = await openFilePicker();
    if (!paths) return;

    for (const path of paths) {
      if (!pendingAttachments.canAdd) break;
      const result = await processFile(path);
      if ('error' in result) {
        console.error('[chat] Attachment error:', result.error);
        // Could show a toast notification here
      } else {
        pendingAttachments.add(result);
      }
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    if (!pendingAttachments.canAdd || isStreaming) return;

    const attachment = await handlePasteImage(e);
    if (attachment) {
      e.preventDefault();
      pendingAttachments.add(attachment);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      isDragging = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    // Only set dragging to false if we're leaving the container
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
      isDragging = false;
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;

    if (!pendingAttachments.canAdd || isStreaming) return;
    if (!e.dataTransfer?.files.length) return;

    const results = await handleDroppedFiles(e.dataTransfer.files);
    for (const result of results) {
      if (!pendingAttachments.canAdd) break;
      if ('error' in result) {
        console.error('[chat] Drop error:', result.error);
      } else {
        pendingAttachments.add(result);
      }
    }
  }

  function handleRemoveAttachment(id: string) {
    pendingAttachments.remove(id);
  }

  // Keyboard shortcuts
  function handleGlobalKeydown(e: KeyboardEvent) {
    // Handle session picker navigation when open
    if (showSessionPicker) {
      const sessions = sessionStore.sessionList;
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        sessionPickerIndex = (sessionPickerIndex + 1) % sessions.length;
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        sessionPickerIndex = (sessionPickerIndex - 1 + sessions.length) % sessions.length;
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (sessions[sessionPickerIndex]) {
          sessionStore.switchToSession(sessions[sessionPickerIndex].id);
        }
        showSessionPicker = false;
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        showSessionPicker = false;
        return;
      }
    }

    // ⌘ + T for session picker (switch between tabs)
    if (e.metaKey && e.key === 't') {
      e.preventDefault();
      const sessions = sessionStore.sessionList;
      if (sessions.length > 0) {
        // Find current session index
        const currentIdx = sessions.findIndex(s => s.id === sessionStore.activeSessionId);
        sessionPickerIndex = currentIdx >= 0 ? currentIdx : 0;
        showSessionPicker = true;
      }
    }
    // ⌘ + K for command palette (threads)
    if (e.metaKey && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = true;
    }
    // ⌘ + N for new session
    if (e.metaKey && e.key === 'n') {
      e.preventDefault();
      startNewThread();
    }
    // ⌘ + W to close current session
    if (e.metaKey && e.key === 'w') {
      e.preventDefault();
      if (currentSession) {
        sessionStore.closeSession(currentSession.id);
      }
    }
    // ⌘ + , for settings
    if (e.metaKey && e.key === ',') {
      e.preventDefault();
      showSettings = true;
    }
    // ⌘ + Shift + R to reset app (dev only)
    if (e.metaKey && e.shiftKey && e.key === 'r') {
      e.preventDefault();
      appConfig.reset();
      sessionStore.clearAll();
      window.location.reload();
    }
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

<div
  class="chat-container"
  class:dragging={isDragging}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="application"
  aria-label="Chat"
>
  <!-- Header -->
  <header class="header drag-region" data-tauri-drag-region>
    <div class="header-center no-drag">
      <div class="workspace-wrapper">
        <button class="workspace-btn" onclick={toggleWorkspaceMenu} title="Change workspace">
          <span class="workspace-name">{appConfig.workspace?.name || 'mensa'}</span>
          <svg class="chevron" class:open={showWorkspaceMenu} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {#if showWorkspaceMenu}
          <div class="workspace-menu" in:fly={{ y: -8, duration: 150 }} out:fade={{ duration: 100 }}>
            <button class="menu-item" onclick={selectNewWorkspace}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <path d="M12 11v6M9 14h6"/>
              </svg>
              <span>Open workspace...</span>
            </button>
            <div class="menu-divider"></div>
            <div class="menu-info">
              <span class="menu-label">Current</span>
              <span class="menu-path">{appConfig.workspace?.path || 'None'}</span>
            </div>
          </div>
          <button class="menu-backdrop" onclick={closeWorkspaceMenu} aria-label="Close menu"></button>
        {/if}
      </div>
    </div>
    <div class="header-right no-drag">
      <button
        class="icon-btn"
        onclick={cycleTheme}
        title={themeTitle}
      >
        {#if showSystemIcon}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
          </svg>
        {:else if effectiveTheme === 'light'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        {/if}
      </button>
      <button
        class="icon-btn"
        onclick={startNewThread}
        title="New thread (⌘N)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
      <button
        class="icon-btn"
        onclick={() => showCommandPalette = true}
        title="Threads (⌘K)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
      <button
        class="icon-btn"
        onclick={() => showSettings = true}
        title="Settings (⌘,)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </header>

  <!-- Session Tabs -->
  <SessionTabs oncreate={startNewThread} />

  <div class="main">
    <!-- Chat column (messages + input) -->
    <div class="chat-column">
      <div class="messages-container" bind:this={messagesEl}>
        <div class="messages-inner">
          {#if currentMessages.length === 0}
            <div class="empty-state" in:fade>
              {#if loadingSession}
                <span class="spinner"></span>
                <p class="empty-title">Loading conversation...</p>
              {:else if resumeSessionId}
                <span class="empty-icon">◈</span>
                <p class="empty-title">Continue conversation</p>
                <p class="empty-hint">Send a message to resume this thread</p>
              {:else}
                <span class="empty-icon">◈</span>
                <p class="empty-title">New conversation</p>
                <p class="empty-hint">Ask Claude to help with your code</p>
              {/if}
            </div>
          {:else}
            <div class="messages-list">
              {#each currentMessages as message (message.id)}
                <div
                  class="message"
                  class:user={message.role === 'user'}
                  class:assistant={message.role === 'assistant'}
                  in:fly={{ y: 10, duration: 300, easing: quintOut }}
                >
                  {#if message.role === 'assistant'}
                    <div class="message-avatar">◈</div>
                  {/if}
                  <div class="message-body">
                    {#if message.role === 'user' && message.attachments?.length}
                      <div class="message-attachments">
                        {#each message.attachments as attachment (attachment.id)}
                          {#if attachment.type === 'image' && attachment.previewUrl}
                            <img class="attachment-image" src={attachment.previewUrl} alt={attachment.name} />
                          {:else}
                            <div class="attachment-file">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span>{attachment.name}</span>
                            </div>
                          {/if}
                        {/each}
                      </div>
                    {/if}
                    {#if message.blocks?.length}
                      <div class="message-sequence">
                        {#each sortedBlocks(message) as block, idx (idx)}
                          {#if block.type === 'text'}
                            {@const textContent = (block as { content: string }).content}
                            <!-- Skip [Image: ...] text if we have actual image blocks -->
                            {#if !textContent.match(/^\[Image: source:/)}
                              <div class="message-text">
                                {#if message.role === 'assistant'}
                                  <Markdown content={textContent} />
                                {:else}
                                  {textContent}
                                {/if}
                              </div>
                            {/if}
                          {:else if block.type === 'tool'}
                            {@const toolId = (block as { toolId: string }).toolId}
                            {@const tool = message.tools?.find(t => t.id === toolId)}
                            {#if tool}
                              {#if tool.tool === 'Task'}
                                <!-- Render Task tools as SubagentGroup -->
                                {@const group = getGroupByTaskToolId(tool.toolUseId || tool.id)}
                                {#if group}
                                  {@const childTools = message.tools?.filter(t => t.parentSubagentId === group.id) || []}
                                  <SubagentGroup {group} tools={childTools} />
                                {:else}
                                  <!-- No group found, render as regular tool -->
                                  <InlineTool {tool} />
                                {/if}
                              {:else if !tool.parentSubagentId}
                                <!-- Only render non-child tools at top level -->
                                <InlineTool {tool} />
                              {/if}
                              <!-- Child tools are rendered inside SubagentGroup, skip them here -->
                            {:else}
                              <!-- Tool block exists but no matching tool found - render placeholder -->
                              <div class="tool-missing">Tool not found: {toolId}</div>
                            {/if}
                          {:else if block.type === 'image'}
                            {@const imageBlock = block as { mediaType: string; data: string }}
                            {@const imageSrc = `data:${imageBlock.mediaType};base64,${imageBlock.data}`}
                            <button
                              class="message-image-thumbnail"
                              onclick={() => lightboxImage = { src: imageSrc, alt: 'Uploaded content' }}
                              title="Click to view full size"
                            >
                              <img
                                src={imageSrc}
                                alt="Uploaded content"
                                loading="lazy"
                              />
                            </button>
                          {/if}
                        {/each}
                        <!-- Fallback: render any tools that don't have blocks -->
                        {#if message.role === 'assistant' && message.tools?.length}
                          {#each message.tools as tool (tool.id)}
                            {#if !hasToolBlock(message, tool.id) && !tool.parentSubagentId}
                              {#if tool.tool === 'Task'}
                                {@const group = getGroupByTaskToolId(tool.toolUseId || tool.id)}
                                {#if group}
                                  {@const childTools = message.tools?.filter(t => t.parentSubagentId === group.id) || []}
                                  <SubagentGroup {group} tools={childTools} />
                                {:else}
                                  <InlineTool {tool} />
                                {/if}
                              {:else}
                                <InlineTool {tool} />
                              {/if}
                            {/if}
                          {/each}
                        {/if}
                      </div>
                    {:else}
                      {#if message.role === 'assistant' && message.tools?.length}
                        <div class="inline-tools">
                          {#each message.tools as tool (tool.id)}
                            {#if !tool.parentSubagentId}
                              {#if tool.tool === 'Task'}
                                {@const group = getGroupByTaskToolId(tool.toolUseId || tool.id)}
                                {#if group}
                                  {@const childTools = message.tools?.filter(t => t.parentSubagentId === group.id) || []}
                                  <SubagentGroup {group} tools={childTools} />
                                {:else}
                                  <InlineTool {tool} />
                                {/if}
                              {:else}
                                <InlineTool {tool} />
                              {/if}
                            {/if}
                          {/each}
                        </div>
                      {/if}
                      <div class="message-text">
                        {#if message.role === 'assistant' && message.content === '' && isStreaming}
                          <span class="typing-indicator">
                            <span class="dot"></span>
                            <span class="dot"></span>
                            <span class="dot"></span>
                          </span>
                        {:else if message.role === 'assistant'}
                          <Markdown content={message.content} />
                        {:else if message.content}
                          {message.content}
                        {/if}
                      </div>
                    {/if}
                    <span class="message-time">{formatTime(message.timestamp)}</span>
                  </div>
                </div>
              {/each}

              <!-- Plan mode interactive components -->
              {#if hasPendingQuestion && currentSession?.pendingQuestion}
                <QuestionCard
                  question={currentSession.pendingQuestion}
                  onAnswer={handleQuestionAnswer}
                />
              {/if}

              {#if hasPlanApprovalPending && currentSession?.planContent}
                <PlanApproval
                  planContent={currentSession.planContent}
                  permissions={currentSession.planApprovedPermissions}
                  onApprove={handleApprovePlan}
                  onReject={handleRejectPlan}
                />
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- Input -->
      <div class="input-area">
        <div class="input-inner">
          <!-- Attachment previews -->
          <!-- Plan mode banner -->
          {#if isPlanMode}
            <div class="plan-mode-banner" in:fly={{ y: 5, duration: 150 }}>
              <span class="plan-mode-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>
                </svg>
              </span>
              <span class="plan-mode-text">Plan Mode - Claude will analyze and plan without making changes</span>
              <button class="plan-mode-dismiss" onclick={togglePlanMode} title="Exit Plan Mode">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          {/if}

          {#if pendingAttachments.count > 0}
            <div class="attachment-previews" in:fly={{ y: 10, duration: 150 }}>
              {#each pendingAttachments.all as attachment (attachment.id)}
                <div class="attachment-preview" in:fly={{ y: 5, duration: 100 }}>
                  {#if attachment.type === 'image' && attachment.previewUrl}
                    <img src={attachment.previewUrl} alt={attachment.name} />
                  {:else}
                    <div class="file-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                  {/if}
                  <button
                    class="remove-attachment"
                    onclick={() => handleRemoveAttachment(attachment.id)}
                    title="Remove attachment"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                  <span class="attachment-name">{attachment.name}</span>
                </div>
              {/each}
            </div>
          {/if}

          <div class="input-box" class:plan-mode-active={isPlanMode}>
            <!-- Attachment button -->
            <button
              class="attach-btn"
              onclick={handleAddAttachment}
              disabled={!pendingAttachments.canAdd || isStreaming}
              title="Attach files"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <textarea
              bind:this={inputEl}
              bind:value={inputValue}
              placeholder="Message Claude..."
              rows="1"
              onkeydown={handleKeydown}
              oninput={(e) => { autoResize(e); handleInput(); }}
              onpaste={handlePaste}
              disabled={isStreaming}
            ></textarea>
            <button
              class="plan-mode-btn"
              class:active={isPlanMode}
              onclick={togglePlanMode}
              disabled={isStreaming}
              title="Plan Mode (Shift+Tab)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18"/>
              </svg>
            </button>
            <button
              class="send-btn"
              disabled={(!inputValue.trim() && pendingAttachments.count === 0) || isStreaming}
              onclick={sendMessage}
            >
              {#if isStreaming}
                <span class="spinner"></span>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              {/if}
            </button>
          </div>

          <!-- Slash command autocomplete menu -->
          {#if showSlashMenu && filteredSlashCommands().length > 0}
            <div class="slash-menu" transition:fly={{ y: 10, duration: 150 }}>
              {#each filteredSlashCommands() as cmd, idx (cmd.name)}
                <button
                  class="slash-item"
                  class:selected={idx === slashMenuIndex}
                  onclick={() => selectSlashCommand(cmd.name)}
                  type="button"
                >
                  <span class="slash-name">/{cmd.name}</span>
                  {#if cmd.description}
                    <span class="slash-desc">{cmd.description}</span>
                  {/if}
                  <span class="slash-source">{cmd.source}</span>
                </button>
              {/each}
            </div>
          {/if}

          <!-- @ mention autocomplete menu -->
          {#if showMentionMenu && filteredMentionItems().length > 0}
            <div class="mention-menu" transition:fly={{ y: 10, duration: 150 }}>
              {#if mentionCurrentPath}
                <div class="mention-path">
                  <span class="mention-path-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </span>
                  <span>{mentionCurrentPath}/</span>
                </div>
              {/if}
              {#each filteredMentionItems() as item, idx (item.type + ':' + item.value)}
                <button
                  class="mention-item"
                  class:selected={idx === mentionMenuIndex}
                  onclick={() => selectMention(item)}
                  type="button"
                >
                  <span class="mention-icon">
                    {#if item.type === 'skill'}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                    {:else if item.isDirectory}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    {:else}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                      </svg>
                    {/if}
                  </span>
                  <span class="mention-name">{item.displayName}</span>
                  {#if item.type === 'skill'}
                    <span class="mention-type">skill</span>
                  {:else if item.isDirectory}
                    <span class="mention-type">folder</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else if showMentionMenu && filteredMentionItems().length === 0}
            <div class="mention-menu mention-empty" transition:fly={{ y: 10, duration: 150 }}>
              <span class="mention-empty-text">No matches</span>
            </div>
          {/if}

          <p class="input-hint">
            <kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line · <kbd>⇧⇥</kbd> plan mode{#if slashCommands.count > 0} · <kbd>/</kbd> commands{/if} · <kbd>@</kbd> files
          </p>
        </div>
      </div>
    </div>

    <!-- Drag overlay -->
    {#if isDragging}
      <div class="drag-overlay" in:fade={{ duration: 100 }} out:fade={{ duration: 100 }}>
        <div class="drag-content">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
          <p>Drop files to attach</p>
        </div>
      </div>
    {/if}

  </div>
</div>

{#if showSettings}
  <Settings onclose={() => showSettings = false} />
{/if}

{#if showCommandPalette}
  <CommandPalette
    onclose={() => showCommandPalette = false}
    onselect={async (claudeSessionId) => {
      showCommandPalette = false;
      // Set the resume session ID for the next query
      resumeSessionId = claudeSessionId;
      // Load session history (creates a new session and switches to it)
      await loadSessionHistory(claudeSessionId);
      // Focus input so user can type next message
      setTimeout(() => inputEl?.focus(), 50);
    }}
  />
{/if}

{#if showSessionPicker && sessionStore.sessionList.length > 0}
  <div
    class="session-picker-overlay"
    onclick={() => showSessionPicker = false}
    onkeydown={(e) => e.key === 'Escape' && (showSessionPicker = false)}
    role="dialog"
    aria-modal="true"
    aria-label="Switch session"
    tabindex="-1"
    in:fade={{ duration: 100 }}
    out:fade={{ duration: 75 }}
  >
    <div class="session-picker" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="listbox" tabindex="-1" in:fly={{ y: -10, duration: 150 }}>
      <div class="session-picker-header">
        <span>Switch Session</span>
        <kbd>⌘T</kbd>
      </div>
      <div class="session-picker-list">
        {#each sessionStore.sessionList as session, idx (session.id)}
          <button
            class="session-picker-item"
            class:selected={idx === sessionPickerIndex}
            class:active={session.id === sessionStore.activeSessionId}
            onclick={() => {
              sessionStore.switchToSession(session.id);
              showSessionPicker = false;
            }}
          >
            <span class="session-picker-title">{session.title}</span>
            {#if session.status === 'streaming'}
              <span class="session-picker-status streaming"></span>
            {:else if session.status === 'error'}
              <span class="session-picker-status error">!</span>
            {/if}
            {#if session.id === sessionStore.activeSessionId}
              <span class="session-picker-current">current</span>
            {/if}
          </button>
        {/each}
      </div>
      <div class="session-picker-hint">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> select</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>
{/if}

{#if lightboxImage}
  <div
    class="lightbox-overlay"
    onclick={() => lightboxImage = null}
    onkeydown={(e) => e.key === 'Escape' && (lightboxImage = null)}
    role="dialog"
    aria-modal="true"
    aria-label="Image preview"
    tabindex="-1"
    in:fade={{ duration: 150 }}
    out:fade={{ duration: 100 }}
  >
    <button class="lightbox-close" onclick={() => lightboxImage = null} aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
    <button
      type="button"
      class="lightbox-image-wrapper"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && (lightboxImage = null)}
    >
      <img
        src={lightboxImage.src}
        alt={lightboxImage.alt}
        class="lightbox-image"
      />
    </button>
  </div>
{/if}

<style>
  .chat-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--white);
  }

  /* Header - minimal centered design */
  .header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.625rem 1rem;
    padding-top: calc(0.625rem + env(safe-area-inset-top, 0px));
    background: var(--white);
    position: relative;
    min-height: 52px;
  }

  .header-center {
    display: flex;
    align-items: center;
  }

  .workspace-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .workspace-btn:hover {
    background: var(--gray-100);
  }

  .workspace-name {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .workspace-btn .chevron {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
    transition: transform var(--transition-fast);
  }

  .workspace-btn .chevron.open {
    transform: rotate(180deg);
  }

  .workspace-wrapper {
    position: relative;
  }

  .workspace-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 220px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
    z-index: 100;
    overflow: hidden;
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: none;
    border: none;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .menu-item:hover {
    background: var(--gray-100);
  }

  .menu-item svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  .menu-divider {
    height: 1px;
    background: var(--gray-200);
    margin: 4px 0;
  }

  .menu-info {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .menu-label {
    font-family: var(--font-sans);
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--gray-400);
  }

  .menu-path {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .menu-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    cursor: default;
    z-index: 99;
  }

  .header-right {
    position: absolute;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    background: var(--gray-100);
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  /* Main area */
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
    border-top: 1px solid var(--gray-200);
  }

  /* Chat column - messages + input */
  .chat-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  /* Messages - centered with max-width */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    justify-content: center;
  }

  .messages-inner {
    width: 100%;
    max-width: 680px;
    padding: 1.5rem 1.5rem 2rem;
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
  }

  .empty-icon {
    font-size: 1.5rem;
    color: var(--gray-300);
    margin-bottom: 0.75rem;
  }

  .empty-title {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--off-black);
    margin: 0 0 0.25rem 0;
  }

  .empty-hint {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-400);
    margin: 0;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-bottom: 2rem;
  }

  .message {
    display: flex;
    gap: 0.75rem;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message.user .message-body {
    align-items: flex-end;
  }

  .message-avatar {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-sm);
    color: var(--gray-400);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .message-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 85%;
  }

  .message-text {
    word-break: break-word;
  }

  .message-sequence {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .message.user .message-text {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.6;
    color: var(--off-black);
    white-space: pre-wrap;
    background: var(--gray-100);
    padding: 0.625rem 0.875rem;
    border-radius: 14px 14px 4px 14px;
  }

  .message-time {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
  }

  .inline-tools {
    margin-bottom: 0.75rem;
    max-width: 100%;
  }

  .typing-indicator {
    display: inline-flex;
    gap: 4px;
    padding: 2px 0;
  }

  .typing-indicator .dot {
    width: 5px;
    height: 5px;
    background: var(--gray-400);
    border-radius: 50%;
    animation: typing 1.2s ease-in-out infinite;
  }

  .typing-indicator .dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing-indicator .dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-3px); opacity: 1; }
  }

  /* Input - sits above messages, not over activity panel */
  .input-area {
    display: flex;
    justify-content: center;
    padding: 0 1.5rem 1.25rem;
    background: var(--white);
  }

  .input-inner {
    width: 100%;
    max-width: 680px;
  }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--gray-100);
    border: 1px solid var(--gray-200);
    border-radius: 16px;
    transition: all var(--transition-fast);
  }

  .input-box:focus-within {
    background: var(--white);
    border-color: var(--gray-300);
  }

  /* Plan mode rainbow gradient border */
  .input-box.plan-mode-active {
    position: relative;
    border-color: transparent;
    background: var(--white);
  }

  .input-box.plan-mode-active::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: 17px;
    padding: 1px;
    background: linear-gradient(
      90deg,
      rgba(255, 107, 107, 0.4),
      rgba(255, 193, 94, 0.4),
      rgba(255, 240, 102, 0.4),
      rgba(144, 238, 144, 0.4),
      rgba(135, 206, 250, 0.4),
      rgba(186, 135, 250, 0.4),
      rgba(255, 182, 193, 0.4),
      rgba(255, 107, 107, 0.4)
    );
    background-size: 300% 100%;
    animation: rainbow-shift 8s linear infinite;
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 0;
  }

  .input-box.plan-mode-active:focus-within::before {
    background: linear-gradient(
      90deg,
      rgba(255, 107, 107, 0.6),
      rgba(255, 193, 94, 0.6),
      rgba(255, 240, 102, 0.6),
      rgba(144, 238, 144, 0.6),
      rgba(135, 206, 250, 0.6),
      rgba(186, 135, 250, 0.6),
      rgba(255, 182, 193, 0.6),
      rgba(255, 107, 107, 0.6)
    );
    background-size: 300% 100%;
  }

  @keyframes rainbow-shift {
    0% { background-position: 0% 50%; }
    100% { background-position: 300% 50%; }
  }

  .input-box textarea {
    flex: 1;
    padding: 0.5rem 0.625rem;
    background: transparent;
    border: none;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    color: var(--off-black);
    resize: none;
    outline: none;
    max-height: 200px;
    line-height: 1.5;
  }

  .input-box textarea::placeholder {
    color: var(--gray-400);
  }

  .input-box textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .send-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--off-black);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .send-btn:disabled {
    background: var(--gray-300);
    cursor: not-allowed;
  }

  .send-btn svg {
    width: 16px;
    height: 16px;
    color: var(--white);
  }

  .send-btn .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: var(--white);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Plan mode button */
  .plan-mode-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-100);
    border: 1px solid var(--gray-200);
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .plan-mode-btn:hover:not(:disabled) {
    background: var(--gray-200);
    border-color: var(--gray-300);
  }

  .plan-mode-btn.active {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .plan-mode-btn.active:hover:not(:disabled) {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.4);
  }

  .plan-mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .plan-mode-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  .plan-mode-btn.active svg {
    color: rgba(59, 130, 246, 0.9);
  }

  /* Plan mode banner */
  .plan-mode-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    margin-bottom: 0.625rem;
  }

  .plan-mode-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .plan-mode-icon svg {
    width: 16px;
    height: 16px;
    color: rgba(59, 130, 246, 0.7);
  }

  .plan-mode-text {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: rgba(59, 130, 246, 0.9);
  }

  .plan-mode-dismiss {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background var(--transition-fast);
    flex-shrink: 0;
  }

  .plan-mode-dismiss:hover {
    background: rgba(59, 130, 246, 0.15);
  }

  .plan-mode-dismiss svg {
    width: 12px;
    height: 12px;
    color: rgba(59, 130, 246, 0.7);
  }

  .empty-state .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--gray-200);
    border-top-color: var(--gray-500);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-bottom: 0.75rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .input-hint {
    margin: 0.5rem 0 0 0;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-400);
    text-align: center;
  }

  .input-hint kbd {
    display: inline;
    padding: 1px 4px;
    background: var(--gray-100);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }

  /* Attachment button */
  .attach-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .attach-btn:hover:not(:disabled) {
    background: var(--gray-200);
  }

  .attach-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .attach-btn svg {
    width: 18px;
    height: 18px;
    color: var(--gray-500);
  }

  /* Attachment previews */
  .attachment-previews {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
    padding: 8px;
    background: var(--gray-50);
    border-radius: 12px;
  }

  .attachment-preview {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--gray-100);
  }

  .attachment-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .attachment-preview .file-icon {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--gray-200);
  }

  .attachment-preview .file-icon svg {
    width: 24px;
    height: 24px;
    color: var(--gray-500);
  }

  .attachment-preview .remove-attachment {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .attachment-preview .remove-attachment:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .attachment-preview .remove-attachment svg {
    width: 10px;
    height: 10px;
    color: #ffffff;
  }

  .attachment-preview .attachment-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.6);
    font-family: var(--font-mono);
    font-size: 8px;
    color: var(--white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Message attachments */
  .message-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  .attachment-image {
    max-width: 200px;
    max-height: 200px;
    border-radius: 8px;
    object-fit: contain;
  }

  .attachment-file {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--gray-200);
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-600);
  }

  .attachment-file svg {
    width: 14px;
    height: 14px;
    color: var(--gray-500);
  }

  /* Drag overlay */
  .drag-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    border: 2px dashed var(--gray-300);
    margin: 8px;
    border-radius: var(--radius-lg);
  }

  .drag-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--gray-500);
  }

  .drag-content svg {
    width: 40px;
    height: 40px;
  }

  .drag-content p {
    margin: 0;
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: 500;
  }

  .chat-container.dragging {
    position: relative;
  }

  /* Image thumbnails - 100x100 clickable */
  .message-image-thumbnail {
    width: 100px;
    height: 100px;
    padding: 0;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    background: var(--gray-100);
    cursor: pointer;
    overflow: hidden;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .message-image-thumbnail:hover {
    border-color: var(--gray-400);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .message-image-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .message.user .message-image-thumbnail {
    align-self: flex-end;
  }

  /* Lightbox overlay */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 2rem;
  }

  .lightbox-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .lightbox-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .lightbox-close svg {
    width: 20px;
    height: 20px;
    color: white;
  }

  .lightbox-image-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    padding: 0;
    cursor: default;
  }

  .lightbox-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
  }

  /* Slash command autocomplete menu */
  .slash-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 8px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
  }

  .slash-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .slash-item:hover,
  .slash-item.selected {
    background: var(--gray-100);
  }

  .slash-item:first-child {
    border-radius: var(--radius-md) var(--radius-md) 0 0;
  }

  .slash-item:last-child {
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }

  .slash-item:only-child {
    border-radius: var(--radius-md);
  }

  .slash-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .slash-desc {
    flex: 1;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slash-source {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
  }

  .input-inner {
    position: relative;
  }

  /* @ mention autocomplete menu */
  .mention-menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 8px;
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-height: 240px;
    overflow-y: auto;
    z-index: 100;
  }

  .mention-path {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    border-bottom: 1px solid var(--gray-100);
    background: var(--gray-50);
  }

  .mention-path-icon {
    display: flex;
    align-items: center;
  }

  .mention-path-icon svg {
    width: 12px;
    height: 12px;
  }

  .mention-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.875rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .mention-item:hover,
  .mention-item.selected {
    background: var(--gray-100);
  }

  .mention-item:first-child:not(:only-child) {
    border-radius: 0;
  }

  .mention-item:last-child {
    border-radius: 0 0 var(--radius-md) var(--radius-md);
  }

  .mention-item:only-child {
    border-radius: var(--radius-md);
  }

  .mention-path + .mention-item:first-of-type {
    border-radius: 0;
  }

  .mention-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .mention-icon svg {
    width: 14px;
    height: 14px;
    color: var(--gray-400);
  }

  .mention-item.selected .mention-icon svg,
  .mention-item:hover .mention-icon svg {
    color: var(--gray-600);
  }

  .mention-name {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mention-type {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
  }

  .mention-empty {
    padding: 0.75rem 0.875rem;
  }

  .mention-empty-text {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--gray-400);
  }

  /* Session picker */
  .session-picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .session-picker {
    background: var(--white);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    min-width: 320px;
    max-width: 400px;
    overflow: hidden;
  }

  .session-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--gray-100);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--gray-500);
  }

  .session-picker-header kbd {
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-400);
  }

  .session-picker-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .session-picker-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .session-picker-item:hover,
  .session-picker-item.selected {
    background: var(--gray-100);
  }

  .session-picker-item.active {
    background: var(--gray-50);
  }

  .session-picker-title {
    flex: 1;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-picker-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .session-picker-status.streaming {
    background: var(--blue-500);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .session-picker-status.error {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--red-100);
    color: var(--red-600);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
  }

  .session-picker-current {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--gray-100);
    border-radius: 4px;
  }

  .session-picker-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--gray-100);
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--gray-400);
  }

  .session-picker-hint kbd {
    padding: 1px 4px;
    background: var(--gray-100);
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 10px;
  }
</style>
