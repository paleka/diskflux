# DiskFlux: a storage manager for SnapRAID, built on SnapRAID Daemon

An unofficial extension of [SnapRAID Daemon](https://github.com/amadvance/snapraid-daemon) by
Andrea Mazzoleni. It makes a Linux machine with a few disks into a home NAS you look after from
the browser. You can set up the disks and pools, see in plain words whether your files are safe,
get deleted files back, share folders, make backups, and get an alert when something needs you.
Underneath, the SnapRAID engine and his daemon do the work.

**Website:** <https://diskflux.com> · **Demo:** <https://demo.diskflux.com/> (user `demo`, password `demo`)

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/diskflux/storage/installer.sh | sudo sh
```

<a href="https://github.com/paleka/diskflux-lab#screenshots"><img src="https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/quiet-home.png" alt="Home, in the Quiet look" width="640"></a>

## Whose work is what

| Project | Author | Where |
|---|---|---|
| SnapRAID, the engine | Andrea Mazzoleni | <https://github.com/amadvance/snapraid>, <https://www.snapraid.it/> |
| SnapRAID Daemon and its web UI | Andrea Mazzoleni | <https://github.com/amadvance/snapraid-daemon>, <https://www.snapraid.it/ui> |
| Storage, Arrays and everyday pages, the Quiet look, the installer (this repository) | Robert Paleka | branch `storage`, see [`CHANGES-FORK`](CHANGES-FORK) |
| The lab with emulated disks | Robert Paleka | <https://github.com/paleka/diskflux-lab> |

This project is not part of SnapRAID and is not reviewed or endorsed by its author. Please
don't send him problems with it. The `master` branch is an unchanged copy of his project, and
the additions are on `storage`.

## What it does for you

- **Tells you if your files are safe.** The Home page answers in one sentence and names the one
  thing to do, when there is one. The details are there when you open them.
- **Sets up the disks.** Choose the disks and what each one is for. It formats blank disks if you
  ask, mounts them, and writes the SnapRAID configuration and, if you want one, a mergerfs pool.
  Before anything is erased you see the full list of what will be done.
- **Keeps the protection up to date.** Sync and scrub run on a schedule you set in plain words,
  and every run is recorded with what it found and repaired.
- **Gets files back.** Deleted or damaged files are rebuilt from the parity, and you choose them
  file by file.
- **Looks after the disks.** A picture of the case shows every disk in its bay with its health,
  temperature, self-tests and spin-down, which array and pool it belongs to, and what pulling it
  out would do; place disks with a click, and find one in the case by its blinking light. A new
  disk can be tested before it holds files. Adding, replacing, emptying and removing a disk, or
  moving the parity to a larger one, is done step by step, and every risky step is explained and
  confirmed first.
- **Shows every change before it is written.** A change to the SnapRAID configuration opens a
  review first: what changes, in plain words, then the lines themselves, checked for mistakes.
  Lines nobody changed stay exactly as they were. The last 30 versions of the file are kept, to
  compare or put back, and the file can also be edited by hand with checks as you type.
- **Shares and backs up.** Samba and NFS shares with their users. Backups go to a USB disk when it
  is plugged in or on a schedule, and can also come in from other computers.
- **Warns you.** Alerts go to your phone or email. With a UPS, the machine shuts down cleanly
  before the battery runs out.
- **Grows with you.** One daemon handles several arrays, each with its own parity, schedule and
  settings, plus several pools, a fast SSD in front of a pool, and split parity.
- **Simple first, nothing left out.** Each page shows the everyday choices, and its **Advanced**
  switch shows the finer ones. The detailed pages of the original daemon are still there, under
  Advanced. There are three looks: Quiet, the default, and Commander and Brutale from the original
  project.
- **Stays light.** The web UI is served by the daemon itself. Pages open at the same time share
  the same replies, so more visitors don't mean more work for it.

## Screenshots

| | |
|---|---|
| **Disks**: the case bay by bay, with the array and pool of every disk; click one to see it and what can be done with it<br>[![Disks](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/quiet-disks.png)](https://github.com/paleka/diskflux-lab#screenshots) | **Protection**: the rules in plain words, and when each part was last checked<br>[![Protection](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/quiet-protection.png)](https://github.com/paleka/diskflux-lab#screenshots) |
| **Get back deleted files**: what can still be rebuilt, chosen file by file<br>[![Get back deleted files](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/everyday-restore.png)](https://github.com/paleka/diskflux-lab#screenshots) | **Guided setup**: what is going to be done, in order, and the lines of the SnapRAID file it writes, before anything is erased<br>[![Guided setup](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/setup-3-review.png)](https://github.com/paleka/diskflux-lab#screenshots) |
| **Check before writing**: every change of the SnapRAID file in plain words and line by line, checked for mistakes<br>[![Check before writing](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/config-review.png)](https://github.com/paleka/diskflux-lab#screenshots) | **SnapRAID file**: the file as text with checks as you type, and the history of its last 30 versions<br>[![SnapRAID file](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/snapraid-file.png)](https://github.com/paleka/diskflux-lab#screenshots) |
| **Arrays**: several arrays in one daemon, the pools, and what protects every disk<br>[![Arrays](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/arrays.png)](https://github.com/paleka/diskflux-lab#screenshots) | **Phone**<br>[![Phone](https://raw.githubusercontent.com/paleka/diskflux-lab/main/docs/screenshots/quiet-phone.png)](https://github.com/paleka/diskflux-lab#screenshots) |

More screenshots, and a tour of the Storage and Arrays pages, are in the
[lab](https://github.com/paleka/diskflux-lab#screenshots).

## Install

On Debian, Ubuntu, Proxmox and other systems that use apt, on x86-64, one command installs
everything:

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/diskflux/storage/installer.sh | sudo sh
```

It installs the SnapRAID engine from its author's releases if it is missing or older than 15.0,
then this daemon, mergerfs and the other tools the Storage page uses. At the end it prints the
address of the web UI (port 7700) and the password of the user `admin`. Running it again upgrades
and keeps your configuration.

To keep the web UI reachable only from the machine itself, and the Storage page read-only, as in
the original project:

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/diskflux/storage/installer.sh | sudo DISKFLUX_LOCAL=1 sh
```

### Already using SnapRAID from the command line?

It installs without changing anything you rely on. The installer and the daemon don't touch the
array, the content and parity files, `/etc/snapraid.conf`, `/etc/fstab`, a mergerfs pool or your
scheduled jobs. These change only when you start something yourself from the web UI, and a backup
of the file is saved first. The daemon starts without a maintenance schedule of its own, so it
only watches until you hand the maintenance over to it. `snapraid` keeps working from the shell.
If the content file is in the old format of SnapRAID 13 or older, the installer converts it
before upgrading the engine, or it stops and tells you what to do. The details are in
[`README`](README), under "An array already in use".

### Already using SnapRAID Daemon?

DiskFlux installs next to it and leaves it as it is: its own program (`diskflux`), service
(`diskflux.service`), configuration (`/etc/diskflux.conf`) and port (7700), so you can try
DiskFlux without removing SnapRAID Daemon. At its first installation it takes the settings of
SnapRAID Daemon from `/etc/snapraidd.conf`, which is only read, and each of its instances becomes an
array. Both use the same SnapRAID log folder of each array. The two keep their own schedules: the
installer and the Home page say which jobs DiskFlux would do a second time, so you keep each in
one of the two. The details are in [`README`](README), under "Next to SnapRAID Daemon".

### Updates

From the **Updates** card of the System page, or from the shell:

```sh
sudo diskflux-upgrade               # the latest release
sudo diskflux-upgrade 1.0.0         # a chosen release, also an older one
diskflux-upgrade --list             # the releases
```

A machine on the earlier package, `snapraid-daemon-storage` (up to `2.2.s14`), moves to
`diskflux` when the installer is run again, or with `sudo snapraidd-upgrade 1.0.0` (or 1.0.0
chosen with "Choose a version…" of its Updates card), keeping its settings, arrays, shares and
history; its web UI moves from port 7627 to 7700. Its update doesn't offer DiskFlux by itself:
the versions of DiskFlux start again from 1.0.0.

### Packages

The `.deb`, the `.rpm` and the source code are in the
[releases](https://github.com/paleka/diskflux/releases). The package is named `diskflux`, with
its own program, service, configuration and port, and it installs next to `snapraid-daemon`,
the original project's package, without changing it. Versions are `MAJOR.MINOR.PATCH`, from
`1.0.0`, the first release under the name DiskFlux; the version of SnapRAID Daemon it is based
on is given apart (`diskflux --version`). To build from source, see [`INSTALL`](INSTALL).

## Try it first

- **The lab**: [paleka/diskflux-lab](https://github.com/paleka/diskflux-lab) runs everything in
  Docker with emulated disks of different sizes and kinds, with three arrays and four pools, so
  nothing on your machine is touched.
- **The demo**: <https://demo.diskflux.com/> (user `demo`, password `demo`). It resets itself
  every 25 minutes.

## Problems and questions

Report problems with this project here, not to the SnapRAID project. For SnapRAID itself, see its
[manual](https://www.snapraid.it/manual) and its [support page](https://www.snapraid.it/support).

## Licence

GPL-3.0-or-later, like the original project. Files that already existed keep their author's
copyright. The new files are copyright of Robert Paleka, and [`CHANGES-FORK`](CHANGES-FORK) lists
them with everything that was added. The additions were written with the help of an AI coding
assistant (Claude).

The full documentation, followed by the README of the original project, is in [`README`](README).
