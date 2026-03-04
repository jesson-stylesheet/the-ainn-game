# **SYSTEM ARCHITECTURE: "The AInn" Engine**

**Version:** Alpha-0.1
**Last Updated:** March 3, 2026

## **1. Core Directives & Project Philosophy**

You are acting as a Senior Backend Systems Engineer. Your task is to build the headless core engine for a real-time management simulation called "The AInn".

**CRITICAL RULES OF REALITY:**

1. **Zero LLM Game Logic:** The simulation is a cold, deterministic mathematical state-machine. The LLM is strictly quarantined to two specific tasks: Parsing text into math (JSON), and rendering math outcomes back into narrative text. It does not decide if a quest succeeds.
2. **Absolute Source of Truth:** Supabase (PostgreSQL) is the sole repository of state. In-memory arrays (`gameState`) are temporary, highly-optimized caches that sync rapidly to the database. All writes must pass through a strict, single-concurrency queue to prevent network race conditions.
3. **Decoupled Architecture:** The game is currently tested via a Terminal User Interface (TUI), but it will eventually be replaced by a Svelte5 web client. The core engine strictly communicates via an Event Bus (`eventBus.ts`).
4. **Multi-Tenancy:** The universe is naturally sharded into `players` -> `worlds` -> `inns`. All queries and logic strictly scope to `world_id` and `inn_id` to prevent data bleed across parallel saves or eventual co-op implementations.

## **1.1 Narrative Context (The Vibe Wrapper)**

While you are building cold math, you must understand the narrative wrapper. The player acts as the stationary anchor in a chaotic fantasy universe—the Innkeeper of "The AInn".

* **The Entities:** The inn is populated by procedural patrons: mundane adventurers, esoteric monsters, and eventually, localized deities.  
* **The Loop:** The player cannot fight. Their sole agency is quest generation, economic and logistical. They provide rooms, broker localized quests, craft items, and manage the tavern lounge.  
* **The Emergence:** The narrative of the game is not pre-written. It emerges entirely from the mathematical friction of the engine. If a Rogue fails a stealth quest, the story of their failure is generated strictly from the exact variables that caused the math to fail.

## **2. Systematic Directory Structure**

The TypeScript Node.js project strictly uses this hierarchy:

```
/the-ainn  
├── /sql                     # Postgres migrations (Multi-Tenancy, pgvector Embeddings, RLS)
├── /src  
│   ├── /core                # The Physics: Pure logic, zero side effects  
│   │   ├── /types           # Entity interfaces, Tag enums, SkillVectors  
│   │   ├── /constants       # TICK_MULTIPLIER, Base modifiers, API Configs  
│   │   ├── /math            # probability.ts (Sigmoid functions, RNG logic)  
│   │   └── /engine          # The Tick Loop, state mutators, and event emitters  
│   ├── /infrastructure      # The Outside World: DB and APIs  
│   │   ├── /db              # Supabase clients, DBSyncAdapter (async queues), pg queries
│   │   └── /llm             # System prompts, OpenRouter wrappers (Gemini models), RAG Tools
│   └── /presentation        # The Glass: The UI Layer  
│       └── /tui             # 'ink' or 'blessed' UI, subscribes to /core/engine  
├── package.json  
└── tsconfig.json
```

## **3. The DNA (Types & Constants)**

Implemented in `/src/core/types/entity.ts`. A character's skill matrix must be a strict 20-dimensional vector. Missing skills must mathematically default to 0.

**Core Skill Tags:**
`Agility`, `Bravery`, `Charisma`, `Curiosity`, `Constitution`, `Defense`, `MeleeWeapon`, `LongRangeWeapon`, `Fishing`, `Foraging`, `Navigation`, `BasicMagic`, `DarkMagic`, `HolyMagic`, `Mining`, `Crafting`, `Intelligent`, `Dexterity`, `Alchemy`, `Cooking`.

## **4. Patron Instantiation & The Engine Loop**

Patrons are dynamically generated based on standard mathematical archetypes: Human Warrior, Elven Archer, Dwarven Miner, Lizardman Mechanic, Skeleton Necromancer, Goblin Wizard, Orc Berserker, Kitsune Cleric, Nekomimi Geisha, Wandering Bard, Shady Rogue, and Master Artisan.

Their actions are resolved via a time-dilated loop (`ticker.ts`) that runs asynchronously in the background. Game time progresses continuously (e.g. 500ms = 1 In-Game Minute).

## **5. The Probability Engine & Equipment Metrics**

Quests are resolved when their deadline expires using a Sigmoid resolution function:

`P(Success) = 1 / (1 + Math.exp(-(dotProduct - D + gamma * (Rd20 - 10.5))))`

* **dotProduct:** The sum of the products of overlapping non-zero skills between the Patron's SkillVector (buffed by their specific equipped items) and the Quest's required SkillVector.  
* **D:** The Quest's `difficultyScalar` (Integer, generally between 10 and 50). Item retrieval/crafting limits heavily inflate this based on Rarity (0-100).  
* **gamma:** The Chaos Coefficient. Set to `0.5` to give the classic d20 role significant weight over brute-force stats.
* **Rd20:** A standard random integer roll between 1 and 20.

## **6. AI Model Routing & System Consistency**

All LLM queries flow through OpenRouter using Google AI Studio explicitly. Models are strictly pinned to their ideal use-cases:

- `google/gemini-3-flash-preview`: Used exclusively for creative narrative rendering. Maps resolution math into immersive stories, handles The Lore Guardian's esoteric dialogue, and formats daily reflections.
- `google/gemini-3.1-flash-lite-preview`: Used for structural and systemic logic. Parses player quests into JSON schemas, executes recursive tool-calling pipelines, runs background deduplication scripts for equipment, and acts as the background Codex Synchroniser.

## **7. Retrieval-Augmented Generation (RAG) & The World Codex**

The central persistent memory of the game is a highly normalized `pgvector` indexed entity history in Supabase.

**The Codex Schema:** `codex_mobs`, `codex_items`, `codex_characters`, `codex_factions`.

Every time a narrative resolves, a background async worker parses the story for newly imagined entities. It strips them of hallucinated variance and permanently registers them to the Codex with a 768-dimensional float embedding (`google/gemini-embedding-001`).

Whenever the Lore Guardian examines the inn's history, or a patron generates a new quest, the engine runs a semantic Cosine similarity search against the Codex to seamlessly inject established, deeply connected historical entities directly into the LLM prompts.

## **8. Immediate Execution Order (Historical Log)**

*   **Phase 1 (Stabilization):** Established the engine tick, the Probability Sigmoid, and the TUI.
*   **Phase 2 (Game Economy & Items):** Initialized `items` tables, specific equipment slots (Head, Body, Legs, Primary, Secondary), and bound item rarities to quest difficulties.
*   **Phase 3 (RAG & Engine Memory):** Implemented recursive OpenRouter tools, the passive Codex Synchroniser, the Lore Guardian API loops, and the Vector Embedding searches.
*   **Phase 4 (Multi-Tenancy):** Segregated data hierarchically (`Players` -> `Worlds`), added Row Level Security (RLS) to Supabase, and secured the `syncAdapter.ts` with strict FIFO 1-concurrency SQL queuing.

## **9. Future Considerations (Architectural Foresight)**

1.  **The API Boundary (Phase 5):** Integrating the Svelte5 web client using the existing event-driven (`eventBus.ts`) hook points.
2.  **Diplomatic Factions:** Since `codex_factions` are fully integrated into RAG, we must expand `questType: 'diplomacy'` to physically shift mathematical alignment scales between factions.
3.  **Economic Thermodynamics:** A closed system generating procedural quests will experience mathematical hyperinflation. The database schema treats currency (Gold/Copper) as strict, atomic integers. Do not rely on floating-point math for the economy.