// Which of a card's 酒馆助手 scripts run on its page (CardFrames.tsx). MVU itself and the variable
// schema are Hearth's own (the 酒馆助手 plugin), so the scripts that load MVU from a CDN or register
// the schema do not run; every other enabled script does, as in 酒馆.

import type { CardScript, Character } from '../core/types.ts';

/** A script that only loads MVU's bundle (酒馆 has no MVU of its own). */
export function loadsMvu(script: CardScript): boolean {
    return script.content.length < 4000 && /MagVarUpdate[^'"`\s]*\/artifact\/bundle\.js/.test(script.content);
}

export function registersSchema(script: CardScript): boolean {
    return /\bregisterMvuSchema\s*\)?\s*\(/.test(script.content);
}

export function pageScripts(character: Character): CardScript[] {
    return character.scripts.filter(s => s.enabled && s.content.trim() && !loadsMvu(s) && !registersSchema(s));
}
