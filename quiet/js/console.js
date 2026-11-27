// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// The Console look: the same pages, with the command behind each button, the
// source of each tile and keys to move between the pages. Every look carries
// this file; it does something only where the page says data-look="console".

import * as P from './plain.js';

const NOTES_KEY = 'df-console-notes';

/** The page is shown in the Console look. */
export const isConsole = () => typeof document !== 'undefined' && document.documentElement.dataset.look === 'console';

const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '') || !!document.activeElement?.isContentEditable;
const windowOpen = () => !!document.querySelector('.modal-overlay, .sp-pal-overlay');

const notesOn = () => { try { return localStorage.getItem(NOTES_KEY) !== 'off'; } catch (ignore) { return true; } };

/** Show or hide the commands and the sources, and say so on the button of the top bar. */
const paintNotes = () => {
    const on = notesOn();
    document.documentElement.dataset.cxNotes = on ? 'on' : 'off';
    const b = document.getElementById('cx-notes');
    if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    const word = b.querySelector('b');
    if (word) word.textContent = on ? 'on' : 'off';
};

const toggleNotes = () => {
    try { localStorage.setItem(NOTES_KEY, notesOn() ? 'off' : 'on'); } catch (ignore) { /* only for this visit */ }
    paintNotes();
};

/** The letters written beside the menu: [['h', '#/'], …]. */
const goPairs = () => [...document.querySelectorAll('.nav-item[data-keys]')].map(a => [a.dataset.keys.split(' ').pop(), a.getAttribute('href')]);

let goTimer = 0;
const goWait = (on) => {
    clearTimeout(goTimer);
    if (on) {
        document.documentElement.dataset.cxGo = '1';
        goTimer = setTimeout(() => goWait(false), 1500);
    } else delete document.documentElement.dataset.cxGo;
};

/** "vm · up 3h 12m · 1.3.0" in the top bar, from what the server says of itself. */
export const consoleStatus = (host) => {
    const el = document.getElementById('cx-status');
    if (!isConsole() || !el || !host) return;
    const sa = host.server_actions || {};
    const bits = [sa.hostname || '', sa.uptime_seconds != null ? P.consoleUptime(sa.uptime_seconds) : '', host.daemon_version || ''].filter(Boolean);
    el.textContent = bits.join(' · ');
};

/**
 * Start the keys and the switch of the Console look.
 * \param palette opens the search
 * \param busy true while a menu that takes the keys itself is open
 */
export const initConsole = ({ palette, busy } = {}) => {
    if (!isConsole()) return;
    paintNotes();
    // a click on the button, or anywhere else after "g", ends the wait for a letter
    document.addEventListener('click', (e) => {
        goWait(false);
        if (e.target.closest?.('#cx-notes')) toggleNotes();
    });
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || typing() || windowOpen() || busy?.()) { goWait(false); return; }
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (document.documentElement.dataset.cxGo) {
            goWait(false);
            const href = P.consoleGo(goPairs(), k);
            if (href) {
                e.preventDefault();
                if (window.location.hash !== href) window.location.hash = href;
            }
            return;
        }
        if (k === 'g') goWait(true);
        else if (k === 'c') toggleNotes();
        else if (k === '/') { e.preventDefault(); palette?.(); }
    });
};
