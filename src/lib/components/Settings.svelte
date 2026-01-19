<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { appConfig, slashCommands } from '$lib/stores/app.svelte';
  import type { MCPServerConfig, PermissionMode, SettingSource } from '$lib/types';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let activeTab = $state<'general' | 'skills' | 'mcp'>('general');
  let editingServer = $state<MCPServerConfig | null>(null);
  let showAddServer = $state(false);

  // New server form state
  let newServer = $state<Partial<MCPServerConfig>>({
    type: 'stdio',
    enabled: true
  });

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  function addServer() {
    if (!newServer.name || (!newServer.command && newServer.type === 'stdio') || (!newServer.url && newServer.type === 'sse')) {
      return;
    }

    const server: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: newServer.name!,
      type: newServer.type!,
      enabled: newServer.enabled ?? true,
      command: newServer.command,
      args: newServer.args,
      env: newServer.env,
      url: newServer.url,
      headers: newServer.headers
    };

    appConfig.addMCPServer(server);
    newServer = { type: 'stdio', enabled: true };
    showAddServer = false;
  }

  function toggleServer(id: string, enabled: boolean) {
    appConfig.updateMCPServer(id, { enabled });
  }

  function removeServer(id: string) {
    appConfig.removeMCPServer(id);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="backdrop" onclick={handleBackdropClick} onkeydown={handleKeydown} role="button" tabindex="-1" transition:fade={{ duration: 150 }}>
  <div class="modal" transition:fly={{ y: 10, duration: 150 }}>
    <header class="modal-header">
      <h2>Settings</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </header>

    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'general'}
        onclick={() => activeTab = 'general'}
      >
        General
      </button>
      <button
        class="tab"
        class:active={activeTab === 'skills'}
        onclick={() => activeTab = 'skills'}
      >
        Skills
      </button>
      <button
        class="tab"
        class:active={activeTab === 'mcp'}
        onclick={() => activeTab = 'mcp'}
      >
        MCP Servers
      </button>
    </div>

    <div class="content">
      {#if activeTab === 'general'}
        <div class="section">
          <h3>Permission Mode</h3>
          <p class="hint">Control how Claude handles file edits and commands</p>
          <select
            value={appConfig.claude.permissionMode}
            onchange={(e) => appConfig.setPermissionMode(e.currentTarget.value as PermissionMode)}
          >
            <option value="default">Default (ask for permission)</option>
            <option value="acceptEdits">Accept Edits (auto-accept file changes)</option>
            <option value="bypassPermissions">Bypass All (dangerous)</option>
          </select>
        </div>

        <div class="section">
          <h3>Max Turns</h3>
          <p class="hint">Maximum conversation turns before stopping</p>
          <input
            type="number"
            min="1"
            max="100"
            value={appConfig.claude.maxTurns}
            onchange={(e) => appConfig.setMaxTurns(parseInt(e.currentTarget.value) || 25)}
          />
        </div>

        <div class="section">
          <h3>Input Mode</h3>
          <p class="hint">Choose your preferred text input style</p>

          <div class="toggle-row">
            <div class="toggle-label">
              <span>Vim Mode</span>
              <span class="toggle-hint">Use vim keybindings for text input (i=insert, Esc=normal, Enter=send)</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                checked={appConfig.claude.vimMode}
                onchange={(e) => appConfig.setVimMode(e.currentTarget.checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      {:else if activeTab === 'skills'}
        <div class="section">
          <h3>Skills & Commands</h3>
          <p class="hint">Enable Claude Code skills and slash commands from your config</p>

          <div class="toggle-row">
            <div class="toggle-label">
              <span>Enable Skills</span>
              <span class="toggle-hint">Load skills from ~/.claude/skills/</span>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                checked={appConfig.claude.skills.enabled}
                onchange={(e) => appConfig.setSkillsEnabled(e.currentTarget.checked)}
              />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        {#if appConfig.claude.skills.enabled}
          <div class="section">
            <h3>Setting Sources</h3>
            <p class="hint">Which locations to load skills and commands from</p>

            <div class="checkbox-group">
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  checked={appConfig.claude.skills.settingSources.includes('user')}
                  onchange={(e) => {
                    const current = appConfig.claude.skills.settingSources;
                    if (e.currentTarget.checked) {
                      appConfig.setSkillsSettingSources([...current.filter(s => s !== 'user'), 'user']);
                    } else {
                      appConfig.setSkillsSettingSources(current.filter(s => s !== 'user'));
                    }
                  }}
                />
                <span class="checkbox-text">
                  <span class="checkbox-label">User</span>
                  <span class="checkbox-hint">~/.claude/skills/ and ~/.claude/commands/</span>
                </span>
              </label>
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  checked={appConfig.claude.skills.settingSources.includes('project')}
                  onchange={(e) => {
                    const current = appConfig.claude.skills.settingSources;
                    if (e.currentTarget.checked) {
                      appConfig.setSkillsSettingSources([...current.filter(s => s !== 'project'), 'project']);
                    } else {
                      appConfig.setSkillsSettingSources(current.filter(s => s !== 'project'));
                    }
                  }}
                />
                <span class="checkbox-text">
                  <span class="checkbox-label">Project</span>
                  <span class="checkbox-hint">.claude/skills/ and .claude/commands/ in workspace</span>
                </span>
              </label>
            </div>
          </div>

          {#if slashCommands.count > 0}
            <div class="section">
              <h3>Available Slash Commands</h3>
              <p class="hint">Commands loaded from your config (type / in chat)</p>

              <div class="commands-list">
                {#each slashCommands.all as cmd (cmd.name)}
                  <div class="command-item">
                    <span class="command-name">/{cmd.name}</span>
                    {#if cmd.description}
                      <span class="command-desc">{cmd.description}</span>
                    {/if}
                    <span class="command-source">{cmd.source}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      {:else}
        <div class="section">
          <div class="section-header">
            <div>
              <h3>MCP Servers</h3>
              <p class="hint">Configure Model Context Protocol servers</p>
            </div>
            <button class="add-btn" onclick={() => showAddServer = true}>
              + Add
            </button>
          </div>

          {#if appConfig.claude.mcpServers.length === 0 && !showAddServer}
            <div class="empty">
              <p>No MCP servers configured</p>
              <button class="link-btn" onclick={() => showAddServer = true}>Add your first server</button>
            </div>
          {:else}
            <div class="servers-list">
              {#each appConfig.claude.mcpServers as server (server.id)}
                <div class="server-item">
                  <div class="server-info">
                    <span class="server-name">{server.name}</span>
                    <span class="server-type">{server.type}</span>
                    {#if server.type === 'stdio'}
                      <span class="server-detail">{server.command}</span>
                    {:else}
                      <span class="server-detail">{server.url}</span>
                    {/if}
                  </div>
                  <div class="server-actions">
                    <label class="toggle">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onchange={(e) => toggleServer(server.id, e.currentTarget.checked)}
                      />
                      <span class="toggle-slider"></span>
                    </label>
                    <button class="delete-btn" onclick={() => removeServer(server.id)} aria-label="Remove server">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if showAddServer}
            <div class="add-form" transition:fly={{ y: -10, duration: 150 }}>
              <h4>New MCP Server</h4>

              <div class="form-group">
                <label for="server-name">Name</label>
                <input
                  id="server-name"
                  type="text"
                  placeholder="e.g., filesystem"
                  bind:value={newServer.name}
                />
              </div>

              <div class="form-group">
                <label for="server-type">Type</label>
                <select id="server-type" bind:value={newServer.type}>
                  <option value="stdio">stdio (local process)</option>
                  <option value="sse">SSE (remote URL)</option>
                </select>
              </div>

              {#if newServer.type === 'stdio'}
                <div class="form-group">
                  <label for="server-command">Command</label>
                  <input
                    id="server-command"
                    type="text"
                    placeholder="e.g., npx -y @anthropic/mcp-server-filesystem"
                    bind:value={newServer.command}
                  />
                </div>
                <div class="form-group">
                  <label for="server-args">Arguments (comma-separated)</label>
                  <input
                    id="server-args"
                    type="text"
                    placeholder="e.g., /path/to/dir"
                    oninput={(e) => newServer.args = e.currentTarget.value.split(',').map(s => s.trim()).filter(Boolean)}
                  />
                </div>
              {:else}
                <div class="form-group">
                  <label for="server-url">URL</label>
                  <input
                    id="server-url"
                    type="url"
                    placeholder="https://api.example.com/mcp"
                    bind:value={newServer.url}
                  />
                </div>
              {/if}

              <div class="form-actions">
                <button class="cancel-btn" onclick={() => { showAddServer = false; newServer = { type: 'stdio', enabled: true }; }}>
                  Cancel
                </button>
                <button class="save-btn" onclick={addServer}>
                  Add Server
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--white);
    border-radius: 12px;
    width: 90%;
    max-width: 520px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--gray-200);
  }

  .modal-header h2 {
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: 600;
    margin: 0;
    color: var(--off-black);
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--gray-100);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
    color: var(--gray-500);
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--gray-200);
    padding: 0 1.5rem;
  }

  .tab {
    padding: 0.875rem 1rem;
    background: none;
    border: none;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--gray-500);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: all var(--transition-fast);
  }

  .tab:hover {
    color: var(--off-black);
  }

  .tab.active {
    color: var(--off-black);
    border-bottom-color: var(--off-black);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .section {
    margin-bottom: 1.5rem;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .section h3 {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
    margin: 0 0 0.25rem 0;
  }

  .hint {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    color: var(--gray-500);
    margin: 0 0 0.75rem 0;
  }

  select, input[type="text"], input[type="url"], input[type="number"] {
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: var(--white);
    border: 1px solid var(--gray-300);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    color: var(--off-black);
    transition: border-color var(--transition-fast);
  }

  select:focus, input:focus {
    outline: none;
    border-color: var(--off-black);
  }

  input[type="number"] {
    width: 100px;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0.5rem 0.875rem;
    background: var(--off-black);
    color: var(--white);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .add-btn:hover {
    opacity: 0.85;
  }

  .empty {
    text-align: center;
    padding: 2rem;
    color: var(--gray-500);
  }

  .empty p {
    margin: 0 0 0.5rem 0;
    font-size: var(--text-sm);
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--off-black);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    text-decoration: underline;
    cursor: pointer;
  }

  .servers-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .server-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .server-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .server-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .server-type {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-500);
    text-transform: uppercase;
  }

  .server-detail {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .server-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .toggle {
    position: relative;
    width: 36px;
    height: 20px;
    cursor: pointer;
  }

  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    inset: 0;
    background: var(--gray-300);
    border-radius: 10px;
    transition: background var(--transition-fast);
  }

  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    top: 2px;
    background: var(--white);
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .toggle input:checked + .toggle-slider {
    background: var(--off-black);
  }

  .toggle input:checked + .toggle-slider::before {
    transform: translateX(16px);
  }

  .delete-btn {
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

  .delete-btn:hover {
    background: rgba(220, 38, 38, 0.1);
  }

  .delete-btn svg {
    width: 16px;
    height: 16px;
    color: var(--gray-500);
  }

  .delete-btn:hover svg {
    color: #dc2626;
  }

  .add-form {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .add-form h4 {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--off-black);
    margin: 0 0 1rem 0;
  }

  .form-group {
    margin-bottom: 0.875rem;
  }

  .form-group label {
    display: block;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--gray-600);
    margin-bottom: 0.375rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .cancel-btn, .save-btn {
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--gray-300);
    color: var(--gray-600);
  }

  .cancel-btn:hover {
    background: var(--gray-100);
  }

  .save-btn {
    background: var(--off-black);
    border: none;
    color: var(--white);
  }

  .save-btn:hover {
    opacity: 0.85;
  }

  /* Skills tab styles */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-label span:first-child {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .toggle-hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .checkbox-row:hover {
    background: var(--gray-100);
  }

  .checkbox-row input[type="checkbox"] {
    margin-top: 2px;
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .checkbox-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkbox-label {
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .checkbox-hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--gray-500);
  }

  .commands-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .command-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--gray-50);
    border-radius: var(--radius-md);
  }

  .command-name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--off-black);
  }

  .command-desc {
    flex: 1;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--gray-500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .command-source {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--gray-400);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--gray-200);
    border-radius: 4px;
  }

</style>
