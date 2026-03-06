/**
 * messages.ts
 * Defines all message types for communication between
 * content script, background script, and popup UI.
 */

// ──────────────────────────────────────────────
// 1. Audio Chunk — content script → background
// ──────────────────────────────────────────────
export interface AudioChunkMessage {
  type: "AUDIO_CHUNK";
  /** Raw audio data captured from the browser tab */
  audio: Blob;
  /** Monotonically increasing counter to preserve ordering */
  sequence_id: number;
  /** Identifies who is speaking, e.g. "interviewer" | "candidate" */
  speaker: string;
}

// ──────────────────────────────────────────────
// 2. Transcript — background → popup / content
// ──────────────────────────────────────────────
export interface TranscriptMessage {
  type: "TRANSCRIPT";
  /** Plain-text transcript returned by the backend STT service */
  transcript: string;
}

// ──────────────────────────────────────────────
// 3. AI Result — background → popup
// ──────────────────────────────────────────────
export interface AIResultMessage {
  type: "AI_RESULT";
  /** Suggested follow-up or clarifying questions */
  questions: string[];
  /** Real-time alerts, e.g. "Answer is too vague" */
  alerts: string[];
  /** Overall performance score (0–100) */
  score: number;
}

// ──────────────────────────────────────────────
// 4. Resume Data — popup → background / content
// ──────────────────────────────────────────────
export interface ResumeDataMessage {
  type: "RESUME_DATA";
  /** Parsed resume payload; kept as `any` for schema flexibility */
  data: any;
}

// ──────────────────────────────────────────────
// Union — exhaustive type for all extension messages
// ──────────────────────────────────────────────
export type ExtensionMessage =
  | AudioChunkMessage
  | TranscriptMessage
  | AIResultMessage
  | ResumeDataMessage;

// ──────────────────────────────────────────────
// Helper — narrow an ExtensionMessage by its type discriminant
// ──────────────────────────────────────────────
export function isMessageOfType<T extends ExtensionMessage["type"]>(
  message: ExtensionMessage,
  type: T
): message is Extract<ExtensionMessage, { type: T }> {
  return message.type === type;
}
