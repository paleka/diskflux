// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// The SnapRAID file page (Advanced): the configuration of the array as text,
// checked while typed, written only after the check of the change, and the
// history of the copies kept at every write, to compare and put back.

import { API } from './api.js';
import { dateText, timeText } from './plain.js';
import { escHtml, escAttr, showToast } from './utils.js';
import { StorageAPI, buildModel, dialog } from './storage.js';
import { confProblems, confReview, lineDiff, reviewHtml, reviewForget, textLines } from './confreview.js';

const P = { inv: null, model: null, history: null, original: '', view: null };

const call = async (endpoint) => {
    const response = await fetch(`${API.base()}/storage${endpoint}`);
    let json = null;
    try { json = await response.json(); } catch (ignore) { /* not json */ }
    if (!response.ok) throw new Error(json?.message || `Request failed with status ${response.status}`);
    return json;
};

const fileName = (path) => (path || '').split('/').pop();

const whenWords = (at) => {
    const d = new Date(at * 1000);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    const time = timeText(d);
    return same ? `Today ${time}` : `${dateText(d, { year: 'other', now: today })}, ${time}`;
};

const WHO = { diskflux: 'DiskFlux', outside: 'outside DiskFlux', found: 'as found' };

/** The lines of the editor that differ from the file, by their number in the editor. */
export const editedLines = (before, after) => new Set(lineDiff(before, after).filter(d => d.k === '+').map(d => d.n));

const mounted = (p) => {
    const m = P.model?.mountOf(p);
    return !!m && m.target !== '/';
};

const problemsOf = (text) => confProblems(text, { before: P.original, mounted: P.model ? mounted : undefined });

const drawGutter = () => {
    const box = P.view.querySelector('#cf-text');
    const text = box.value;
    const edited = editedLines(P.original, text);
    const marks = {};
    problemsOf(text).forEach(p => { if (p.line && marks[p.line] !== 'error') marks[p.line] = p.level; });
    const n = Math.max(1, textLines(text).length + (text.endsWith('\n') ? 1 : 0));
    let html = '';
    for (let i = 1; i <= n; ++i)
        html += `<div class="cf-ln${edited.has(i) ? ' cf-ln-edit' : ''}${marks[i] ? ` cf-ln-${marks[i]}` : ''}">${i}</div>`;
    P.view.querySelector('#cf-gutter').innerHTML = html;
    P.view.querySelector('#cf-gutter').scrollTop = box.scrollTop;
};

const drawChecks = () => {
    const text = P.view.querySelector('#cf-text').value;
    const problems = problemsOf(text);
    const edited = editedLines(P.original, text).size;
    const removed = lineDiff(P.original, text).filter(d => d.k === '-').length;
    const errors = problems.filter(p => p.level === 'error').length;
    P.view.querySelector('#cf-checks').innerHTML = problems.length
        ? problems.map(p => `
            <li class="cr-check cr-check-${p.level}">
                <span class="cr-check-mark" aria-hidden="true">${p.level === 'error' ? '✕' : '!'}</span>
                <span>${p.line ? `<button type="button" class="cf-goto" data-cf-line="${p.line}">Line ${p.line}</button> ` : ''}${escHtml(p.text)}</span>
            </li>`).join('')
        : '<li class="cr-check cr-check-ok"><span class="cr-check-mark" aria-hidden="true">✓</span><span>Nothing to say: SnapRAID can read this file.</span></li>';
    const changed = edited || removed;
    P.view.querySelector('#cf-state').innerHTML = changed
        ? `<span class="cf-dot"></span>${edited ? `${edited} ${edited === 1 ? 'line' : 'lines'} edited` : ''}${edited && removed ? ', ' : ''}${removed ? `${removed} removed` : ''}, not written`
        : 'The file as it is';
    P.view.querySelector('#cf-undo').disabled = !changed;
    const go = P.view.querySelector('#cf-review');
    go.disabled = !changed || errors > 0 || !P.inv?.admin;
    P.view.querySelector('#cf-block').innerHTML = errors
        ? `<span class="cf-block-err">${errors} ${errors === 1 ? 'problem' : 'problems'} to fix before writing</span>`
        : !P.inv?.admin ? `<span class="text-muted">Read only: ${escHtml(P.inv?.admin_reason || 'set net_storage_admin = 1 in diskflux.conf to write from here')}</span>` : '';
};

const refresh = () => { drawGutter(); drawChecks(); };

const historyHtml = () => {
    const h = P.history;
    if (!h) return '<p class="text-sm text-muted">The history could not be read.</p>';
    if (!h.copies.length) return '<p class="text-sm text-muted">No copy yet: DiskFlux keeps one at every write from now on.</p>';
    return `<ul class="cf-history">${h.copies.map((c, i) => `
        <li>
            <div class="cf-history-what">
                <div class="cf-history-label">${escHtml(c.label)}</div>
                <div class="cf-history-when">${escHtml(whenWords(c.at))} · ${escHtml(WHO[c.who] || c.who)}${i === 0 && !h.outside ? ' · the file now' : ''}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-cf-compare="${escAttr(c.id)}">Compare</button>
        </li>`).join('')}</ul>`;
};

const render = () => {
    const h = P.history;
    const last = h?.copies?.[0];
    const path = P.inv.engine_conf.path;
    P.view.innerHTML = `
        <div class="cf">
            <div class="cf-head">
                <p class="text-sm text-muted cf-intro">The file SnapRAID itself reads. Every page of DiskFlux writes it for you; edit it here only if you know
                    <a href="https://www.snapraid.it/manual" target="_blank" rel="noopener">SnapRAID's format</a>. Nothing is written until you check the change.</p>
                <div class="cf-facts">
                    <span class="font-mono">${escHtml(path)}</span>
                    <span>${textLines(P.original).length} lines${last ? ` · last written ${last.who === 'diskflux' ? 'by DiskFlux' : 'outside DiskFlux'} ${escHtml(whenWords(last.at).replace(/^Today/, 'today at'))}` : ''}</span>
                </div>
            </div>
            ${h?.outside ? `
            <div class="cf-outside" role="status">
                <span aria-hidden="true">i</span>
                <div>This file was changed outside DiskFlux${h.mtime ? ` (${escHtml(whenWords(h.mtime))})` : ''}, after the last copy DiskFlux kept. DiskFlux reads it as it is and keeps that version in the history at the next write.
                    <button type="button" class="cf-link" data-cf-outside>See what changed</button></div>
            </div>` : ''}
            <div class="cf-cols">
                <section class="card cf-editor" aria-label="The file">
                    <div class="cf-bar">
                        <span class="cf-state" id="cf-state"></span>
                        <span class="cr-grow"></span>
                        <button type="button" class="btn btn-secondary btn-sm" id="cf-undo">Undo my edits</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="cf-download">Download</button>
                        <label class="btn btn-secondary btn-sm cf-upload">Open a file…<input type="file" id="cf-file" accept=".conf,.txt,text/plain"></label>
                    </div>
                    <div class="cf-area">
                        <div class="cf-gutter font-mono" id="cf-gutter" aria-hidden="true"></div>
                        <textarea id="cf-text" class="cf-text font-mono" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="SnapRAID configuration ${escAttr(fileName(path))}" wrap="off">${escHtml(P.original)}</textarea>
                    </div>
                    <div class="cf-foot">
                        <span id="cf-block"></span>
                        <span class="cr-grow"></span>
                        <button type="button" class="btn btn-primary" id="cf-review">Check the change…</button>
                    </div>
                </section>
                <aside class="cf-side">
                    <section class="card">
                        <h3 class="cf-h">Checks, as you type</h3>
                        <ul class="cr-checks cf-checks" id="cf-checks"></ul>
                    </section>
                    <section class="card">
                        <div class="cf-h-row"><h3 class="cf-h">History</h3><span class="text-xs text-muted">last 30 copies kept</span></div>
                        ${historyHtml()}
                        <p class="text-xs text-muted mt-2">Compare shows what a change did and what putting it back would change, in the same window as before every write.</p>
                    </section>
                </aside>
            </div>
        </div>`;
    const box = P.view.querySelector('#cf-text');
    box.addEventListener('input', refresh);
    box.addEventListener('scroll', () => { P.view.querySelector('#cf-gutter').scrollTop = box.scrollTop; });
    box.addEventListener('keydown', (e) => {
        // a tab key writes a tab, as in any editor of configuration files
        if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const { selectionStart: a, selectionEnd: b } = box;
            box.setRangeText('\t', a, b, 'end');
            refresh();
        }
    });
    P.view.querySelector('#cf-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 1024 * 1024) { showToast('That file is too big for a SnapRAID configuration', 'error'); return; }
        box.value = (await f.text()).replace(/\r/g, '');
        e.target.value = '';
        refresh();
        showToast(`${f.name} is in the editor: check the change before writing it`, 'info');
    });
    refresh();
};

/** Read the file, the disks and the history again, and draw the page. */
const load = async () => {
    const [inv, history] = await Promise.all([
        StorageAPI.get(),
        call('/engine_conf_history').catch(() => null)
    ]);
    P.inv = inv;
    P.model = buildModel(inv);
    P.history = history;
    P.original = inv.engine_conf?.text || '';
    render();
};

export const loadConfFile = async (view) => {
    P.view = view;
    try {
        await load();
    } catch (e) {
        view.innerHTML = `<div class="card border-red"><h3 class="text-red">The SnapRAID file could not be read</h3><p>${escHtml(e.message)}</p></div>`;
    }
};

const writeText = async (text, label, title) => {
    const path = P.inv.engine_conf.path;
    if (!(await confReview({
        title,
        files: [{ label: fileName(path), path, before: P.original, after: text }],
        mounted: P.model ? mounted : undefined,
        note: 'The daemon reads the file again right away.',
        label: 'Write the change'
    }))) return false;
    try {
        await StorageAPI.saveConf(text, label);
        await API.schedule([{ command: 'probe' }]).catch(() => null);
        showToast('Written. The file as it was is kept in the history', 'info');
        await load();
        return true;
    } catch (e) {
        showToast(e.message, 'error');
        return false;
    }
};

const compare = async (id) => {
    const h = P.history;
    const i = h.copies.findIndex(c => c.id === id);
    const c = h.copies[i];
    let copy, prev = null;
    try {
        copy = await call(`/engine_conf_history?id=${encodeURIComponent(id)}`);
        if (i + 1 < h.copies.length) prev = await call(`/engine_conf_history?id=${encodeURIComponent(h.copies[i + 1].id)}`);
    } catch (e) { showToast(e.message, 'error'); return; }
    const path = P.inv.engine_conf.path;
    const files = [];
    files.push({ label: 'What this change did', path: `${fileName(path)} · ${whenWords(c.at)}`, before: prev ? prev.text : '', after: copy.text, note: prev ? 'from the copy before it to this one' : 'the oldest copy, whole' });
    files.push({ label: 'Putting it back', path, before: P.original, after: copy.text, note: 'from the file now to this copy' });
    const same = copy.text === P.original;
    const { html } = reviewHtml({
        files,
        summary: [`${c.label} · ${whenWords(c.at)} · ${WHO[c.who] || c.who}`, same ? 'The file is the same as this copy now: putting it back changes nothing.' : 'Putting it back writes this copy as the file, after the usual check.'],
        note: prev ? '' : 'This is the oldest copy: “What this change did” shows it whole.'
    });
    dialog({
        title: 'A copy of the SnapRAID file',
        body: html,
        buttons: [
            { label: 'Close', onClick: (d) => { reviewForget(d.body); d.close(); } },
            {
                label: 'Put this copy back', cls: 'btn-primary', disabled: same || !P.inv.admin,
                onClick: async (d) => {
                    reviewForget(d.body); d.close();
                    await writeText(copy.text, `Put back the copy of ${whenWords(c.at)} (${c.label})`, 'Put a copy back');
                }
            }
        ]
    });
};

const showOutside = async () => {
    const last = P.history.copies[0];
    let copy;
    try { copy = await call(`/engine_conf_history?id=${encodeURIComponent(last.id)}`); } catch (e) { showToast(e.message, 'error'); return; }
    const { html } = reviewHtml({
        files: [{ label: fileName(P.inv.engine_conf.path), path: P.inv.engine_conf.path, before: copy.text, after: P.original }],
        note: `From the last copy DiskFlux kept (${escHtml(last.label)}, ${escHtml(whenWords(last.at))}) to the file as it is now.`
    });
    dialog({ title: 'Changed outside DiskFlux', body: html, buttons: [{ label: 'Close', onClick: (d) => { reviewForget(d.body); d.close(); } }] });
};

// the buttons of the page, drawn again at every load
if (typeof document !== 'undefined') {
    document.addEventListener('click', async (e) => {
        if (!P.view || !P.view.isConnected || !P.view.querySelector('.cf')) return;
        const t = e.target.closest('#cf-undo,#cf-download,#cf-review,[data-cf-line],[data-cf-compare],[data-cf-outside]');
        if (!t || !P.view.contains(t) && !t.closest('.modal-overlay')) return;
        const box = P.view.querySelector('#cf-text');
        if (t.id === 'cf-undo') { box.value = P.original; refresh(); }
        else if (t.id === 'cf-download') {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([box.value], { type: 'text/plain' }));
            a.download = fileName(P.inv.engine_conf.path) || 'snapraid.conf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } else if (t.id === 'cf-review') {
            const text = box.value.replace(/\r/g, '').replace(/\n*$/, '\n');
            await writeText(text, 'Edited by hand in Settings › SnapRAID file', 'Check the change before it is written');
        } else if (t.dataset.cfLine) {
            // the line asked, selected in the editor
            const n = Number(t.dataset.cfLine);
            const lines = box.value.split('\n');
            const start = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
            box.focus();
            box.setSelectionRange(start, start + (lines[n - 1] || '').length);
            const lh = parseFloat(getComputedStyle(box).lineHeight) || 20;
            box.scrollTop = Math.max(0, (n - 4) * lh);
        } else if (t.dataset.cfCompare) await compare(t.dataset.cfCompare);
        else if (t.dataset.cfOutside !== undefined) await showOutside();
    });
}
