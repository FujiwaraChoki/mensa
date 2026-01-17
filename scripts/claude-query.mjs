#!/usr/bin/env node
// Claude Agent SDK Query Script
// Usage: node claude-query.mjs --cwd <dir> --prompt <prompt> [--config <json>]

import { query } from '@anthropic-ai/claude-agent-sdk';

const args = process.argv.slice(2);
let cwd = process.cwd();
let prompt = '';
let configJson = '';
let resumeSessionId = '';
let hasAttachments = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cwd' && args[i + 1]) {
    cwd = args[++i];
  } else if (args[i] === '--prompt' && args[i + 1]) {
    prompt = args[++i];
  } else if (args[i] === '--config' && args[i + 1]) {
    configJson = args[++i];
  } else if (args[i] === '--resume' && args[i + 1]) {
    resumeSessionId = args[++i];
  } else if (args[i] === '--has-attachments') {
    hasAttachments = true;
  } else if (!args[i].startsWith('--') && !prompt) {
    prompt = args[i];
  }
}

if (!prompt) {
  console.error(JSON.stringify({ type: 'error', error: 'No prompt provided' }));
  process.exit(1);
}

// Parse config
let config = {
  permissionMode: 'acceptEdits',
  maxTurns: 25,
  mcpServers: []
};

if (configJson) {
  try {
    config = { ...config, ...JSON.parse(configJson) };
  } catch (e) {
    console.error(JSON.stringify({ type: 'error', error: `Invalid config JSON: ${e.message}` }));
    process.exit(1);
  }
}

// Build MCP servers object for SDK
function buildMcpServers(servers) {
  const mcpServers = {};
  for (const server of servers) {
    if (!server.enabled) continue;

    if (server.type === 'stdio') {
      mcpServers[server.name] = {
        type: 'stdio',
        command: server.command,
        args: server.args || [],
        env: server.env || {}
      };
    } else if (server.type === 'sse') {
      mcpServers[server.name] = {
        type: 'sse',
        url: server.url,
        headers: server.headers || {}
      };
    }
  }
  return mcpServers;
}

async function main() {
  try {
    const mcpServers = buildMcpServers(config.mcpServers || []);

    const options = {
      cwd,
      maxTurns: config.maxTurns,
      permissionMode: config.permissionMode,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      ...(resumeSessionId && { resume: resumeSessionId })
    };

    // Only add mcpServers if there are any
    if (Object.keys(mcpServers).length > 0) {
      options.mcpServers = mcpServers;
    }

    // Parse prompt as content blocks if attachments are present
    let queryPrompt;
    if (hasAttachments) {
      try {
        const contentBlocks = JSON.parse(prompt);
        console.error('[claude-query] Parsed content blocks:', contentBlocks.length, 'blocks');

        // Claude Agent SDK expects an async generator for image messages
        async function* generateMessage() {
          yield {
            type: 'user',
            message: {
              role: 'user',
              content: contentBlocks
            }
          };
        }
        queryPrompt = generateMessage();
      } catch (e) {
        console.error('[claude-query] Failed to parse content blocks:', e.message);
        queryPrompt = prompt;
      }
    } else {
      queryPrompt = prompt;
    }

    for await (const message of query({ prompt: queryPrompt, options })) {
      // Debug: log to stderr what we're sending
      console.error('[claude-query] MESSAGE TYPE:', message?.type, 'KEYS:', Object.keys(message || {}));
      if (message?.type === 'assistant' && message?.message?.content) {
        console.error('[claude-query] CONTENT BLOCKS:', message.message.content.map(b => b?.type));
      }
      // Output each message as JSON line
      console.log(JSON.stringify(message));
    }
    console.log(JSON.stringify({ type: 'done' }));
  } catch (error) {
    console.log(JSON.stringify({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    }));
    process.exit(1);
  }
}

main();
