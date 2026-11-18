import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './styles.css';
import { watchUnsaved } from './unsaved.ts';

watchUnsaved();
createRoot(document.getElementById('root') as HTMLElement).render(<App />);
