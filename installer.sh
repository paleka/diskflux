#!/bin/sh
#
# Installer of DiskFlux, the storage manager for SnapRAID (unofficial extension of SnapRAID Daemon).
#
# Copyright (C) 2026 Robert Paleka
# SPDX-License-Identifier: GPL-3.0-or-later
#
# For Debian, Ubuntu, Proxmox and other systems using apt, on x86-64.
#
#   curl -fsSL https://raw.githubusercontent.com/paleka/diskflux/storage/installer.sh | sudo sh
#
# It installs the SnapRAID engine from the releases of its author if it is
# missing or older than 15.0, then the daemon from the releases of this fork,
# with the tools used by the Storage page. On a new installation it opens
# the web UI to the network, protects it with a password, and enables the
# Storage page.
#
# On a machine where SnapRAID is already in use from the command line, the
# array, its configuration, /etc/fstab and the scheduled jobs are left as
# they are, and the daemon starts without a maintenance schedule and without
# spinning down the disks: it only watches, until told otherwise in its
# Settings page. See "An array already in use" in the README file.
#
# On a machine with SnapRAID Daemon, DiskFlux installs next to it: SnapRAID
# Daemon, its configuration, its service and the SnapRAID engine it uses are
# left as they are. DiskFlux starts with the settings of SnapRAID Daemon,
# imported from its configuration (only read), on its own port. See "Next to
# SnapRAID Daemon" in the README file.
#
# Options, as environment variables (the names starting with SNAPRAIDD_ of the
# earlier releases are still read):
#
#   DISKFLUX_LOCAL=1        Keep the default configuration: web UI reachable
#                           only from the machine itself, Storage page read-only.
#   DISKFLUX_USER=name      User of the web UI (default: admin).
#   DISKFLUX_PORT=7700      Port of the web UI on a new installation (default: 7700).
#   DISKFLUX_PASSWORD=pw    Password of the web UI (default: generated).
#   DISKFLUX_VERSION=26.12.0 Install this release of DiskFlux instead of
#                           the latest.
#   SNAPRAID_VERSION=15.2   Install this release of the engine instead of
#                           the latest.
#   DISKFLUX_DEB=file       Install this DiskFlux package instead of downloading it.
#   SNAPRAID_DEB=file       Install this engine package instead of downloading it.
#   DISKFLUX_SHARES=1       Install the servers the Sharing page works with,
#                           Samba and NFS. This is the default on a machine
#                           new to SnapRAID; 0 leaves them out. Nothing is
#                           shared until a share is added in the web UI.
#   DISKFLUX_AUTO=1         With an array already in use, let the daemon take the
#                           maintenance over right away: sync and scrub every
#                           night at 02:00, idle disks spun down.
#   SNAPRAID_SYNC=1         With a content file written by SnapRAID 13 or older
#                           and changes not synced yet, run the sync needed to
#                           convert it instead of stopping.
#   SNAPRAID_MIGRATE_DEB=file  Use this SnapRAID 14.10 package for that
#                           conversion instead of downloading it.
#
# Running it again upgrades the packages and keeps the configuration.

set -eu

DAEMON_REPO="paleka/diskflux"
ENGINE_REPO="amadvance/snapraid"
CONF="/etc/diskflux.conf"
ENGINE_CONF="/etc/snapraid.conf"

# The options; SNAPRAIDD_* are their names in the earlier releases
OPT_LOCAL="${DISKFLUX_LOCAL:-${SNAPRAIDD_LOCAL:-0}}"
OPT_USER="${DISKFLUX_USER:-${SNAPRAIDD_USER:-admin}}"
OPT_PASSWORD="${DISKFLUX_PASSWORD:-${SNAPRAIDD_PASSWORD:-}}"
OPT_VERSION="${DISKFLUX_VERSION:-${SNAPRAIDD_VERSION:-}}"
OPT_DEB="${DISKFLUX_DEB:-${SNAPRAIDD_DEB:-}}"
OPT_SHARES="${DISKFLUX_SHARES:-${SNAPRAIDD_SHARES:-}}"
OPT_AUTO="${DISKFLUX_AUTO:-${SNAPRAIDD_AUTO:-0}}"
PORT="${DISKFLUX_PORT:-${SNAPRAIDD_PORT:-7700}}"

# The last SnapRAID able to read the content files of SnapRAID 13 and older,
# and the one that converts them for SnapRAID 15
MIGRATE_VERSION="14.10"

say() {
	printf '%s\n' "$*"
}

die() {
	printf 'installer.sh: %s\n' "$*" >&2
	exit 1
}

# Print the version of the latest release of a repository, from the address
# its "latest" page redirects to
latest_version() {
	curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest" \
		| sed -n 's|.*/releases/tag/v\(.*\)$|\1|p'
}

# Check a downloaded file against a list of SHA256 checksums
verify() {
	_file="$1"
	_sums="$2"
	_name=$(basename "$_file")
	_want=$(awk -v n="$_name" '$2 == n || $2 == "*" n { print $1; exit }' "$_sums")
	[ -n "$_want" ] || die "no checksum published for $_name"
	_have=$(sha256sum "$_file" | awk '{ print $1 }')
	[ "$_want" = "$_have" ] || die "checksum mismatch for $_name"
}

# Print the first content file of the SnapRAID configuration that exists:
# an array synced at least once has one
content_file() {
	[ -f "$ENGINE_CONF" ] || return 0
	tr -d '\r' < "$ENGINE_CONF" \
		| sed -n 's/^[[:space:]]*content[[:space:]][[:space:]]*//p' \
		| sed 's/[[:space:]]*$//' \
		| while IFS= read -r _f; do
			if [ -f "$_f" ]; then
				printf '%s\n' "$_f"
				break
			fi
		done
}

# Tell if a content file is in the format written by SnapRAID 13 and older,
# that SnapRAID 15 refuses to read
content_is_legacy() {
	case "$(head -c 8 "$1" 2>/dev/null | tr -d '\000')" in
	SNAPCNT1|SNAPCNT2) return 0 ;;
	esac
	return 1
}

# Convert a content file of SnapRAID 13 or older, with a sync made by the
# last SnapRAID able to read it. The program is run from the temporary
# directory, it's not installed.
#
# With nothing to sync, the sync writes only the content files and leaves the
# parity as it is. With changes pending it would be a real sync: when to run
# one is the choice of who owns the array, so it's done only if asked.
migrate_content() {
	_content="$1"

	say "The content file $_content was written by SnapRAID 13 or older."
	say "SnapRAID 15 cannot read it: it has to be converted by SnapRAID $MIGRATE_VERSION first."

	_deb="$TMP/snapraid_$MIGRATE_VERSION-1_amd64.deb"
	if [ -n "${SNAPRAID_MIGRATE_DEB:-}" ]; then
		[ -f "$SNAPRAID_MIGRATE_DEB" ] || die "$SNAPRAID_MIGRATE_DEB not found"
		cp "$SNAPRAID_MIGRATE_DEB" "$_deb"
	else
		say "Downloading SnapRAID $MIGRATE_VERSION"
		curl -fsSL -o "$_deb" "https://github.com/$ENGINE_REPO/releases/download/v$MIGRATE_VERSION/snapraid_$MIGRATE_VERSION-1_amd64.deb"
		curl -fsSL -o "$TMP/migrate.sums" "https://raw.githubusercontent.com/$ENGINE_REPO/master/CHECKSUMS"
		verify "$_deb" "$TMP/migrate.sums"
	fi
	mkdir "$TMP/migrate"
	dpkg-deb -x "$_deb" "$TMP/migrate"
	_old="$TMP/migrate/usr/bin/snapraid"
	[ -x "$_old" ] || die "cannot unpack SnapRAID $MIGRATE_VERSION"

	say "Checking the array for changes not synced yet"
	_rc=0
	"$_old" -c "$ENGINE_CONF" diff > "$TMP/diff.log" 2>&1 || _rc=$?
	if [ "$_rc" = "2" ] && [ "${SNAPRAID_SYNC:-0}" != "1" ]; then
		say ""
		tail -n 10 "$TMP/diff.log"
		say ""
		say "The array has changes not synced yet, and the conversion takes a sync."
		say "Nothing was installed and nothing was changed. Choose one:"
		say ""
		say "  - check the changes above, then run the installer again with SNAPRAID_SYNC=1"
		say "    to let it sync, like 'snapraid sync' does:"
		say "      curl -fsSL https://raw.githubusercontent.com/$DAEMON_REPO/storage/installer.sh | sudo SNAPRAID_SYNC=1 sh"
		say "  - or install SnapRAID $MIGRATE_VERSION yourself, run 'snapraid sync' with it, and run the"
		say "    installer again:"
		say "      https://github.com/$ENGINE_REPO/releases/tag/v$MIGRATE_VERSION"
		exit 1
	elif [ "$_rc" != "0" ] && [ "$_rc" != "2" ]; then
		say ""
		tail -n 10 "$TMP/diff.log"
		say ""
		die "SnapRAID $MIGRATE_VERSION cannot read the array (see above). Nothing was installed and nothing was changed. Make 'snapraid diff' work, then run the installer again"
	fi

	if [ "$_rc" = "0" ]; then
		say "Nothing to sync: converting the content files, the parity is not touched"
		"$_old" -c "$ENGINE_CONF" sync > "$TMP/sync.log" 2>&1 || {
			tail -n 10 "$TMP/sync.log"
			die "the conversion failed (see above). Nothing was installed"
		}
	else
		say "Syncing the array with SnapRAID $MIGRATE_VERSION, as asked with SNAPRAID_SYNC=1"
		"$_old" -c "$ENGINE_CONF" sync || die "the sync failed. Nothing was installed"
	fi

	if content_is_legacy "$_content"; then
		die "$_content is still in the old format. Nothing was installed"
	fi
	say "Content files converted"
}

# Print how SnapRAID Daemon of its author is installed, if it is: its package,
# or a program built from the sources (not owned by any package)
official_daemon() {
	if dpkg-query -W -f='${Status}' snapraid-daemon 2>/dev/null | grep -q "ok installed"; then
		printf '%s\n' "package snapraid-daemon $(dpkg-query -W -f='${Version}' snapraid-daemon)"
		return 0
	fi
	for _p in /usr/bin/snapraidd /usr/sbin/snapraidd /usr/local/bin/snapraidd /usr/local/sbin/snapraidd; do
		if [ -e "$_p" ] && ! dpkg -S "$_p" >/dev/null 2>&1; then
			printf '%s\n' "$_p, built from the sources"
			return 0
		fi
	done
	return 0
}

# Print the configuration SnapRAID Daemon reads: built from the sources, the
# one in /usr/local/etc comes first, as it does for the program itself
official_conf() {
	case "$1" in
	package*) _c="/etc/snapraidd.conf" ;;
	*) _c="/usr/local/etc/snapraidd.conf"; [ -f "$_c" ] || _c="/etc/snapraidd.conf" ;;
	esac
	[ -f "$_c" ] && printf '%s\n' "$_c"
	return 0
}

# Tell if SnapRAID Daemon runs now, or starts with the machine (its service or
# one of its instances enabled)
official_running() {
	pidof snapraidd >/dev/null 2>&1
}
official_enabled() {
	for _l in /etc/systemd/system/*.wants/snapraidd.service /etc/systemd/system/*.wants/snapraidd@*.service; do
		[ -L "$_l" ] && return 0
	done
	return 1
}

# Print the last value of an option in a daemon configuration, comments left out
conf_value() {
	[ -f "$1" ] || return 0
	tr -d '\r' < "$1" | sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" | tail -n 1 | sed 's/[[:space:]]*$//'
}

# Print the addresses of a web UI from a net_port value, as links: a port alone
# listens on every interface, so it's reached at the address of the machine
web_urls() {
	printf '%s\n' "$1" | tr ',' '\n' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | while IFS= read -r _a; do
		[ -n "$_a" ] || continue
		_s="http"
		case "$_a" in *s) _s="https"; _a="${_a%s}" ;; esac
		case "$_a" in
		*[!0-9]*) printf '%s://%s\n' "$_s" "$_a" ;;
		*) printf '%s://%s:%s\n' "$_s" "$ADDR" "$_a" ;;
		esac
	done | paste -sd ' ' -
}

# Write another port in the addresses of an imported net_port, or the address
# of the machine itself on that port if it sets none; the first one is kept
# when it's the port of the configuration
conf_set_port() {
	awk -v p="$2" '
		function swap(v,   n, a, i, x, s, out) {
			n = split(v, a, ",")
			for (i = 1; i <= n; ++i) {
				x = a[i]; gsub(/^[ \t]+|[ \t]+$/, "", x); s = ""
				if (x ~ /s$/) { s = "s"; x = substr(x, 1, length(x) - 1) }
				if (x ~ /^[0-9]+$/) x = p; else sub(/:[0-9]+$/, ":" p, x)
				out = out (i > 1 ? "," : "") x s
			}
			return out
		}
		/^[ \t]*net_port[ \t]*=/ { v = $0; sub(/^[^=]*=[ \t]*/, "", v); sub(/[ \t\r]+$/, "", v); print "net_port = " swap(v); done = 1; next }
		{ print }
		END { if (!done) print "net_port = 127.0.0.1:" p }
	' "$1"
}

# Tell if a program listens on a TCP port, read from /proc: no ss or netstat needed
port_listened() {
	_hex=$(printf ':%04X' "$1")
	cat /proc/net/tcp /proc/net/tcp6 2>/dev/null \
		| awk -v p="$_hex" '$4 == "0A" && substr($2, length($2) - 4) == p { f = 1 } END { exit !f }'
}

# Print the port of the first address in the net_port of a daemon configuration,
# if it sets one: "127.0.0.1:7700", "[::1]:7700,127.0.0.1:7700", "7700s" give 7700
conf_port() {
	[ -f "$1" ] || return 0
	sed -n 's/^[[:space:]]*net_port[[:space:]]*=[[:space:]]*//p' "$1" | tail -n 1 \
		| cut -d, -f1 | sed 's/[[:space:]]*$//; s/s$//; s/.*://' | grep -E '^[0-9]+$' || true
}

# Everything runs from a function, so that a download cut short runs nothing
main() {

[ "$(id -u)" = "0" ] || die "run it as root, for example with sudo"
command -v apt-get >/dev/null 2>&1 || die "this installer needs apt (Debian, Ubuntu, Proxmox). On other systems see the INSTALL file"
[ "$(dpkg --print-architecture)" = "amd64" ] || die "packages are built for x86-64 only. On other systems see the INSTALL file"

# SnapRAID Daemon of its author, from its package or built from the sources.
# DiskFlux has its own program, service, configuration and port, and installs
# next to it: SnapRAID Daemon is never stopped, disabled, removed or
# reconfigured, and the SnapRAID engine it uses is never changed.
OFFICIAL=$(official_daemon)
OFFICIAL_CONF=""
if [ -n "$OFFICIAL" ]; then
	OFFICIAL_CONF=$(official_conf "$OFFICIAL")
	say "SnapRAID Daemon is installed on this machine ($OFFICIAL): it is kept as it is."
	say "DiskFlux installs next to it, with its own program, service, configuration and port."

	# The engine of SnapRAID Daemon is the one DiskFlux uses too. Its package
	# needs the snapraid package 15.0 or newer: anything else here is the
	# choice of the owner of SnapRAID Daemon, not of this installer
	_have=$(dpkg-query -W -f='${Version}' snapraid 2>/dev/null || true)
	if [ -z "$_have" ] || dpkg --compare-versions "$_have" lt 15.0; then
		_other=""
		if [ -n "$_have" ]; then
			_other="the snapraid package $_have"
		else
			for _p in /usr/local/bin/snapraid /usr/local/sbin/snapraid /usr/bin/snapraid /usr/sbin/snapraid; do
				if [ -e "$_p" ]; then _other="$_p, not from a package"; break; fi
			done
		fi
		if [ -n "$_other" ]; then
			say ""
			say "installer.sh: DiskFlux needs the SnapRAID engine 15.0 or newer from the snapraid"
			say "package. SnapRAID Daemon here uses $_other, and this installer"
			say "doesn't change the engine of SnapRAID Daemon. Nothing was installed and nothing"
			say "was changed. To go on, install the snapraid package 15.0 or newer yourself, from"
			say "  https://github.com/$ENGINE_REPO/releases"
			say "check that SnapRAID Daemon still works, then run this installer again."
			exit 1
		fi
	fi
fi

# The earlier package of DiskFlux, snapraid-daemon-storage (up to 2.2.s14), with
# the names of SnapRAID Daemon. DiskFlux takes its place: its package moves the
# settings, arrays, shares and history to its own names, and the web UI from
# port 7627, the default of SnapRAID Daemon, to 7700 (pkg/preinst), and replaces the old package, which apt removes.
EARLIER=$(dpkg-query -W -f='${Status} ${Version}\n' snapraid-daemon-storage 2>/dev/null | awk '$3 == "installed" { print $4 }')
if [ -n "$EARLIER" ]; then
	# the template service of those releases reads /etc/snapraidd-NAME.conf, not moved
	for _l in /etc/systemd/system/*.wants/snapraidd@*.service; do
		[ -L "$_l" ] || continue
		say "installer.sh: the service $(basename "$_l") of snapraid-daemon-storage is enabled."
		say ""
		say "Its array is not moved to DiskFlux. Nothing was installed and nothing was changed."
		say "Move it to an array of the daemon first (/etc/snapraidd.d, the Arrays page),"
		say "disable the service, then run this installer again."
		exit 1
	done
	say "snapraid-daemon-storage $EARLIER, the earlier package of DiskFlux, is installed: DiskFlux"
	say "takes its place, with the same settings, arrays, shares and history."
fi

# A SnapRAID built from the sources lives in /usr/local, and reads
# /usr/local/etc/snapraid.conf. The engine of the package would be a second
# one, with another configuration file: the shell would run one and the
# daemon the other, on the same array. Next to SnapRAID Daemon it's its setup,
# already checked above, and it's left as it is.
for OTHER in /usr/local/bin/snapraid /usr/local/sbin/snapraid; do
	[ -z "$OFFICIAL" ] || break
	if [ -e "$OTHER" ] && ! dpkg -S "$OTHER" >/dev/null 2>&1; then
		say "installer.sh: another SnapRAID is installed as $OTHER, not from a package."
		say ""
		say "The packages install the engine as /usr/bin/snapraid, reading $ENGINE_CONF."
		say "The two would be used on the same array: the old one from your shell, the new"
		say "one by the daemon. Nothing was installed and nothing was changed. To go on:"
		say ""
		say "  1. remove the old program:  rm $OTHER"
		say "     (or 'make uninstall' in the directory it was built in)"
		if [ ! -e "$ENGINE_CONF" ] && [ -e /usr/local/etc/snapraid.conf ]; then
			say "  2. move its configuration:  mv /usr/local/etc/snapraid.conf $ENGINE_CONF"
			say "  3. run this installer again"
		else
			say "  2. run this installer again"
		fi
		exit 1
	fi
done

# The port of the web UI: the one of the configuration kept, else the default.
# Taken by another program, the daemon could not start: stop before changing
# anything. A DiskFlux already running is the one being updated.
# Moving from the earlier package, the web UI goes from 7627 (also when not
# set) to 7700, and another port chosen by hand stays, held by the old daemon
# until DiskFlux takes over.
_port=$(conf_port "$CONF")
[ -n "$_port" ] && PORT="$_port"
EARLIER_PORT=""
if [ -n "$EARLIER" ]; then
	EARLIER_PORT=$(conf_port /etc/snapraidd.conf)
	EARLIER_PORT="${EARLIER_PORT:-7627}"
	if [ "$EARLIER_PORT" = "7627" ]; then PORT=7700; else PORT="$EARLIER_PORT"; fi
fi
if { [ -z "$EARLIER" ] || [ "$EARLIER_PORT" = "7627" ]; } && port_listened "$PORT" && ! pidof diskflux >/dev/null 2>&1; then
	say "installer.sh: another program already listens on port $PORT, the port of the DiskFlux web UI."
	say ""
	if [ -n "$EARLIER" ]; then
		say "The web UI of snapraid-daemon-storage moves there from 7627. Nothing was installed"
		say "and nothing was changed. Free the port, or choose another one in /etc/snapraidd.conf"
		say "(net_port, like 127.0.0.1:7710; kept by the move), then run the installer again."
		exit 1
	fi
	say "Nothing was installed and nothing was changed. Free the port, or run the"
	say "installer again with another port for DiskFlux, for example:"
	say "  curl -fsSL https://raw.githubusercontent.com/$DAEMON_REPO/storage/installer.sh | sudo DISKFLUX_PORT=7710 sh"
	exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# apt reads the packages as the unprivileged _apt user
chmod 755 "$TMP"

export DEBIAN_FRONTEND=noninteractive

if ! command -v curl >/dev/null 2>&1; then
	say "Installing curl"
	apt-get update -q
	apt-get install -y -q curl ca-certificates
fi

# An array already in use: its content file is there. Next to SnapRAID Daemon
# the array is the one it maintains: converting its content file takes a run
# of SnapRAID on it, and that's for its owner to decide
CONTENT=$(content_file)
if [ -n "$CONTENT" ] && content_is_legacy "$CONTENT"; then
	if [ -n "$OFFICIAL" ]; then
		say "The content file $CONTENT was written by SnapRAID 13 or older, and SnapRAID 15"
		say "cannot read it: it was left as it is, as the array of SnapRAID Daemon."
	else
		migrate_content "$CONTENT"
	fi
fi

# The engine: needed if missing or older than 15.0. Next to SnapRAID Daemon
# it's installed only if missing, never changed: the check above stopped on
# an engine too old
ENGINE=""
ENGINE_HAVE=$(dpkg-query -W -f='${Version}' snapraid 2>/dev/null || true)
if [ -n "$OFFICIAL" ] && [ -n "$ENGINE_HAVE" ]; then
	[ -z "${SNAPRAID_DEB:-}${SNAPRAID_VERSION:-}" ] \
		|| say "SNAPRAID_DEB and SNAPRAID_VERSION are not used: the engine of SnapRAID Daemon is kept as it is."
elif [ -n "${SNAPRAID_DEB:-}" ]; then
	[ -f "$SNAPRAID_DEB" ] || die "$SNAPRAID_DEB not found"
	cp "$SNAPRAID_DEB" "$TMP/"
	ENGINE="$TMP/$(basename "$SNAPRAID_DEB")"
elif [ -z "$ENGINE_HAVE" ] || dpkg --compare-versions "$ENGINE_HAVE" lt 15.0; then
	say "Downloading the SnapRAID engine"
	VER="${SNAPRAID_VERSION:-$(latest_version "$ENGINE_REPO")}"
	[ -n "$VER" ] || die "cannot find the latest version of the SnapRAID engine"
	ENGINE="$TMP/snapraid_$VER-1_amd64.deb"
	curl -fsSL -o "$ENGINE" "https://github.com/$ENGINE_REPO/releases/download/v$VER/snapraid_$VER-1_amd64.deb"
	curl -fsSL -o "$TMP/engine.sums" "https://raw.githubusercontent.com/$ENGINE_REPO/master/CHECKSUMS"
	verify "$ENGINE" "$TMP/engine.sums"
fi

# The daemon
if [ -n "$OPT_DEB" ]; then
	[ -f "$OPT_DEB" ] || die "$OPT_DEB not found"
	cp "$OPT_DEB" "$TMP/"
	DAEMON="$TMP/$(basename "$OPT_DEB")"
else
	say "Downloading DiskFlux"
	VER="${OPT_VERSION:-$(latest_version "$DAEMON_REPO")}"
	[ -n "$VER" ] || die "cannot find the latest version of the daemon"
	DAEMON="$TMP/diskflux_$VER-1_amd64.deb"
	curl -fsSL -o "$DAEMON" "https://github.com/$DAEMON_REPO/releases/download/v$VER/diskflux_$VER-1_amd64.deb"
	curl -fsSL -o "$TMP/daemon.sums" "https://github.com/$DAEMON_REPO/releases/download/v$VER/SHA256SUMS"
	verify "$DAEMON" "$TMP/daemon.sums"
fi

# A configuration is new if no package owned it before
NEW=1
if dpkg-query -W -f='${Status}' diskflux 2>/dev/null | grep -q "ok installed"; then
	NEW=0
elif [ -e "$CONF" ] || [ -n "$EARLIER" ]; then
	NEW=0
fi

say "Installing the packages"
apt-get update -q
# shellcheck disable=SC2086
apt-get install -y -q -o Dpkg::Options::=--force-confold $ENGINE "$DAEMON"
# apt removed the earlier package and kept the entry of its configuration file,
# now moved: nothing of value is left in it
if [ -n "$EARLIER" ] && dpkg-query -W -f='${Status}' snapraid-daemon-storage 2>/dev/null | grep -q "config-files"; then
	dpkg --purge snapraid-daemon-storage >/dev/null || say "warning: snapraid-daemon-storage could not be purged"
fi

# The servers behind the Sharing page. They listen on the network as soon
# as installed, so they are added by default only to a machine that is new
# to SnapRAID and to this daemon: an existing setup is left as it is, unless
# asked. Not having them is not an error: the Sharing page says what to do.
SHARES="$OPT_SHARES"
if [ -z "$SHARES" ]; then
	if [ "$NEW" = "1" ] && [ -z "$CONTENT" ] && [ -z "$OFFICIAL" ] && [ ! -e /etc/snapraidd.conf ]; then SHARES=1; else SHARES=0; fi
fi
SHARES_DONE=0
if [ "$SHARES" = "1" ]; then
	if command -v smbd >/dev/null 2>&1 && command -v exportfs >/dev/null 2>&1; then
		SHARES_DONE=2
	else
		say "Installing Samba and NFS, for the Sharing page"
		if apt-get install -y -q -o Dpkg::Options::=--force-confold samba nfs-kernel-server; then
			SHARES_DONE=1
		else
			say "warning: Samba and NFS could not be installed. Everything else works; to try again:"
			say "  apt-get install samba nfs-kernel-server"
		fi
	fi
fi

# The package imported the settings of SnapRAID Daemon (diskflux --import-conf)
# from /etc/snapraidd.conf. Built from the sources, SnapRAID Daemon may read
# /usr/local/etc/snapraidd.conf instead: imported here, the same way. Its
# login, addresses, schedule and the rest are kept as they were imported.
IMPORTED=0
if [ "$NEW" = "1" ] && [ -n "$OFFICIAL_CONF" ] && ! grep -q '^# Settings imported from ' "$CONF" 2>/dev/null; then
	diskflux --import-conf "$OFFICIAL_CONF" || true
fi
# Moving from the earlier package, its configuration is imported instead of
# moved when SnapRAID Daemon may own it (pkg/preinst)
if { [ "$NEW" = "1" ] || [ -n "$EARLIER" ]; } && grep -q '^# Settings imported from ' "$CONF" 2>/dev/null; then
	IMPORTED=1
	# the import moves the addresses of SnapRAID Daemon to the port 7700 of
	# DiskFlux: another port asked for, or 7700 found taken, goes in their place
	if [ "$PORT" != "7700" ]; then
		conf_set_port "$CONF" "$PORT" > "$TMP/diskflux.conf"
		cat "$TMP/diskflux.conf" > "$CONF"
	fi
fi

USER_NAME="$OPT_USER"
PASSWORD=""
OPENED=0
WATCHING=0
CRED=""
if [ "$NEW" = "1" ] && [ "$IMPORTED" = "0" ] && [ "$OPT_LOCAL" != "1" ]; then
	PASSWORD="$OPT_PASSWORD"
	if [ -z "$PASSWORD" ]; then
		PASSWORD=$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')
	fi
	CRED=$(diskflux -g "$USER_NAME:$PASSWORD" | sed -n 's/^net_auth_credential = //p')
	[ -n "$CRED" ] || die "cannot generate the credential of the web UI"
	OPENED=1
fi
# The address of the web UI written in the configuration: every interface when
# opened to the network, the machine itself on another port than the default
LISTEN=""
if [ "$OPENED" = "1" ]; then
	LISTEN="$PORT"
elif [ "$NEW" = "1" ] && [ "$IMPORTED" = "0" ] && [ "$PORT" != "7700" ]; then
	LISTEN="127.0.0.1:$PORT"
fi
# An array already in use has its own routine, by hand or with scheduled
# jobs: the daemon must not add a nightly sync and scrub to it, nor start
# spinning down its disks, until asked to
if [ "$NEW" = "1" ] && [ "$IMPORTED" = "0" ] && [ -n "$CONTENT" ] && [ "$OPT_AUTO" != "1" ]; then
	WATCHING=1
fi

if [ "$OPENED" = "1" ] || [ "$WATCHING" = "1" ] || [ -n "$LISTEN" ]; then
	# Listen on all the interfaces, require the password, enable the Storage page;
	# no schedule and no spin down for an array already in use
	CRED="$CRED" LISTEN="$LISTEN" OPENED="$OPENED" WATCHING="$WATCHING" awk '
		BEGIN { opened = ENVIRON["OPENED"] == "1"; watching = ENVIRON["WATCHING"] == "1"; listen = ENVIRON["LISTEN"] }
		listen != "" && /^#?[[:space:]]*net_port[[:space:]]*=/ && !port { print "net_port = " listen; port = 1; next }
		opened && /^#?[[:space:]]*net_auth_credential[[:space:]]*=/ && !cred { print "net_auth_credential = " ENVIRON["CRED"]; cred = 1; next }
		opened && /^#?[[:space:]]*net_storage_admin[[:space:]]*=/ && !adm { print "net_storage_admin = 1"; adm = 1; next }
		watching && /^#?[[:space:]]*maintenance_schedule[[:space:]]*=/ && !sched { print "maintenance_schedule ="; sched = 1; next }
		watching && /^#?[[:space:]]*spindown_idle_minutes[[:space:]]*=/ && !spin { print "spindown_idle_minutes = 0"; spin = 1; next }
		{ print }
		END {
			if (listen != "" && !port) print "net_port = " listen
			if (opened && !cred) print "net_auth_credential = " ENVIRON["CRED"]
			if (opened && !adm) print "net_storage_admin = 1"
			if (watching && !sched) print "maintenance_schedule ="
			if (watching && !spin) print "spindown_idle_minutes = 0"
		}
	' "$CONF" > "$TMP/diskflux.conf"
	cat "$TMP/diskflux.conf" > "$CONF"
	chmod 600 "$CONF"
fi

if [ -d /run/systemd/system ]; then
	systemctl enable diskflux.service >/dev/null 2>&1 || true
	systemctl restart diskflux.service
	STARTED=1
else
	STARTED=0
fi

ADDR=$(hostname -I 2>/dev/null | awk '{ print $1 }')
[ -n "$ADDR" ] || ADDR="<address of this machine>"

say ""
say "DiskFlux $(dpkg-query -W -f='${Version}' diskflux) is installed."
ENGINE_NOW=$(dpkg-query -W -f='${Version}' snapraid 2>/dev/null || true)
if [ -n "$ENGINE_HAVE" ] && [ "$ENGINE_HAVE" != "$ENGINE_NOW" ]; then
	say "The SnapRAID engine was upgraded from $ENGINE_HAVE to $ENGINE_NOW: 'snapraid' in your shell is the new one."
fi
if [ "$STARTED" = "0" ]; then
	say "systemd is not running here: start the daemon with 'diskflux'."
fi
if [ "$OPENED" = "1" ]; then
	say ""
	say "  Web UI:    http://$ADDR:$PORT"
	say "  User:      $USER_NAME"
	say "  Password:  $PASSWORD"
	say ""
	say "The password is not stored in clear anywhere: note it now."
	say "To change it: the System page of the web UI, under Login."
	say "If it is lost: diskflux -g $USER_NAME:NEW_PASSWORD, put the line in $CONF,"
	say "then: systemctl restart diskflux"
	say ""
	say "The web UI uses plain HTTP: use it on a trusted network or a VPN only."
elif [ "$IMPORTED" = "1" ]; then
	_from=$(sed -n '1s/^# Settings imported from \(.*\) on [0-9-]* [0-9:]*$/\1/p' "$CONF")
	_np=$(conf_value "$CONF" net_port)
	say ""
	say "The settings of SnapRAID Daemon were imported from ${_from:-its configuration} (listed"
	say "above), which was not changed: the same login, schedule and log folder, on the"
	say "port of DiskFlux."
	say "  Web UI:    $(web_urls "${_np:-127.0.0.1:$PORT}")"
elif [ "$NEW" = "1" ]; then
	say ""
	say "  Web UI:    http://127.0.0.1:$PORT (from this machine only)"
	say ""
	say "To open it to the network and enable the Storage page, see net_port,"
	say "net_auth_credential and net_storage_admin in $CONF."
elif [ -n "$EARLIER" ]; then
	_np=$(conf_value "$CONF" net_port)
	say ""
	say "DiskFlux took the place of snapraid-daemon-storage $EARLIER, with the same settings,"
	say "arrays, shares and history, moved to its own names ($CONF)."
	say "  Web UI:    $(web_urls "${_np:-127.0.0.1:7700}")"
	if [ "$EARLIER_PORT" = "7627" ]; then
		say "The web UI moved from port 7627, the default of SnapRAID Daemon, to 7700, the port"
		say "of DiskFlux: SnapRAID Daemon can be installed next to it."
	fi
else
	say "The existing configuration in $CONF was kept."
fi

# SnapRAID Daemon, left as it is: where both are, and what DiskFlux does on
# its own on the same disks. Nothing is switched off: each job is for the user
# to keep in one of the two
if [ -n "$OFFICIAL" ]; then
	_his=$(conf_value "$OFFICIAL_CONF" net_port)
	_ours=$(conf_value "$CONF" net_port)
	say ""
	say "SnapRAID Daemon ($OFFICIAL) was left as it is: not stopped, not"
	say "changed, with its configuration, its service and the SnapRAID engine it uses."
	say "  SnapRAID Daemon:  $(web_urls "${_his:-127.0.0.1:7627}")"
	say "  DiskFlux:         $(web_urls "${_ours:-127.0.0.1:7700}")"
	if official_running || official_enabled; then
		_twice=""
		_own=""
		_sched=$(conf_value "$CONF" maintenance_schedule)
		[ -z "$_sched" ] || _twice="$_twice; the maintenance ($_sched)"
		conf_value "$CONF" spindown_idle_minutes | tr ',' '\n' | grep -q '^[[:space:]]*0*[1-9]' \
			&& _twice="$_twice; the spin-down of idle disks"
		[ -z "$(conf_value "$CONF" notify_start)$(conf_value "$CONF" notify_result)" ] || _twice="$_twice; the alerts"
		[ -z "$(conf_value "$CONF" sys_shutdown_on)" ] || _own="$_own; the power off after its jobs"
		[ -z "$(conf_value "$CONF" hook_docker_pause)" ] || _own="$_own; the pause of Docker containers"
		[ -z "$(conf_value "$CONF" hook_script)" ] || _own="$_own; the hook script"
		[ -z "$(conf_value "$CONF" notify_heartbeat)" ] || _own="$_own; the heartbeat ping"
		if [ -n "$_twice$_own" ]; then
			say ""
			if official_running; then
				say "SnapRAID Daemon is running on this machine, on the same disks. Each one keeps its"
			else
				say "SnapRAID Daemon starts with this machine, on the same disks. Each one keeps its"
			fi
			say "own schedule."
			if [ -n "$_twice" ]; then
				say "DiskFlux also does these: keep each job in one of the two, and turn it off in the other."
				printf '%s\n' "${_twice#; }" | sed 's/; /\n/g' | sed 's/^/  - /'
			fi
			if [ -n "$_own" ]; then
				say "DiskFlux runs these around its own jobs, not around the ones of SnapRAID Daemon:"
				printf '%s\n' "${_own#; }" | sed 's/; /\n/g' | sed 's/^/  - /'
			fi
			say "They are in the Protection and Settings pages of the DiskFlux web UI, and in $CONF."
		fi
	fi
fi

if [ "$SHARES_DONE" = "1" ]; then
	say ""
	say "Samba and NFS were installed for the Sharing page. No folder is shared and no"
	say "user can log in until you add a share and a user in the web UI."
elif [ "$SHARES_DONE" = "0" ] && ! command -v smbd >/dev/null 2>&1; then
	say ""
	say "Samba is not installed, so the Sharing page cannot share folders yet. To add it:"
	say "  apt-get install samba nfs-kernel-server"
fi

if [ "$NEW" = "1" ] && [ -n "$CONTENT" ]; then
	say ""
	say "The array of $ENGINE_CONF is already in use: it was left as it is, with its"
	say "configuration, /etc/fstab and scheduled jobs. 'snapraid' works from the shell as before."
fi
if [ "$WATCHING" = "1" ]; then
	say "The daemon only watches the array: it runs no sync or scrub of its own and doesn't"
	say "spin down the disks. To hand the maintenance over to it, set a schedule in the"
	say "Settings page of the web UI, and remove your own scheduled jobs."
	# shellcheck disable=SC2046
	JOBS=$(grep -ls snapraid /etc/crontab /etc/cron.d/* /etc/cron.hourly/* /etc/cron.daily/* \
		/etc/cron.weekly/* /etc/cron.monthly/* /var/spool/cron/crontabs/* /var/spool/cron/* \
		/etc/systemd/system/*.timer /etc/systemd/system/*.service 2>/dev/null | grep -v diskflux || true)
	if [ -n "$JOBS" ]; then
		say "Scheduled jobs found that use SnapRAID, left untouched:"
		printf '%s\n' "$JOBS" | sed 's/^/  /'
	fi
fi

}

main "$@" </dev/null
