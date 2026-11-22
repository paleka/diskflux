#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Robert Paleka
#
# Test of the change of the login (POST /snapraid/v1/host/login) against a
# daemon built in this tree, started on a port and a directory of its own.
# Nothing of the machine is touched.
#
#   test/login-test.sh            from the top of the tree, after make
#   BIN=/usr/bin/snapraidd PORT=17627 DIR=/tmp/login-test test/login-test.sh
#
# It takes about a minute and a half: the daemon checks one password per
# second, and the test leaves it the time. The requests "from the network"
# use the first address of the machine that is not the loopback; without one
# those checks are skipped. Run as root, the check of a configuration that
# cannot be written is skipped.
BIN=${BIN:-$(cd "$(dirname "$0")/.." && pwd)/snapraidd}
DIR=${DIR:-$(mktemp -d)}
PORT=${PORT:-17627}
rm -rf $DIR; mkdir -p $DIR
[ -x "$BIN" ] || { echo "no daemon at $BIN: run make first"; exit 2; }
ADDR=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | grep -v : | head -1)
CONF=$DIR/snapraidd.conf
L=http://127.0.0.1:$PORT/snapraid/v1
R=http://$ADDR:$PORT/snapraid/v1
pass=0; fail=0; rm -f $DIR/burst
ok() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1: got '$2', wanted '$3'"; fi; }
fast() { curl -s -o $DIR/body -w "%{http_code}" "$@"; }
# one password is checked per second by the daemon: leave it the time
code() { sleep 1.1; fast "$@"; }
# start of a second, so that two requests fall in the same one
align() { python3 -c "import time; t=time.time(); time.sleep(1.02-(t%1))"; }
post() { url=$1; shift; body=$1; shift; code -X POST -H 'Content-Type: application/json' -d "$body" "$@" "$url/host/login"; }
start() {
	pkill -f "snapraidd -f -c $CONF" 2>/dev/null; sleep 0.5
	printf '%s\n' "$@" > $CONF
	($BIN -f -c $CONF -p $DIR/pid > $DIR/out.log 2>&1 &); sleep 1.5
}
field() { python3 -c "import json,sys; d=json.load(open('$DIR/body')); print(json.dumps(d$1))" 2>/dev/null; }

echo "== no login, loopback only"
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "#net_auth_credential ="
ok "status without login" "$(code $L/host)" 200
ok "login.set false" "$(field "['login']['set']")" false
ok "login.local true" "$(field "['login']['local']")" true
ok "login.change true" "$(field "['login']['change']")" true
ok "forwarded request is not local" "$(code -H 'X-Forwarded-For: 1.2.3.4' $L/host; field "['login']['local']")" 200false
ok "first login through a proxy refused" "$(post $L '{"user":"admin","password":"first-pass-1"}' -H 'X-Forwarded-For: 1.2.3.4')" 403
ok "first login without password refused" "$(post $L '{"user":"admin"}')" 400
ok "first login short password refused" "$(post $L '{"user":"admin","password":"short"}')" 400
ok "first login bad user refused" "$(post $L '{"user":"ad:min","password":"first-pass-1"}')" 400
ok "unknown field refused" "$(post $L '{"user":"admin","password":"first-pass-1","hash":"x"}')" 400
ok "nothing written so far" "$(grep -c '^net_auth_credential' $CONF)" 0
ok "first login from the machine" "$(post $L '{"user":"admin","password":"first-pass-1"}')" 200
ok "line written" "$(grep -c '^net_auth_credential = admin:\$argon2id\$' $CONF)" 1
ok "no plain password in the file" "$(grep -c 'first-pass-1' $CONF)" 0
ok "other lines kept" "$(grep -c '^net_storage_admin = 1' $CONF)" 1
ok "now asks for the login" "$(code $L/host)" 401
ok "new login accepted" "$(code -u admin:first-pass-1 $L/host)" 200
ok "login.set true, user admin" "$(field "['login']['set']")$(field "['login']['user']")" 'true"admin"'
ok "no hash in the status" "$(grep -c 'argon2' $DIR/body)" 0

echo "== change with a login"
ok "without current password" "$(post $L '{"user":"admin","password":"second-pass-2"}' -u admin:first-pass-1)" 400
ok "wrong current password" "$(post $L '{"user":"admin","password":"second-pass-2","current":"nope-nope"}' -u admin:first-pass-1)" 403
# three checks asked in the same second: the third finds no turn, even after waiting once
align
for n in 1 2 3; do (curl -s -o /dev/null -w "%{http_code}\n" -X POST -H 'Content-Type: application/json' -d '{"user":"admin","password":"second-pass-2","current":"nope-nope"}' -u admin:first-pass-1 $L/host/login >> $DIR/burst) & done; wait
ok "a burst of wrong passwords is slowed down" "$(sort $DIR/burst | tr '\n' ' ')" "403 403 429 "
ok "still the first login" "$(code -u admin:first-pass-1 $L/host)" 200
ok "nothing to change" "$(post $L '{"user":"admin","current":"first-pass-1"}' -u admin:first-pass-1)" 400
ok "without being logged in" "$(post $L '{"user":"admin","password":"second-pass-2","current":"first-pass-1"}')" 401
ok "password changed" "$(post $L '{"user":"admin","password":"second pass \"2\" ž","current":"first-pass-1"}' -u admin:first-pass-1)" 200
ok "old password refused" "$(code -u admin:first-pass-1 $L/host)" 401
ok "new password accepted (quotes, space, accent)" "$(code -u 'admin:second pass "2" ž' $L/host)" 200
ok "user name alone changed" "$(post $L '{"user":"robert","current":"second pass \"2\" ž"}' -u 'admin:second pass "2" ž')" 200
ok "old user refused" "$(code -u 'admin:second pass "2" ž' $L/host)" 401
ok "new user with the same password" "$(code -u 'robert:second pass "2" ž' $L/host)" 200
ok "both changed" "$(post $L '{"user":"nas@home","password":"third-pass-3","current":"second pass \"2\" ž"}' -u 'robert:second pass "2" ž')" 200
ok "both accepted" "$(code -u nas@home:third-pass-3 $L/host)" 200
ok "one line in the file" "$(grep -c 'net_auth_credential' $CONF)" 1
ok "events have it" "$(code -u nas@home:third-pass-3 "$L/host/events?limit=10"; grep -c '"kind": *"login"' $DIR/body)" 2004

echo "== survives a restart"
SAVED=$(cat $CONF)
start "$SAVED"
ok "login kept after restart" "$(code -u nas@home:third-pass-3 $L/host)" 200
ok "without it refused" "$(code $L/host)" 401

echo "== switch off (the demo)"
[ -n "$ADDR" ] || R=$L
start "net_enabled = 1" "net_port = 0.0.0.0:$PORT" "net_storage_admin = 1" "net_login_change = 0" "$(grep '^net_auth_credential' <<<"$SAVED")"
ok "status says change false" "$(code -u nas@home:third-pass-3 $R/host; field "['login']['change']")" 200false
ok "change refused" "$(post $R '{"user":"x","password":"fourth-pass-4","current":"third-pass-3"}' -u nas@home:third-pass-3)" 403
ok "login untouched" "$(code -u nas@home:third-pass-3 $R/host)" 200

if [ -n "$ADDR" ]; then
echo "== no login, reachable from the network with an access list"
start "net_enabled = 1" "net_port = 0.0.0.0:$PORT" "net_storage_admin = 1" "net_acl = +$ADDR,+127.0.0.1"
ok "status from the network" "$(code $R/host; field "['login']['local']")" 200false
ok "first login from the network refused" "$(post $R '{"user":"admin","password":"first-pass-1"}')" 403
ok "still no login" "$(grep -c '^net_auth_credential' $CONF)" 0
ok "first login from the machine" "$(post $L '{"user":"admin","password":"first-pass-1"}')" 200
ok "then changed from the network" "$(post $R '{"user":"admin","password":"second-pass-2","current":"first-pass-1"}' -u admin:first-pass-1)" 200

else echo "skip (no address beside the loopback)"; fi

echo "== no login, open to the network: administration is refused as before"
start "net_enabled = 1" "net_port = 0.0.0.0:$PORT" "net_storage_admin = 1"
ok "refused from the machine too" "$(post $L '{"user":"admin","password":"first-pass-1"}')" 403

echo "== configuration that cannot be written"
start "net_enabled = 1" "net_port = 127.0.0.1:$PORT" "net_storage_admin = 1" "$(grep '^net_auth_credential' <<<"$SAVED")"
if [ "$(id -u)" = 0 ]; then echo "skip (root writes anywhere)"; else chmod a-w $DIR; ok "save fails" "$(post $L '{"user":"x","password":"fourth-pass-4","current":"third-pass-3"}' -u nas@home:third-pass-3)" 500; chmod u+w $DIR; sleep 1.1; ok "old login stays" "$(code -u nas@home:third-pass-3 $L/host)" 200; fi

pkill -f "snapraidd -f -c $CONF"
echo "passed $pass, failed $fail"
[ $fail = 0 ]
