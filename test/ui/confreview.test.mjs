// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// Tests of the check shown before SnapRAID's configuration is written
// (commander/js/confreview.js): the line diff, the plain words, the problems
// found in a file, the rows of the views, and the lines kept as written by
// the Storage page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'confreview-test-'));
for (const name of ['confreview', 'storage', 'api', 'utils', 'plain']) {
    const src = readFileSync(join(here, '..', '..', 'commander', 'js', `${name}.js`), 'utf8');
    writeFileSync(join(tmp, `${name}.mjs`), src.replace(/from '\.\/(\w+)\.js'/g, "from './$1.mjs'"));
}
const C = await import(pathToFileURL(join(tmp, 'confreview.mjs')).href);
const S = await import(pathToFileURL(join(tmp, 'storage.mjs')).href);

const BASE = [
    '# SnapRAID configuration',
    'parity /mnt/parity1/snapraid.parity',
    '',
    'content /var/snapraid/snapraid.content',
    'content /mnt/disk1/.snapraid.content',
    'content /mnt/disk2/.snapraid.content',
    '',
    'data d1 /mnt/disk1/',
    'data d2 /mnt/disk2/',
    'data d3 /mnt/disk3/',
    '',
    'exclude *.unrecoverable',
    'exclude /tmp/',
    'blocksize 256',
    'nohidden',
    ''
].join('\n');

const edit = (text, fn) => text.split('\n').flatMap(l => fn(l) ?? [l]).join('\n');

test('diff: same text, nothing changes', () => {
    const d = C.lineDiff(BASE, BASE);
    assert.ok(d.every(x => x.k === '='));
    assert.equal(d.length, 15);
    assert.deepEqual(C.diffStats(d), { added: 0, removed: 0 });
    assert.deepEqual(C.describeChange(BASE, BASE), []);
});

test('diff: an added line keeps the numbers of both texts', () => {
    const after = edit(BASE, l => (l === 'data d3 /mnt/disk3/' ? [l, 'data d4 /mnt/disk4/'] : null));
    const d = C.lineDiff(BASE, after);
    const add = d.filter(x => x.k === '+');
    assert.equal(add.length, 1);
    assert.deepEqual(add[0], { k: '+', t: 'data d4 /mnt/disk4/', o: 0, n: 11 });
    const last = d[d.length - 1];
    assert.equal(last.o, 15);
    assert.equal(last.n, 16);
    assert.deepEqual(C.describeChange(BASE, after), ['New data disk d4 at /mnt/disk4/']);
});

test('diff: a replaced line comes as a removal then an addition', () => {
    const after = edit(BASE, l => (l === 'data d2 /mnt/disk2/' ? ['data d2 /mnt/disk6/'] : null));
    const d = C.lineDiff(BASE, after).filter(x => x.k !== '=');
    assert.deepEqual(d.map(x => x.k), ['-', '+']);
    assert.deepEqual(C.describeChange(BASE, after), ['Disk d2 moves from /mnt/disk2/ to /mnt/disk6/']);
    assert.deepEqual(C.changedSpan('data d2 /mnt/disk2/', 'data d2 /mnt/disk6/'), { pre: 17, post: 1 });
});

test('diff: empty texts and a file written from nothing', () => {
    assert.deepEqual(C.lineDiff('', ''), []);
    const d = C.lineDiff('', 'parity /p/x\n');
    assert.deepEqual(d, [{ k: '+', t: 'parity /p/x', o: 0, n: 1 }]);
    assert.deepEqual(C.describeChange('', 'parity /p/x\n'), ['New parity level: first parity, at /p/x']);
    assert.deepEqual(C.lineDiff('a\r\nb\r\n', 'a\nb\n').map(x => x.k), ['=', '=']);
});

test('diff: a big change is still complete and in order', () => {
    const a = Array.from({ length: 300 }, (_, i) => `exclude /a${i}/`).join('\n');
    const b = Array.from({ length: 300 }, (_, i) => (i % 7 ? `exclude /a${i}/` : `exclude /b${i}/`)).join('\n');
    const d = C.lineDiff(a, b);
    assert.deepEqual(d.filter(x => x.k !== '+').map(x => x.t), a.split('\n'));
    assert.deepEqual(d.filter(x => x.k !== '-').map(x => x.t), b.split('\n'));
    assert.equal(C.diffStats(d).added, 43);
});

test('plain words: taking a disk out, with its copy of the index moved', () => {
    const after = edit(BASE, l => {
        if (l === 'data d2 /mnt/disk2/') return [];
        if (l === 'content /mnt/disk2/.snapraid.content') return ['content /mnt/disk3/.snapraid.content'];
        return null;
    });
    assert.deepEqual(C.describeChange(BASE, after), [
        'A copy of the index moves from /mnt/disk2/.snapraid.content to /mnt/disk3/.snapraid.content',
        'Disk d2 leaves the array'
    ]);
});

test('plain words: options, rules, parity and comments', () => {
    const after = edit(BASE, l => {
        if (l === 'blocksize 256') return ['blocksize 512'];
        if (l === 'nohidden') return [];
        if (l === 'exclude /tmp/') return [l, 'exclude *.part'];
        if (l === 'parity /mnt/parity1/snapraid.parity') return [l, '2-parity /mnt/parity2/snapraid.2-parity'];
        if (l === '# SnapRAID configuration') return ['# SnapRAID configuration of media'];
        return null;
    });
    assert.deepEqual(C.describeChange(BASE, after), [
        'Comments change',
        'New parity level: parity 2, at /mnt/parity2/snapraid.2-parity',
        'Left out: *.part',
        'Block size: 256 KiB → 512 KiB',
        'Skip hidden files: off'
    ]);
    assert.deepEqual(C.describeHunk(['temp_limit 50'], ['temp_limit 45']), ['Pause when a disk is hotter than: 50 °C → 45 °C']);
    assert.deepEqual(C.describeHunk(['exclude /tmp/'], []), ['No longer left out: /tmp/']);
});

test('problems: a good file has none, mounted disks are checked when asked', () => {
    assert.deepEqual(C.confProblems(BASE), []);
    const mounted = (p) => !p.startsWith('/mnt/disk3');
    assert.deepEqual(C.confProblems(BASE, { mounted }), [
        { level: 'warn', line: 10, text: '/mnt/disk3/ is on the system disk, not on a disk of its own: if a disk belongs there, it is not mounted and SnapRAID would take its files as deleted' }
    ]);
});

test('problems: what stops SnapRAID or protects nothing', () => {
    const bad = [
        'data d1 /mnt/disk1/',
        'data d1 /mnt/disk2/',
        'data d3',
        'data d4 /mnt/disk1',
        'temp_limit 90',
        'frobnicate yes',
        ''
    ].join('\n');
    const p = C.confProblems(bad);
    assert.deepEqual(p.filter(x => x.level === 'error').map(x => x.line), [2, 3, 4, 5, 0, 0]);
    assert.match(p[0].text, /name d1 is already used on line 1/);
    assert.match(p[2].text, /already used on line 1/);
    assert.match(p.find(x => x.line === 5).text, /from 40 to 70/);
    assert.deepEqual(p.filter(x => x.level === 'warn').map(x => x.line), [6]);
});

test('problems: copies of the index and a new block size', () => {
    const two = edit(BASE, l => (l === 'parity /mnt/parity1/snapraid.parity' ? [l, '2-parity /mnt/parity2/snapraid.2-parity', '3-parity /mnt/parity3/snapraid.3-parity'] : null));
    assert.match(C.confProblems(two)[0].text, /3 copies of the index for 3 parity levels/);
    const bigger = edit(BASE, l => (l === 'blocksize 256' ? ['blocksize 512'] : null));
    const w = C.confProblems(bigger, { before: BASE });
    assert.equal(w.length, 1);
    assert.equal(w[0].line, 14);
    assert.match(w[0].text, /built again from zero/);
    // a new array has no parity yet: its first block size costs nothing
    assert.deepEqual(C.confProblems(bigger, { before: '' }), []);
});

test('rows: only the changes, with folds and a caption', () => {
    const after = edit(BASE, l => (l === 'data d3 /mnt/disk3/' ? [l, 'data d4 /mnt/disk4/'] : null));
    const d = C.lineDiff(BASE, after);
    const rows = C.unifiedRows(d, 'changes');
    assert.deepEqual(rows.map(r => r.type), ['fold', 'line', 'line', 'line', 'cap', 'line', 'line', 'line', 'line', 'fold']);
    assert.deepEqual(rows[0], { type: 'fold', from: 0, to: 7 });
    assert.deepEqual(rows[4].words, ['New data disk d4 at /mnt/disk4/']);
    // an opened fold shows its lines
    assert.equal(C.unifiedRows(d, 'changes', new Set([0])).filter(r => r.type === 'line').length, 14);
    assert.equal(C.unifiedRows(d, 'whole').filter(r => r.type === 'line').length, 16);
});

test('rows: before and after side by side pair the replaced lines', () => {
    const after = edit(BASE, l => (l === 'data d2 /mnt/disk2/' ? ['data d2 /mnt/disk6/', 'data d5 /mnt/disk5/'] : null));
    const rows = C.splitRows(C.lineDiff(BASE, after));
    const changed = rows.filter(r => r.type === 'pair' && (r.l?.k !== '=' || r.r?.k !== '='));
    assert.equal(changed.length, 2);
    assert.equal(changed[0].l.t, 'data d2 /mnt/disk2/');
    assert.equal(changed[0].lp, 'data d2 /mnt/disk6/');
    assert.equal(changed[1].l, null);
    assert.equal(changed[1].r.t, 'data d5 /mnt/disk5/');
});

test('html: the text is escaped and the tabs appear only for several files', () => {
    const after = BASE.replace('exclude /tmp/', 'exclude <b>/tmp/');
    const one = C.reviewHtml({ files: [{ label: 'snapraid.conf', path: '/etc/snapraid.conf', before: BASE, after }] }).html;
    assert.ok(one.includes('&lt;b&gt;/tmp/'));
    assert.ok(!one.includes('<b>/tmp/'));
    assert.ok(!one.includes('data-cr-tab='));
    const two = C.reviewHtml({ files: [{ label: 'a', path: '/a', before: BASE, after }, { label: 'b', path: '/b', before: BASE, after: BASE }] }).html;
    assert.equal((two.match(/data-cr-tab="/g) || []).length, 2);
});

test('storage: lines nobody changed are written back as they were', () => {
    const hand = '# mine\nparity\t/mnt/parity1/snapraid.parity\ndata   d1    /mnt/disk1/\nDATA d2 /mnt/disk2/\ncontent /var/snapraid.content\n';
    const conf = S.parseConf(hand);
    assert.equal(S.serializeConf(conf), hand);
    // a change rewrites only its own line, in the plain form
    conf.find(e => e.type === 'data' && e.name === 'd2').path = '/mnt/disk6/';
    S.confInsert(conf, { type: 'data', key: 'data', name: 'd3', path: '/mnt/disk3/' });
    const after = S.serializeConf(conf);
    assert.equal(after, '# mine\nparity\t/mnt/parity1/snapraid.parity\ndata   d1    /mnt/disk1/\ndata d2 /mnt/disk6/\ndata d3 /mnt/disk3/\ncontent /var/snapraid.content\n');
    assert.deepEqual(C.diffStats(C.lineDiff(hand, after)), { added: 2, removed: 1 });
});

test('plain words: a line taken from one place and written in another moves', () => {
    const before = 'exclude /a/\nexclude /b/\n# rest\nexclude /c/\n';
    const after = 'exclude /a/\n# rest\nexclude /c/\nexclude /b/\n';
    assert.deepEqual(C.describeChange(before, after), ['Moves: exclude /b/']);
});

test('storage: the form keeps rules split by comments where they are', () => {
    const text = 'parity /p/x\nexclude *.tmp\nexclude /lost+found/\nautosave 1\n# not protected\nexclude *.part\nexclude Thumbs.db\n';
    const conf = S.parseConf(text);
    const rules = (lines) => lines.map(l => { const [key, pattern] = l.split(' '); return { type: 'filter', key, pattern }; });
    // nothing changed: nothing moves
    assert.equal(S.serializeConf(S.confReplaceGroup(conf, 'filter', rules(['exclude *.tmp', 'exclude /lost+found/', 'exclude *.part', 'exclude Thumbs.db']))), text);
    // one added at the end and one taken away: the others stay under their comment
    const after = S.serializeConf(S.confReplaceGroup(S.parseConf(text), 'filter', rules(['exclude *.tmp', 'exclude *.part', 'exclude Thumbs.db', 'exclude /incomplete/'])));
    assert.equal(after, 'parity /p/x\nexclude *.tmp\nautosave 1\n# not protected\nexclude *.part\nexclude Thumbs.db\nexclude /incomplete/\n');
    // a new first one goes before the first that stays
    assert.equal(S.serializeConf(S.confReplaceGroup(S.parseConf(text), 'filter', rules(['include /x/', 'exclude *.tmp', 'exclude /lost+found/', 'exclude *.part', 'exclude Thumbs.db']))).split('\n')[1], 'include /x/');
    // the order changed: the group is written where its first entry was
    assert.equal(S.serializeConf(S.confReplaceGroup(S.parseConf(text), 'filter', rules(['exclude Thumbs.db', 'exclude *.tmp']))), 'parity /p/x\nexclude Thumbs.db\nexclude *.tmp\nautosave 1\n# not protected\n');
});
