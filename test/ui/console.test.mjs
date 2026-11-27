// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// Tests of the Console look: the commands it writes under the buttons, the
// sources of the tiles, the keys of the menu, and that its files are complete.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
// the pages are served as .js: a copy named .mjs loads on every Node, also 18
const tmp = mkdtempSync(join(tmpdir(), 'console-test-'));
writeFileSync(join(tmp, 'plain.mjs'), readFileSync(join(root, 'commander', 'js', 'plain.js'), 'utf8'));
const P = await import(pathToFileURL(join(tmp, 'plain.mjs')).href);
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

test('a button says its command only when it has one', () => {
    assert.equal(P.consoleCmd('go', { act: 'protect' }), 'snapraid sync, then scrub');
    assert.equal(P.consoleCmd('go', { act: 'heal' }), 'snapraid fix -e, then scrub -p bad');
    assert.equal(P.consoleCmd('srv', { id: 'reboot' }), 'systemctl reboot');
    assert.equal(P.consoleCmd('restore', { path: '/' }), 'snapraid diff, then fix -m');
    // going to a page, or a window with several choices, has no command
    assert.equal(P.consoleCmd('go', { act: 'drives' }), '');
    assert.equal(P.consoleCmd('share-edit', { name: 'photos' }), '');
    assert.equal(P.consoleCmd('srv', { id: 'unknown' }), '');
    assert.equal(P.consoleCmd('go'), '');
});

test('every action on the server of the menu has its command', () => {
    for (const id of ['disks_sleep', 'service_restart', 'suspend', 'reboot', 'poweroff']) assert.ok(P.CONSOLE_CMD[`srv:${id}`], id);
});

test('the tiles of Home name the request they read, other titles none', () => {
    assert.equal(P.consoleApi('Space'), 'GET /host/space');
    assert.equal(P.consoleApi('What happened'), 'GET /host/runs + /host/events');
    assert.equal(P.consoleApi('Something else'), '');
    // each tile that Home draws with a title has a source
    const titles = [...read('commander', 'js', 'simple.js').matchAll(/tileHead\('([^']+)'/g)].map(m => m[1]);
    assert.ok(titles.length >= 10);
    for (const t of titles) assert.ok(P.consoleApi(t), t);
    // and each source is a request the scripts really make
    const scripts = read('commander', 'js', 'simple.js') + read('commander', 'js', 'api.js');
    for (const src of Object.values(P.CONSOLE_API))
        for (const path of src.replace(/^GET /, '').split(' + ')) {
            const last = path.split('/').pop();
            assert.ok(scripts.includes(`/${last}`), path);
        }
});

test('the uptime of the status line', () => {
    assert.equal(P.consoleUptime(0), 'up 0m');
    assert.equal(P.consoleUptime(59), 'up 0m');
    assert.equal(P.consoleUptime(5 * 60 + 3), 'up 5m');
    assert.equal(P.consoleUptime(3 * 3600 + 12 * 60), 'up 3h 12m');
    assert.equal(P.consoleUptime(41 * 86400 + 6 * 3600 + 59 * 60), 'up 41d 06h');
    assert.equal(P.consoleUptime(undefined), 'up 0m');
    assert.equal(P.consoleUptime(-5), 'up 0m');
});

test('the letters of the menu open pages that exist, each letter once', () => {
    const html = read('console', 'index.html');
    const pairs = [...html.matchAll(/<a href="(#\/[a-z-]*)" class="nav-item[^"]*" data-link data-keys="g (\w)">/g)].map(m => [m[2], m[1]]);
    assert.ok(pairs.length >= 9, 'the pages for everyday use have a letter');
    assert.equal(new Set(pairs.map(p => p[0])).size, pairs.length, 'no letter twice');
    for (const taken of ['g', 'c']) assert.ok(!pairs.some(p => p[0] === taken), `${taken} is a key of its own`);
    assert.equal(P.consoleGo(pairs, 'h'), '#/');
    assert.equal(P.consoleGo(pairs, 'd'), '#/drives');
    assert.equal(P.consoleGo(pairs, 'q'), null);
    assert.equal(P.consoleGo([], 'h'), null);
    // the other looks have the same pages in their menu
    const quiet = read('quiet', 'index.html');
    for (const [, href] of pairs) assert.ok(quiet.includes(`<a href="${href}"`), href);
});

test('Console is the page of Quiet, starting dark, with its own stylesheet', () => {
    const html = read('console', 'index.html');
    assert.match(html, /data-look="console"/);
    assert.match(html, /data-theme-default="dark"/);
    assert.match(html, /css\/quiet\.css[\s\S]*css\/console\.css/);
    for (const id of ['cx-status', 'cx-notes', 'palette-open', 'user-menu', 'view-container', 'header-actions']) assert.match(html, new RegExp(`id="${id}"`), id);
    // the other looks do not say they are Console
    for (const t of ['quiet', 'commander', 'brutale']) assert.doesNotMatch(read(t, 'index.html'), /data-look=/);
    // every element of the menu of Quiet is there
    const ids = (s) => [...s.matchAll(/id="([\w-]+)"/g)].map(m => m[1]);
    const mine = ids(html);
    for (const id of ids(read('quiet', 'index.html'))) assert.ok(mine.includes(id), id);
});

test('the parts only Console shows are hidden in the other looks, and Console can hide them', () => {
    assert.match(read('commander', 'css', 'simple.css'), /\.cx-only \{ display: none; \}/);
    const css = read('console', 'css', 'console.css');
    assert.match(css, /\[data-cx-notes="off"\] \.cx-only \{ display: none; \}/);
    assert.match(css, /\.btn\[data-cmd\]::after \{ content: attr\(data-cmd\)/);
    // both lights are defined
    assert.match(css, /:root, \[data-theme="dark"\] \{/);
    assert.match(css, /\[data-theme="light"\] \{/);
});

test('every file of Console is in the package', () => {
    const make = read('Makefile.am');
    for (const f of ['index.html', 'css/console.css', 'css/quiet.css', 'css/fonts/JetBrainsMono-Bold.woff2', 'js/console.js', 'js/simple.js'])
        assert.match(make, new RegExp(`console/${f.replace(/\./g, '\\.')}`), f);
    assert.match(make, /data_DATA = .*console\.zip/);
    for (const t of ['quiet', 'commander', 'brutale']) assert.match(make, new RegExp(`${t}/js/console\\.js`), t);
    assert.match(read('pkg', 'diskflux.spec.in'), /console\.zip/);
    assert.match(read('pkg', 'diskflux.nsis.in'), /File "console\.zip"/);
});
