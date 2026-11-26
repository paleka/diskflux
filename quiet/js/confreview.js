// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// The check of a change before it is written: the text of the SnapRAID
// configuration, the lines that change, in plain words, and the problems
// found in the new text. Used before every write of the file, and by the
// SnapRAID file page of Settings.

import { escHtml, escAttr } from './utils.js';

const PARITY_KEYS = ['parity', '2-parity', '3-parity', '4-parity', '5-parity', '6-parity', 'z-parity'];
// the words of SnapRAID's configuration, as its latest version reads them (cmdline/state.c)
const KNOWN_KEYS = [...PARITY_KEYS, 'content', 'data', 'disk', 'extra', 'exclude', 'include', 'blocksize', 'block_size', 'hashsize', 'hash_size', 'autosave', 'nohidden', 'snapshot', 'pool', 'share', 'smartctl', 'smartignore', 'temp_limit', 'temp_sleep'];

/** The lines of a text, without the empty one after the final newline. */
export const textLines = (text) => {
    const lines = (text || '').replace(/\r/g, '').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines;
};

/**
 * The lines of the old text and of the new one, in order, marked as kept
 * ('='), removed ('-') or added ('+'), with their numbers in each text.
 * A longest common subsequence over what is left once the common start
 * and end are set aside: a configuration is at most a few hundred lines.
 */
export const lineDiff = (before, after) => {
    const a = textLines(before), b = textLines(after);
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) ++start;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { --endA; --endB; }

    const n = endA - start, m = endB - start;
    const mid = [];
    if (n * m > 4000000) {
        // too big to compare line by line: all of the old part goes, all of the new one comes
        for (let i = start; i < endA; ++i) mid.push(['-', i]);
        for (let j = start; j < endB; ++j) mid.push(['+', j]);
    } else {
        // len[i][j] = longest common run of a[start+i..] and b[start+j..]
        const len = new Uint32Array((n + 1) * (m + 1));
        const at = (i, j) => i * (m + 1) + j;
        for (let i = n - 1; i >= 0; --i) {
            for (let j = m - 1; j >= 0; --j) {
                len[at(i, j)] = a[start + i] === b[start + j] ? len[at(i + 1, j + 1)] + 1 : Math.max(len[at(i + 1, j)], len[at(i, j + 1)]);
            }
        }
        let i = 0, j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && a[start + i] === b[start + j]) { mid.push(['=', start + i, start + j]); ++i; ++j; }
            else if (j < m && (i === n || len[at(i, j + 1)] >= len[at(i + 1, j)])) { mid.push(['+', start + j]); ++j; }
            else { mid.push(['-', start + i]); ++i; }
        }
        // a removal reads better before the addition that replaces it
        for (let k = 1; k < mid.length; ++k) {
            if (mid[k][0] === '-' && mid[k - 1][0] === '+') {
                let p = k;
                while (p > 0 && mid[p - 1][0] === '+') { [mid[p - 1], mid[p]] = [mid[p], mid[p - 1]]; --p; }
            }
        }
    }

    const out = [];
    for (let i = 0; i < start; ++i) out.push({ k: '=', t: a[i], o: i + 1, n: i + 1 });
    mid.forEach(([k, x, y]) => {
        if (k === '=') out.push({ k, t: a[x], o: x + 1, n: y + 1 });
        else if (k === '-') out.push({ k, t: a[x], o: x + 1, n: 0 });
        else out.push({ k, t: b[x], o: 0, n: x + 1 });
    });
    for (let i = endA, j = endB; i < a.length; ++i, ++j) out.push({ k: '=', t: a[i], o: i + 1, n: j + 1 });
    return out;
};

export const diffStats = (diff) => ({
    added: diff.filter(d => d.k === '+').length,
    removed: diff.filter(d => d.k === '-').length
});

/* ------------------------------------------------------------------ */
/* plain words                                                         */
/* ------------------------------------------------------------------ */

const lineInfo = (t) => {
    const line = (t || '').trim();
    if (!line) return { kind: 'blank' };
    if (line.startsWith('#')) return { kind: 'comment' };
    const m = line.match(/^(\S+)\s*(.*)$/);
    const key = m[1].toLowerCase();
    const rest = m[2].trim();
    if (PARITY_KEYS.includes(key)) return { kind: 'parity', id: key, key, value: rest };
    if (key === 'data' || key === 'disk') {
        const d = rest.match(/^(\S+)\s*(.*)$/);
        return { kind: 'data', id: `data ${d ? d[1] : rest}`, name: d ? d[1] : rest, value: d ? d[2].trim() : '' };
    }
    if (key === 'content') return { kind: 'content', id: `content ${rest}`, value: rest };
    if (key === 'exclude' || key === 'include') return { kind: 'filter', id: `${key} ${rest}`, key, value: rest };
    if (KNOWN_KEYS.includes(key)) return { kind: 'option', id: key, key, value: rest };
    return { kind: 'other', id: line, key, value: rest };
};

const OPTION_WORDS = {
    blocksize: 'Block size',
    hashsize: 'Hash size',
    autosave: 'Save the index during a sync, every',
    nohidden: 'Skip hidden files',
    pool: 'Folder of links (pool)',
    share: 'Share path of the links',
    smartctl: 'smartctl options',
    smartignore: 'SMART attributes ignored',
    temp_limit: 'Pause when a disk is hotter than',
    temp_sleep: 'Pause for',
    snapshot: 'Snapshot mode',
    block_size: 'Block size',
    hash_size: 'Hash size'
};

const OPTION_UNITS = { blocksize: ' KiB', block_size: ' KiB', hashsize: ' bytes', hash_size: ' bytes', autosave: ' GB', temp_limit: ' °C', temp_sleep: ' minutes' };

const optionValue = (key, value) => (value ? `${value}${OPTION_UNITS[key] || ''}` : key === 'nohidden' || key === 'snapshot' ? 'on' : 'default');

const levelWords = (key) => (key === 'parity' ? 'first parity' : key === 'z-parity' ? 'parity z' : `parity ${key.split('-')[0]}`);

/**
 * What changes, in plain words, for a group of removed and added lines.
 * \return The sentences, in the order of the lines.
 */
export const describeHunk = (removed, added, moved = new Set()) => {
    // a line taken from one place and written the same in another moved: said once, where it lands
    const out = added.filter(t => moved.has(t.trim())).map(t => `Moves: ${t.trim()}`);
    removed = removed.filter(t => !moved.has(t.trim()));
    added = added.filter(t => !moved.has(t.trim()));
    const del = removed.map(lineInfo), add = added.map(lineInfo);
    const used = new Set();
    let comments = false;
    const other = (d) => { if (!used.has(d)) { used.add(d); return true; } return false; };

    add.forEach(x => {
        if (x.kind === 'blank') return;
        if (x.kind === 'comment') { comments = true; return; }
        const old = del.find(d => !used.has(d) && d.kind === x.kind && d.id === x.id);
        if (old) used.add(old);
        switch (x.kind) {
            case 'data':
                out.push(old ? `Disk ${x.name} moves from ${old.value} to ${x.value}` : `New data disk ${x.name} at ${x.value}`);
                break;
            case 'parity':
                out.push(old ? `The ${levelWords(x.key)} moves to ${x.value}` : `New parity level: ${levelWords(x.key)}, at ${x.value}`);
                break;
            case 'content': {
                // a copy of the index taken away in the same place moved, rather than one gone and one new
                const gone = del.find(d => !used.has(d) && d.kind === 'content');
                if (gone) { used.add(gone); out.push(`A copy of the index moves from ${gone.value} to ${x.value}`); }
                else out.push(`New copy of the index at ${x.value}`);
                break;
            }
            case 'filter':
                out.push(x.key === 'exclude' ? `Left out: ${x.value}` : `Only taken: ${x.value}`);
                break;
            case 'option':
                out.push(old
                    ? `${OPTION_WORDS[x.key] || x.key}: ${optionValue(x.key, old.value)} → ${optionValue(x.key, x.value)}`
                    : `${OPTION_WORDS[x.key] || x.key}: ${optionValue(x.key, x.value)}`);
                break;
            default:
                out.push(`Line added: ${x.id}`);
        }
    });
    del.forEach(d => {
        if (used.has(d) || d.kind === 'blank') return;
        if (d.kind === 'comment') { comments = true; return; }
        other(d);
        switch (d.kind) {
            case 'data': out.push(`Disk ${d.name} leaves the array`); break;
            case 'parity': out.push(`The ${levelWords(d.key)} is taken away`); break;
            case 'content': out.push(`The copy of the index at ${d.value} is taken away`); break;
            case 'filter': out.push(d.key === 'exclude' ? `No longer left out: ${d.value}` : `No longer the only one taken: ${d.value}`); break;
            case 'option': out.push(`${OPTION_WORDS[d.key] || d.key}: ${d.key === 'nohidden' || d.key === 'snapshot' ? 'off' : 'back to the default'}`); break;
            default: out.push(`Line taken away: ${d.id}`);
        }
    });
    if (comments) out.push('Comments change');
    return out;
};

/**
 * The groups of changed lines, each with its sentences.
 * \return [{ from, to, words }], from and to index the diff.
 */
export const diffHunks = (diff) => {
    const gone = new Set(diff.filter(d => d.k === '-' && d.t.trim()).map(d => d.t.trim()));
    const moved = new Set(diff.filter(d => d.k === '+' && gone.has(d.t.trim())).map(d => d.t.trim()));
    const hunks = [];
    for (let i = 0; i < diff.length;) {
        if (diff[i].k === '=') { ++i; continue; }
        const from = i;
        while (i < diff.length && diff[i].k !== '=') ++i;
        const part = diff.slice(from, i);
        hunks.push({ from, to: i, words: describeHunk(part.filter(d => d.k === '-').map(d => d.t), part.filter(d => d.k === '+').map(d => d.t), moved) });
    }
    return hunks;
};

/** Every sentence of a change, once. */
export const describeChange = (before, after) => {
    const seen = new Set();
    return diffHunks(lineDiff(before, after)).flatMap(h => h.words).filter(w => !seen.has(w) && seen.add(w));
};

/* ------------------------------------------------------------------ */
/* problems                                                            */
/* ------------------------------------------------------------------ */

/**
 * The problems of a SnapRAID configuration, checked in the browser.
 * An 'error' stops SnapRAID or leaves the files unprotected: it blocks the
 * write. A 'warn' is allowed but deserves a look.
 *
 * ctx.before: the text in place, to see what a change costs.
 * ctx.mounted(path): true when the path is on a disk of its own; without it
 * the disks are not checked (a guided change mounts them in an earlier step).
 * \return [{ level, line, text }], line counted from 1, 0 for the whole file.
 */
export const confProblems = (text, ctx = {}) => {
    const out = [];
    const lines = textLines(text);
    const names = {}, paths = {}, levels = {};
    let data = 0, contents = 0;
    let blocksize = null;

    lines.forEach((raw, i) => {
        const no = i + 1;
        const x = lineInfo(raw);
        if (x.kind === 'blank' || x.kind === 'comment') return;
        const seenPath = (p, what) => {
            const k = p.replace(/\/+$/, '');
            if (paths[k]) out.push({ level: 'error', line: no, text: `${p} is already used on line ${paths[k]}: every disk and file needs a place of its own` });
            else paths[k] = no;
            // a folder on the system disk is allowed, but it is mostly a disk that is not mounted
            if (ctx.mounted && !ctx.mounted(p)) out.push({ level: 'warn', line: no, text: `${p} is on the system disk, not on a disk of its own: if a disk belongs there, it is not mounted and SnapRAID would ${what}` });
        };
        switch (x.kind) {
            case 'data':
                ++data;
                if (!x.value) { out.push({ level: 'error', line: no, text: `The disk ${x.name} has no folder: write it as “data NAME /mnt/folder/”` }); break; }
                if (names[x.name]) out.push({ level: 'error', line: no, text: `The name ${x.name} is already used on line ${names[x.name]}` });
                else names[x.name] = no;
                seenPath(x.value, 'take its files as deleted');
                break;
            case 'parity':
                if (!x.value) { out.push({ level: 'error', line: no, text: `The ${levelWords(x.key)} has no file` }); break; }
                if (levels[x.key]) out.push({ level: 'error', line: no, text: `The ${levelWords(x.key)} is already on line ${levels[x.key]}` });
                else levels[x.key] = no;
                x.value.split(',').map(s => s.trim()).filter(Boolean).forEach(f => seenPath(f.replace(/\/[^/]*$/, '') || '/', 'not find the parity'));
                break;
            case 'content':
                ++contents;
                if (!x.value) out.push({ level: 'error', line: no, text: 'A content line needs the path of the file' });
                break;
            case 'option': {
                if (x.key === 'blocksize' || x.key === 'block_size') blocksize = { value: x.value, line: no };
                // SnapRAID refuses these out of their range
                const range = { temp_limit: [40, 70, '°C'], temp_sleep: [3, 120, 'minutes'] }[x.key];
                const v = Number(x.value);
                if (range && !(Number.isInteger(v) && v >= range[0] && v <= range[1]))
                    out.push({ level: 'error', line: no, text: `${x.key} must be a whole number from ${range[0]} to ${range[1]} ${range[2]}: SnapRAID stops with an error` });
                break;
            }
            case 'other':
                out.push({ level: 'warn', line: no, text: `“${x.key}” is not a word of SnapRAID's configuration that DiskFlux knows: SnapRAID stops if it does not know it either` });
                break;
            default:
        }
    });

    const parityLevels = Object.keys(levels).length;
    if (data && !parityLevels) out.push({ level: 'error', line: 0, text: 'There is no parity: no file would be protected' });
    if ((data || parityLevels) && !contents) out.push({ level: 'error', line: 0, text: 'There is no content line: SnapRAID needs at least one file for its index' });
    else if (parityLevels && contents < parityLevels + 1)
        out.push({ level: 'warn', line: 0, text: `${contents} ${contents === 1 ? 'copy' : 'copies'} of the index for ${parityLevels} parity ${parityLevels === 1 ? 'level' : 'levels'}: SnapRAID advises one more copy than levels, on different disks` });

    if (ctx.before !== undefined) {
        const old = textLines(ctx.before).map(lineInfo).find(x => x.kind === 'option' && (x.key === 'blocksize' || x.key === 'block_size'));
        const was = old ? old.value : '';
        const now = blocksize ? blocksize.value : '';
        if (was !== now && textLines(ctx.before).some(l => lineInfo(l).kind === 'parity'))
            out.push({ level: 'warn', line: blocksize ? blocksize.line : 0, text: `The block size changes (${was || '256, the default'} → ${now || '256, the default'}): the parity has to be built again from zero, a full read of every disk` });
    }
    return out.sort((p, q) => (p.level === q.level ? (p.line || 1e9) - (q.line || 1e9) : p.level === 'error' ? -1 : 1));
};

/* ------------------------------------------------------------------ */
/* rows to draw                                                        */
/* ------------------------------------------------------------------ */

/** The part that differs between two lines that replace each other. */
export const changedSpan = (a, b) => {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) ++p;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) ++s;
    return { pre: p, post: s };
};

/**
 * What a view shows: 'changes' (three lines around each change, the rest
 * folded unless open), or 'whole'.
 * \return [{ type: 'line', d, pair } | { type: 'fold', from, to } | { type: 'cap', words }]
 */
export const unifiedRows = (diff, view, open = new Set()) => {
    const hunks = diffHunks(diff);
    const near = diff.map(() => view !== 'changes');
    hunks.forEach(h => { for (let i = Math.max(0, h.from - 3); i < Math.min(diff.length, h.to + 3); ++i) near[i] = true; });
    const rows = [];
    let i = 0;
    while (i < diff.length) {
        if (!near[i]) {
            const from = i;
            while (i < diff.length && !near[i]) ++i;
            if (open.has(from)) for (let k = from; k < i; ++k) rows.push({ type: 'line', d: diff[k] });
            else rows.push({ type: 'fold', from, to: i });
            continue;
        }
        const h = hunks.find(x => x.from === i);
        if (h) {
            const part = diff.slice(h.from, h.to);
            if (h.words.length) rows.push({ type: 'cap', words: h.words, del: part.every(d => d.k === '-') });
            const dels = part.filter(d => d.k === '-'), adds = part.filter(d => d.k === '+');
            part.forEach(d => {
                // a line replaced one for one shows the part that changes
                const idx = d.k === '-' ? dels.indexOf(d) : adds.indexOf(d);
                const pair = dels.length === adds.length ? (d.k === '-' ? adds[idx] : dels[idx]) : null;
                rows.push({ type: 'line', d, pair: pair ? pair.t : null });
            });
            i = h.to;
            continue;
        }
        rows.push({ type: 'line', d: diff[i] });
        ++i;
    }
    return rows;
};

/** Before and after side by side. \return [{ type: 'pair', l, r, lp, rp } | { type: 'cap', words }] */
export const splitRows = (diff) => {
    const gone = new Set(diff.filter(d => d.k === '-' && d.t.trim()).map(d => d.t.trim()));
    const moved = new Set(diff.filter(d => d.k === '+' && gone.has(d.t.trim())).map(d => d.t.trim()));
    const rows = [];
    for (let i = 0; i < diff.length;) {
        if (diff[i].k === '=') { rows.push({ type: 'pair', l: diff[i], r: diff[i] }); ++i; continue; }
        const from = i;
        while (i < diff.length && diff[i].k !== '=') ++i;
        const part = diff.slice(from, i);
        const dels = part.filter(d => d.k === '-'), adds = part.filter(d => d.k === '+');
        const words = describeHunk(dels.map(d => d.t), adds.map(d => d.t), moved);
        if (words.length) rows.push({ type: 'cap', words, del: !adds.length });
        for (let k = 0; k < Math.max(dels.length, adds.length); ++k)
            rows.push({ type: 'pair', l: dels[k] || null, r: adds[k] || null, lp: dels[k] && adds[k] ? adds[k].t : null, rp: dels[k] && adds[k] ? dels[k].t : null });
    }
    return rows;
};

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

const codeHtml = (t, pair) => {
    if (!t) return ' ';
    if (t.trim().startsWith('#')) return `<span class="cr-cm">${escHtml(t)}</span>`;
    const m = t.match(/^(\s*)(\S+)(.*)$/);
    if (!m) return escHtml(t);
    const html = (s, from, to) => escHtml(s.slice(from, to));
    if (pair !== null && pair !== undefined) {
        const { pre, post } = changedSpan(t, pair);
        const end = t.length - post;
        const kwEnd = m[1].length + m[2].length;
        // the keyword stays bold where it is not part of what changes
        const k = Math.min(kwEnd, pre);
        return `${html(t, 0, m[1].length)}<b class="cr-kw">${html(t, m[1].length, Math.max(k, m[1].length))}</b>${html(t, Math.max(k, m[1].length), pre)}<mark class="cr-hl">${html(t, pre, end)}</mark>${html(t, end)}`;
    }
    return `${escHtml(m[1])}<b class="cr-kw">${escHtml(m[2])}</b>${escHtml(m[3])}`;
};

const mark = (k) => (k === '+' ? '+' : k === '-' ? '−' : '');

const unifiedHtml = (st) => {
    const f = st.files[st.file];
    return unifiedRows(f.diff, st.view, f.open).map(r => {
        if (r.type === 'fold') return `<button type="button" class="cr-fold" data-cr-fold="${r.from}">⋯ ${r.to - r.from} unchanged ${r.to - r.from === 1 ? 'line' : 'lines'} · show</button>`;
        if (r.type === 'cap') return st.words ? `<div class="cr-cap${r.del ? ' cr-cap-del' : ''}">${r.words.map(escHtml).join(' · ')}</div>` : '';
        const d = r.d;
        return `<div class="cr-row font-mono cr-${d.k === '+' ? 'add' : d.k === '-' ? 'del' : 'same'}"><span class="cr-no">${d.o || ''}</span><span class="cr-no">${d.n || ''}</span><span class="cr-mk">${mark(d.k)}</span><span class="cr-tx">${codeHtml(d.t, r.pair)}</span></div>`;
    }).join('');
};

const splitHtml = (st) => {
    const f = st.files[st.file];
    const cell = (d, k, pair) => (d
        ? `<div class="cr-cell font-mono cr-${k === '+' ? 'add' : k === '-' ? 'del' : 'same'}"><span class="cr-no">${k === '+' ? d.n : d.o}</span><span class="cr-mk">${mark(k)}</span><span class="cr-tx">${codeHtml(d.t, pair)}</span></div>`
        : '<div class="cr-cell font-mono cr-none"><span class="cr-no"></span><span class="cr-mk"></span><span class="cr-tx"> </span></div>');
    return `<div class="cr-split-head"><div>Now</div><div>After writing</div></div>` + splitRows(f.diff).map(r => {
        if (r.type === 'cap') return st.words ? `<div class="cr-cap${r.del ? ' cr-cap-del' : ''}">${r.words.map(escHtml).join(' · ')}</div>` : '';
        return `<div class="cr-split">${cell(r.l, r.l && r.l.k === '=' ? '=' : '-', r.lp)}${cell(r.r, r.r && r.r.k === '=' ? '=' : '+', r.rp)}</div>`;
    }).join('');
};

const problemHtml = (p) => `
    <li class="cr-check cr-check-${p.level}">
        <span class="cr-check-mark" aria-hidden="true">${p.level === 'error' ? '✕' : p.level === 'warn' ? '!' : '✓'}</span>
        <span>${p.line ? `<b>Line ${p.line}:</b> ` : ''}${escHtml(p.text)}</span>
    </li>`;

const reviews = new Map();
let nextId = 1;

const drawCode = (root, st) => {
    const f = st.files[st.file];
    root.querySelector('.cr-path').textContent = f.path;
    root.querySelector('.cr-path-note').textContent = f.note;
    root.querySelector('.cr-code').innerHTML = st.view === 'split' ? splitHtml(st) : unifiedHtml(st);
    root.querySelectorAll('[data-cr-tab]').forEach(b => b.setAttribute('aria-selected', String(Number(b.dataset.crTab) === st.file)));
    root.querySelectorAll('[data-cr-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.crView === st.view)));
};

/**
 * The body of the check: summary, file tabs, views, the text and the problems.
 * files: [{ label, path, before, after, note? }]
 * \return { html, id }: the html is complete; the buttons in it work once it is in the page.
 */
export const reviewHtml = ({ files, summary = null, problems = [], note = '', words: plain = true }) => {
    const id = String(nextId++);
    const list = files.map(f => {
        const diff = lineDiff(f.before, f.after);
        const s = diffStats(diff);
        const lines = textLines(f.after).length;
        return { ...f, diff, stats: s, open: new Set(), note: f.note || `${lines} ${lines === 1 ? 'line' : 'lines'} after writing · comments and lines nobody changed stay as they are` };
    });
    const changed = list.findIndex(f => f.stats.added || f.stats.removed);
    // words: false for a file that is not SnapRAID's configuration, whose lines have no sentence
    const st = { files: list, file: changed < 0 ? 0 : changed, view: 'changes', words: plain };
    reviews.set(id, st);
    const cur = list[st.file];

    const words = summary || [...new Set(list.flatMap(f => diffHunks(f.diff).flatMap(h => h.words)))];
    const { added, removed } = list[0].stats;
    const html = `
        <div class="cr" data-cr="${id}">
            <div class="cr-summary">
                <div class="cr-summary-words">
                    <div class="cr-label">In plain words</div>
                    ${words.length ? `<ul>${words.map(w => `<li>${typeof w === 'string' ? escHtml(w) : w.html}</li>`).join('')}</ul>` : '<p>Nothing changes in the file.</p>'}
                </div>
                ${list.length === 1 ? `<div class="cr-stats"><span class="cr-stat cr-stat-add">+${added} ${added === 1 ? 'line' : 'lines'}</span><span class="cr-stat${removed ? ' cr-stat-del' : ''}">${removed ? `−${removed}` : '0'} removed</span></div>` : ''}
            </div>
            <div class="cr-bar">
                <div class="cr-tabs" role="tablist" aria-label="Files">
                    ${list.length > 1 ? list.map((f, i) => `<button type="button" role="tab" class="cr-tab" data-cr-tab="${i}" aria-selected="${i === st.file}"><span>${escHtml(f.label)}</span>${f.stats.removed ? `<span class="cr-n-del">−${f.stats.removed}</span>` : ''}${f.stats.added ? `<span class="cr-n-add">+${f.stats.added}</span>` : ''}</button>`).join('') : ''}
                </div>
                <div class="cr-views" role="group" aria-label="View">
                    <button type="button" data-cr-view="changes" aria-pressed="true">Changes only</button>
                    <button type="button" data-cr-view="whole" aria-pressed="false">Whole file</button>
                    <button type="button" data-cr-view="split" aria-pressed="false">Before / after</button>
                </div>
            </div>
            <div class="cr-file">
                <div class="cr-file-head">
                    <span class="font-mono cr-path">${escHtml(cur.path)}</span><span class="cr-path-note">${escHtml(cur.note)}</span><span class="cr-grow"></span>
                    <button type="button" class="btn btn-secondary btn-sm" data-cr-copy>Copy the new file</button>
                </div>
                <div class="cr-code">${unifiedHtml(st)}</div>
            </div>
            ${problems.length ? `<ul class="cr-checks">${problems.map(problemHtml).join('')}</ul>` : ''}
            ${note ? `<div class="cr-note">${note}</div>` : ''}
        </div>`;
    return { html, id };
};

// one listener for every check in the page, drawn and redrawn as html
if (typeof document !== 'undefined') {
    document.addEventListener('click', (ev) => {
        const t = ev.target.closest('[data-cr-tab],[data-cr-view],[data-cr-fold],[data-cr-copy]');
        if (!t) return;
        const root = t.closest('[data-cr]');
        const st = root && reviews.get(root.dataset.cr);
        if (!st) return;
        if (t.dataset.crTab !== undefined) st.file = Number(t.dataset.crTab);
        else if (t.dataset.crView !== undefined) st.view = t.dataset.crView;
        else if (t.dataset.crFold !== undefined) st.files[st.file].open.add(Number(t.dataset.crFold));
        else {
            const text = st.files[st.file].after;
            navigator.clipboard?.writeText(text).then(() => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy the new file'; }, 1500); }, () => { });
            return;
        }
        drawCode(root, st);
    });
}

/** Forget the checks of a closed window. */
export const reviewForget = (root) => {
    root.querySelectorAll('[data-cr]').forEach(el => reviews.delete(el.dataset.cr));
};

/**
 * The window shown before a change of SnapRAID's configuration is written.
 *
 * files: [{ label, path, before, after }]; summary: sentences in place of
 * the ones made from the lines; note: html under the text (what happens next).
 * An error found in a new text blocks the write. mounted(path), when given,
 * also checks that the disks are on disks of their own (see confProblems).
 * \return A promise of true when the change is to be written.
 */
export const confReview = async ({ title = 'Check the change before it is written', subtitle = '', files, summary = null, note = '', label = 'Write the change', danger = false, mounted = undefined }) => {
    if (files.every(f => f.before === f.after)) return true;
    const { dialog } = await import('./storage.js');
    const problems = [...files.flatMap(f => confProblems(f.after, { before: f.before, mounted }).map(p => ({ ...p, text: files.length > 1 ? `${f.label}: ${p.text}` : p.text })))];
    const blocked = problems.some(p => p.level === 'error');
    const kept = 'The file as it is now is kept: <b>Settings › SnapRAID file › History</b> can put it back.';
    const { html } = reviewHtml({ files, summary, problems, note: [note, kept].filter(Boolean).join('<br>') });
    return new Promise((resolve) => {
        const finish = (dl, yes) => { reviewForget(dl.body); dl.close(); resolve(yes); };
        const dl = dialog({
            title,
            body: `${subtitle ? `<p class="text-sm text-muted mb-4">${subtitle}</p>` : ''}${html}`,
            buttons: [
                { label: 'Cancel', onClick: (d) => finish(d, false) },
                { label: blocked ? 'Fix the problem first' : label, cls: danger ? 'btn-danger' : 'btn-primary', disabled: blocked, onClick: (d) => finish(d, true) }
            ]
        });
        dl.overlay.querySelector('.modal-container').classList.add('cr-dialog');
    });
};

export const __test = { lineInfo };
