// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

// The logic of the pages for everyday use, without any page: what the state of
// the machine means in plain words, schedules, notifications and the parsing of
// tool outputs. Kept apart so it can be tested (test/ui/plain.test.mjs).

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NTH = ['', 'first', 'second', 'third', 'fourth'];

/* ------------------------------------------------------------------ */
/* words                                                               */
/* ------------------------------------------------------------------ */

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "3 minutes", "5 hours", "2 days": the biggest unit that fits. */
export const humanSpan = (seconds) => {
    const s = Math.max(0, Math.round(seconds));
    if (s < 90) return plural(s, 'second', 'seconds');
    if (s < 90 * 60) return plural(Math.round(s / 60), 'minute', 'minutes');
    if (s < 36 * 3600) return plural(Math.round(s / 3600), 'hour', 'hours');
    return plural(Math.round(s / 86400), 'day', 'days');
};

/** Seconds from an ISO local time to the reference one (the server's "now"). */
export const secondsSince = (iso, nowIso) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    const now = nowIso ? Date.parse(nowIso) : Date.now();
    if (Number.isNaN(t) || Number.isNaN(now)) return null;
    return (now - t) / 1000;
};

export const ago = (iso, nowIso) => {
    const s = secondsSince(iso, nowIso);
    return s == null ? 'never' : `${humanSpan(s)} ago`;
};

/* ------------------------------------------------------------------ */
/* how numbers, times and dates are written: chosen on My settings     */
/* ------------------------------------------------------------------ */

/**
 * The choices of the person, set by the page at the start (prefs.js).
 * sizes: 'tb' (1 TB = 1000 GB, as on the disk label) or 'tib' (1 TiB = 1024 GiB);
 * time: '24' or '12'; date: 'dmy' (26 Nov 2026), 'iso' (2026-11-26) or 'mdy' (Nov 26, 2026);
 * temp: 'c' or 'f'.
 */
export const FORMAT = { sizes: 'tb', time: '24', date: 'dmy', temp: 'c' };

export const FORMAT_CHOICES = {
    sizes: ['tb', 'tib'],
    time: ['24', '12'],
    date: ['dmy', 'iso', 'mdy'],
    temp: ['c', 'f']
};

/** Change how things are written; unknown or invalid values are ignored. */
export const setFormat = (f = {}) => {
    for (const [k, v] of Object.entries(f))
        if (FORMAT_CHOICES[k]?.includes(v)) FORMAT[k] = v;
    return FORMAT;
};

/** The base and the units of the sizes chosen. */
export const sizeUnits = () => FORMAT.sizes === 'tib'
    ? { k: 1024, units: ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] }
    : { k: 1000, units: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] };

export const bytes = (n) => {
    if (n == null || Number.isNaN(n)) return '–';
    const { k, units: u } = sizeUnits();
    let i = 0;
    let v = n;
    while (v >= k && i < u.length - 1) { v /= k; ++i; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};

const MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A time of day as chosen: "14:30" or "2:30 pm". Schedules written in the settings stay 24-hour. */
export const clock = (hour, minute, seconds = null) => {
    const mm = String(minute).padStart(2, '0');
    const ss = seconds == null ? '' : `:${String(seconds).padStart(2, '0')}`;
    if (FORMAT.time === '12') return `${hour % 12 || 12}:${mm}${ss} ${hour < 12 ? 'am' : 'pm'}`;
    return `${String(hour).padStart(2, '0')}:${mm}${ss}`;
};

/** The time of a date, as chosen. */
export const timeText = (date, withSeconds = false) => clock(date.getHours(), date.getMinutes(), withSeconds ? date.getSeconds() : null);

/**
 * A date as chosen: "26 Nov 2026", "2026-11-26" or "Nov 26, 2026".
 * The year is left out of the first and the last when it is this year, if asked.
 */
export const dateText = (date, { long = false, year = 'always', now = new Date() } = {}) => {
    const y = date.getFullYear();
    if (FORMAT.date === 'iso') return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const m = (long ? MONTHS : MONTH3)[date.getMonth()];
    const showYear = year === 'always' || (year === 'other' && y !== now.getFullYear());
    if (FORMAT.date === 'mdy') return `${m} ${date.getDate()}${showYear ? `, ${y}` : ''}`;
    return `${date.getDate()} ${m}${showYear ? ` ${y}` : ''}`;
};

/** A date and its time, as chosen. */
export const dateTimeText = (date, now = new Date()) => `${dateText(date, { year: 'other', now })}, ${timeText(date)}`;

/** A temperature given in °C, written as chosen. */
export const temp = (celsius) => {
    if (celsius == null || celsius === '' || Number.isNaN(Number(celsius))) return '';
    const c = Number(celsius);
    return FORMAT.temp === 'f' ? `${Math.round(c * 9 / 5 + 32)} °F` : `${Math.round(c)} °C`;
};

/** Short explanations of the words of the trade, shown on hover. */
export const GLOSSARY = {
    ups: 'A battery that keeps the server on during a power cut, long enough to finish and turn off cleanly. UPS stands for uninterruptible power supply.',
    eject: 'Releasing a disk so it can be unplugged without losing what was still being written.',
    parity: 'Extra information kept on the protection disks. With it, the files of a failed disk can be rebuilt.',
    sync: 'Updating the protection, so the newest files can be rebuilt too. SnapRAID protects a snapshot: what changed after the last update is not protected yet.',
    scrub: 'Reading a part of the data and comparing it with what was saved, to find damage before it is too late.',
    pool: 'One folder that shows the files of all the data disks together, as if they were one big disk.',
    array: 'The group of disks protected together: data disks and protection disks.',
    smart: 'Self-diagnosis built into every disk. It warns about wear and errors before a disk fails.',
    share: 'A folder that the other computers of your network can open.',
    'recycle bin': 'Files deleted from a share over the network go here first, and are really deleted after some days.',
    'fast disk': 'An SSD placed in front of the big disks. New files are written to it first, then moved to the big disks at night. Also called cache.',
    mover: 'The nightly work that moves the files from the fast disk to the disks of the array, where the protection covers them.'
};

/* ------------------------------------------------------------------ */
/* schedules                                                           */
/* ------------------------------------------------------------------ */

/**
 * Parse a schedule of the daemon: "02:00", "Sun 05:00", "Sun#1 04:00" (first Sunday of the month),
 * separated by commas. Entries that cannot be read are skipped.
 */
export const parseSchedule = (text) => (text || '').split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(?:([A-Za-z]{3})(?:#([1-4]))?\s+)?(\d{2}):(\d{2})$/);
    if (!m) return null;
    const day = m[1] ? DAY3.findIndex(d => d.toLowerCase() === m[1].toLowerCase()) : -1;
    if (m[1] && day < 0) return null;
    const hour = Number(m[3]);
    const minute = Number(m[4]);
    if (hour > 23 || minute > 59) return null;
    return { day, nth: m[2] ? Number(m[2]) : 0, hour, minute };
}).filter(Boolean);

/** The time of a schedule as the settings write it: always 24-hour. */
const hhmmConf = (e) => `${String(e.hour).padStart(2, '0')}:${String(e.minute).padStart(2, '0')}`;
/** The time of a schedule as the person chose to read it. */
const hhmm = (e) => clock(e.hour, e.minute);

export const formatSchedule = (list) => list.map(e => e.day < 0 ? hhmmConf(e) : `${DAY3[e.day]}${e.nth ? `#${e.nth}` : ''} ${hhmmConf(e)}`).join(', ');

/** "every day at 02:00 and every Sunday at 05:00" */
export const describeSchedule = (text) => {
    const list = parseSchedule(text);
    if (!list.length) return 'never';
    const one = (e) => e.day < 0 ? `every day at ${hhmm(e)}`
        : e.nth ? `the ${NTH[e.nth]} ${DAYS[e.day]} of every month at ${hhmm(e)}`
            : `every ${DAYS[e.day]} at ${hhmm(e)}`;
    const words = list.map(one);
    return words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
};

/** The next time a schedule fires after the given date, or null. */
export const nextRun = (text, now = new Date()) => {
    const list = parseSchedule(text);
    let best = null;
    for (const e of list) {
        for (let d = 0; d <= 62; ++d) {
            const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, e.hour, e.minute, 0, 0);
            if (t <= now) continue;
            if (e.day >= 0 && t.getDay() !== e.day) continue;
            if (e.nth && Math.floor((t.getDate() - 1) / 7) + 1 !== e.nth) continue;
            if (!best || t < best) best = t;
            break;
        }
    }
    return best;
};

/** "tonight at 02:00", "tomorrow at 05:00", "on Sunday at 05:00", "on 1 March at 04:00" */
export const whenWords = (date, now = new Date()) => {
    if (!date) return 'not planned';
    const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const at = `at ${hhmm({ hour: date.getHours(), minute: date.getMinutes() })}`;
    if (days === 0) return `${date.getHours() >= 18 || date.getHours() < 5 ? 'tonight' : 'today'} ${at}`;
    if (days === 1) return `${date.getHours() < 5 ? 'tonight' : 'tomorrow'} ${at}`;
    if (days < 7) return `on ${DAYS[date.getDay()]} ${at}`;
    return `on ${dateText(date, { long: true, year: 'other', now })} ${at}`;
};

/* ------------------------------------------------------------------ */
/* tasks                                                               */
/* ------------------------------------------------------------------ */

const TASK_WORDS = {
    sync: ['Protection updated', 'Updating the protection'],
    scrub: ['Checked for damage', 'Checking for damage'],
    fix: ['Files repaired', 'Repairing files'],
    check: ['Files verified', 'Verifying files'],
    diff: ['Looked for changes', 'Looking for changes'],
    probe: ['Disks looked at', 'Looking at the disks'],
    smart: ['Disk health read', 'Reading the disk health'],
    up: ['Disks woken up', 'Waking up the disks'],
    down: ['Disks put to sleep', 'Putting the disks to sleep'],
    down_idle: ['Idle disks put to sleep', 'Putting idle disks to sleep'],
    report: ['Report sent', 'Sending the report'],
    read: ['State read', 'Reading the state'],
    status: ['Status read', 'Reading the status'],
    start: ['Started', 'Starting'],
    shutdown: ['Machine switched off', 'Switching off the machine']
};

/** Routine commands, not worth telling a person about. */
export const ROUTINE = ['probe', 'smart', 'report', 'read', 'status', 'start', 'down_idle', 'up', 'down'];

export const taskTitle = (task, running = false) => (TASK_WORDS[task.command] || [task.command, task.command])[running ? 1 : 0];

/** Did the task do its job? */
export const taskOk = (task) => task.status === 'terminated' && !task.exit_code;

/** One line in plain words about a finished task. */
/** Messages of the engine said again for a person. */
const PLAIN_ERRORS = [
    [/There are soft errors/, 'Some files changed after the last update of the protection: that is not damage.'],
    [/Too many files were removed \((\d+), limit is (\d+)\)/, 'Stopped by the safety check: $1 files were deleted, more than $2. It waits for your OK on the Protection page.'],
    [/Too many files were updated \((\d+), limit is (\d+)\)/, 'Stopped by the safety check: $1 files were changed, more than $2. It waits for your OK on the Protection page.'],
    [/--force-empty/, 'A data disk looks empty: it may not be mounted. Nothing was changed. If you emptied it on purpose, say so on the Disks page: turn on Advanced, then “Empty it…”.'],
    [/The preceding sync operation failed/, 'Skipped, because the update of the protection before it did not finish.'],
    [/Insufficient parity space|Failed to allocate all the required parity space/, 'The protection disk is full: a data disk holds more than it can protect.'],
    [/are now missing or have been rewritten/, 'A data disk looks empty: it may not be mounted. Nothing was changed. If you emptied it on purpose, say so on the Disks page: turn on Advanced, then “Empty it…”.'],
    [/Unrecoverable errors detected/, 'Some files could not be rebuilt: they had changed after the last update of the protection, which keeps only the state of that moment.']
];

export const plainError = (text) => {
    for (const [re, words] of PLAIN_ERRORS) {
        const m = (text || '').match(re);
        if (m) return words.replace(/\$(\d)/g, (_, i) => m[Number(i)]);
    }
    return text;
};

export const taskWords = (task) => {
    // diff tells with its exit code that there are differences
    if (task.command === 'diff' && task.status === 'terminated' && task.exit_code === 2)
        return { title: 'Looked for changes', detail: 'Some files changed since the last update of the protection.', ok: true };
    const ok = taskOk(task);
    let detail = '';
    if (task.status === 'canceled') {
        const why = (task.messages || []).map(m => m.text || '').find(t => /preceding/.test(t));
        return { title: `${taskTitle(task)}: skipped`, detail: why ? plainError(why) : 'It did not start.', ok: false };
    }
    else if (task.status === 'signaled' || (task.messages || []).some(m => /Stop requested/.test(m.text || ''))) detail = 'Stopped before the end. The next run continues from there.';
    else if (!ok) {
        const errs = (task.messages || []).filter(m => m.level === 'error' || m.level === 'fatal').map(m => m.text).filter(Boolean);
        const known = errs.map(plainError).find((t, i) => t !== errs[i]);
        const err = known || errs.pop();
        detail = err ? (known ? err : `It did not finish: ${err}`) : 'It did not finish. The details are in Tasks.';
        if (errs.some(t => /Too many files were (removed|updated)/.test(t)))
            return { title: 'Protection update paused', detail, ok: false };
        if (errs.some(t => /There are soft errors/.test(t)) && !errs.some(t => /data errors|unrecoverable/i.test(t)) && known)
            return { title: `${taskTitle(task)}: changes found`, detail, ok: true };
    } else if (task.command === 'scrub') detail = 'No damage found.';
    else if (task.command === 'sync') detail = 'The newest files can now be rebuilt too.';
    return { title: ok ? taskTitle(task) : `${taskTitle(task)}: problem`, detail, ok };
};

export const lastTask = (tasks, command, onlyOk = false) => (tasks?.history || []).find(t => t.command === command && t.status === 'terminated' && (!onlyOk || !t.exit_code));

/** Duration in seconds of a finished task. */
export const taskSeconds = (t) => {
    if (!t.started_at || !t.finished_at) return 0;
    return Math.max(0, (Date.parse(t.finished_at) - Date.parse(t.started_at)) / 1000);
};

/**
 * The latest update of the protection was stopped by the safety check, because too many
 * files were deleted or changed: it waits for a person to say it's fine.
 * \return { what: 'removed' | 'updated', count, limit } or null
 */
export const blockedSync = (tasks) => {
    const sync = (tasks?.history || []).find(t => t.command === 'sync' && t.status === 'terminated');
    if (!sync || !sync.exit_code) return null;
    for (const m of sync.messages || []) {
        const hit = (m.text || '').match(/Too many files were (removed|updated) \((\d+), limit is (\d+)\)/);
        if (hit) return { what: hit[1], count: Number(hit[2]), limit: Number(hit[3]), at: sync.finished_at };
    }
    return null;
};

/** Files changed since the last update of the protection, as counted by the latest diff. */
export const pendingChanges = (array) => array ? (array.diff_added || 0) + (array.diff_removed || 0) + (array.diff_updated || 0) + (array.diff_moved || 0) + (array.diff_copied || 0) + (array.diff_relocated || 0) + (array.diff_restored || 0) : 0;

/* ------------------------------------------------------------------ */
/* the headline of the home page                                       */
/* ------------------------------------------------------------------ */

/**
 * What a person needs to know first, in one headline, one sentence and one action.
 * \param d { configured, health, healthReason, active (state of the running task or null), array, tasks, config, now, diskProblems }
 * \return { level: 'setup' | 'bad' | 'warn' | 'busy' | 'ok', title, text, action: { label, act } | null }
 */
export const homeStatus = (d) => {
    const array = d.array || {};
    const now = d.now || new Date();
    const nowIso = array.pulse?.current_at;
    if (!d.configured)
        return { level: 'setup', title: 'Let’s set up your storage', text: 'Choose which disks keep your files and which keep the protection. It takes a few minutes, and every step is explained before it happens.', action: { label: 'Start the guided setup', act: 'setup' } };

    if (['failing', 'prefail'].includes(d.health))
        return { level: 'bad', title: 'A disk is failing', text: `${d.healthReason || 'A disk reports serious errors.'} Your files are still there. Replace the disk soon: the protection rebuilds its files on the new one.`, action: { label: 'See which disk', act: 'drives' } };
    if (d.health === 'degraded')
        return { level: 'bad', title: 'A disk is missing or was replaced', text: `${d.healthReason || 'A disk does not answer as expected.'} The automatic protection is paused until it is solved.`, action: { label: 'Fix it', act: 'recover' } };
    if (d.health === 'corrupt' || (array.blocks_bad || 0) > 0)
        return { level: 'bad', title: 'Some data is damaged', text: `${plural(array.blocks_bad || 0, 'block was', 'blocks were')} found damaged. The protection can usually repair them.`, action: { label: 'Repair now', act: 'heal' } };

    if (d.active)
        return { level: 'busy', title: `${taskTitle({ command: d.active.command }, true)}…`, text: d.active.progress != null ? `${d.active.progress}% done${d.active.eta_seconds ? `, about ${humanSpan(d.active.eta_seconds)} left` : ''}. You can keep using your files.` : 'You can keep using your files.', action: null };

    const blocked = blockedSync(d.tasks);
    // the files may be back since: then only the update is missing
    const latest = blocked ? (blocked.what === 'removed' ? array.diff_removed : array.diff_updated) : null;
    if (blocked && latest != null && latest < blocked.limit)
        return { level: 'warn', title: 'Update the protection now', text: `The last update stopped because ${plural(blocked.count, `file was ${blocked.what === 'removed' ? 'deleted' : 'changed'}`, `files were ${blocked.what === 'removed' ? 'deleted' : 'changed'}`)}. Now there are ${latest}: below the safety limit of ${blocked.limit}.`, action: { label: 'Protect now', act: 'protect' } };
    if (blocked)
        return { level: 'warn', title: 'The protection waits for your OK', text: `${plural(blocked.count, `file was ${blocked.what === 'removed' ? 'deleted' : 'changed'}`, `files were ${blocked.what === 'removed' ? 'deleted' : 'changed'}`)} since the last update, more than the safety limit of ${blocked.limit}. If it was on purpose, say so; if not, you can still get them back.`, action: { label: 'Look at it', act: 'protection' } };

    if ((d.diskProblems || 0) > 0)
        return { level: 'warn', title: 'A disk shows signs of wear', text: `${plural(d.diskProblems, 'disk reports', 'disks report')} errors or high temperature. Nothing is lost; keep an eye on it.`, action: { label: 'See the disks', act: 'drives' } };

    const sync = lastTask(d.tasks, 'sync', true);
    const changes = pendingChanges(array);
    const next = nextRun(d.config?.maintenance_schedule, now);
    const nextText = next ? `The next automatic update is ${whenWords(next, now)}.` : 'No automatic update is planned: set one in Protection.';
    // the history of the tasks is kept for some days only: "never" is told by the blocks
    if (!sync && array.blocks_count && array.blocks_unsynced >= array.blocks_count)
        return { level: 'warn', title: 'Your files are not protected yet', text: `The protection was never updated. ${nextText}`, action: { label: 'Protect now', act: 'protect' } };
    const age = sync ? secondsSince(sync.finished_at, nowIso) : null;
    if (age != null && age > 3 * 86400)
        return { level: 'warn', title: 'The protection is getting old', text: `It was last updated ${humanSpan(age)} ago: files changed since then cannot be rebuilt. ${nextText}`, action: { label: 'Protect now', act: 'protect' } };
    if (!next)
        return { level: 'warn', title: 'Automatic protection is off', text: `Nothing updates the protection by itself.${age != null ? ` It was last updated ${humanSpan(age)} ago.` : ''}`, action: { label: 'Turn it on', act: 'protection' } };

    return {
        level: 'ok', title: 'Your files are safe',
        text: `${age != null ? `Protected ${humanSpan(age)} ago` : 'Protected'}${changes ? `, ${plural(changes, 'file changed', 'files changed')} since then` : ''}. ${nextText}`,
        action: changes ? { label: 'Protect the changes now', act: 'protect' } : null
    };
};

/* ------------------------------------------------------------------ */
/* findings beyond the Storage advisor                                 */
/* ------------------------------------------------------------------ */

/**
 * SnapRAID Daemon runs on this machine too, on the same disks. Each daemon keeps
 * its own schedule and settings; avoiding a job done twice is left to the user,
 * so this only tells what DiskFlux does on its own, to keep each job in one of them.
 * @return A finding, or null when SnapRAID Daemon is not there or DiskFlux schedules nothing.
 */
export const snapraidDaemonFinding = (host, config) => {
    const sd = host?.snapraid_daemon;
    if (!sd || !(sd.running || sd.enabled) || !config)
        return null;
    const spin = String(config.spindown_idle_minutes ?? '').split(',').some(v => Number(v) > 0);
    const twice = [];
    if (config.maintenance_schedule)
        twice.push(`the maintenance (${config.maintenance_schedule})`);
    if (spin)
        twice.push('the spin-down of idle disks');
    if (config.notify_start || config.notify_result)
        twice.push('the alerts');
    const own = [];
    if (sd.shutdown_on)
        own.push('the power off after its jobs');
    if (config.hook_docker_pause)
        own.push('the pause of Docker containers');
    if (config.hook_script)
        own.push('the hook script');
    if (config.notify_heartbeat)
        own.push('the heartbeat ping');
    if (!twice.length && !own.length)
        return null;
    const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
    const where = sd.running ? 'is running on this server' : 'starts with this server';
    let text = `SnapRAID Daemon ${where}, on the same disks. Each one keeps its own schedule.`;
    if (twice.length)
        text += ` DiskFlux also does ${list(twice)}: keep each job in one of the two, and turn it off in the other.`;
    if (own.length)
        text += ` DiskFlux runs ${list(own)} around its own jobs, not around the ones of SnapRAID Daemon.`;
    return { level: 'warn', title: 'SnapRAID Daemon runs here too', text, action: { label: 'Open Protection', act: 'protection' } };
};

/**
 * Health checks of the machine, most serious first. Each is { level: bad|warn|tip, title, text, action: { label, act } }.
 */
export const machineFindings = ({ host, config, disks, nowIso }) => {
    const out = [];
    const add = (level, title, text, action = null) => out.push({ level, title, text, action });
    const facts = host?.facts || {};

    if (facts.root_total_bytes && facts.root_free_bytes < Math.min(2e9, facts.root_total_bytes * 0.05))
        add('bad', 'The system disk is almost full', `Only ${bytes(facts.root_free_bytes)} are free on the disk of the system. Logs and updates may fail.`);
    if (facts.log_free_bytes != null && facts.log_free_bytes < 5e8)
        add('warn', 'Little space left for the logs', `${bytes(facts.log_free_bytes)} free in ${facts.log_dir}. Without its logs the daemon forgets what it did.`);

    for (const b of host?.backups || []) {
        if (b.last_status != null && b.last_status !== 0 && b.last_status !== 207)
            add('bad', `The backup “${b.name}” failed`, b.last_message || 'See the Backups page.', { label: 'Open Backups', act: 'backups' });
    }

    const all = [...(disks?.data_disks || []), ...(disks?.parity_disks || [])];
    for (const d of all) {
        for (const dev of d.devices || []) {
            const st = dev.smart?.temperature_status;
            if (st === 'critical' || st === 'danger')
                add('bad', `${d.name} is too hot`, `It's at ${temp(dev.smart.temperature_celsius)}. Heat shortens the life of disks: check the fans and the air flow.`, { label: 'See the disks', act: 'drives' });
        }
    }

    for (const f of cacheFindings(host))
        out.push(f);

    if (config && !config.notify_result)
        add('warn', 'Nobody is told when something goes wrong', 'Problems are only shown here. Get a message on your phone or by email instead.', { label: 'Set up alerts', act: 'alerts' });
    if (host && !host.smart_tests?.short && !host.smart_tests?.long)
        add('tip', 'Disk self-tests are not scheduled', 'A short test every week and a long one every month find failing disks earlier.', { label: 'Schedule them', act: 'drives' });
    if (host && !(host.backups || []).length)
        add('tip', 'No backup copy', 'Protection rebuilds a failed disk, but a file deleted or overwritten by mistake is gone after the next update. A copy on another disk keeps it.', { label: 'Make a backup', act: 'backups' });
    if (host && (host.shares || []).some(s => s.smb !== false) && !facts.samba_ready && !host.tools?.smbd)
        add('warn', 'Shares are set but Samba is missing', 'Install the samba package so the other computers can open them.');
    if (host && host.facts && host.facts.clock_synchronized === false && host.tools?.systemctl)
        add('tip', 'The clock may not be synchronized', 'Schedules run on the clock of this machine. Turn on time synchronization (timedatectl set-ntp true).');
    const both = snapraidDaemonFinding(host, config);
    if (both)
        out.push(both);
    if (host?.can_upgrade && host.latest_daemon_version && versionCmp(host.latest_daemon_version, host.daemon_version) > 0)
        add('tip', `Version ${host.latest_daemon_version} is out`, `This server has ${host.daemon_version}. The update takes a minute and keeps every setting.`, { label: 'See the update', act: 'system' });
    void nowIso;

    const order = { bad: 0, warn: 1, tip: 2, ok: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
};

/* ------------------------------------------------------------------ */
/* fast disks                                                          */
/* ------------------------------------------------------------------ */

/**
 * What waits on a fast disk, as counted by the daemon: { files, bytes, more }.
 * 'more' tells that the count stopped at its limit.
 */
export const cacheWaiting = (c) => ({ files: c?.waiting_files || 0, bytes: c?.waiting_bytes || 0, more: !!c?.waiting_more });

/** The same in words: "3 files (12 MB) waiting", "empty". */
export const cacheWaitingWords = (c) => {
    const w = cacheWaiting(c);
    if (!w.files) return 'empty';
    return w.more ? `more than ${w.files} files waiting` : `${plural(w.files, 'file', 'files')} (${bytes(w.bytes)}) waiting`;
};

/** The line of the SnapRAID configuration that sets the temperature limit, however it was parsed. */
export const isTempLimit = (e) => (e.type === 'option' && e.key === 'temp_limit') || (e.type === 'raw' && /^\s*temp_limit(\s|$)/.test(e.raw || ''));

/** The temperature limit of a parsed SnapRAID configuration, or '' when there is none. */
export const confTempLimit = (conf) => {
    const e = (conf || []).find(isTempLimit);
    if (!e) return '';
    return String(e.type === 'option' ? e.value : (e.raw.trim().split(/\s+/)[1] || '')).trim();
};

/** What a fast disk does, in one sentence. */
export const cacheWords = (c) => {
    const when = c.when ? describeSchedule(c.when) : '';
    const age = Number(c.age_hours) > 0 ? `files not changed for ${plural(Number(c.age_hours), 'hour', 'hours')}` : 'every file';
    const parts = [when ? `${when}, ${age} is moved to the other disks` : 'Files are moved only when you press Move now'];
    if (Number(c.fill) > 0) parts.push(`at once when it is more than ${c.fill}% full`);
    const text = `${parts.join('; ')}${c.sync === false ? '' : '. Then the protection is updated'}.`;
    return text.charAt(0).toUpperCase() + text.slice(1);
};

/** What the home page says about the fast disks. */
export const cacheFindings = (host) => {
    const out = [];
    for (const c of host?.caches || []) {
        if (c.last_status != null && c.last_status !== 0 && c.last_status !== 499)
            out.push({ level: 'bad', title: `The move from the fast disk “${c.name}” failed`, text: c.last_message || 'See the Disks page.', action: { label: 'Open Disks', act: 'drives' } });
        else if (c.total_bytes && c.free_bytes < c.total_bytes * 0.05)
            out.push({ level: 'warn', title: `The fast disk “${c.name}” is full`, text: 'New files go straight to the big disks until it is emptied. Move its files now, or let it move them earlier.', action: { label: 'Open Disks', act: 'drives' } });
        else if (c.enabled === false || (!c.when && !(Number(c.fill) > 0)))
            out.push({ level: 'warn', title: `The fast disk “${c.name}” is never emptied`, text: 'Its files stay there, outside the protection. Set a time for the move.', action: { label: 'Open Disks', act: 'drives' } });
    }
    return out;
};

/* ------------------------------------------------------------------ */
/* folders kept on chosen disks                                        */
/* ------------------------------------------------------------------ */

/** A name for the setting of a folder kept on chosen disks, not yet taken. */
export const keepName = (rel, taken = []) => {
    const base = (String(rel || '').split('/').filter(Boolean).pop() || 'folder').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'folder';
    let name = base;
    for (let i = 2; taken.includes(name); ++i) name = `${base}-${i}`;
    return name;
};

/** The setting of a folder, if it has one: same pool and same path. */
export const keepOf = (keeps, pool, rel) => (keeps || []).find(k => k.pool === pool && k.path === rel) || null;

/** What keeping a folder on its disks means, in one sentence. */
export const keepWords = (k, diskName = (p) => p.split('/').pop()) => {
    const disks = String(k.disks || '').split(':').filter(Boolean).map(diskName);
    const list = disks.length > 1 ? `${disks.slice(0, -1).join(', ')} and ${disks[disks.length - 1]}` : disks[0] || '–';
    if (k.enabled === false || !k.when) return `Chosen: ${list}. Nothing is brought back by itself: use Tidy now.`;
    const when = describeSchedule(k.when);
    return `Kept on ${list}. New files that land on another disk are brought back ${when.charAt(0).toLowerCase()}${when.slice(1)}.`;
};

/** How a folder is spread over the disks, from the result of the 'usage' job. */
export const usageRows = (job) => (job?.result || []).map(r => {
    const [b, f] = String(r.value || '').split(' ');
    return { path: r.name, bytes: Number(b) || 0, files: Number(f) || 0 };
}).sort((a, b) => b.bytes - a.bytes);

/** The outcome of a move of files among disks, in plain words. */
export const moveWords = (job) => {
    if (!job) return '';
    const moved = `${plural(job.files || 0, 'file', 'files')} moved (${bytes(job.bytes || 0)})`;
    if (!job.success) return `${job.message || 'Not finished'}`;
    if (job.skipped) return `${moved}. ${plural(job.skipped, 'file was', 'files were')} left where ${job.skipped === 1 ? 'it was' : 'they were'}: see why below.`;
    return job.files ? `${moved}.` : 'There was nothing to move.';
};

/* ------------------------------------------------------------------ */
/* the first visit                                                     */
/* ------------------------------------------------------------------ */

export const TOUR = [
    { title: 'Welcome', text: 'This server keeps your files on several disks and protects them, so a broken disk does not cost you anything. Four things are worth knowing. It takes a minute.' },
    { title: 'Home tells you if all is well', text: 'One sentence at the top says how things are, and one button does what is needed. Green means there is nothing to do. Around it, tiles show the space, the disks, what comes next and what happened; “Needs your attention” lists anything to look at, most important first.' },
    { title: 'Your data and your server', text: 'The menu has two groups. “Your data”: My files, Sharing with the other computers, and Backups. “Your server”: the Disks, the Protection, Alerts and System. Each page starts with the everyday things. Ctrl K (Cmd K on a Mac) finds any page, disk, share or setting. Your name, top right, opens light or dark, your settings and the actions on the server.' },
    { title: 'Advanced is there when you want it', text: 'Pages and windows with finer controls have an “Advanced” switch. Leave it off and the usual choices are made for you; turn it on to see and change them. The switch is remembered for each page.' },
    { title: 'Nothing happens by surprise', text: 'Before anything is changed, a window tells what will happen and what stays as it is. After saving, the page reads the setting back and tells when it runs next. Help explains every word and the common jobs.' }
];

/* ------------------------------------------------------------------ */
/* notifications                                                       */
/* ------------------------------------------------------------------ */

const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export const CHANNELS = {
    ntfy: { label: 'Phone notification (ntfy)', fields: [['topic', 'Topic or full address', 'ntfy.sh/my-secret-topic']] },
    discord: { label: 'Discord', fields: [['url', 'Webhook address', 'https://discord.com/api/webhooks/…']] },
    telegram: { label: 'Telegram', fields: [['token', 'Bot token', '123456:ABC…'], ['chat', 'Chat ID', '123456789']] },
    email: { label: 'Email (local mail command)', fields: [['to', 'Address', 'me@example.com']] },
    webhook: { label: 'Other web address (POST)', fields: [['url', 'Address', 'https://…']] }
};

/** The command of the daemon (notify_result) that sends the report to a channel. */
export const notifyCommand = (channel, f) => {
    switch (channel) {
        case 'ntfy': {
            const topic = String(f.topic || '').trim();
            const url = /^https?:\/\//.test(topic) ? topic : topic.includes('/') ? `https://${topic}` : `https://ntfy.sh/${topic}`;
            return `curl -fsS --max-time 30 --retry 3 -H "Title: %s" -H "Priority: %n" -H "Tags: %t" --data-binary @- ${shq(url)}`;
        }
        case 'discord':
            return `curl -fsS --max-time 30 --retry 3 -H "Content-Type: application/json" -d "{\\"content\\": \\"%s\\"}" ${shq(f.url)}`;
        case 'telegram':
            return `curl -fsS --max-time 30 --retry 3 --data-urlencode "chat_id=${String(f.chat).replace(/[^0-9-]/g, '')}" --data-urlencode "text=%s" ${shq(`https://api.telegram.org/bot${f.token}/sendMessage`)}`;
        case 'email':
            return `mail -s "%s" ${shq(f.to)}`;
        case 'webhook':
            return `curl -fsS --max-time 30 --retry 3 -H "Title: %s" --data-binary @- ${shq(f.url)}`;
        default:
            return '';
    }
};

/** Recognize a command made by notifyCommand, to show it as a form again. */
export const notifyParse = (cmd) => {
    if (!cmd) return { channel: '', fields: {} };
    const quoted = (re) => { const m = cmd.match(re); return m ? m[1].replace(/'\\''/g, "'") : ''; };
    if (/api\.telegram\.org\/bot/.test(cmd))
        return { channel: 'telegram', fields: { token: quoted(/api\.telegram\.org\/bot([^/']+)\/sendMessage/), chat: quoted(/chat_id=([0-9-]+)/) } };
    if (/discord(app)?\.com\/api\/webhooks/.test(cmd))
        return { channel: 'discord', fields: { url: quoted(/'(https:\/\/[^']+)'$/) } };
    if (/^mail -s/.test(cmd))
        return { channel: 'email', fields: { to: quoted(/'([^']+)'$/) } };
    if (/-H "Priority: %n"/.test(cmd)) {
        const url = quoted(/'(https?:\/\/[^']+)'$/);
        return { channel: 'ntfy', fields: { topic: url.replace(/^https:\/\/ntfy\.sh\//, '') } };
    }
    if (/^curl .*--data-binary @- '/.test(cmd))
        return { channel: 'webhook', fields: { url: quoted(/'(https?:\/\/[^']+)'$/) } };
    return { channel: 'custom', fields: { command: cmd } };
};

/* ------------------------------------------------------------------ */
/* tool outputs                                                        */
/* ------------------------------------------------------------------ */

/**
 * The files a check or a scrub complained about, from the messages of its task.
 * \return [{ path, problem }]
 */
export const damagedFiles = (task) => {
    const out = [];
    const seen = new Set();
    for (const m of task?.messages || []) {
        const t = m.text || '';
        const hit = t.match(/^(?:File|Data error in file|Error reading file|Unexpected .* in file) '([^']+)'(?:[ :,]+(.*))?$/) || t.match(/'([^']+)'.*(error|larger|smaller|missing|damaged)/i);
        if (hit && !seen.has(hit[1])) {
            seen.add(hit[1]);
            const problem = (hit[2] || '').replace(/\.$/, '');
            // a size or a time different from the last update is a change, not damage
            const changed = /larger|smaller|timestamp|time|size|missing/i.test(problem) && !/data error|damaged|unrecoverable/i.test(t);
            out.push({ path: hit[1], problem, kind: changed ? 'changed' : 'damaged' });
        }
    }
    return out;
};

/** What the self-test log of a disk says, in short. */
export const selfTestSummary = (text) => {
    const t = text || '';
    const running = t.match(/Self-test routine in progress[\s\S]*?(\d+)% of test remaining/);
    if (running) return { state: 'running', remaining: Number(running[1]), text: `Testing, ${100 - Number(running[1])}% done` };
    const line = t.split('\n').find(l => /^#\s*1\s/.test(l));
    if (!line) return { state: 'none', text: 'Never tested' };
    if (/Completed without error/.test(line)) return { state: 'ok', text: `Last test (${/Extended|long/i.test(line) ? 'long' : 'short'}) passed` };
    if (/in progress/i.test(line)) return { state: 'running', text: 'Testing' };
    if (/Aborted|Interrupted/i.test(line)) return { state: 'warn', text: 'Last test was interrupted' };
    return { state: 'bad', text: 'Last test found errors' };
};

/** Name a share from a folder: "/mnt/storage/My Movies" -> "My-Movies". */
export const shareNameOf = (path) => (path.split('/').filter(Boolean).pop() || 'share').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'share';

/** Addresses to open a share from the other computers. */
export const shareAddresses = (host, name) => ({ windows: `\\\\${host}\\${name}`, mac: `smb://${host}/${name}`, linux: `smb://${host}/${name}` });

/* ------------------------------------------------------------------ */
/* bays                                                                */
/* ------------------------------------------------------------------ */

/** The bay map with defaults: { rows, cols, slots: { diskId: bayIndex }, info: { diskId: { bought, note } } } */
export const bayDoc = (doc, diskCount) => {
    const d = doc && typeof doc === 'object' ? doc : {};
    const n = Math.max(1, diskCount);
    const cols = Number(d.cols) > 0 ? Math.min(12, Number(d.cols)) : Math.min(n, 4);
    const rows = Number(d.rows) > 0 ? Math.min(12, Number(d.rows)) : Math.ceil(n / cols);
    const slots = {};
    for (const [k, v] of Object.entries(d.slots || {})) {
        if (Number.isInteger(v) && v >= 0 && v < rows * cols) slots[k] = v;
    }
    return { rows, cols, slots, info: d.info && typeof d.info === 'object' ? d.info : {} };
};

/** The disk in a bay, or null. */
export const bayHolder = (doc, bay) => Object.keys(doc.slots).find(k => doc.slots[k] === bay) || null;

/**
 * What putting a disk in a bay does: { kind, other, to }.
 * kind: 'same' (it is there already), 'free', 'swap' (the other one goes to its old bay `to`)
 * or 'out' (the other one goes back to the disks not in the picture).
 */
export const bayEffect = (doc, diskId, bay) => {
    const other = bayHolder(doc, bay);
    if (other === diskId) return { kind: 'same', other: null, to: null };
    if (!other) return { kind: 'free', other: null, to: null };
    const from = doc.slots[diskId];
    return from != null ? { kind: 'swap', other, to: from } : { kind: 'out', other, to: null };
};

/** Place a disk in a bay (null takes it out of the picture). A disk already there swaps with it, or goes back to the unplaced ones. */
export const bayPlace = (doc, diskId, bay) => {
    const slots = { ...doc.slots };
    if (bay == null) {
        delete slots[diskId];
        return { ...doc, slots };
    }
    const fx = bayEffect(doc, diskId, bay);
    if (fx.kind === 'swap') slots[fx.other] = fx.to;
    else if (fx.kind === 'out') delete slots[fx.other];
    slots[diskId] = bay;
    return { ...doc, slots };
};

/** The free bays, first to last. */
export const bayFree = (doc) => {
    const used = new Set(Object.values(doc.slots));
    return Array.from({ length: doc.rows * doc.cols }, (_, i) => i).filter(i => !used.has(i));
};

/** Put the disks in the free bays, in their order; the ones that don't fit stay out. */
export const bayFill = (doc, ids) => {
    const free = bayFree(doc);
    const slots = { ...doc.slots };
    ids.filter(id => slots[id] == null).forEach((id, i) => { if (i < free.length) slots[id] = free[i]; });
    return { ...doc, slots };
};

/** Row and column of a bay, counted from 1. */
export const bayRowCol = (doc, bay) => ({ row: Math.floor(bay / doc.cols) + 1, col: (bay % doc.cols) + 1 });

/** The pool showing the files of a disk mounted at `mount`: a branch is the mount or a folder in it. */
export const poolOfMount = (pools, mount) => {
    const m = String(mount || '').replace(/\/+$/, '');
    if (!m) return null;
    return (pools || []).find(p => (p.branches || []).some(b => {
        const path = String(b.path || '').replace(/\/+$/, '');
        return path === m || path.startsWith(m + '/');
    })) || null;
};

/** Where a pool puts new files, in one sentence. */
export const poolPolicyWords = (policy) => {
    const p = String(policy || '').trim();
    const words = {
        mfs: 'New files go to the disk with the most free space.',
        pfrd: 'New files go to a disk chosen at random, more often an emptier one.',
        lfs: 'New files fill one disk before the next.',
        ff: 'New files go to the first disk of the list with room.',
        lus: 'New files go to the least used disk.',
        rand: 'New files go to a disk chosen at random.'
    };
    if (words[p]) return words[p];
    if (p.startsWith('ep')) return 'New files follow their folder, to a disk that has it.';
    return p ? `New files are placed by the rule “${p}”.` : 'New files go to the disk with the most free space.';
};

/**
 * What happens when a disk is pulled out of the case: { level, head, lines }.
 * d: { role, array, pool, poolOthers, levels (protection levels of its array), level (1-based, for a parity),
 *      part, parts, missing, cache, usb, mount }
 */
export const pullOutWords = (d) => {
    const list = (names) => names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
    if (d.missing) return { level: 'bad', head: 'It is not found already', lines: ['Check its cable and its power, or replace it.'] };
    if (d.role === 'data' && d.array) {
        const lines = [];
        if (d.pool && d.poolOthers?.length) lines.push(`The files on ${list(d.poolOthers)} stay; the pool keeps working.`);
        if (d.levels > 0) {
            lines.push(`${d.array} can rebuild them on a new disk from its protection, as of its last update.`);
            lines.push(`Updates of the protection of ${d.array} wait until it is back or replaced, so nothing is lost by mistake.`);
        } else {
            lines.push(`${d.array} has no protection yet: only a backup has its files.`);
        }
        return { level: 'warn', head: d.pool ? `Its files leave ${d.pool} until it is back` : 'Its files can’t be opened until it is back', lines };
    }
    if (d.role === 'parity' && d.array) {
        const left = Math.max(0, (d.levels || 1) - 1);
        const lines = [];
        if (d.parts > 1) lines.push(`Its ${d.parts} parts together make one level: without one part the level is gone.`);
        lines.push('Every file stays readable.');
        lines.push(left ? `${plural(left, 'more failed disk', 'more failed disks')} can still be rebuilt, not ${left + 1}.` : 'A disk that fails meanwhile can’t be rebuilt.');
        return left
            ? { level: 'warn', head: `${d.array} keeps ${left} of its ${d.levels} levels of protection`, lines }
            : { level: 'bad', head: `${d.array} has no protection until it is back`, lines };
    }
    if (d.cache) return { level: 'bad', head: `The files waiting on it leave ${d.pool || 'the pool'}`, lines: ['They are not protected yet: press Move now on the fast disk first.'] };
    if (d.pool) return { level: 'bad', head: `Its files leave ${d.pool}, and nothing can rebuild them`, lines: ['No array protects this disk: only a backup has its files.', ...(d.poolOthers?.length ? [`The other disks of ${d.pool} keep working.`] : [])] };
    if (d.usb) return { level: 'ok', head: 'No array or pool is affected', lines: ['Press Eject first, so everything is written.'] };
    if (d.mount) return { level: 'warn', head: 'No array or pool is affected', lines: [`The programs using ${d.mount} lose it.`] };
    if (['blank', 'unmounted', 'unformatted'].includes(d.role)) return { level: 'ok', head: 'Nothing uses it', lines: ['It can be taken out at any time.'] };
    return { level: 'tip', head: 'Something else uses it', lines: ['DiskFlux does not manage it: check what uses it first.'] };
};

export const __test = { shq };

/* ------------------------------------------------------------------ */
/* alerts on more channels at once                                     */
/* ------------------------------------------------------------------ */

/** The address of an ntfy topic, as typed: a name, a host/name or a full address. */
export const ntfyUrl = (topic) => {
    const t = String(topic || '').trim();
    return /^https?:\/\//.test(t) ? t : t.includes('/') ? `https://${t}` : `https://ntfy.sh/${t}`;
};

/** A channel of the form as a line of the daemon: "kind=ntfy<TAB>url=https://…". */
export const alertLine = (channel, f) => {
    const v = (x) => String(x || '').trim();
    switch (channel) {
        case 'ntfy': return v(f.topic) ? `kind=ntfy\turl=${ntfyUrl(f.topic)}` : '';
        case 'discord': return v(f.url) ? `kind=discord\turl=${v(f.url)}` : '';
        case 'webhook': return v(f.url) ? `kind=webhook\turl=${v(f.url)}` : '';
        case 'telegram': return v(f.token) && v(f.chat) ? `kind=telegram\ttoken=${v(f.token)}\tchat=${v(f.chat).replace(/[^0-9-]/g, '')}` : '';
        case 'email': return v(f.to) ? `kind=email\tto=${v(f.to)}` : '';
        default: return '';
    }
};

/** A channel the daemon gives back ({ kind, url, token, chat, to }) as the form shows it. */
export const alertForm = (c) => {
    switch (c?.kind) {
        case 'ntfy': return { channel: 'ntfy', fields: { topic: String(c.url || '').replace(/^https:\/\/ntfy\.sh\//, '') } };
        case 'discord': case 'webhook': return { channel: c.kind, fields: { url: c.url || '' } };
        case 'telegram': return { channel: 'telegram', fields: { token: c.token || '', chat: c.chat || '' } };
        case 'email': return { channel: 'email', fields: { to: c.to || '' } };
        default: return null;
    }
};

/** The command of the reports is the script of the daemon that sends to more channels. */
export const isAlertScript = (cmd) => /\/diskflux-alerts\.sh "%s" "%n" "%t"$/.test(String(cmd || ''));

/** What the Alerts page says about where the messages go. */
export const alertSummary = (list) => {
    const names = (list || []).map(x => {
        const def = CHANNELS[x.channel];
        if (!def) return 'a custom command';
        const f = x.fields || {};
        return x.channel === 'email' ? `email to ${f.to}` : x.channel === 'ntfy' ? `ntfy topic ${String(f.topic || '').split('/').pop()}` : def.label.replace(/ \(.*\)$/, '');
    });
    if (!names.length) return 'Messages go nowhere: problems show only on these pages.';
    if (names.length === 1) return `Messages go to ${names[0]}.`;
    return `Messages go to ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}, all of them every time.`;
};

/* ------------------------------------------------------------------ */
/* record of the runs                                                  */
/* ------------------------------------------------------------------ */

const RUN_TITLES = { sync: 'Protection updated', scrub: 'Checked for damage', fix: 'Repair', check: 'Full check' };

/** One run of the record in words: { title, detail, level: ok | warn | bad, problems } */
export const runWords = (r) => {
    const found = (r.errors_io || 0) + (r.errors_data || 0);
    const title = RUN_TITLES[r.command] || r.command;
    const bits = [];
    if (r.command === 'sync' && (r.added || r.removed || r.updated)) bits.push(`${[r.added ? `${r.added} added` : '', r.updated ? `${r.updated} changed` : '', r.removed ? `${r.removed} deleted` : ''].filter(Boolean).join(', ')}`);
    if (r.errors_data) bits.push(`${plural(r.errors_data, 'block with silent damage', 'blocks with silent damage')}`);
    if (r.errors_io) bits.push(`${plural(r.errors_io, 'read error', 'read errors')} of a disk`);
    if (r.recovered) bits.push(`${plural(r.recovered, 'error', 'errors')} repaired`);
    if (r.unrecoverable) bits.push(`${plural(r.unrecoverable, 'error', 'errors')} that could not be repaired`);
    if (r.result === 'stopped') return { title: `${title}: stopped`, detail: ['Stopped before the end, the next run goes on from there.', ...bits].join(' '), level: 'warn', problems: found };
    if (r.unrecoverable) return { title, detail: bits.join(', '), level: 'bad', problems: found };
    // a repair finds what it repairs: that is its success
    if (r.command === 'fix' && r.result !== 'error') return { title, detail: bits.length ? bits.join(', ') : 'Nothing needed a repair.', level: 'ok', problems: 0 };
    if (found) return { title: `${title}: problems found`, detail: `${bits.join(', ')}.${r.command === 'fix' ? '' : ' Use Repair on the Home page.'}`, level: 'bad', problems: found };
    if (r.result === 'error') return { title: `${title}: did not finish`, detail: bits.length ? bits.join(', ') : 'See every detail for the reason.', level: 'bad', problems: 0 };
    return { title, detail: bits.length ? bits.join(', ') : r.command === 'sync' ? 'Nothing had changed.' : 'No problem found.', level: 'ok', problems: 0 };
};

/** The sum of the record, in one sentence. */
export const runsSummary = (rec, nowIso) => {
    if (!rec?.total) return 'No run recorded yet.';
    const since = rec.since ? ` in ${humanSpan(secondsSince(rec.since, nowIso))}` : '';
    const head = `${plural(rec.total, 'run', 'runs')}${since}`;
    if (!rec.errors_found && !rec.errors_fixed && !rec.errors_lost) return `${head}, no damage found.`;
    return `${head}: ${plural(rec.errors_found, 'error', 'errors')} found, ${rec.errors_fixed} repaired${rec.errors_lost ? `, ${rec.errors_lost} that could not be repaired` : ''}.`;
};

/* ------------------------------------------------------------------ */
/* battery backup (UPS)                                                */
/* ------------------------------------------------------------------ */

/** The state of the UPS in words: { level, text } */
export const upsWords = (u) => {
    if (!u || !u.configured || u.state === 'off') return { level: 'tip', text: 'Not watched' };
    const left = [u.charge >= 0 ? `${u.charge}%` : '', u.runtime_seconds >= 0 ? `about ${humanSpan(u.runtime_seconds)} left` : ''].filter(Boolean).join(', ');
    switch (u.state) {
        case 'online': return { level: 'ok', text: `On the mains${left ? ` · battery ${left}` : ''}` };
        case 'battery': return { level: 'warn', text: `Power cut: on battery${left ? `, ${left}` : ''}` };
        case 'low': return { level: 'bad', text: `Battery low${left ? `: ${left}` : ''}` };
        default: return { level: 'bad', text: u.error || 'The UPS does not answer' };
    }
};

/** The name of a UPS for people: "labups" for nut:labups, "APC (apcupsd)" for apc. */
export const upsName = (id) => id === 'apc' ? 'APC (apcupsd)' : String(id || '').replace(/^nut:/, '');

/* ------------------------------------------------------------------ */
/* the tiles of Home                                                   */
/* ------------------------------------------------------------------ */

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * The last nights, one mark each, from the record of the runs of every array.
 * level: bad (a run failed or found damage it could not repair), warn (stopped),
 * checked (checked for damage), updated (protection updated), none.
 */
export const nightsStrip = (runs, now = new Date(), days = 14) => {
    const byDay = new Map();
    for (const r of runs || []) {
        const at = new Date(r.finished_at);
        if (Number.isNaN(at.getTime())) continue;
        const k = dayKey(at);
        const list = byDay.get(k) || [];
        list.push(r);
        byDay.set(k, list);
    }
    const out = [];
    for (let i = days - 1; i >= 0; --i) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const list = byDay.get(dayKey(d)) || [];
        const words = list.map(runWords);
        let level = 'none';
        if (words.some(w => w.level === 'bad')) level = 'bad';
        else if (words.some(w => w.level === 'warn')) level = 'warn';
        else if (list.some(r => r.command === 'scrub' || r.command === 'check')) level = 'checked';
        else if (list.length) level = 'updated';
        const text = list.length ? list.map(r => `${r.array}: ${runWords(r).title}`).join('; ') : 'Nothing ran';
        out.push({ day: d.getDate(), weekday: DAYS[d.getDay()].slice(0, 3), level, text, today: i === 0 });
    }
    return out;
};

/** When the space runs out, from the samples of the daemon: { level, text } */
export const forecastWords = (f) => {
    if (!f || !f.total_bytes) return { level: 'tip', text: 'No data disk measured yet.' };
    const free = Math.max(0, f.total_bytes - f.used_bytes);
    if (!f.forecast) return { level: 'tip', text: 'A forecast comes after a week of daily measures.' };
    const growth = f.growth_bytes_per_day || 0;
    if (growth <= 0 || f.days_to_full == null) return { level: 'ok', text: 'Not growing over the last 90 days.' };
    const daysLeft = f.days_to_full;
    const pace = `${bytes(growth * 30)} a month`;
    if (daysLeft < 45) return { level: daysLeft < 14 ? 'bad' : 'warn', text: `At ${pace}, full in about ${plural(Math.max(1, daysLeft), 'day', 'days')}.` };
    if (daysLeft < 730) return { level: daysLeft < 120 ? 'warn' : 'ok', text: `At ${pace}, full in about ${plural(Math.round(daysLeft / 30.4), 'month', 'months')}.` };
    return { level: 'ok', text: `At ${pace}, ${bytes(free)} last more than two years.` };
};

/** Percent of the data read back for damage in the last days, from the scrub history of an array. */
export const checkedWithin = (hist, days = 30) => {
    if (!hist?.points?.length) return null;
    let sum = 0;
    for (const p of hist.points) if (p.ago <= days) sum += p.scrubbed || 0;
    return Math.min(100, Math.round(sum));
};

/** The scrub history in five spans of age: [{ label, pct }] */
export const SCRUB_SPANS = [[0, 7, '0–7 days'], [8, 14, '8–14 days'], [15, 30, '15–30 days'], [31, 60, '31–60 days'], [61, Infinity, 'over 60 days']];
export const scrubAges = (hist) => {
    const out = SCRUB_SPANS.map(([lo, hi, label]) => ({ lo, hi, label, pct: 0 }));
    for (const p of hist?.points || []) {
        const span = out.find(s => p.ago >= s.lo && p.ago <= s.hi);
        if (span) span.pct += (p.scrubbed || 0) + (p.new || 0);
    }
    return out.map(s => ({ label: s.label, pct: Math.round(s.pct * 10) / 10 }));
};

/** A time to come, short: "Tonight 02:00", "Tomorrow 05:00", "Sat 04:30", "1 Dec 04:00" */
export const shortWhen = (date, now = new Date()) => {
    if (!date) return '';
    const days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    const t = hhmm({ hour: date.getHours(), minute: date.getMinutes() });
    if (days === 0) return `${date.getHours() >= 18 || date.getHours() < 5 ? 'Tonight' : 'Today'} ${t}`;
    if (days === 1) return `${date.getHours() < 5 ? 'Tonight' : 'Tomorrow'} ${t}`;
    if (days < 7) return `${DAYS[date.getDay()].slice(0, 3)} ${t}`;
    return `${dateText(date, { year: 'other', now })} ${t}`;
};

/** What the server does by itself next, the soonest first: [{ at, what, sub }] */
export const comingUp = ({ config, host }, now = new Date(), max = 4) => {
    const list = [];
    const add = (when, what, sub) => {
        const at = nextRun(when, now);
        if (at) list.push({ at, what, sub });
    };
    if (config?.maintenance_schedule) {
        const pct = Number(config.scrub_percentage) || 0;
        add(config.maintenance_schedule, 'Update the protection', pct ? `then check ${pct}% of the data for damage` : 'of every array');
    }
    add(host?.smart_tests?.short, 'Short disk self-test', 'all the disks, a few minutes');
    add(host?.smart_tests?.long, 'Long disk self-test', 'all the disks, some hours');
    for (const b of host?.backups || []) if (b.enabled !== false && b.when) add(b.when, `Backup “${b.name}”`, b.source || '');
    for (const c of host?.caches || []) if (c.enabled !== false && c.when) add(c.when, 'Move from the fast disk', c.pool || '');
    return list.sort((a, b) => a.at - b.at).slice(0, max);
};

const EVENT_JOBS = {
    wipe: 'Disk erased', burnin: 'Write test of a disk', surface: 'Reading test of a disk', move: 'Files moved to other disks',
    empty: 'Disk emptied', mover: 'Files moved from the fast disk', copy: 'Copy', permissions: 'Permissions reset',
    format: 'Disk prepared', balance: 'Disks balanced', parity_move: 'Protection moved to a larger disk'
};

/** An event of the machine in words: { level, title, detail } */
export const eventWords = (e) => {
    const level = ['ok', 'info', 'warn', 'bad'].includes(e.level) ? (e.level === 'info' ? 'tip' : e.level) : 'tip';
    switch (e.kind) {
        case 'power_cut': return { level, title: 'Power cut', detail: e.text };
        case 'power_back': return { level, title: 'Power back', detail: e.text };
        case 'power_shutdown': return { level, title: 'Battery running out', detail: e.text };
        case 'idle': return { level, title: 'Went to sleep', detail: e.text };
        case 'usb_open': return { level, title: 'USB disk opened', detail: e.text ? `Its files are in ${e.text}` : '' };
        case 'usb_eject': return { level, title: `USB disk ${e.target} ejected`, detail: e.text };
        case 'backup': return { level, title: `Backup “${e.target}” ${level === 'ok' ? 'finished' : level === 'warn' ? 'did not copy everything' : 'failed'}`, detail: e.text };
        case 'upgrade_start': return { level: 'tip', title: `Update to ${e.target === 'latest' ? 'the latest version' : e.target} started`, detail: e.text };
        case 'upgrade': return { level, title: level === 'ok' ? `Updated to ${e.target}` : `Update to ${e.target} failed`, detail: e.text };
        case 'login': return { level, title: 'Login of this page changed', detail: e.text };
        case 'look': return { level, title: `Look of the pages changed to ${lookName(e.target)}`, detail: e.text };
        case 'power': return { level, title: SERVER_EVENT[e.target] || 'Server action', detail: e.target === 'cancel' ? `${e.text}: cancelled` : e.text };
        default: {
            const words = EVENT_JOBS[e.kind] || e.kind;
            return { level, title: level === 'ok' ? words : `${words}: ${level === 'warn' ? 'stopped' : 'failed'}`, detail: e.text };
        }
    }
};

/** Search of the palette: the items with every word of the query, the best first. */
export const paletteMatch = (items, query, max = 12) => {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items.slice(0, max);
    const scored = [];
    for (const it of items) {
        const label = it.label.toLowerCase();
        const hay = `${label} ${(it.keys || '').toLowerCase()} ${(it.group || '').toLowerCase()}`;
        if (!words.every(w => hay.includes(w))) continue;
        let score = 0;
        if (label.startsWith(words[0])) score += 4;
        else if (label.split(/[^a-z0-9]+/).some(p => p.startsWith(words[0]))) score += 2;
        if (words.every(w => label.includes(w))) score += 1;
        scored.push({ it, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, max).map(x => x.it);
};

/* ------------------------------------------------------------------ */
/* updates of the daemon                                               */
/* ------------------------------------------------------------------ */

/**
 * Compare two versions, part by part as numbers: negative, 0 or positive.
 * DiskFlux releases are MAJOR.MINOR.PATCH, like 1.0.0, and come after the
 * releases of the earlier package, like 2.2.s14 (".sN" after the version of
 * SnapRAID Daemon it was built on), whatever the numbers.
 */
export const versionCmp = (a, b) => {
    // the earlier package (2.2.s14, or a build after it) before every version of DiskFlux,
    // MAJOR.MINOR.PATCH, whatever the numbers
    const earlier = (v) => /\.s\d/.test(String(v || ''));
    const diskflux = (v) => !earlier(v) && /^v?\d+\.\d+\.\d+(\.|$)/.test(String(v || ''));
    if (earlier(a) && diskflux(b)) return -1;
    if (diskflux(a) && earlier(b)) return 1;
    const parts = (v) => String(v || '').replace(/^v/, '').split('.').map(p => /^s\d+$/.test(p) ? { fork: Number(p.slice(1)) } : { n: Number(p) || 0 });
    const x = parts(a);
    const y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); ++i) {
        const p = x[i];
        const q = y[i];
        if (!p || !q) {
            // 2.2 before 2.2.s1 and before 2.2.1
            return p ? 1 : q ? -1 : 0;
        }
        if (p.fork != null || q.fork != null) {
            // a fork release after a further upstream part is not compared to it: 2.2.s9 before 2.2.1
            if (p.fork == null) return 1;
            if (q.fork == null) return -1;
            if (p.fork !== q.fork) return p.fork - q.fork;
            continue;
        }
        if (p.n !== q.n) return p.n - q.n;
    }
    return 0;
};

/**
 * What the Updates card says, from GET host/upgrade and the releases if they
 * were read: { level, title, text, target, older, running }.
 * target: the version the main button installs, or ''.
 */
export const upgradeWords = (u, releases = null, nowSec = Date.now() / 1000) => {
    const cur = u?.daemon_version || '';
    const latest = releases?.length ? releases[0].version : (u?.latest_daemon_version || '');
    const last = u?.last;
    if (last?.state === 'running')
        return { level: 'tip', title: `Updating to ${last.to || 'the latest version'}…`, text: last.message || 'The daemon restarts at the end, and this page reconnects by itself.', target: '', running: true };
    if (!u?.available)
        return { level: 'tip', title: `This server has version ${cur}`, text: u?.unavailable_reason || 'It cannot update itself.', target: '' };
    const failed = last?.state === 'failed' && last.finished && nowSec - last.finished < 7 * 86400;
    const failNote = failed ? `The last update, to ${last.to}, failed: ${last.message}` : '';
    if (latest && versionCmp(latest, cur) > 0)
        return { level: failed ? 'warn' : 'tip', title: `Version ${latest} is available`, text: failNote || `This server has ${cur}. The update keeps every setting, and the page reconnects by itself.`, target: latest };
    if (latest)
        return { level: failed ? 'warn' : 'ok', title: 'Up to date', text: failNote || `This server has ${cur}, the latest version.`, target: '' };
    return { level: failed ? 'warn' : 'tip', title: `This server has version ${cur}`, text: failNote || 'Check to see if a newer one is out.', target: '' };
};

/* ------------------------------------------------------------------ */
/* login of the pages                                                  */
/* ------------------------------------------------------------------ */

export const LOGIN_PASSWORD_MIN = 8;
export const LOGIN_PASSWORD_MAX = 256;
export const LOGIN_USER_MAX = 64;

/**
 * What the Login card of System shows, from the "login" of GET host:
 * { mode, level, title, text }, or null when the daemon does not tell (older one).
 * mode: 'change' a login is set and can be changed, with the current password;
 *       'first'  no login, and this browser is on the server: it can be set;
 *       'remote' no login, and this browser is elsewhere: only explained;
 *       'off'    the server does not let the login be changed from here.
 */
export const loginWords = (login) => {
    if (!login) return null;
    if (!login.change)
        return { mode: 'off', level: 'tip', title: login.set ? `You are logged in as ${login.user}` : 'This server asks for no login', text: 'On this server the login cannot be changed from this page.' };
    if (login.set)
        return { mode: 'change', level: 'ok', title: `This page asks for a login: ${login.user}`, text: 'Change the name, the password, or both. The current password is asked to be sure it is you.' };
    if (login.local)
        return { mode: 'first', level: 'warn', title: 'This page asks for no login', text: 'Whoever can reach this page can change the server. Set a name and a password to keep it to yourself.' };
    return { mode: 'remote', level: 'warn', title: 'This page asks for no login', text: 'Whoever can reach this page can change the server. For safety the first login is set only from the server itself: open this page in a browser on the server, and come back here.' };
};

/**
 * What is wrong in the form of the login, or '' when it can be sent.
 * f: { user, password, repeat, current }. The same rules of the daemon.
 */
export const loginProblem = (f, login) => {
    const user = f.user || '';
    const password = f.password || '';
    if (!user) return 'Write a name';
    if (user.length > LOGIN_USER_MAX) return `The name can have ${LOGIN_USER_MAX} characters at most`;
    if (!/^[A-Za-z0-9._@-]+$/.test(user)) return 'The name can have only letters without accents, digits and . _ - @';
    if (!password && !login?.set) return 'Write a password';
    if (!password && user === login?.user) return 'Nothing to change: write another name or a new password';
    if (password) {
        if (password.length < LOGIN_PASSWORD_MIN) return `The password needs at least ${LOGIN_PASSWORD_MIN} characters`;
        if (new TextEncoder().encode(password).length > LOGIN_PASSWORD_MAX) return 'The password is too long';
        // eslint-disable-next-line no-control-regex
        if (/[\u0000-\u001f\u007f]/.test(password)) return 'The password cannot have line breaks';
        if (password !== (f.repeat || '')) return 'The two passwords are not the same';
    }
    if (login?.set && !f.current) return 'Write the current password';
    return '';
};

/** The confirmation of a change of the login: { title, effects, safe, label }. */
export const loginConfirm = (f, login) => {
    const first = !login?.set;
    const renamed = !first && f.user !== login.user;
    const what = first ? `the name “${f.user}” and the password you wrote` : renamed && !f.password ? `the name “${f.user}”, with the same password` : renamed ? `the name “${f.user}” and the new password` : `the new password, with the same name “${f.user}”`;
    return {
        title: first ? 'Set the login' : 'Change the login',
        effects: [
            `From now on this page asks for ${what}.`,
            first ? 'Your browser asks for it right away, and so does every other browser, phone or program that uses this server.' : 'Your browser asks for it right away. Every other browser, phone or program logged in with the old one is asked again too.',
            'The password cannot be shown again or sent by email: write it down now. If it is lost, a new one is set on the server itself.'
        ],
        safe: ['The arrays, the disks and the files.', 'The shares and the passwords of their users.', first ? 'Every other setting.' : 'Every other setting. Until you confirm, the old login stays.'],
        label: first ? 'Set the login' : 'Change the login'
    };
};

/* ------------------------------------------------------------------ */
/* the look of the pages                                               */
/* ------------------------------------------------------------------ */

/** The looks, in the order they are offered, with what each one is. */
export const LOOKS = [
    { id: 'quiet', name: 'Quiet', words: 'Calm tiles with one clear action on each page. The look DiskFlux starts with.' },
    { id: 'console', name: 'Console', words: 'The same pages as an instrument panel: letters of one width, and the command behind each button. Starts dark.' },
    { id: 'commander', name: 'Commander', words: 'The dashboard of SnapRAID Daemon, with the pages of DiskFlux.' },
    { id: 'brutale', name: 'Brutale', words: 'High contrast, thick lines, loud colours.' }
];

export const lookName = (id) => LOOKS.find(l => l.id === id)?.name || id;

/**
 * What the card of the look shows, from the "look" of GET /host and whether
 * this browser may change the server:
 *   mode    'choose' (buttons), 'fixed' (shown, cannot be changed from here),
 *           'own' (pages that are not a look), 'old' (a daemon that does not say)
 *   why     for the modes without buttons, the reason in one sentence
 *   cards   the looks on this server, the one in use marked
 */
export const lookCard = (look, admin = true) => {
    if (!look || typeof look.current !== 'string')
        return { mode: 'old', why: 'The look of the pages (Quiet, Console, Commander or Brutale) is set on the server, in net_web_root of diskflux.conf.', cards: [] };
    if (!look.current)
        return { mode: 'own', why: 'This server shows pages of its own, not one of the looks of DiskFlux. They are set in net_web_root of diskflux.conf, and are changed there.', cards: [] };
    const on = new Set(look.choices || []);
    on.add(look.current);
    const cards = LOOKS.filter(l => on.has(l.id)).map(l => ({ ...l, current: l.id === look.current }));
    if (cards.length < 2)
        return { mode: 'fixed', why: 'Only this look is installed on this server.', cards };
    if (!admin)
        return { mode: 'fixed', why: 'This page cannot change the server: set net_storage_admin = 1 in diskflux.conf to choose the look from here.', cards };
    return { mode: 'choose', why: '', cards };
};

/** The window that asks before the look changes. */
export const lookConfirm = (to, from) => ({
    title: `Change the look to ${lookName(to)}`,
    intro: 'The look belongs to the server, not to this browser.',
    effects: [
        `Every page is drawn in ${lookName(to)}, for everyone who opens this server. This browser changes right away, the others when they open or reload a page.`,
        to === 'console' ? 'Console starts dark. Light or dark stays the choice of each browser, in the menu under your name.'
            : from === 'console' ? `${lookName(to)} follows the light or dark each browser has chosen.` : null,
        to === 'commander' || to === 'brutale' ? `${lookName(to)} has the same pages and menu, drawn the older way.` : null
    ].filter(Boolean),
    safe: ['The arrays, the disks, the files and the protection.', 'Every other setting, the login and the choices of each browser.', `Nothing is installed or restarted. ${lookName(from)} stays one press away, on this page.`],
    label: `Use ${lookName(to)}`
});

/* ------------------------------------------------------------------ */
/* the menu of the person and the actions on the server                */
/* ------------------------------------------------------------------ */

/** The events of the server actions, as the list of what happened says them. */
export const SERVER_EVENT = {
    disks_sleep: 'Disks asked to sleep',
    service_restart: 'DiskFlux restarted from this page',
    suspend: 'Server put to sleep from this page',
    reboot: 'Server restarted from this page',
    poweroff: 'Server shut down from this page',
    waiting: 'Server action waiting for the work to end',
    cancel: 'Server action'
};

/** The server actions in the order of the menu, with what the ? beside each one says. */
export const SERVER_ACTIONS = [
    {
        id: 'disks_sleep', label: 'Let the disks sleep now',
        does: 'Spins the disks of every array down now, without waiting for their idle time.',
        stays: 'The server, shared folders and your files. A sleeping disk wakes on the next read.',
        takes: 'A few seconds, after any work already running. The first file from a sleeping disk then waits a few seconds.'
    },
    {
        id: 'service_restart', label: 'Restart DiskFlux',
        does: 'Restarts only the DiskFlux program, as after an update.',
        stays: 'The server, shared folders, the disks and your files.',
        takes: 'About 10 seconds. This page reconnects by itself.'
    },
    {
        id: 'suspend', label: 'Sleep the server',
        does: 'Puts the whole server to sleep. It uses very little power and keeps what it was doing.',
        stays: 'Your files, settings and everything in memory.',
        takes: 'Wakes with its power button, or Wake-on-LAN from another computer.'
    },
    {
        id: 'reboot', label: 'Restart the server',
        does: 'Restarts the whole machine, like turning it off and on.',
        stays: 'Your files, settings and schedules.',
        takes: 'About 2 minutes. This page comes back by itself.'
    },
    {
        id: 'poweroff', label: 'Shut down the server',
        does: 'Turns the server off completely.',
        stays: 'Your files and settings. It starts as usual when switched on.',
        takes: 'Starts again only with its power button or Wake-on-LAN. This page can’t start it.'
    }
];

/** "Up 12 days" */
export const uptimeWords = (seconds) => seconds == null || seconds < 0 ? '' : `Up ${humanSpan(seconds)}`;

/** Wake-on-LAN of the network interfaces: { state: 'on'|'off'|'unknown', names: 'eth0' }. */
export const wolState = (interfaces = []) => {
    const phys = (interfaces || []).filter(i => i.physical);
    const on = phys.filter(i => i.wake_on && i.wake_on.includes('g'));
    if (on.length) return { state: 'on', names: on.map(i => i.name).join(', ') };
    if (phys.some(i => i.wake_on)) return { state: 'off', names: '' };
    return { state: 'unknown', names: '' };
};

/**
 * What the window of a server action says, from the facts of the server:
 * { name, busy, shareClients, nextMaintenance (minutes, -1 none), wol: wolState(), now }.
 * \return { title, warn, effects, safe, ack, go } — go is the label of the button.
 */
export const serverConfirm = (id, f = {}) => {
    const name = f.name || 'the server';
    const busy = f.busy || '';
    const clients = Number(f.shareClients) || 0;
    const wol = f.wol || { state: 'unknown', names: '' };
    const now = f.now || new Date();
    const next = f.nextMaintenance != null && f.nextMaintenance >= 0
        ? new Date(now.getTime() + f.nextMaintenance * 60000) : null;
    const open = clients ? `${plural(clients, 'computer has', 'computers have')} a shared folder open now.` : '';
    const waitWords = (verb) => busy ? `${busy}. ${verb} waits until it ends; Cancel leaves everything as it is.` : '';
    switch (id) {
        case 'disks_sleep': return {
            title: 'Let the disks sleep now?',
            warn: busy ? `${busy}: the disks sleep after it.` : '',
            effects: ['The disks of every array spin down.', 'The next file opened on a sleeping disk waits a few seconds while it wakes.'],
            safe: ['The server stays on, shared folders stay connected, schedules run as usual.'],
            go: 'Let them sleep'
        };
        case 'service_restart': return {
            title: 'Restart DiskFlux?',
            warn: waitWords('The restart'),
            effects: ['DiskFlux stops and starts again; this page reconnects in about 10 seconds.', 'It reads its settings file again, so changes made by hand take effect.'],
            safe: ['The server stays on, shared folders stay connected, the disks are not touched.'],
            go: busy ? 'Restart when it ends' : 'Restart DiskFlux'
        };
        case 'suspend': return {
            title: `Put ${name} to sleep?`,
            warn: waitWords('Sleeping'),
            effects: [
                'These pages and shared folders can’t be reached until it wakes.',
                ...(open ? [`${open} They lose it until it wakes.`] : []),
                ...(next ? [`Schedules don’t run while it sleeps: the protection update of ${shortWhen(next, now).toLowerCase()} waits for it.`] : ['Schedules don’t run while it sleeps.']),
                wol.state === 'on' ? `Wake it with its power button, or Wake-on-LAN from another computer (on for ${wol.names}).`
                    : wol.state === 'off' ? 'Wake-on-LAN is off: only its power button wakes it.' : 'Wake it with its power button.'
            ],
            safe: ['Your files, settings and the protection already made.'],
            go: busy ? 'Sleep when it ends' : 'Sleep'
        };
        case 'reboot': return {
            title: `Restart ${name}?`,
            warn: waitWords('The restart'),
            effects: [
                'The server restarts; these pages come back in about 2 minutes.',
                open ? `Shared folders disconnect for that time. ${open}` : 'Shared folders disconnect for that time.'
            ],
            safe: ['Your files, the protection already made, schedules and settings.'],
            go: busy ? 'Restart when it ends' : 'Restart'
        };
        case 'poweroff': return {
            title: `Shut down ${name}?`,
            warn: waitWords('Shutting down'),
            effects: [
                'These pages and shared folders stop until someone turns it on.',
                ...(open ? [open] : []),
                'No schedules, backups or alerts while it is off.',
                wol.state === 'on' ? `Wake-on-LAN is on for ${wol.names}: another computer on your network can start it. This page can’t.`
                    : wol.state === 'off' ? 'Wake-on-LAN is off: only its power button starts it again. This page can’t.'
                        : 'Only its power button starts it again, or Wake-on-LAN if it is set up. This page can’t.'
            ],
            safe: ['Your files, the protection already made, settings.'],
            ack: 'I can reach the server, or wake it from another computer.',
            go: busy ? 'Shut down when it ends' : 'Shut down'
        };
        default: return null;
    }
};

/** The words of the action waiting for the work to end, for the menu. */
export const pendingWords = (pending) => {
    if (!pending?.action) return '';
    const a = SERVER_ACTIONS.find(x => x.id === pending.action);
    return `${a ? a.label : pending.action} when the work ends`;
};

/** The time of the last change of the login, from the events (newest first or not), or null. */
export const loginChangedAt = (events = []) => {
    let best = null;
    for (const e of events || []) {
        if (e.kind !== 'login' || !e.at) continue;
        const t = Date.parse(e.at);
        if (!Number.isNaN(t) && (best == null || t > best)) best = t;
    }
    return best == null ? null : new Date(best);
};

/** The letter shown in the round badge of the person. */
export const initial = (user) => {
    const m = String(user || '').match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '?';
};

/** The keys that work on every page. */
export const SHORTCUTS = [
    ['Ctrl K or ⌘ K', 'Search pages, disks, shares and settings'],
    ['?', 'This list of keys'],
    ['Esc', 'Close a window, a menu or the search'],
    ['↑ ↓ and Enter', 'Move in the search and open what is chosen']
];

/** "Protection updated: finished" — the notice when a run of SnapRAID ends. */
export const jobEndWords = (cmd) => `${RUN_TITLES[cmd] || ({ diff: 'Look for changes', status: 'Status', smart: 'Disk health read', down: 'Disks asleep', up: 'Disks awake', probe: 'Disks looked at' })[cmd] || cmd}: finished`;

/** The newer version offered in the menu, '' when there is none or this server can't update itself. */
export const updateOffered = (host) => {
    const latest = host?.latest_daemon_version;
    if (!latest || !host.can_upgrade || latest === host.daemon_version) return '';
    const a = String(latest).split(/[.-]/).map(Number);
    const b = String(host.daemon_version || '').split(/[.-]/).map(Number);
    for (let i = 0; i < 3; ++i) {
        if ((a[i] || 0) > (b[i] || 0)) return latest;
        if ((a[i] || 0) < (b[i] || 0)) return '';
    }
    return '';
};

/* ------------------------------------------------------------------ */
/* the Console look: what a button runs, and where a tile reads from   */
/* ------------------------------------------------------------------ */

/** The command or request behind a button, by its action and what it acts on. Only what is certain is listed. */
export const CONSOLE_CMD = {
    'go:protect': 'snapraid sync, then scrub',
    'go:heal': 'snapraid fix -e, then scrub -p bad',
    'sync-anyway': 'snapraid sync',
    restore: 'snapraid diff, then fix -m',
    'file-check': 'snapraid check -f',
    stop: 'POST /stop',
    'disk-test': 'smartctl -t',
    'backup-run': 'rsync',
    'usb-eject': 'umount',
    'upgrade-run': 'diskflux-upgrade',
    'srv:disks_sleep': 'snapraid down',
    'srv:service_restart': 'systemctl restart diskflux',
    'srv:suspend': 'systemctl suspend',
    'srv:reboot': 'systemctl reboot',
    'srv:poweroff': 'systemctl poweroff'
};

/** '' when the button has no single command behind it. */
export const consoleCmd = (act, data = {}) => CONSOLE_CMD[`${act}:${data.act || data.id || ''}`] || CONSOLE_CMD[act] || '';

/** Where each tile of Home reads its numbers, by its title. */
export const CONSOLE_API = {
    Space: 'GET /host/space',
    Disks: 'GET /disks',
    'Checked for damage': 'GET /array',
    'Coming up': 'GET /config + /host',
    Backups: 'GET /host',
    'Shared folders': 'GET /host',
    Power: 'GET /host',
    'Fast disk': 'GET /host',
    'What happened': 'GET /host/runs + /host/events',
    Alerts: 'GET /host/alerts',
    'Needs your attention': 'GET /storage + /host',
    Ideas: 'GET /storage'
};
export const consoleApi = (title) => CONSOLE_API[title] || '';

/** The keys of the Console look, after the ones of every look. */
export const CONSOLE_SHORTCUTS = [
    ['g then a letter', 'Go to a page: the letters are beside the menu (g h is Home, g d is Disks)'],
    ['c', 'Show or hide the commands under the buttons and the sources of the tiles'],
    ['/', 'Search, like Ctrl K']
];

/** The page a "g" key opens, from the letters written in the menu: [['h', '#/'], …]. null when the letter has no page. */
export const consoleGo = (pairs, letter) => (pairs.find(([k]) => k === letter) || [])[1] || null;

/** "up 41d 06h", "up 3h 12m", "up 5m": how long the server has been running, as a status line writes it. */
export const consoleUptime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    const two = (n) => String(n).padStart(2, '0');
    return d ? `up ${d}d ${two(h)}h` : h ? `up ${h}h ${two(m)}m` : `up ${m}m`;
};
