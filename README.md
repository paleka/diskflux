# SnapRAID Daemon, with the Storage and everyday pages

An unofficial extension of [SnapRAID Daemon](https://github.com/amadvance/snapraid-daemon) by
Andrea Mazzoleni. It makes a Linux machine with a few disks into a home NAS you look after from
the browser. You can set up the disks and pools, see in plain words whether your files are safe,
get deleted files back, share folders, make backups, and get an alert when something needs you.
Underneath, the SnapRAID engine and his daemon do the work.

[![Home, in the Quiet look](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/quiet-home.png)](https://github.com/paleka/snapraid-lab#screenshots)

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/snapraid-daemon/storage/installer.sh | sudo sh
```

## Whose work is what

| Project | Author | Where |
|---|---|---|
| SnapRAID, the engine | Andrea Mazzoleni | <https://github.com/amadvance/snapraid>, <https://www.snapraid.it/> |
| SnapRAID Daemon and its web UI | Andrea Mazzoleni | <https://github.com/amadvance/snapraid-daemon>, <https://www.snapraid.it/ui> |
| Storage, Arrays and everyday pages, the Quiet look, the installer (this repository) | Robert Paleka | branch `storage`, see [`CHANGES-FORK`](CHANGES-FORK) |
| The lab with emulated disks | Robert Paleka | <https://github.com/paleka/snapraid-lab> |

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
  temperature, self-tests and spin-down. A new disk can be tested before it holds files. Adding,
  replacing, emptying and removing a disk, or moving the parity to a larger one, is done step by
  step, and every risky step is explained and confirmed first.
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
| **Disks**: click a bay to see that disk and what can be done with it<br>[![Disks](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/quiet-disks.png)](https://github.com/paleka/snapraid-lab#screenshots) | **Protection**: the rules in plain words, and when each part was last checked<br>[![Protection](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/quiet-protection.png)](https://github.com/paleka/snapraid-lab#screenshots) |
| **Get back deleted files**: what can still be rebuilt, chosen file by file<br>[![Get back deleted files](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/everyday-restore.png)](https://github.com/paleka/snapraid-lab#screenshots) | **Guided setup**: what is going to be done, in order, before anything is erased<br>[![Guided setup](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/setup-3-review.png)](https://github.com/paleka/snapraid-lab#screenshots) |
| **Arrays**: several arrays in one daemon, the pools, and what protects every disk<br>[![Arrays](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/arrays.png)](https://github.com/paleka/snapraid-lab#screenshots) | **Phone**<br>[![Phone](https://raw.githubusercontent.com/paleka/snapraid-lab/main/docs/screenshots/quiet-phone.png)](https://github.com/paleka/snapraid-lab#screenshots) |

More screenshots, and a tour of the Storage and Arrays pages, are in the
[lab](https://github.com/paleka/snapraid-lab#screenshots).

## Install

On Debian, Ubuntu, Proxmox and other systems that use apt, on x86-64, one command installs
everything:

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/snapraid-daemon/storage/installer.sh | sudo sh
```

It installs the SnapRAID engine from its author's releases if it is missing or older than 15.0,
then this daemon, mergerfs and the other tools the Storage page uses. At the end it prints the
address of the web UI (port 7627) and the password of the user `admin`. Running it again upgrades
and keeps your configuration.

To keep the web UI reachable only from the machine itself, and the Storage page read-only, as in
the original project:

```sh
curl -fsSL https://raw.githubusercontent.com/paleka/snapraid-daemon/storage/installer.sh | sudo SNAPRAIDD_LOCAL=1 sh
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

### Updates

From the **Updates** card of the System page, or from the shell:

```sh
sudo snapraidd-upgrade              # the latest release
sudo snapraidd-upgrade 2.2.s9       # a chosen release, also an older one
snapraidd-upgrade --list            # the releases
```

### Packages

The `.deb`, the `.rpm` and the source code are in the
[releases](https://github.com/paleka/snapraid-daemon/releases). The package is named
`snapraid-daemon-storage`. It takes the place of `snapraid-daemon`, the original project's
package, with the same program, service and configuration file, so the two can't be installed
together. To go back to the original, install its package: the configuration is kept. Versions
are the SnapRAID Daemon version they are based on plus the release number of this project, like
`2.2.s12`. To build from source, see [`INSTALL`](INSTALL).

## Try it first

- **The lab**: [paleka/snapraid-lab](https://github.com/paleka/snapraid-lab) runs everything in
  Docker with emulated disks of different sizes and kinds, with three arrays and four pools, so
  nothing on your machine is touched.
- **The demo**: <https://snapraid.paleka.net/> (user `demo`, password `demo`). It resets itself
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
