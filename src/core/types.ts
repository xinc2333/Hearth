// Hearth core data model.
//
// Every piece of user data is a *resource*: a plain JSON document with a stable id and a kind.
// Resources are never mutated in place by features; all changes go through ChangeSets (see ops.ts),
// so the UI, the AI editor, card scripts (MVU) and plugins share one audited, revertible channel.
//
// Field names are normalized (readable enums instead of ST's magic numbers). The compat layer maps
// SillyTavern formats in and out, and anything it does not understand is kept verbatim in `extra`.

export type ResourceKind = 'character' | 'lorebook' | 'preset' | 'persona' | 'chat';

export type Role = 'system' | 'user' | 'assistant';

export interface ResourceBase {
    id: string;
    kind: ResourceKind;
    name: string;
    createdAt: number;
    updatedAt: number;
    /** Unknown/unsupported source fields, preserved for lossless re-export. */
    extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------------------------

export interface DepthPrompt {
    text: string;
    depth: number;
    role: Role;
}

export interface CharacterFields {
    description: string;
    personality: string;
    scenario: string;
    firstMessage: string;
    alternateGreetings: string[];
    /** Raw example dialogue block, `<START>` separated (ST mes_example). */
    exampleDialogue: string;
    /** Overrides the preset's main prompt when non-empty (ST system_prompt). */
    systemPrompt: string;
    /** Overrides the preset's post-history instructions when non-empty. */
    postHistoryInstructions: string;
    depthPrompt: DepthPrompt;
    creatorNotes: string;
}

export interface Character extends ResourceBase {
    kind: 'character';
    fields: CharacterFields;
    meta: {
        creator: string;
        version: string;
        tags: string[];
        nickname?: string;
    };
    /** Primary lorebook first, then additional ones. */
    lorebookIds: string[];
    regex: RegexScript[];
    /** Card-bound scripts (e.g. TavernHelper / MVU). Stored, not executed yet. */
    scripts: CardScript[];
    avatar?: string;
    /** Where this resource came from. */
    source?: ImportSource;
}

export interface CardScript {
    id: string;
    name: string;
    enabled: boolean;
    type: string;
    content: string;
    raw: unknown;
}

export interface ImportSource {
    format: string;
    file: string;
    importedAt: number;
}

// ---------------------------------------------------------------------------------------------
// Lorebook (World Info)
// ---------------------------------------------------------------------------------------------

export type LoreLogic = 'and_any' | 'not_all' | 'not_any' | 'and_all';

export type LorePosition =
    | 'before_char'
    | 'after_char'
    | 'an_top'
    | 'an_bottom'
    | 'at_depth'
    | 'em_top'
    | 'em_bottom'
    | 'outlet';

export type LoreActivation = 'keyword' | 'constant' | 'vector';

export interface LoreEntry {
    id: string;
    title: string;
    content: string;
    enabled: boolean;
    activation: LoreActivation;
    keys: string[];
    secondaryKeys: string[];
    logic: LoreLogic;
    position: LorePosition;
    depth: number;
    role: Role;
    outlet: string;
    order: number;
    /** 0–100. 100 means always. */
    probability: number;
    useProbability: boolean;
    ignoreBudget: boolean;
    recursion: {
        exclude: boolean;
        prevent: boolean;
        /** 0 = off; n = only activates on recursion level n or later. */
        delayUntil: number;
    };
    group: {
        names: string;
        override: boolean;
        weight: number;
        scoring: boolean | null;
    };
    timed: {
        sticky: number | null;
        cooldown: number | null;
        delay: number | null;
    };
    match: {
        scanDepth: number | null;
        caseSensitive: boolean | null;
        wholeWords: boolean | null;
        personaDescription: boolean;
        characterDescription: boolean;
        characterPersonality: boolean;
        characterDepthPrompt: boolean;
        scenario: boolean;
        creatorNotes: boolean;
    };
    filter: {
        characters: string[];
        tags: string[];
        exclude: boolean;
    };
    /** Generation types this entry is limited to; empty = all. */
    triggers: string[];
    automationId: string;
    extra?: Record<string, unknown>;
}

export interface Lorebook extends ResourceBase {
    kind: 'lorebook';
    description: string;
    entries: LoreEntry[];
    source?: ImportSource;
}

// ---------------------------------------------------------------------------------------------
// Preset (Chat Completion)
// ---------------------------------------------------------------------------------------------

/** Built-in slots whose content is produced by the engine (ST "markers"). */
export const MARKER_IDS = [
    'worldInfoBefore',
    'worldInfoAfter',
    'charDescription',
    'charPersonality',
    'scenario',
    'personaDescription',
    'dialogueExamples',
    'chatHistory',
] as const;

export interface PromptEntry {
    /** ST identifier, e.g. "main", "jailbreak", "chatHistory" or a uuid. */
    id: string;
    name: string;
    role: Role;
    content: string;
    marker: boolean;
    /** ST system_prompt flag: built-in prompt (main/nsfw/jailbreak/enhanceDefinitions/markers). */
    builtin: boolean;
    injection: {
        mode: 'relative' | 'in_chat';
        depth: number;
        order: number;
    };
    triggers: string[];
    forbidOverrides: boolean;
    extra?: Record<string, unknown>;
}

export interface PromptOrderItem {
    id: string;
    enabled: boolean;
}

export type NamesBehavior = 'none' | 'default' | 'completion' | 'content';

export interface Preset extends ResourceBase {
    kind: 'preset';
    sampling: {
        temperature: number;
        topP: number;
        topK: number;
        minP: number;
        topA: number;
        frequencyPenalty: number;
        presencePenalty: number;
        repetitionPenalty: number;
        seed: number;
        reasoningEffort: string;
    };
    context: {
        maxContext: number;
        maxTokens: number;
        stream: boolean;
    };
    prompts: PromptEntry[];
    order: PromptOrderItem[];
    formats: {
        worldInfo: string;
        scenario: string;
        personality: string;
        newChat: string;
        newGroupChat: string;
        newExampleChat: string;
        continueNudge: string;
        groupNudge: string;
        impersonation: string;
        sendIfEmpty: string;
        assistantPrefill: string;
        assistantImpersonation: string;
        continuePostfix: string;
    };
    behavior: {
        namesBehavior: NamesBehavior;
        squashSystemMessages: boolean;
        continuePrefill: boolean;
        showThoughts: boolean;
    };
    regex: RegexScript[];
    scripts: CardScript[];
    source?: ImportSource;
}

// ---------------------------------------------------------------------------------------------
// Regex scripts
// ---------------------------------------------------------------------------------------------

export type RegexPlacement = 'user_input' | 'ai_output' | 'slash_command' | 'world_info' | 'reasoning';

export interface RegexScript {
    id: string;
    name: string;
    enabled: boolean;
    find: string;
    replace: string;
    trim: string[];
    placement: RegexPlacement[];
    /** Applies only when rendering for display (not stored, not sent). */
    displayOnly: boolean;
    /** Applies only when building the prompt (not stored, not displayed). */
    promptOnly: boolean;
    runOnEdit: boolean;
    /** Macro substitution inside the find pattern. */
    substitute: 'none' | 'raw' | 'escaped';
    minDepth: number | null;
    maxDepth: number | null;
    extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------------------------

export type PersonaPosition = 'in_prompt' | 'an_top' | 'an_bottom' | 'at_depth' | 'none';

export interface Persona extends ResourceBase {
    kind: 'persona';
    description: string;
    position: PersonaPosition;
    depth: number;
    role: Role;
    lorebookId?: string;
    avatar?: string;
}

// ---------------------------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------------------------

export interface Swipe {
    id: string;
    content: string;
    reasoning?: string;
    createdAt: number;
    model?: string;
    finish?: 'stop' | 'length' | 'aborted' | 'error';
    error?: string;
    /**
     * Per-swipe state snapshot (variables). This is where MVU-style stat data lives: state is part
     * of the timeline, so switching swipes or branches switches state for free.
     */
    state?: Record<string, unknown>;
    /** Chat-scoped engine state when this reply was saved, so a branch from it starts in that state. */
    chatState?: { variables: Chat['variables']; runtime: Chat['runtime'] };
    /** Card and lorebook changes made by this reply (编辑 mode). */
    edits?: CardEdits;
}

export interface CardEditResult {
    action: string;
    /** The address as the model wrote it. */
    target: string;
    /** Readable name of what was changed, e.g. 世界书「唯一之人」 › 年龄. */
    label: string;
    ok: boolean;
    /** Why it was not applied. */
    reason?: string;
    /** The changed text before and after (whole field or entry). */
    before?: string;
    after?: string;
}

export interface CardEdits {
    results: CardEditResult[];
    /** Change sets written, in order; reverting them undoes this reply's edits. */
    changes: string[];
    reverted?: boolean;
    /** Shown instead of results when nothing was applied, e.g. the block was cut off. */
    note?: string;
}

/** Conversation channel. 'story' is the role-play; 'edit' talks about and edits the card. */
export type ChatMode = 'story' | 'edit';

export interface ChatMessage {
    id: string;
    role: Role;
    name: string;
    swipes: Swipe[];
    activeSwipe: number;
    /** Hidden from the prompt (ST is_system). */
    hidden: boolean;
    /** Channel the message belongs to; missing means 'story'. 编辑 messages never enter the story prompt. */
    mode?: ChatMode;
    createdAt: number;
    extra?: Record<string, unknown>;
}

export interface AuthorsNote {
    content: string;
    /** Insert every N user messages; 1 = always, 0 = off. */
    interval: number;
    position: 'in_prompt' | 'in_chat' | 'before_prompt';
    depth: number;
    role: Role;
    scan: boolean;
}

export interface Chat extends ResourceBase {
    kind: 'chat';
    characterId: string;
    personaId?: string;
    presetId?: string;
    lorebookId?: string;
    messages: ChatMessage[];
    /** Chat-scoped variables ({{setvar}} / {{getvar}}). */
    variables: Record<string, unknown>;
    authorsNote: AuthorsNote;
    /** Channel new messages go to. */
    mode?: ChatMode;
    /** Per-plugin state for this chat, keyed by plugin id. The kernel does not read it. */
    plugins?: Record<string, Record<string, unknown>>;
    /** Set on a chat created as a branch of another. */
    branch?: { chatId: string; messageId: string; swipeId: string; index: number };
    /** Engine bookkeeping (e.g. world info sticky/cooldown timers). */
    runtime: {
        timedLore?: TimedLoreState;
    };
}

export interface TimedEffect {
    hash: string;
    start: number;
    end: number;
    protected: boolean;
}

export interface TimedLoreState {
    sticky: Record<string, TimedEffect>;
    cooldown: Record<string, TimedEffect>;
}

export type AnyResource = Character | Lorebook | Preset | Persona | Chat;

// ---------------------------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------------------------

export interface Connection {
    id: string;
    name: string;
    provider: 'openai-compatible';
    baseUrl: string;
    model: string;
    /** Stored separately in secrets; present here only as a mask. */
    hasKey?: boolean;
    /** Send OpenAI `name` fields (some proxies reject them). */
    sendNames: boolean;
    extraHeaders?: Record<string, string>;
    extraBody?: Record<string, unknown>;
}

export interface LoreSettings {
    scanDepth: number;
    budgetPercent: number;
    budgetCap: number;
    includeNames: boolean;
    recursive: boolean;
    caseSensitive: boolean;
    matchWholeWords: boolean;
    useGroupScoring: boolean;
    minActivations: number;
    minActivationsDepthMax: number;
    maxRecursionSteps: number;
    strategy: 'evenly' | 'character_first' | 'global_first';
    globalLorebookIds: string[];
}

export interface ReadingSettings {
    font: 'sans' | 'serif' | 'kai' | 'custom';
    /** CSS font-family used when `font` is 'custom'. */
    customFont: string;
    /** Font size in px. */
    size: number;
    lineHeight: number;
    /** Width of the text column in px. */
    width: number;
    /** Indent the first line of each paragraph by two characters. */
    indent: boolean;
    justify: boolean;
    /** Color quoted dialogue. */
    quotes: boolean;
    /** While a reply streams, keep scrolling to the newest text instead of staying at its start. */
    follow: boolean;
}

export interface Settings {
    userName: string;
    personaId?: string;
    presetId?: string;
    connectionId?: string;
    connections: Connection[];
    lore: LoreSettings;
    preferCharacterPrompt: boolean;
    preferCharacterJailbreak: boolean;
    pinExamples: boolean;
    collapseNewlines: boolean;
    theme: 'system' | 'light' | 'dark';
    /** How message text is typeset; missing fields use the interface defaults. */
    reading?: Partial<ReadingSettings>;
    /** {{setglobalvar}} storage. */
    globalVariables: Record<string, unknown>;
    /** Per-plugin switches and settings, keyed by plugin id. Missing means enabled, auto-update on. */
    plugins?: Record<string, PluginSettings>;
}

export interface PluginSettings {
    enabled?: boolean;
    autoUpdate?: boolean;
    /** The plugin's own settings. */
    config?: Record<string, unknown>;
}

export const DEFAULT_LORE_SETTINGS: LoreSettings = {
    scanDepth: 2,
    budgetPercent: 25,
    budgetCap: 0,
    includeNames: true,
    recursive: false,
    caseSensitive: false,
    matchWholeWords: false,
    useGroupScoring: false,
    minActivations: 0,
    minActivationsDepthMax: 0,
    maxRecursionSteps: 0,
    strategy: 'character_first',
    globalLorebookIds: [],
};

export const DEFAULT_SETTINGS: Settings = {
    userName: 'User',
    connections: [],
    lore: DEFAULT_LORE_SETTINGS,
    preferCharacterPrompt: true,
    preferCharacterJailbreak: true,
    pinExamples: false,
    collapseNewlines: false,
    theme: 'system',
    globalVariables: {},
};
