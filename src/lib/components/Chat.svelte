<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { invoke } from '@tauri-apps/api/core';
  import { messages, uiState, appConfig, appState, toolActivity, pendingAttachments } from '$lib/stores/app.svelte';
  import { queryClaudeStreaming, type ClaudeStreamEvent, type ClaudeQueryConfig } from '$lib/services/claude';
  import { openFilePicker, processFile, handlePasteImage, handleDroppedFiles, buildMessageContent, formatFileSize } from '$lib/services/attachments';
  import type { Attachment, ContentBlock, Message, MessageBlock } from '$lib/types';
  import Markdown from './Markdown.svelte';
  import Settings from './Settings.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import InlineTool from './InlineTool.svelte';

  let inputValue = $state('');
  let showSettings = $state(false);
  let showCommandPalette = $state(false);
  let lightboxImage = $state<{ src: string; alt: string } | null>(null);
  let inputEl: HTMLTextAreaElement;
  let messagesEl: HTMLDivElement;
  let showWorkspaceMenu = $state(false);
  let pendingTools = $state<Map<string, string>>(new Map()); // tool id/name -> tool activity id
  let resumeSessionId = $state<string | null>(null);
  let loadingSession = $state(false);
  let isDragging = $state(false);

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

  async function loadSessionHistory(sessionId: string) {
    loadingSession = true;
    try {
      const workspacePath = appConfig.workspace?.path || '.';
      const sessionMessages = await invoke<SessionMessage[]>('load_session_messages', {
        workspacePath,
        sessionId
      });

      // Convert to our message format and add to store
      for (const msg of sessionMessages) {
        messages.add({
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

  async function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await sendMessage();
    }
  }

  async function sendMessage() {
    const content = inputValue.trim();
    const attachments = [...pendingAttachments.all];

    if ((!content && attachments.length === 0) || uiState.isStreaming) return;

    // Add message with attachments for display
    messages.add({ role: 'user', content, attachments: attachments.length > 0 ? attachments : undefined });
    inputValue = '';
    pendingAttachments.clear();

    await tick();
    scrollToBottom();

    // Build content blocks for Claude if there are attachments
    const messageContent = attachments.length > 0
      ? buildMessageContent(content, attachments)
      : content;

    await queryClaudeReal(messageContent);
  }

  async function queryClaudeReal(prompt: string | ContentBlock[]) {
    const logPrompt = typeof prompt === 'string' ? prompt.substring(0, 50) : '[content blocks]';
    console.log('[queryClaudeReal] CALLED with prompt:', logPrompt);
    uiState.isStreaming = true;
    messages.add({ role: 'assistant', content: '', blocks: [] });

    const workingDir = appConfig.workspace?.path || '.';
    const hasAttachments = typeof prompt !== 'string';
    const config: ClaudeQueryConfig = {
      permissionMode: appConfig.claude.permissionMode,
      maxTurns: appConfig.claude.maxTurns,
      mcpServers: appConfig.claude.mcpServers
    };

    // Capture resume session ID and clear it
    const currentResumeSession = resumeSessionId;
    resumeSessionId = null;

    try {
      let blockOrder = 0;
      await queryClaudeStreaming(prompt, workingDir, (event: ClaudeStreamEvent) => {
        console.log('[chat] RECEIVED event:', event.type, event);

        switch (event.type) {
          case 'text':
            if (event.content) {
              messages.appendTextToLast(event.content, ++blockOrder);
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

              // Add to toolActivity panel (kept for debugging)
              const toolId = toolActivity.add({
                tool: event.tool.name,
                status: 'running',
                input: toolInput,
                toolUseId: event.tool.id
              });
              console.log('[chat] toolActivity.add returned id:', toolId);
              pendingTools.set(toolKey, toolId);

              // Add to current message for inline display
              console.log('[chat] Calling messages.addToolToLast');
              const messageToolId = messages.addToolToLast({
                tool: event.tool.name,
                status: 'running',
                input: toolInput,
                toolUseId: event.tool.id
              }, true, ++blockOrder);
              console.log('[chat] addToolToLast returned id:', messageToolId);
              console.log('[chat] After addToolToLast, last message tools:', messages.all[messages.all.length - 1]?.tools);
            } else {
              console.log('[chat] WARNING: event.tool is falsy!');
            }
            break;

          case 'tool_result':
            console.log('[chat] RECEIVED tool_result:', event);
            if (event.tool?.name) {
              const toolKey = event.tool.id || event.tool.name;
              const toolId = pendingTools.get(toolKey);
              console.log('[chat] Looking for pending tool:', event.tool.name, 'found id:', toolId);
              if (toolId) {
                toolActivity.complete(toolId, event.tool?.result);
                pendingTools.delete(toolKey);
              }

              // Update tool in current message for inline display
              const lastMessage = messages.all[messages.all.length - 1];
              console.log('[chat] Last message tools:', lastMessage?.tools);
              const toolToUpdate = lastMessage?.tools?.find(
                t =>
                  (event.tool?.id ? t.toolUseId === event.tool.id : t.tool === event.tool!.name) &&
                  t.status === 'running'
              );
              console.log('[chat] Tool to update:', toolToUpdate);
              if (toolToUpdate && lastMessage) {
                messages.updateTool(lastMessage.id, toolToUpdate.id, {
                  status: 'completed',
                  output: event.tool.result,
                  completedAt: new Date()
                });
              }
            }
            break;

          case 'error':
            console.log('[chat] RECEIVED error:', event.error);
            messages.updateLast(`Error: ${event.error}`);
            break;

          case 'done':
            console.log('[chat] RECEIVED done, pending tools:', pendingTools.size);
            // Mark any remaining pending tools as completed
            for (const [, toolId] of pendingTools) {
              toolActivity.complete(toolId);
            }
            pendingTools.clear();
            uiState.isStreaming = false;
            break;
        }
      }, config, currentResumeSession || undefined);
    } catch (error) {
      messages.updateLast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      uiState.isStreaming = false;
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
        // Clear current conversation when switching workspace
        messages.clear();
        toolActivity.clear();
      }
    } catch (e) {
      console.error('Failed to select directory:', e);
    }
  }

  function startNewThread() {
    // Clear messages to start a new conversation
    messages.clear();
    toolActivity.clear();
    pendingAttachments.clear();
    resumeSessionId = null;
  }

  // Attachment handlers
  async function handleAddAttachment() {
    if (!pendingAttachments.canAdd || uiState.isStreaming) return;

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
    if (!pendingAttachments.canAdd || uiState.isStreaming) return;

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

    if (!pendingAttachments.canAdd || uiState.isStreaming) return;
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
    // ⌘ + K for command palette (threads)
    if (e.metaKey && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = true;
    }
    // ⌘ + N for new thread
    if (e.metaKey && e.key === 'n') {
      e.preventDefault();
      startNewThread();
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
      messages.clear();
      toolActivity.clear();
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
  <header class="header drag-region">
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

  <div class="main">
    <!-- Chat column (messages + input) -->
    <div class="chat-column">
      <div class="messages-container" bind:this={messagesEl}>
        <div class="messages-inner">
          {#if messages.count === 0}
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
              {#each messages.all as message (message.id)}
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
                              <InlineTool {tool} />
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
                            {#if !hasToolBlock(message, tool.id)}
                              <InlineTool {tool} />
                            {/if}
                          {/each}
                        {/if}
                      </div>
                    {:else}
                      {#if message.role === 'assistant' && message.tools?.length}
                        <div class="inline-tools">
                          {#each message.tools as tool (tool.id)}
                            <InlineTool {tool} />
                          {/each}
                        </div>
                      {/if}
                      <div class="message-text">
                        {#if message.role === 'assistant' && message.content === '' && uiState.isStreaming}
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
            </div>
          {/if}
        </div>
      </div>

      <!-- Input -->
      <div class="input-area">
        <div class="input-inner">
          <!-- Attachment previews -->
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

          <div class="input-box">
            <!-- Attachment button -->
            <button
              class="attach-btn"
              onclick={handleAddAttachment}
              disabled={!pendingAttachments.canAdd || uiState.isStreaming}
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
              oninput={autoResize}
              onpaste={handlePaste}
              disabled={uiState.isStreaming}
            ></textarea>
            <button
              class="send-btn"
              disabled={(!inputValue.trim() && pendingAttachments.count === 0) || uiState.isStreaming}
              onclick={sendMessage}
            >
              {#if uiState.isStreaming}
                <span class="spinner"></span>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              {/if}
            </button>
          </div>
          <p class="input-hint">
            <kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line
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
    onselect={async (sessionId) => {
      showCommandPalette = false;
      // Set up session resumption
      messages.clear();
      toolActivity.clear();
      resumeSessionId = sessionId;
      // Load session history
      await loadSessionHistory(sessionId);
      // Focus input so user can type next message
      setTimeout(() => inputEl?.focus(), 50);
    }}
  />
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
    <img
      src={lightboxImage.src}
      alt={lightboxImage.alt}
      class="lightbox-image"
      onclick={(e) => e.stopPropagation()}
    />
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

  .icon-btn.active {
    background: var(--off-black);
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  .icon-btn.active svg {
    color: var(--white);
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

  .message-image {
    max-width: 100%;
    border-radius: 8px;
    overflow: hidden;
  }

  .message-image img {
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
    display: block;
    border-radius: 8px;
    border: 1px solid var(--gray-200);
  }

  .message.user .message-image {
    background: var(--gray-100);
    padding: 0.5rem;
    border-radius: 14px;
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
    color: var(--white);
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

  .lightbox-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
  }
</style>
