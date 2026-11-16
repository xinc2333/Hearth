// 酒馆助手 (JS-Slash-Runner) compatibility. Cards and presets bring 酒馆助手 scripts; this plugin
// provides what those scripts do, natively:
//   - SPreset: the preset runtime that Meowssiah-style presets load through a script;
//   - the 小猫之神 console those presets add (reply mode, deep thinking, notes);
//   - MVU (MagVarUpdate): variables that cards load through a script.
// The message-frame side (status bars and other HTML in messages) is rendered by the window while
// this plugin is enabled.

import type { HearthPlugin } from '../../server/plugins.ts';
import { setupConsole } from './console.ts';
import { setupMvu } from './mvu.ts';
import { setupSpreset } from './spreset.ts';

const plugin: HearthPlugin = {
    setup(api) {
        // SPreset normalizes tool replies before MVU reads their <UpdateVariable> block.
        setupSpreset(api);
        setupConsole(api);
        setupMvu(api);
    },
};

export default plugin;
