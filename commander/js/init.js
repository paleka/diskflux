// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Andrea Mazzoleni

// before the page is drawn: light or dark, and the spacing, as chosen on My settings.
// "system", or no choice in a theme that follows the computer, takes the light or dark of the computer.
(() => {
    let theme = null;
    let density = null;
    try {
        theme = localStorage.getItem('theme');
        density = localStorage.getItem('df-density');
    } catch (ignore) { /* no storage */ }
    if (!['light', 'dark', 'system'].includes(theme)) theme = document.documentElement.dataset.themeDefault === 'system' ? 'system' : 'light';
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = theme === 'system' ? (dark ? 'dark' : 'light') : theme;
    document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'roomy';
})();
