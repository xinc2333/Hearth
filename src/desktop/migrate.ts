// Moving data from the unzipped Hearth (Start.bat, data/ next to the program) into the desktop app's
// data folder. Plain file operations, so the tests can run it without Electron.

import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const MARKERS = ['settings.json', 'journal.jsonl', 'chats', 'characters'];

function isDataDir(dir: string): boolean {
    try {
        return statSync(dir).isDirectory() && MARKERS.some(m => existsSync(path.join(dir, m)));
    } catch {
        return false;
    }
}

/**
 * Finds Hearth data in or under a folder the user picked: the old Hearth folder (with data/ inside),
 * the data folder itself, or a folder holding one unzipped Hearth (e.g. Hearth-v0.4.0-windows/).
 */
export function findOldData(picked: string): string | null {
    const candidates = [picked, path.join(picked, 'data')];
    try {
        for (const name of readdirSync(picked)) candidates.push(path.join(picked, name, 'data'));
    } catch {
        return null;
    }
    return candidates.find(isDataDir) ?? null;
}

/** Copies old data into `to`, which must not exist yet. The old folder is left untouched. */
export function copyData(from: string, to: string): void {
    if (existsSync(to)) throw new Error(`数据目录已经存在：${to}`);
    cpSync(from, to, {
        recursive: true,
        errorOnExist: true,
        force: false,
        // Leftovers of an interrupted plugin download are not worth carrying over.
        filter: src => !/[\\/]plugins[\\/]\.staging$/.test(src),
    });
}
