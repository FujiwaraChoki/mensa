// Attachment Service - File handling utilities for chat attachments

import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import type { Attachment, AttachmentType, ContentBlock } from '$lib/types';

// Constants
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_ATTACHMENTS = 10;

// Supported MIME types
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const SUPPORTED_DOCUMENT_TYPES = ['application/pdf', 'text/plain'];
export const SUPPORTED_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES];

// File extensions to MIME type mapping
const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

function getMimeType(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? EXT_TO_MIME[ext] || null : null;
}

function getAttachmentType(mimeType: string): AttachmentType {
  return SUPPORTED_IMAGE_TYPES.includes(mimeType) ? 'image' : 'document';
}

/**
 * Open file picker dialog and select files
 */
export async function openFilePicker(): Promise<string[] | null> {
  try {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: 'Images & Documents',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt']
        }
      ]
    });

    if (!selected) return null;
    return Array.isArray(selected) ? selected : [selected];
  } catch (e) {
    console.error('[attachments] Failed to open file picker:', e);
    return null;
  }
}

/**
 * Process a file and convert to Attachment
 */
export async function processFile(filePath: string): Promise<Attachment | { error: string }> {
  try {
    const filename = filePath.split('/').pop() || filePath;
    const mimeType = getMimeType(filename);

    if (!mimeType || !SUPPORTED_TYPES.includes(mimeType)) {
      return { error: `Unsupported file type: ${filename}` };
    }

    // Read file as binary
    const data = await readFile(filePath);

    if (data.length > MAX_FILE_SIZE) {
      return { error: `File too large: ${filename} (max 20MB)` };
    }

    // Convert to base64
    const base64 = arrayBufferToBase64(data);

    // Create preview URL for images
    let previewUrl: string | undefined;
    if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      const blob = new Blob([data], { type: mimeType });
      previewUrl = URL.createObjectURL(blob);
    }

    return {
      id: crypto.randomUUID(),
      type: getAttachmentType(mimeType),
      name: filename,
      mimeType,
      size: data.length,
      data: base64,
      previewUrl
    };
  } catch (e) {
    console.error('[attachments] Failed to process file:', e);
    return { error: `Failed to read file: ${filePath}` };
  }
}

/**
 * Handle paste event for images
 */
export async function handlePasteImage(event: ClipboardEvent): Promise<Attachment | null> {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;

      const mimeType = file.type;
      if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        console.warn('[attachments] Unsupported image type:', mimeType);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        console.warn('[attachments] Pasted image too large:', file.size);
        return null;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(new Uint8Array(arrayBuffer));
        const previewUrl = URL.createObjectURL(file);

        return {
          id: crypto.randomUUID(),
          type: 'image',
          name: `pasted-image-${Date.now()}.${mimeType.split('/')[1]}`,
          mimeType,
          size: file.size,
          data: base64,
          previewUrl
        };
      } catch (e) {
        console.error('[attachments] Failed to process pasted image:', e);
        return null;
      }
    }
  }

  return null;
}

/**
 * Handle dropped files
 */
export async function handleDroppedFiles(files: FileList): Promise<(Attachment | { error: string })[]> {
  const results: (Attachment | { error: string })[] = [];

  for (const file of files) {
    const mimeType = file.type || getMimeType(file.name);

    if (!mimeType || !SUPPORTED_TYPES.includes(mimeType)) {
      results.push({ error: `Unsupported file type: ${file.name}` });
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      results.push({ error: `File too large: ${file.name} (max 20MB)` });
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(new Uint8Array(arrayBuffer));

      let previewUrl: string | undefined;
      if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
        previewUrl = URL.createObjectURL(file);
      }

      results.push({
        id: crypto.randomUUID(),
        type: getAttachmentType(mimeType),
        name: file.name,
        mimeType,
        size: file.size,
        data: base64,
        previewUrl
      });
    } catch (e) {
      console.error('[attachments] Failed to process dropped file:', e);
      results.push({ error: `Failed to read file: ${file.name}` });
    }
  }

  return results;
}

/**
 * Build Claude SDK content blocks from text and attachments
 */
export function buildMessageContent(text: string, attachments: Attachment[]): ContentBlock[] {
  const content: ContentBlock[] = [];

  // Add attachments first (Claude prefers context before the question)
  for (const attachment of attachments) {
    if (attachment.type === 'image') {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
          data: attachment.data
        }
      });
    } else if (attachment.type === 'document') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: attachment.mimeType as 'application/pdf' | 'text/plain',
          data: attachment.data
        }
      });
    }
  }

  // Add text content
  if (text.trim()) {
    content.push({
      type: 'text',
      text: text.trim()
    });
  }

  return content;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
