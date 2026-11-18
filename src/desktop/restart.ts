// Restarting for an update without asking. Once the new version is downloaded, Hearth installs it at
// the first moment nobody would lose anything or be interrupted:
//   - no reply is being written, and the background work after a reply (e.g. 结算) is done;
//   - nothing typed on the page is still unsaved;
//   - the user is away: the window is hidden or minimized, has been in the background for a minute,
//     or nobody has used the keyboard or mouse for three minutes.
// A short notice shows on the page first; if the user comes back during it, the restart waits.
// No Electron here, so the rules can be tested on their own.

export interface Activity {
    /** The window is on screen (visible and not minimized). */
    shown: boolean;
    focused: boolean;
    /** How long the window has been in the background, in ms (0 while it is focused). */
    backgroundMs: number;
    /** How long nobody has used the keyboard or mouse, in ms. */
    idleMs: number;
}

export const BACKGROUND_MS = 60_000;
export const IDLE_MS = 3 * 60_000;

export function userAway(a: Activity): boolean {
    return !a.shown || (!a.focused && a.backgroundMs >= BACKGROUND_MS) || a.idleMs >= IDLE_MS;
}

export interface RestartHooks {
    /** Restarting right now would interrupt nobody and lose nothing. */
    canRestart(): Promise<boolean>;
    /** The restart is about to happen (true), or was called off because the user came back (false). */
    announce(soon: boolean): void;
    restart(): void;
}

export const CHECK_MS = 10_000;
export const NOTICE_MS = 3_000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AutoRestart {
    private readonly hooks: RestartHooks;
    private readonly checkMs: number;
    private readonly noticeMs: number;
    private timer: ReturnType<typeof setInterval> | null = null;
    private checking = false;
    private done = false;

    constructor(hooks: RestartHooks, checkMs = CHECK_MS, noticeMs = NOTICE_MS) {
        this.hooks = hooks;
        this.checkMs = checkMs;
        this.noticeMs = noticeMs;
    }

    /** Checks every few seconds until the restart happens. */
    start() {
        if (this.timer || this.done) return;
        this.timer = setInterval(() => void this.check(), this.checkMs);
        this.timer.unref?.();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** One check; true when it restarted. */
    async check(): Promise<boolean> {
        if (this.checking || this.done) return false;
        this.checking = true;
        try {
            if (!await this.ask()) return false;
            this.hooks.announce(true);
            await wait(this.noticeMs);
            if (!await this.ask()) {
                this.hooks.announce(false);
                return false;
            }
            this.done = true;
            this.stop();
            this.hooks.restart();
            return true;
        } finally {
            this.checking = false;
        }
    }

    private async ask(): Promise<boolean> {
        try {
            return await this.hooks.canRestart();
        } catch {
            return false;
        }
    }
}
