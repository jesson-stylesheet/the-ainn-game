# **SYSTEM ARCHITECTURE: "The AInn" Engine**

## **1\. Core Directives & Project Philosophy**

You are acting as a Senior Backend Systems Engineer. Your task is to build the headless core engine for a real-time management simulation called "The AInn".

**CRITICAL RULES OF REALITY:**

1. **Zero LLM Game Logic:** The simulation is a cold, deterministic mathematical state-machine. The LLM is strictly quarantined to two specific tasks: Parsing text into math (JSON), and rendering math outcomes back into narrative text. It does not decide if a quest succeeds.  
2. **Absolute Source of Truth:** Supabase (PostgreSQL) is the sole repository of state. In-memory arrays are temporary and must sync to the database. Create a new table in https://supabase.com/dashboard/project/akfkdhrxmshprvetvkqz  
3. **Decoupled Architecture:** The game is currently tested via a Terminal User Interface (TUI), but it will eventually be replaced by a Svelte5 web client. The core engine must be completely blind to the UI layer.

## **1.1 Narrative Context (The Vibe Wrapper)**

While you are building cold math, you must understand the narrative wrapper. The player acts as the stationary anchor in a chaotic fantasy universe—the Innkeeper of "The AInn".

* **The Entities:** The inn is populated by procedural patrons: mundane adventurers, esoteric monsters, and eventually, localized deities.  
* **The Loop:** The player cannot fight. Their sole agency is economic and logistical. They provide rooms, broker localized quests, craft items, and manage the tavern lounge.  
* **The Goal:** To scale the inn from a mundane rat-infested tavern into an ontological anchor point of the universe, accepting increasingly dangerous favors and managing higher-tier patrons.  
* **The Emergence:** The narrative of the game is not pre-written. It emerges entirely from the mathematical friction of the engine. If an Orc Berserker fails a stealth quest, the story of his failure is generated strictly from the exact variables that caused the math to fail.

## **2\. Systematic Directory Structure**

Initialize the TypeScript Node.js project strictly using this hierarchy. Do not deviate.

/the-ainn  
├── /src  
│   ├── /core                \# The Physics: Pure logic, zero side effects  
│   │   ├── /types           \# Entity interfaces, Tag enums, SkillVectors  
│   │   ├── /constants       \# TICK\_MULTIPLIER, Base modifiers, API Configs  
│   │   ├── /math            \# probability.ts (Sigmoid functions, RNG logic)  
│   │   └── /engine          \# The Tick Loop, state mutators, and event emitters  
│   ├── /infrastructure      \# The Outside World: DB and APIs  
│   │   ├── /db              \# Supabase clients and queries  
│   │   └── /llm             \# System prompts, API wrappers, strict JSON parsers  
│   └── /presentation        \# The Glass: The UI Layer  
│       └── /tui             \# 'ink' or 'blessed' UI, subscribes to /core/engine  
├── .env                     \# SUPABASE\_URL, SUPABASE\_SERVICE\_ROLE\_KEY, LLM\_API\_KEY  
├── package.json  
└── tsconfig.json

## **3\. Step 1: The DNA (Types & Constants)**

Implement these exact types in /src/core/types/entity.ts. A character's skill matrix must be a strict 15-dimensional vector. Missing skills must mathematically default to 0.

export type SkillTag \=   
  | 'Agility' | 'Bravery' | 'Charisma' | 'Curiosity' | 'Constitution'   
  | 'Defense' | 'MeleeWeapon' | 'LongRangeWeapon' | 'Fishing'   
  | 'Foraging' | 'Navigation' | 'BasicMagic' | 'DarkMagic'   
  | 'HolyMagic' | 'Mining';

// A strict record ensuring all 15 skills exist. Unassigned skills \= 0\.  
export type SkillVector \= Record\<SkillTag, number\>;

export interface IPatron {  
  id: string; // UUID   
  name: string;   
  archetype: string;   
  skills: SkillVector; // The mathematical anchor  
  state: 'IDLE' | 'LOUNGING' | 'ON\_QUEST' | 'DEPARTED' | 'DEAD';  
  arrivalTimestamp: number; // Unix epoch  
}

export interface IQuest {  
  id: string; // UUID  
  originalText: string;  
  requirements: SkillVector; // Extracted by LLM  
  difficultyScalar: number;  // Extracted by LLM (D)  
  assignedPatronId: string | null;  
  status: 'POSTED' | 'ACCEPTED' | 'FAILED' | 'COMPLETED';  
  deadlineTimestamp: number; // Unix epoch  
}

## **4\. Step 2: Patron Instantiation (The Factory)**

In /src/core/engine/patronFactory.ts, build a generator that selects an archetype, assigns base stats, and applies a \[-2, \+2\] RNG variance to all non-zero stats. Stats cannot drop below 1 or exceed 20\. Omitted stats MUST be exactly 0\.

**Archetype Blueprints:**

* **Human Warrior:** Primary \[10-15\]: MeleeWeapon, Defense, Constitution, Bravery. Secondary \[5-9\]: Agility, Charisma, Navigation, Foraging. Omitted: All else.  
* **Elven Archer:** Primary: Agility, LongRangeWeapon, Navigation, Foraging. Secondary: Curiosity, Constitution, Defense, BasicMagic.  
* **Dwarven Miner:** Primary: Mining, Constitution, Bravery, Defense. Secondary: MeleeWeapon, Navigation, Charisma, Foraging.  
* **Lizardman Mechanic:** Primary: Curiosity, Agility, Constitution, Defense. Secondary: Foraging, Navigation, MeleeWeapon, BasicMagic.  
* **Skeleton Necromancer:** Primary: DarkMagic, Constitution, Curiosity, BasicMagic. Secondary: Defense, Navigation, Foraging, Charisma.  
* **Goblin Wizard:** Primary: BasicMagic, Curiosity, Agility, Foraging. Secondary: Navigation, Defense, Bravery, MeleeWeapon.  
* **Orc Berserker:** Primary: MeleeWeapon, Bravery, Constitution, Defense. Secondary: Agility, Foraging, Navigation, Charisma.  
* **Kitsune Cleric:** Primary: HolyMagic, Charisma, Agility, Curiosity. Secondary: BasicMagic, Navigation, Bravery, Defense.  
* **Nekomimi Geisha:** Primary: Charisma, Agility, Curiosity. Secondary: Navigation, BasicMagic, Bravery, Foraging, Defense.

## **5\. Step 3: The Probability Engine**

In /src/core/math/probability.ts, implement the following Sigmoid resolution function. This is how quests are resolved when their deadline expires.

P(Success) \= 1 / (1 \+ Math.exp(-(dotProduct \- D \+ gamma \* (Rd20 \- 10.5))))

* dotProduct: The sum of the products of overlapping non-zero skills between the Patron's SkillVector and the Quest's SkillVector.  
* D: The Quest's difficultyScalar (Integer, generally between 10 and 50).  
* gamma: The Chaos Coefficient constant (set to 0.2 in /core/constants).  
* Rd20: A standard random integer roll between 1 and 20\.

**Resolution:** Generate a random float Math.random(). If it is less than or equal to P(Success), the quest succeeds. Otherwise, it fails. Return a data object detailing the outcome, the d20 roll, and an array of the tags that caused the highest negative impact on the dot product (for the LLM to use later).

## **6\. Step 4: The Time Dilation Loop**

In /src/core/engine/ticker.ts, build the main loop.

* Import TICK\_MULTIPLIER (e.g., 3600 means 1 real second \= 1 in-game hour).  
* Run a setInterval loop every X milliseconds.  
* On every tick, calculate the simulated current time.  
* Query Supabase: Fetch Quests where status \=== 'ACCEPTED' and deadlineTimestamp \<= simulatedCurrentTime.  
* Pass those quests to the Probability Engine.  
* Update the database with the resulting status (COMPLETED or FAILED).

## **7\. Immediate Execution Order**

Do not write the entire application at once. Execute in this strict sequence:

1. Initialize the project structure and install TypeScript dependencies.  
2. Implement the Types and the Patron Factory. Write a local test script to generate one of each archetype and log them to the console to verify the math and variance.  
3. Implement probability.ts and write unit tests simulating a Nekomimi Geisha trying to mine vs. a Dwarven Miner trying to mine.  
4. Pause and await my review before proceeding to the Ticker or Supabase integration.

## **8\. The Autonomous Execution Mandate (Fill the Gaps)**

I cannot predict every missing utility function, undefined import, or localized edge case in this document. You are an engineer, not a typewriter.

* **No Placeholders:** Do not leave // TODO: handle this edge case or // Implement generic random generator here comments. If the code requires a helper function (e.g., a standard standard d20 roller, or a uuid generator for entity IDs) to compile and execute, **write the function**.  
* **Infer the Plumbing:** If the core math requires variables or structural glue that I failed to explicitly name, invent them. Ensure your inventions strictly adhere to the deterministic, math-first philosophy of the engine.  
* **Complete the Circuit:** The output of your code must be fully executable within the boundary of the current step. If it cannot be executed or tested because a dependency is missing, resolve the dependency autonomously.

## **9\. Future Considerations (Architectural Foresight)**

Do not implement these features yet, but architect the current systems so they do not block these eventual expansions.

1. **The Web API Boundary:** The TUI is temporary. Eventually, a Svelte5 web client will connect to this engine. Ensure /core/engine emits clear, serializable events (e.g., using EventEmitter or a simple PubSub pattern) so that a WebSocket or Server-Sent Events (SSE) layer can easily replace the TUI later without rewriting the core physics.  
2. **Vectorized Grudges (Memory):** Patrons will eventually need to remember their interactions to generate emergent rivalries or loyalties. We will eventually use Supabase pgvector to store LLM-generated narrative summaries of their failed/successful quests. Ensure the IPatron interface can cleanly accept an array of memoryIds or eventIds in the future.  
3. **Economic Thermodynamics:** A closed system generating procedural quests will experience mathematical hyperinflation. The database schema must treat currency (Gold/Copper) as strict, atomic integers. Do not rely on floating-point math for the economy, or a Nekomimi Geisha will eventually owe you 0.0000000000001 copper coins and crash the database.