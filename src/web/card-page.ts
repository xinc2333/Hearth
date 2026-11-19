// The open card frames of each chat: message frames and the card's page (CardPage.tsx). The window
// tells them about a generation's steps (酒馆's events) and, before and during one, asks the page:
// for the prompts its scripts inject, and for its handlers' changes to the final prompt.

interface Frame {
    port: MessagePort;
    /** The card's page (it runs the card's scripts), not HTML in a message. */
    page: boolean;
}

const frames = new Map<string, Set<Frame>>();
const waits = new Map<number, (value: unknown) => void>();
let seq = 0;

/** Registers an open frame of a chat; returns the function that removes it. */
export function registerFrame(chatId: string, port: MessagePort, page: boolean): () => void {
    const frame = { port, page };
    let set = frames.get(chatId);
    if (!set) frames.set(chatId, set = new Set());
    set.add(frame);
    return () => {
        set.delete(frame);
        if (!set.size) frames.delete(chatId);
    };
}

/** A frame's answer to an ask (its port messages with `answer` come here). */
export function frameAnswer(data: { answer?: number; value?: unknown }): boolean {
    const resolve = typeof data?.answer === 'number' ? waits.get(data.answer) : undefined;
    resolve?.(data.value ?? null);
    return Boolean(resolve);
}

/** Tells every frame of the chat about an event (酒馆助手 tavern_events). */
export function broadcast(chatId: string, event: string, ...args: unknown[]) {
    for (const frame of frames.get(chatId) ?? []) frame.port.postMessage({ event, args });
}

/** Tells only the chat's card page about an event (e.g. one of its script buttons was clicked). */
export function pageEvent(chatId: string, event: string, ...args: unknown[]) {
    for (const frame of frames.get(chatId) ?? []) if (frame.page) frame.port.postMessage({ event, args });
}

/** Whether the chat's card has its page open. */
export function hasPage(chatId: string): boolean {
    return [...frames.get(chatId) ?? []].some(f => f.page);
}

/** Asks the chat's card page; null when there is none, or it does not answer in time. */
export function askPage(chatId: string, kind: string, payload: unknown, timeoutMs = 60_000): Promise<unknown> {
    const page = [...frames.get(chatId) ?? []].find(f => f.page);
    if (!page) return Promise.resolve(null);
    const id = ++seq;
    return new Promise(resolve => {
        const done = (value: unknown) => { clearTimeout(timer); waits.delete(id); resolve(value); };
        const timer = setTimeout(() => done(null), timeoutMs);
        waits.set(id, done);
        page.port.postMessage({ ask: id, kind, payload });
    });
}
