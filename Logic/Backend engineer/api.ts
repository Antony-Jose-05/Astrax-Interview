/**
 * api.ts
 * Utility functions for communicating with the Interview Intelligence backend.
 * Used by the background script to forward audio chunks and transcript analysis.
 */

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const STT_API_BASE = "http://localhost:8002"; // STT Service  → /transcribe
const AI_API_BASE  = "http://localhost:8001"; // AI Service   → /analyze-answer

// ─────────────────────────────────────────────
// Response shape contracts
// ─────────────────────────────────────────────

export interface TranscribeResponse {
  transcript: string;
}

export interface AnalyzeAnswerResponse {
  follow_up_questions: string[];
  contradictions: string[];
  score: number;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Shared error class so callers can distinguish API failures
 * from unexpected runtime errors.
 */
export class ApiError extends Error {
  constructor(
    public readonly endpoint: string,
    public readonly status: number,
    message: string
  ) {
    super(`[ApiError] ${endpoint} → HTTP ${status}: ${message}`);
    this.name = "ApiError";
  }
}

/**
 * Asserts a fetch Response is OK; throws ApiError otherwise.
 * Attempts to parse an error message from the response body.
 */
async function assertOk(response: Response, endpoint: string): Promise<void> {
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body?.detail ?? body?.message ?? detail;
    } catch {
      // Body is not JSON — keep statusText as the detail
    }
    throw new ApiError(endpoint, response.status, detail);
  }
}

// ─────────────────────────────────────────────
// Public API functions
// ─────────────────────────────────────────────

/**
 * Sends a WAV audio Blob to the /transcribe endpoint.
 *
 * @param audio       - Raw audio captured from the browser tab (WAV Blob)
 * @param sequence_id - Monotonically increasing chunk counter for ordering
 * @param speaker     - Speaker label, e.g. "interviewer" | "candidate"
 * @returns           - Parsed TranscribeResponse containing the transcript string
 *
 * @throws {ApiError}  On non-2xx HTTP responses
 * @throws {TypeError} On network failure (no connection, CORS, etc.)
 */
export async function sendAudio(
  audio: Blob,
  sequence_id: number,
  speaker: string = "unknown"
): Promise<TranscribeResponse> {
  const endpoint = "/transcribe";

  const form = new FormData();
  // Backend expects a WAV file; name the field "audio"
  form.append("audio", audio, `chunk_${sequence_id}.wav`);
  form.append("sequence_id", String(sequence_id));
  form.append("speaker", speaker);

  const response = await fetch(`${STT_API_BASE}${endpoint}`, {
    method: "POST",
    body: form,
    // Note: Do NOT set Content-Type manually — the browser sets it
    // automatically with the correct multipart boundary when using FormData.
  });

  await assertOk(response, endpoint);
  return response.json() as Promise<TranscribeResponse>;
}

/**
 * Sends a transcript + resume to the /analyze-answer endpoint
 * and returns AI-generated follow-up questions, contradiction alerts,
 * and a performance score.
 *
 * @param transcript - Plain-text transcript from the STT service
 * @param resume     - Parsed resume object (free-form structure)
 * @returns          - Parsed AnalyzeAnswerResponse
 *
 * @throws {ApiError}  On non-2xx HTTP responses
 * @throws {TypeError} On network failure
 */
export async function analyzeAnswer(
  transcript: string,
  resume: any
): Promise<AnalyzeAnswerResponse> {
  const endpoint = "/analyze-answer";

  const response = await fetch(`${AI_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transcript, resume }),
  });

  await assertOk(response, endpoint);
  return response.json() as Promise<AnalyzeAnswerResponse>;
}
