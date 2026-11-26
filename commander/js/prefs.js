// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// The choices of the person on My settings: kept in this browser only, so
// another computer starts with the defaults. The login is the only choice of
// the person kept on the server (System and My settings change it there).

import { setFormat, FORMAT_CHOICES } from './plain.js';

/** Every choice, its key in the storage of the browser, its values and its default. */
export const PREFS = {
    theme: { key: 'theme', values: ['light', 'dark', 'system'], def: null }, // null: the default of the theme
    density: { key: 'df-density', values: ['roomy', 'compact'], def: 'roomy' },
    sizes: { key: 'df-sizes', values: FORMAT_CHOICES.sizes, def: 'tb' },
    time: { key: 'df-time', values: FORMAT_CHOICES.time, def: '24' },
    date: { key: 'df-date', values: FORMAT_CHOICES.date, def: 'dmy' },
    temp: { key: 'df-temp', values: FORMAT_CHOICES.temp, def: 'c' },
    start: { key: 'df-start', values: ['#/', '#/drives', '#/protection', '#/files', 'last'], def: '#/' },
    advAll: { key: 'df-adv-all', values: ['0', '1'], def: '0' },
    jobNotes: { key: 'df-job-notes', values: ['0', '1'], def: '0' }
};

/** Keys of this browser that My settings puts back to their defaults (the array chosen and the tour stay). */
const RESET_PREFIXES = ['sp-adv-', 'df-'];
const RESET_KEYS = ['theme', 'sp-bay-label', 'sp-browser-alerts', 'nav-advanced', 'df-last-route'];

const read = (key) => { try { return localStorage.getItem(key); } catch (ignore) { return null; } };
const write = (key, v) => { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch (ignore) { /* only for this visit */ } };

/** The value of a choice, its default when none or not valid. */
export const pref = (name) => {
    const p = PREFS[name];
    const v = read(p.key);
    return p.values.includes(v) ? v : p.def;
};

/** The default of the theme: Quiet follows the computer, the others start light. */
export const themeDefault = () => document.documentElement.dataset.themeDefault === 'system' ? 'system' : 'light';

/** "light", "dark" or "system", as chosen or as the theme does by itself. */
export const themeChoice = () => pref('theme') || themeDefault();

/** The light or dark to show now. */
export const themeShown = () => {
    const c = themeChoice();
    if (c !== 'system') return c;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Put the choices on the page: light or dark, spacing and how numbers are written. */
export const applyPrefs = () => {
    const root = document.documentElement;
    root.dataset.theme = themeShown();
    root.dataset.density = pref('density');
    setFormat({ sizes: pref('sizes'), time: pref('time'), date: pref('date'), temp: pref('temp') });
};

const listeners = [];
/** Called after any choice changes, to draw what depends on it again. */
export const onPrefs = (fn) => listeners.push(fn);

/** Save a choice and apply it. A value not allowed is refused. */
export const setPref = (name, value) => {
    const p = PREFS[name];
    if (!p || !p.values.includes(value)) return false;
    write(p.key, value);
    applyPrefs();
    listeners.forEach(fn => { try { fn(name, value); } catch (ignore) { /* a page drawing again */ } });
    return true;
};

/** Put every choice of this browser back to its default. */
export const resetPrefs = () => {
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; ++i) keys.push(localStorage.key(i));
        keys.filter(k => RESET_KEYS.includes(k) || RESET_PREFIXES.some(x => k.startsWith(x))).forEach(k => localStorage.removeItem(k));
    } catch (ignore) { /* no storage */ }
    applyPrefs();
    listeners.forEach(fn => { try { fn('reset'); } catch (ignore) { /* a page drawing again */ } });
};

/** The page to open when the address has no page of its own. */
export const startPage = () => {
    const s = pref('start');
    if (s !== 'last') return s;
    const last = read('df-last-route');
    return last && /^#\/[a-z0-9/-]*$/.test(last) ? last : '#/';
};

/** Remember the page shown, for "the page I left". */
export const rememberRoute = (hash) => { if (pref('start') === 'last' && /^#\/[a-z0-9/-]*$/.test(hash)) write('df-last-route', hash); };

/** Every page shows its Advanced choices. */
export const advAll = () => pref('advAll') === '1';
