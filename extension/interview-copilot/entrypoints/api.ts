/**
 * api.ts
 * Utility functions for communicating with the Interview Intelligence backend.
 * Used by the background script to forward audio chunks and transcript analysis.
 */

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const STT_API_BASE = "http://localhost:8002"; // STT Service  → /transcribe
const AI_API_BASE = "http://localhost:8001"; // AI Service   → /analyze-answer

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
 * Sends an audio Blob to the /transcribe endpoint (SST-Service :8002).
 */
export async function sendAudio(
    audio: Blob,
    sequence_id: number,
    speaker: string = "unknown"
): Promise<TranscribeResponse> {
    const endpoint = "/transcribe";

    const form = new FormData();
    form.append("audio", audio, `chunk_${sequence_id}.webm`);
    form.append("sequence_id", String(sequence_id));
    form.append("speaker", speaker);

    const response = await fetch(`${STT_API_BASE}${endpoint}`, {
        method: "POST",
        body: form,
    });

    await assertOk(response, endpoint);
    return response.json() as Promise<TranscribeResponse>;
}

/**
 * Sends a transcript + resume to /analyze-answer (AI-Intelligence :8001).
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
