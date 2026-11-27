#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Robert Paleka
#
# Test of the change of the look of the pages (POST /snapraid/v1/host/look)
# against a daemon built in this tree, started on a port and a directory of
# its own. Nothing of the machine is touched: the .zip files of the looks are
# copied to the directory of the test.
#
#   test/look-test.sh             from the top of the tree, after make
#   BIN=/usr/bin/diskflux ZIPS=/usr/share/diskflux PORT=17629 DIR=/tmp/look-test test/look-test.sh
#
# ZIPS is where quiet.zip, console.zip, commander.zip and brutale.zip are
# (beside the daemon after make), SRC the top of the sources (for the looks
# served as folders). Run as root, the check of a configuration that cannot
# be written is skipped.
SRC=${SRC:-$(cd "$(dirname "$0")/.." && pwd)}
BIN=${BIN:-$SRC/diskflux}
ZIPS=${ZIPS:-$(dirname "$BIN")}
DIR=${DIR:-$(mktemp -d)}
PORT=${PORT:-17629}
rm -rf $DIR; mkdir -p $DIR/looks
[ -x "$BIN" ] || { echo "no daemon at $BIN: run make first"; exit 2; }
for look in quiet console commander brutale; do
	[ -f "$ZIPS/$look.zip" ] || { echo "no $look.zip in $ZIPS: run make first"; exit 2; }
done
CONF=$DIR/diskflux.conf
L=http://127.0.0.1:$PORT
A=$L/snapraid/v1
pass=0; fail=0
ok() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1: got '$2', wanted '$3'"; fi; }
code() { curl -s -o $DIR/body -D $DIR/head -w "%{http_code}" "$@"; }
post() { body=$1; shift; code -X POST -H 'Content-Type: application/json' -d "$body" "$@" $A/host/look; }
field() { python3 -c "import json,sys; d=json.load(open('$DIR/body')); print(json.dumps(d$1))" 2>/dev/null; }
# the look a browser gets: what the index page says
page() { curl -s "$@" $L/ | grep -o 'data-look="[a-z]*"' | head -1; }
modified() { curl -s -o /dev/null -D - $L/$1 | tr -d '\r' | sed -n 's/^Last-Modified: //p'; }
looks() { rm -f $DIR/looks/*.zip; for look in "$@"; do cp "$ZIPS/$look.zip" $DIR/looks/; done; }
start() {
	pkill -f -- "-c $CONF -p" 2>/dev/null; sleep 0.5
	printf '%s\n' "$@" > $CONF
	($BIN -f $NOCACHE-c $CONF -p $DIR/pid > $DIR/out.log 2>&1 &); sleep 1.5
}
NOCACHE=

echo "== the looks as .zip files"
looks quiet console commander brutale
start "# my notes" "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "net_web_root = $DIR/looks/quiet.zip" "scrub_percentage = 3"
ok "status" "$(code $A/host)" 200
ok "the look in use" "$(field "['look']['current']")" '"quiet"'
ok "the looks on the machine" "$(field "['look']['choices']")" '["quiet", "console", "commander", "brutale"]'
ok "can be changed" "$(field "['look']['change']")" true
ok "the page is Quiet" "$(page)" ''
ok "no page of Console yet" "$(code $L/css/console.css)" 404
BEFORE=$(modified css/style.css)
ok "a browser's copy is good" "$(code -H "If-Modified-Since: $BEFORE" $L/css/style.css)" 304
sleep 1.1
ok "to Console" "$(post '{"look":"console"}')" 200
ok "written, in the same place" "$(grep -c "^net_web_root = $DIR/looks/console.zip\$" $CONF)" 1
ok "one line" "$(grep -c 'net_web_root' $CONF)" 1
ok "other lines kept" "$(grep -c -e '^# my notes' -e '^scrub_percentage = 3' -e '^net_storage_admin = 1' $CONF)" 3
ok "the page is Console, without a restart" "$(page)" 'data-look="console"'
ok "its own file is served" "$(code $L/css/console.css)" 200
ok "a browser's older copy is not used" "$(code -H "If-Modified-Since: $BEFORE" $L/css/style.css)" 200
ok "status says Console" "$(code $A/host; field "['look']['current']")" '200"console"'
ok "said in what happened" "$(code "$A/host/events?limit=10"; grep -c '"kind": *"look"' $DIR/body)" 2001
ok "the same again changes nothing" "$(post '{"look":"console"}')" 200
ok "still one event" "$(code "$A/host/events?limit=10"; grep -c '"kind": *"look"' $DIR/body)" 2001

echo "== what is refused"
SAVED=$(cat $CONF)
ok "no name" "$(post '{}')" 400
ok "a name that is not a look" "$(post '{"look":"mine"}')" 400
ok "a file name" "$(post '{"look":"console.zip"}')" 400
ok "a path" "$(post '{"look":"../../etc/passwd"}')" 400
ok "a path of another look" "$(post "{\"look\":\"$DIR/looks/quiet\"}")" 400
ok "another field" "$(post '{"look":"quiet","root":"/tmp"}')" 400
ok "not read with GET" "$(code $A/host/look)" 404
ok "nothing written" "$(cat $CONF)" "$SAVED"
ok "still Console" "$(page)" 'data-look="console"'

echo "== a look that is not on the machine, or cannot be read"
rm $DIR/looks/brutale.zip
head -c 2000 /dev/urandom > $DIR/looks/commander.zip
ok "not offered when missing" "$(code $A/host; field "['look']['choices']")" '200["quiet", "console", "commander"]'
ok "missing refused" "$(post '{"look":"brutale"}')" 404
ok "unreadable refused" "$(post '{"look":"commander"}')" 500
ok "nothing written" "$(cat $CONF)" "$SAVED"
ok "the pages in use stay" "$(page)$(code $L/css/console.css)" 'data-look="console"200'
ok "back to Quiet" "$(post '{"look":"quiet"}')$(page)" 200
ok "written" "$(grep -c "^net_web_root = $DIR/looks/quiet.zip\$" $CONF)" 1

echo "== survives a restart"
looks quiet console commander brutale
ok "to Brutale" "$(post '{"look":"brutale"}')" 200
start "$(cat $CONF)"
ok "kept after a restart" "$(code $A/host; field "['look']['current']")" '200"brutale"'

if [ "$(id -u)" != 0 ]; then
echo "== a configuration that cannot be written"
chmod a-w $CONF $DIR
ok "refused" "$(post '{"look":"console"}')" 500
ok "the pages in use are back" "$(page)$(code $L/css/console.css)" 404
ok "status says the look written" "$(code $A/host; field "['look']['current']")" '200"brutale"'
chmod u+w $CONF $DIR
else echo "skip (root writes everywhere)"; fi

echo "== only one look on the machine"
looks quiet
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "net_web_root = $DIR/looks/quiet.zip"
ok "nothing to choose" "$(code $A/host; field "['look']['choices']")$(field "['look']['change']")" '200["quiet"]false'

echo "== pages of one's own"
mkdir -p $DIR/mine; (cd $DIR/mine && unzip -q "$ZIPS/quiet.zip")
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "net_web_root = $DIR/mine"
ok "not a look" "$(code $A/host; field "['look']['current']")$(field "['look']['change']")" '200""false'
ok "changed only in the file" "$(post '{"look":"console"}')" 409
ok "nothing written" "$(grep -c "^net_web_root = $DIR/mine\$" $CONF)" 1

echo "== the looks as folders, read at every request (-N)"
NOCACHE="-N "
for look in quiet console commander brutale; do mkdir -p $DIR/ui/$look; (cd $DIR/ui/$look && unzip -q "$ZIPS/$look.zip"); done
# the same time on every file, as after a checkout
find $DIR/ui -exec touch -d '2026-01-01 00:00:00' {} +
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "net_web_root = $DIR/ui/quiet/"
ok "the looks on the machine" "$(code $A/host; field "['look']['choices']")" '200["quiet", "console", "commander", "brutale"]'
BEFORE=$(modified css/style.css)
ok "a browser's copy is good" "$(code -H "If-Modified-Since: $BEFORE" $L/css/style.css)" 304
ok "to Console" "$(post '{"look":"console"}')" 200
ok "written as a folder" "$(grep -c "^net_web_root = $DIR/ui/console\$" $CONF)" 1
ok "the page is Console" "$(page)" 'data-look="console"'
ok "a browser's older copy is not used" "$(code -H "If-Modified-Since: $BEFORE" $L/css/style.css)" 200
AFTER=$(modified css/style.css)
ok "the new copy is good" "$(code -H "If-Modified-Since: $AFTER" $L/css/style.css)" 304
rm $DIR/ui/brutale/index.html
ok "a folder without pages is not offered" "$(code $A/host; field "['look']['choices']")" '200["quiet", "console", "commander"]'
ok "and refused" "$(post '{"look":"brutale"}')" 404
NOCACHE=

echo "== not allowed"
looks quiet console commander brutale
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 0" "net_web_root = $DIR/looks/quiet.zip"
ok "refused without administration" "$(post '{"look":"console"}')" 403
ok "still Quiet" "$(page)$(grep -c "^net_web_root = $DIR/looks/quiet.zip\$" $CONF)" 1
CRED=$($BIN -g admin:look-pass-1 2>/dev/null | grep -o 'admin:\$argon2id.*')
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "net_web_root = $DIR/looks/quiet.zip" "net_auth_credential = $CRED"
ok "refused without the login" "$(post '{"look":"console"}')" 401
ok "allowed with it" "$(post '{"look":"console"}' -u admin:look-pass-1)" 200
ok "the page is Console" "$(page -u admin:look-pass-1)" 'data-look="console"'

pkill -f -- "-c $CONF -p" 2>/dev/null
echo
echo "$pass passed, $fail failed"
[ $fail = 0 ]
