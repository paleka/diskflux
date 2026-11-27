# Release notes of DiskFlux

What each release adds, newest first, written with the change itself.
The release workflow (`.github/workflows/release.yml`) publishes the section
of the tag's version as the "What's new" of its GitHub release, between the
same introduction and install lines every release has. A tag whose version
has no section here is refused before anything is built: add the section in
the commit that is tagged.

Each section starts with `## MAJOR.MINOR.PATCH` alone on its line and ends at
the next one. Write for the people who install DiskFlux: what they can do now,
in plain words.

## 1.4.0

**A fourth look, Console: the same pages, drawn as an instrument panel.**

- **Console** shows every page of Quiet with letters of one width, ruled panels and bars made of cells. The words stay the plain ones: nothing has to be learned to use it.
- **Under a button, the command it runs**: "Update the protection now" says `snapraid sync, then scrub`, "Get back deleted files" says `snapraid diff, then fix -m`, and the windows that ask first show the same line. Only buttons with one command behind them carry it.
- **On each tile of Home, the request it reads from** (`GET /host/space`, `GET /disks`, …), and in the list of what happened the name of the run (`sync`, `scrub`) before its plain words.
- **Keys**: **g** then a letter opens a page (the letters are written beside the menu: **g h** Home, **g d** Disks), **/** opens the search, **c** hides or shows the commands and sources. The switch `cmd: on` of the top bar does the same. **?** lists every key.
- The search is a prompt: actions show their command beside their name.
- It starts dark; light is in the menu under your name. The top bar shows the server's name, how long it has been up and the version.
- To use it, set `net_web_root = console.zip` in `/etc/diskflux.conf` and restart DiskFlux. Quiet stays the default; Commander and Brutale are unchanged.

## 1.3.0

**A menu under your name, My settings, and the server's power from the page.**

- **Your name, top right**, opens a menu with light, dark or "as my computer", a switch to show the Advanced choices on every page, My settings, Change login, keyboard shortcuts (press **?**), the tour, and **Log out**. On a phone it comes up from the bottom of the screen.
- **New page, My settings**: your login (moved here from System), and how this browser shows things: spacing (roomy or compact), sizes in TB or TiB, 12 or 24-hour time, how dates are written, °C or °F, the page it opens on, and a browser notice when a long job ends. These choices are kept in this browser; "Put this browser's choices back" resets them.
- **This server, in the same menu**: its uptime and clock, "Update DiskFlux" when a new version is out, and five actions: let the disks sleep now, restart DiskFlux, and sleep, restart or shut down the server.
- **Each action explains itself before anything happens.** The **?** beside it says what it does, what stays the same and how long it takes. Clicking it opens a window with what happens and what doesn't, using your server's real situation: work that is running, computers with a shared folder open, the next protection update it would miss, and whether Wake-on-LAN can start it again. Shutting down asks you to tick that you can reach the server.
- **Nothing is cut off halfway**: while a protection update or another job runs, the action is offered "when it ends" and waits for it; you can cancel it from the menu until then.
- Every action is written in the list of what happened on Home.

## 1.2.2

**Saving the rules of Storage no longer moves lines of the SnapRAID file.**

- Saving the content files, rules or options from the Storage page kept the right lines, but gathered every rule in one place, away from the comments above them. Now the lines that stay are left where they are, and a new one goes next to the one before it. The review before writing showed the move, which is how it was found.
- When a line really moves, the review says "Moves" once, instead of taken away and added.

## 1.2.1

**Messages are never hidden behind a window.**

- Warnings, errors and other messages now always show on top of open windows, in every theme; so do tooltips.
- When a change that erases a disk is started without typing ERASE, the window now scrolls to the box and puts the cursor in it.

## 1.2.0

**See every change to the SnapRAID file before it is written.**

- Every change DiskFlux makes to `snapraid.conf` now opens a review first: what changes in plain words ("New data disk d5", "Disk d2 leaves the array", "Block size: 256 KiB → 512 KiB"), then the lines themselves, as changes only, the whole file, or before and after side by side.
- The new file is checked before writing. A problem that would stop SnapRAID (no parity, a name used twice, a value out of range) blocks the write; anything worth a second look is pointed out.
- Covers adding, removing and moving disks, the parity move, the rules and options of Storage, the temperature limit, and restoring a settings backup.
- Lines nobody changed are written back exactly as they were: your comments, tabs and alignment stay.
- **New page, Advanced › SnapRAID file:** edit the file as text with checks as you type, see when it was changed outside DiskFlux, and look through the history of the last 30 versions to compare or put one back.

## 1.1.0

**The Disks page shows your case as it is.**

- Each bay shows which array its disk belongs to (one colour per array, the same on every page), its pool, its role, and a label of your choice: size, end of the serial, or temperature.
- Filter by array or pool; the other disks fade.
- Place disks with a click: free bays are outlined, each bay says what a click does, and a disk dropped on a taken bay swaps places. Every change can be undone.
- The disk panel says what the disk belongs to, where it sits (bay, row, column), and what pulling it out of the case would do.
- **Find it by its light:** the disk's activity light blinks for 30 seconds so you can spot it in the case.
- Split parity disks show which part they hold.

## 1.0.0

**The first release named DiskFlux. It installs next to SnapRAID Daemon instead of replacing it.**

- New names throughout: program `diskflux`, service `diskflux.service`, settings `/etc/diskflux.conf`, web UI on port 7700.
- Installs next to SnapRAID Daemon: its package, engine and settings are left as they are. On a first install, DiskFlux imports its settings and instances (as arrays) without changing them, and keeps the Quiet theme.
- When SnapRAID Daemon runs on the same machine, Home says so and explains what DiskFlux does on its own. The shared log folder is used safely.
- Versions are now MAJOR.MINOR.PATCH, starting at 1.0.0.
- Fixes: formatting without udev on loop and NVMe disks; the `.rpm` now keeps moved settings.

**Coming from an earlier release (package `snapraid-daemon-storage`, up to 2.2.s14)?** Its update moves the machine to the `diskflux` package, keeping its settings, arrays, shares and history; the web UI moves from port 7627 to 7700. The `snapraid-daemon-storage` package attached here is only for that move.
