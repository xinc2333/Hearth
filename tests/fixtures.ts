// Test fixtures are third-party files (SillyTavern defaults, real cards and presets) and are not
// part of the repository. Put them in tests/fixtures/ or point to them with environment variables;
// tests that need a missing file are skipped.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export const SERAPHINA = process.env.HEARTH_FIXTURE_SERAPHINA ?? path.join(dir, 'default_Seraphina.png');
export const ELDORIA = process.env.HEARTH_FIXTURE_ELDORIA ?? path.join(dir, 'Eldoria.json');
export const MEOWSSIAH = process.env.HEARTH_FIXTURE_MEOWSSIAH ?? path.join(dir, 'Meowssiah-2.1.7.json');
export const MVU_CARD = process.env.HEARTH_FIXTURE_MVU_CARD ?? path.join(dir, 'mvu-card.png');
export const FRONTEND_CARD = process.env.HEARTH_FIXTURE_FRONTEND_CARD ?? path.join(dir, 'frontend-card.png');
export const PAGE_CARD = process.env.HEARTH_FIXTURE_PAGE_CARD ?? path.join(dir, 'page-card.png');
