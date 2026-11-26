#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Robert Paleka
#
# Test of the server actions (POST /snapraid/v1/host/server_action) and of
# what the pages read about them in GET /snapraid/v1/host, against a daemon
# built in this tree, started on a port and a directory of its own.
#
# The daemon always runs with DISKFLUX_HOST_DRYRUN=1: the machine is never
# put to sleep, restarted or turned off, the actions are only logged.
#
#   test/server-actions-test.sh            from the top of the tree, after make
#   BIN=/usr/bin/diskflux PORT=17628 DIR=/tmp/actions-test test/server-actions-test.sh
BIN=${BIN:-$(cd "$(dirname "$0")/.." && pwd)/diskflux}
DIR=${DIR:-$(mktemp -d)}
PORT=${PORT:-17628}
rm -rf $DIR; mkdir -p $DIR
[ -x "$BIN" ] || { echo "no daemon at $BIN: run make first"; exit 2; }
CONF=$DIR/diskflux.conf
L=http://127.0.0.1:$PORT/snapraid/v1
pass=0; fail=0
ok() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1: got '$2', wanted '$3'"; fi; }
code() { curl -s -o $DIR/body -w "%{http_code}" "$@"; }
act() { code -X POST -H 'Content-Type: application/json' -d "$1" $L/host/server_action; }
field() { python3 -c "import json,sys; d=json.load(open('$DIR/body')); print(json.dumps(d$1))" 2>/dev/null; }
# a whole expression on the reply d
expr() { python3 -c "import json,sys; d=json.load(open('$DIR/body')); print(json.dumps($1))" 2>/dev/null; }
events() { curl -s "$L/host/events?limit=50" > $DIR/events; }
has_event() { python3 -c "
import json,sys
d=json.load(open('$DIR/events'))
print(sum(1 for e in d.get('events',[]) if e.get('kind')=='power' and e.get('target')=='$1' and '$2' in e.get('text','')))"; }
start() {
	pkill -f "diskflux -f -c $CONF" 2>/dev/null; sleep 0.5
	printf '%s\n' "$@" > $CONF
	(DISKFLUX_HOST_DRYRUN=1 $BIN -f -c $CONF -p $DIR/pid > $DIR/out.log 2>&1 &); sleep 1.5
}
stop() { pkill -f "diskflux -f -c $CONF" 2>/dev/null; sleep 0.3; }
trap stop EXIT

echo "== what the pages read"
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1"
ok "status" "$(code $L/host)" 200
ok "dry run" "$(field "['dry_run']")" true
ok "admin true" "$(field "['admin']")" true
ok "address of this browser" "$(field "['login']['address']")" '"127.0.0.1"'
ok "uptime is a number" "$(field "['server_actions']['uptime_seconds'] >= 0")" true
ok "server time" "$(field "['server_actions']['time'][:2]")" '"20"'
ok "time zone given" "$(expr "len(d['server_actions']['timezone']) > 0")" true
ok "offset in minutes" "$(expr "type(d['server_actions']['utc_offset_minutes']).__name__")" '"int"'
ok "next maintenance (-1: none)" "$(field "['server_actions']['next_maintenance_minutes'] >= -1")" true
ok "computers on the shares" "$(field "['server_actions']['share_clients'] >= 0")" true
ok "nothing busy" "$(field "['server_actions']['busy']")" '""'
ok "nothing waiting" "$(expr "'pending' in d['server_actions']")" false
ok "each action says if it can run" "$(expr "sorted(d['server_actions']['available'].keys())")" '["disks_sleep", "poweroff", "reboot", "service_restart", "suspend"]'
ok "letting the disks sleep is always possible" "$(field "['server_actions']['available']['disks_sleep']")" '""'
if [ -d /run/systemd/system ]; then SYSTEMD=1; else SYSTEMD=0; fi
ok "restart of DiskFlux follows systemd" "$(expr "d['server_actions']['available']['service_restart'] == ''")" "$([ $SYSTEMD = 1 ] && echo true || echo false)"

echo "== requests refused"
ok "unknown action" "$(act '{"action":"halt"}')" 400
ok "no action" "$(act '{}')" 400
ok "bad when" "$(act '{"action":"reboot","when":"later"}')" 400
ok "cancel with nothing waiting" "$(act '{"action":"cancel"}')" 409
ok "GET is not an action" "$(code $L/host/server_action)" 404
ok "disks sleep with no array" "$(act '{"action":"disks_sleep"}')" 409

echo "== actions, dry run"
for a in reboot poweroff suspend; do
	if command -v systemctl >/dev/null || { [ $a != suspend ] && command -v shutdown >/dev/null; }; then
		ok "$a accepted" "$(act "{\"action\":\"$a\",\"when\":\"now\"}")" 202
		ok "$a not waiting" "$(field "['waiting']")" false
		sleep 1
		events
		ok "$a logged as dry run" "$(has_event $a '(dry run)')" 1
		ok "daemon still running after $a" "$(code $L/host)" 200
		ok "$a no longer waiting" "$(expr "'pending' in d['server_actions']")" false
	else
		ok "$a refused without its tool" "$(act "{\"action\":\"$a\"}")" 501
	fi
done
if [ $SYSTEMD = 1 ]; then
	ok "restart of DiskFlux accepted" "$(act '{"action":"service_restart"}')" 202
	sleep 1; events
	ok "restart of DiskFlux logged as dry run" "$(has_event service_restart '(dry run)')" 1
else
	ok "restart of DiskFlux refused without systemd" "$(act '{"action":"service_restart"}')" 501
	ok "and says so" "$(field "['message'][:40]")" '"Restarting DiskFlux from this page needs"'
fi
ok "when after with nothing running: done at once" "$(act '{"action":"reboot","when":"after"}')" 202
ok "not waiting" "$(field "['waiting']")" false
sleep 1; events
ok "logged" "$(has_event reboot '(dry run)')" 2

echo "== read-only daemon"
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 0"
ok "status" "$(code $L/host)" 200
ok "admin false" "$(field "['admin']")" false
ok "action refused" "$(act '{"action":"reboot"}')" 403

echo
echo "passed $pass, failed $fail"
[ $fail = 0 ]
