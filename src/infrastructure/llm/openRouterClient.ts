/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — OpenRouter LLM Client
 * ═══════════════════════════════════════════════════════════════════════
 * All LLM API calls go through OpenRouter. Uses STRUCTURED OUTPUTS
 * (JSON Schema) for reliable, type-safe responses.
 *
 * The LLM is strictly quarantined to:
 *   1. Parsing quest text → structured data
 *   2. Rendering math outcomes → narrative text
 *   3. Determining patron health after quest resolution
 *
 * The LLM does NOT decide if a quest succeeds. (Blueprint Rule #1)
 */

import { config } from 'dotenv';

config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

if (!OPENROUTER_API_KEY) {
    console.warn('⚠ OPENROUTER_API_KEY not set. LLM features will use fallbacks.');
}

// ── Types ───────────────────────────────────────────────────────────────

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** JSON Schema definition for structured outputs. */
interface JsonSchemaDefinition {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
}

interface OpenRouterResponse {
    id: string;
    choices: {
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface LLMOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

// ── Core API Call (free-form text) ───────────────────────────────────────

/**
 * Send a chat completion request to OpenRouter. Returns raw text.
 */
export async function chatCompletion(
    messages: ChatMessage[],
    options: LLMOptions = {}
): Promise<string> {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 1024,
    } = options;

    const response = await fetch(OPENROUTER_BASE_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://the-ainn.game',
            'X-Title': 'The AInn Engine',
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter returned no choices');
    }

    return data.choices[0].message.content;
}

// ── Structured Output (JSON Schema) ─────────────────────────────────────

/**
 * Send a chat completion with structured output enforcement.
 * OpenRouter validates the response against the provided JSON Schema.
 * This guarantees type-safe, parseable responses.
 *
 * @see https://openrouter.ai/docs/guides/features/structured-outputs
 */
export async function chatCompletionStructured<T>(
    messages: ChatMessage[],
    jsonSchema: JsonSchemaDefinition,
    options: LLMOptions = {}
): Promise<T> {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 1024,
    } = options;

    const response = await fetch(OPENROUTER_BASE_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://the-ainn.game',
            'X-Title': 'The AInn Engine',
        },
        body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            response_format: {
                type: 'json_schema',
                json_schema: jsonSchema,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter returned no choices');
    }

    const raw = data.choices[0].message.content;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        return JSON.parse(cleaned) as T;
    } catch {
        throw new Error(`Failed to parse structured LLM response: ${cleaned.slice(0, 200)}`);
    }
}
