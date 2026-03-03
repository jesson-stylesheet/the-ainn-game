# The AInn Game - Architecture & Development Guide

This document serves as the ground truth for the AInn Game's architecture, pipelines, and design patterns. When developing new features, **always refer to this guide** to ensure consistency and prevent regressions in the core loops.

## Core Philosophical Rules

1. **State is Persistent, Not Volatile:** 
   The memory `gameState` object is just a fast access layer. **Supabase is the ultimate source of truth.** Upon server boot (`src/server/index.ts`), the engine *must* invoke `syncAdapter.hydrateGameState()` to load active quests, patrons, inventory, and tick count before starting the game loop.
2. **Determinism over Hallucination:**
   Stats, probabilities, item drops, and game logic are purely mathematical (`src/core/math/probability.ts`). The LLM is **only** used to narrate the results of these deterministic checks, never to decide if an action succeeds or fails.
3. **Event-Driven Subsystems:**
   Avoid deep coupling. If something happens in the simulation (e.g., a quest expires), the engine emits an event (`eventBus.emit('quest:expired', quest)`). The database adapters or UI listeners react to these events asynchronously.

---

## 1. The Ticking Engine (`src/core/engine/ticker.ts`)

The game operates on a discrete "tick" system (1 tick = 1 in-game minute, natively ~500ms real-time).
- **Time Management**: The `gameState.currentTick` advances infinitely.
- **Expiration Checks**: Within `ticker.ts`, the engine checks if a `POSTED` quest has surpassed its `deadlineTimestamp`. If so, it fails and triggers `quest:expired`.
- **Worker Queues**: The ticker picks up `ACCEPTED` quests that have reached their `completionTimestamp` and pushes them to the `narrativeWorker`.

## 2. The Asynchronous Narrative Pipeline (`src/core/engine/narrativeWorker.ts`)

Because LLM calls are slow, patrons cannot instantly react to quest results. This creates a race condition pipeline:

1. **Resolution Calculation (`gameState.ts`)**: When a quest finishes its duration, math decides the outcome (Success, Fail, Death). The patron is placed into an `AWAITING_NARRATIVE` state. They cannot take new quests while in this state.
2. **LLM Generation (`narrativeWorker.ts`)**: The worker formats the prompt and calls `gemini-3-flash`.
3. **State Release**: Only *after* the LLM returns the story does the worker emit `narrative:completed` and release the patron back to `IDLE` (or keep them `DEAD`).

## 3. The World Codex & Tools (`add_world_codex.sql`)

The game features normalized, highly-structured entity tracking.
- **Tables**: `codex_mobs`, `codex_items`, `codex_characters`, `codex_factions`, `codex_recipes`.
- **Tool Calling**: `gemini-2.5-flash` natively supports open-ended tool calling (`src/infrastructure/llm/openRouterClient.ts`). When parsing a quest, the LLM is given tools like `search_mob` and `register_mob`.
- **Sanitization Pipeline**: All DB insertions via the LLM enforce a strict `sanitizeName()` constraint (trimming, Title Case) to prevent duplicate key errors if the LLM hallucinates an existing entity with slightly different casing.

## 4. Planned Capabilities (Phase 3+)

**Retrieval-Augmented Generation (RAG):**
To ensure the LLM perfectly remembers years of lore, the World Codex operates on `pgvector` embeddings (`google/gemini-embedding-001`). Before generating a narrative, the LLM will fetch semantically relevant entities (RAG) rather than relying on exact regex or full-text SQL searches, empowering deep, consistent world-building.

---

*Always use specific db queries rather than generic updates, and respect the strict type safety defined in `src/core/types/entity.ts`.*
