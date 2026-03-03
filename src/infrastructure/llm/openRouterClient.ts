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
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string; };
    }[];
    tool_call_id?: string;
    name?: string;
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
            content: string | null;
            tool_calls?: {
                id: string;
                type: 'function';
                function: { name: string; arguments: string; };
            }[];
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface EmbeddingResponse {
    data: {
        object: 'embedding';
        embedding: number[];
        index: number;
    }[];
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

export type ToolHandlerRegistry = Record<string, (args: any) => Promise<any>>;

export interface LLMOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    tools?: ToolDefinition[];
    tool_choice?: 'auto' | 'any' | 'none' | { type: 'function', function: { name: string } };
    toolHandlers?: ToolHandlerRegistry;
}

// ── Core API Call (free-form text) ───────────────────────────────────────

/**
 * Send a chat completion request to OpenRouter. Returns raw text.
 */
export async function chatCompletion(
    inputMessages: ChatMessage[],
    options: LLMOptions = {}
): Promise<string> {
    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY not configured');
    }

    const {
        model = DEFAULT_MODEL,
        temperature = 0.3,
        maxTokens = 1024,
        timeoutMs = 60000,
        tools,
        tool_choice,
        toolHandlers
    } = options;

    const messages = [...inputMessages];

    while (true) {
        const body: any = {
            model, messages, temperature, max_tokens: maxTokens,
            provider: { order: ["Google"] }
        };
        if (tools && tools.length > 0) {
            body.tools = tools;
            if (tool_choice) body.tool_choice = tool_choice;
        }

        const response = await fetch(OPENROUTER_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://the-ainn.game',
                'X-Title': 'The AInn Engine',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as OpenRouterResponse;
        if (!data.choices || data.choices.length === 0) {
            throw new Error('OpenRouter returned no choices');
        }

        const message = data.choices[0].message;
        const finishReason = data.choices[0].finish_reason;

        if (finishReason === 'tool_calls' && message.tool_calls && toolHandlers) {
            messages.push(message as ChatMessage);
            for (const call of message.tool_calls) {
                if (call.type === 'function') {
                    let result;
                    const handler = toolHandlers[call.function.name];
                    if (handler) {
                        try {
                            const args = JSON.parse(call.function.arguments);
                            console.log(`\n  🧩 [LLM Tool Call] ${call.function.name}`, args);
                            result = await handler(args);
                            console.log(`  ✅ [LLM Tool Result]`, result);
                        } catch (e: any) {
                            console.error(`  ❌ [LLM Tool Error] ${call.function.name}:`, e.message);
                            result = { error: e.message };
                        }
                    } else {
                        result = { error: `Tool ${call.function.name} not found` };
                    }
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        tool_call_id: call.id,
                        name: call.function.name
                    });
                }
            }
            continue;
        }

        return message.content || '';
    }
}

// ── Structured Output (JSON Schema) ─────────────────────────────────────

/**
 * Send a chat completion with structured output enforcement.
 */
export async function chatCompletionStructured<T>(
    inputMessages: ChatMessage[],
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
        timeoutMs = 60000,
        tools,
        tool_choice,
        toolHandlers
    } = options;

    const messages = [...inputMessages];

    while (true) {
        const body: any = {
            model, messages, temperature, max_tokens: maxTokens,
            response_format: { type: 'json_schema', json_schema: jsonSchema },
            provider: { order: ["Google"] }
        };
        if (tools && tools.length > 0) {
            body.tools = tools;
            if (tool_choice) body.tool_choice = tool_choice;
        }

        const response = await fetch(OPENROUTER_BASE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://the-ainn.game',
                'X-Title': 'The AInn Engine',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }

        const data = (await response.json()) as OpenRouterResponse;
        if (!data.choices || data.choices.length === 0) {
            throw new Error('OpenRouter returned no choices');
        }

        const message = data.choices[0].message;
        const finishReason = data.choices[0].finish_reason;

        if (finishReason === 'tool_calls' && message.tool_calls && toolHandlers) {
            messages.push(message as ChatMessage);
            for (const call of message.tool_calls) {
                if (call.type === 'function') {
                    let result;
                    const handler = toolHandlers[call.function.name];
                    if (handler) {
                        try {
                            const args = JSON.parse(call.function.arguments);
                            console.log(`\n  🧩 [LLM Tool Call] ${call.function.name}`, args);
                            result = await handler(args);
                            console.log(`  ✅ [LLM Tool Result]`, result);
                        } catch (e: any) {
                            console.error(`  ❌ [LLM Tool Error] ${call.function.name}:`, e.message);
                            result = { error: e.message };
                        }
                    } else {
                        result = { error: `Tool ${call.function.name} not found` };
                    }
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify(result),
                        tool_call_id: call.id,
                        name: call.function.name
                    });
                }
            }
            continue;
        }

        const raw = message.content || '';
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
            return JSON.parse(cleaned) as T;
        } catch {
            throw new Error(`Failed to parse structured LLM response: ${cleaned.slice(0, 200)}`);
        }
    }
}

// ── Embeddings (RAG) ───────────────────────────────────────────────────

/**
 * Generate a vector embedding for a given text string.
 * Uses 768 dimensions by default (compatible with google/text-embedding-004).
 */
export async function generateEmbedding(text: string, model: string = 'google/gemini-embedding-001', dimensions: number = 1536): Promise<number[]> {
    if (!OPENROUTER_API_KEY) {
        console.warn('⚠ OPENROUTER_API_KEY not set. Returning zero-vector.');
        return new Array(dimensions).fill(0);
    }

    const requestBody: any = {
        model,
        input: text
    };

    if (dimensions) {
        requestBody.dimensions = dimensions;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    let response: Response;
    try {
        response = await fetch('https://openrouter.ai/api/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/jesson-stylesheet/the-ainn-game',
                'X-Title': 'The AInn Game'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
    } catch (e: any) {
        if (e.name === 'AbortError') {
            throw new Error(`Embedding request timed out after 15s`);
        }
        throw new Error(`Failed to call OpenRouter Embeddings: ${e.message}`);
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as EmbeddingResponse;
    if (!data.data || data.data.length === 0 || !data.data[0].embedding) {
        throw new Error(`Invalid response format from OpenRouter Embeddings: ${JSON.stringify(data)}`);
    }

    return data.data[0].embedding;
}
