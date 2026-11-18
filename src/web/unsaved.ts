// Before restarting for an update, the desktop app asks the page whether anything typed is not saved
// yet (window.hearthUnsaved); while it is, the restart waits. Two things count:
//   - a form saved with a button that has changes: the form's element carries data-unsaved;
//   - a field that saves when it loses focus, typed into and still focused.
// The message box keeps its draft by itself, and search boxes hold nothing to lose, so they do not count.

const KEPT = '[data-composer], .search, .palette-input';

let typedInto: Element | null = null;

export function unsaved(): boolean {
    if (document.querySelector('[data-unsaved]')) return true;
    return Boolean(typedInto && typedInto === document.activeElement && !typedInto.closest(KEPT));
}

export function watchUnsaved() {
    document.addEventListener('input', e => { typedInto = e.target instanceof Element ? e.target : null; }, true);
    document.addEventListener('focusout', e => { if (e.target === typedInto) typedInto = null; }, true);
    (window as unknown as { hearthUnsaved: () => boolean }).hearthUnsaved = unsaved;
}
