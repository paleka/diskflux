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
