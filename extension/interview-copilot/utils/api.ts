/**
 * api.ts
 * Utility functions for communicating with the Interview Intelligence backend.
 * Used by the background script to forward audio chunks and transcript analysis.
 */

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

const STT_API_BASE = "http://127.0.0.1:8000"; // STT Service  → /transcribe
const AI_API_BASE = "http://127.0.0.1:8002"; // AI Service   → /analyze-answer

// ─────────────────────────────────────────────
// Response shape contracts
// ─────────────────────────────────────────────

export interface TranscribeResponse {
    transcript: string;
}

export interface AnalyzeAnswerResponse {
    follow_up_questions: any[];
    contradictions: any[];
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
    console.log(`[API] Sending ${audio.size}B to ${STT_API_BASE}${endpoint}`);
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
    resume: any,
    latest_answer?: string, // Add optional parameter for latest answer
    topic: string = "general" // Add topic parameter with default
): Promise<AnalyzeAnswerResponse> {
    const endpoint = "/analyze-answer";

    // Send all fields that the AI backend expects
    const requestBody = {
        transcript,
        resume,
        latest_answer: latest_answer || null, // Use provided latest_answer
        topic: topic, // Use provided topic
        role: "Software Engineer"
    };

    console.log(`🌐 [API] 📤 SENDING TO AI ANALYSIS:`);
    console.log(`  Endpoint: ${AI_API_BASE}${endpoint}`);
    console.log(`  Request body keys: ${Object.keys(requestBody)}`);
    console.log(`  Transcript length: ${transcript.length} chars`);
    console.log(`  Resume present: ${!!resume}`);
    console.log(`  Full request: ${JSON.stringify(requestBody, null, 2)}`);

    const response = await fetch(`${AI_API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    await assertOk(response, endpoint);
    
    console.log(`🌐 [API] 📥 AI ANALYSIS RESPONSE RECEIVED:`);
    console.log(`  Response status: ${response.status}`);
    console.log(`  Response OK: ${response.ok}`);
    
    const result = await response.json();
    console.log(`🌐 [API] ✅ PARSED RESPONSE:`);
    console.log(`  Response type: ${typeof result}`);
    console.log(`  Response keys: ${Object.keys(result)}`);
    console.log(`  Follow-up questions: ${result.follow_up_questions?.length || 0}`);
    console.log(`  Contradictions: ${result.contradictions?.length || 0}`);
    console.log(`  Score: ${result.score}`);
    console.log(`  Full response: ${JSON.stringify(result, null, 2)}`);
    
    return result as Promise<AnalyzeAnswerResponse>;
}
