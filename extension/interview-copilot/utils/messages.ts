/**
 * messages.ts
 * Single source of truth for ALL chrome.runtime message types in this extension.
 *
 * WHY centralise here?
 * Chrome's message passing is untyped by default — every sendMessage/onMessage
 * call accepts `any`. Putting every message shape in a discriminated union means
 * TypeScript catches mismatches at compile time, not during a live interview.
 *
 * ── FIXES IN THIS VERSION ───────────────────────────────────────────────────
 * 1. Added TRANSCRIPT_SEGMENT — sent by content.ts's DOM caption scraper.
 *    Was missing entirely, causing background.ts to @ts-ignore every reference.
 *
 * 2. Added GET_TRANSCRIPT — used by TranscriptPanel to hydrate history on mount.
 *    Was also missing from the union.
 *
 * 3. TranscriptMessage now includes `id` and `timestamp` fields that
 *    background.ts was already attaching before broadcasting.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// content.ts → background.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sent by the DOM caption scraper in content.ts every time a new caption
 * delta is detected. background.ts deduplicates and debounces these before
 * broadcasting a final TRANSCRIPT message to the UI.
 */
export interface TranscriptSegmentMessage {
  type: 'TRANSCRIPT_SEGMENT';
  text: string;
  speaker: string;   // Raw speaker name from the DOM, e.g. "You", "John"
  isFinal: boolean;  // True when the caption line is complete (speaker changed)
}

// ─────────────────────────────────────────────────────────────────────────────
// popup/sidepanel → content.ts  (via chrome.tabs.sendMessage)
// ─────────────────────────────────────────────────────────────────────────────

export interface ToggleRecordingMessage {
  type: 'TOGGLE_RECORDING';
  active: boolean; // true = start scraping, false = stop
}

// ─────────────────────────────────────────────────────────────────────────────
// popup/sidepanel → background.ts  (via chrome.runtime.sendMessage)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResumeDataMessage {
  type: 'RESUME_DATA';
  data: any; // Parsed resume JSON from the resume parser service
}

export interface GetStatusMessage {
  type: 'GET_STATUS';
}

export interface GetTranscriptMessage {
  type: 'GET_TRANSCRIPT'; // TranscriptPanel uses this to hydrate history on mount
}

// ─────────────────────────────────────────────────────────────────────────────
// background.ts → sidepanel/popup  (broadcast via chrome.runtime.sendMessage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Broadcast after background.ts debounces and finalises a TRANSCRIPT_SEGMENT.
 * Includes `id` and `speaker` so the UI can render chat-bubble style messages.
 */
export interface TranscriptMessage {
  type: 'TRANSCRIPT';
  id: string;          // Unique message ID, e.g. `msg-${Date.now()}-${Math.random()}`
  text: string;
  speaker: string;     // Normalised: 'INTERVIEWER' | 'CANDIDATE' | 'MIXED'
  timestamp?: number;  // Date.now() — used for display timestamps
}

export interface AIResultMessage {
  type: 'AI_RESULT';
  questions: any[];  // FollowUpQuestion[] from the AI Intelligence service
  alerts: any[];     // ContradictionAlert[] from the AI Intelligence service
  score: number;     // overall_score 0–10
}

// ─────────────────────────────────────────────────────────────────────────────
// Exhaustive discriminated union — covers every message in the system
// ─────────────────────────────────────────────────────────────────────────────

export type ExtensionMessage =
  | TranscriptSegmentMessage
  | ToggleRecordingMessage
  | ResumeDataMessage
  | GetStatusMessage
  | GetTranscriptMessage
  | TranscriptMessage
  | AIResultMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Type guard — narrows a message by its discriminant
// ─────────────────────────────────────────────────────────────────────────────

export function isMessageOfType<T extends ExtensionMessage['type']>(
  message: ExtensionMessage,
  type: T
): message is Extract<ExtensionMessage, { type: T }> {
  return message.type === type;
}