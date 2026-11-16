const PATHS: Record<string, string> = {
    plus: 'M12 5v14M5 12h14',
    upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
    panel: 'M4 5h16v14H4zM15 5v14',
    send: 'M5 12h14M13 6l6 6-6 6',
    stop: 'M7 7h10v10H7z',
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    copy: 'M9 9h10v10H9zM5 15V5h10',
    edit: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
    trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
    x: 'M6 6l12 12M18 6 6 18',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.3-4.3',
    book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
    check: 'M5 12l5 5L20 7',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    forward: 'M5 5l7 7-7 7M13 5l7 7-7 7',
    layers: 'M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
    chat: 'M5 5h14v10H9l-4 4V5Z',
    braces: 'M8 4C6 4 5 5 5 7v2c0 1.2-.8 2.2-2 3 1.2.8 2 1.8 2 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.2.8 2.2 2 3-1.2.8-2 1.8-2 3v2c0 2-1 3-3 3',
    sidebar: 'M4 5h16v14H4zM9.5 5v14',
    down: 'M12 5v14M6 13l6 6 6-6',
    chevron: 'M6 9l6 6 6-6',
    expand: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',
    spark: 'M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2',
    command: 'M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V9Z',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
    dot: 'M12 12h.01',
};

export function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={PATHS[name] ?? PATHS.dot} />
        </svg>
    );
}
