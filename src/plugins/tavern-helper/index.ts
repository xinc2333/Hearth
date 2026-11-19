// 酒馆助手 (JS-Slash-Runner) compatibility. Cards and presets bring 酒馆助手 scripts; this plugin
// provides what those scripts do, natively:
//   - SPreset: the preset runtime that Meowssiah-style presets load through a script;
//   - the 小猫之神 console those presets add (reply mode, deep thinking, notes);
//   - MVU (MagVarUpdate): variables that cards load through a script, checked against the card's
//     variable schema when it has one;
//   - the card's own background scripts that are card logic (see scripts.ts).
// The message-frame side (status bars, 开局 panels and other HTML in messages, with 酒馆助手's
// globals) is rendered by the window while this plugin is enabled: src/web/card-frame.ts.

import type { HearthPlugin } from '../../server/plugins.ts';
import { setupConsole } from './console.ts';
import { setupMvu } from './mvu.ts';
import { setupScripts } from './scripts.ts';
import { setupSpreset } from './spreset.ts';

const plugin: HearthPlugin = {
    setup(api) {
        // SPreset normalizes tool replies before MVU reads their <UpdateVariable> block.
        setupSpreset(api);
        setupConsole(api);
        setupMvu(api);
        setupScripts(api);
    },
};

export default plugin;
