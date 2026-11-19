// 酒馆助手 (JS-Slash-Runner) compatibility. Cards and presets bring 酒馆助手 scripts; this plugin
// provides what those scripts do, natively:
//   - SPreset: the preset runtime that Meowssiah-style presets load through a script;
//   - the 小猫之神 console those presets add (reply mode, deep thinking, notes);
//   - MVU (MagVarUpdate): variables that cards load through a script, checked against the card's
//     variable schema when it has one;
//   - a card page's hook on the final prompt (card-hooks.ts).
// The window side is rendered while this plugin is enabled: HTML in messages (status bars, 开局
// panels) and the card's page, which runs its other scripts, both with 酒馆助手's globals
// (src/web/card-frame.ts, src/web/components/CardFrames.tsx).

import type { HearthPlugin } from '../../server/plugins.ts';
import { setupCardHooks } from './card-hooks.ts';
import { setupConsole } from './console.ts';
import { setupMvu } from './mvu.ts';
import { setupSpreset } from './spreset.ts';

const plugin: HearthPlugin = {
    setup(api) {
        // A card page sees the final prompt before the SPreset request script does.
        setupCardHooks(api);
        // SPreset normalizes tool replies before MVU reads their <UpdateVariable> block.
        setupSpreset(api);
        setupConsole(api);
        setupMvu(api);
    },
};

export default plugin;
