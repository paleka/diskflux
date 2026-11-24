// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#ifndef IMPORT_H
#define IMPORT_H

#include "state.h"

/*
 * Import of the settings of SnapRAID Daemon (snapraidd.conf) into the
 * configuration of DiskFlux, at installation.
 *
 * Every option DiskFlux understands is taken with its value, with two
 * exceptions: net_port keeps the addresses of SnapRAID Daemon with the port of
 * DiskFlux, so the two never ask for the same port, and net_web_root is left
 * out: DiskFlux opens in its own theme, Quiet.
 * Options DiskFlux does not know, or whose value it refuses, are left out and
 * listed. The file of SnapRAID Daemon is only read, never written.
 */

/** Port of the web UI of DiskFlux. */
#define IMPORT_PORT "7700"

/**
 * Import the settings of src into dst, and print what was taken and what was left.
 * dst is written only if the result loads as a valid configuration. A dst that
 * already holds an import is left as it is.
 * @return 0 on success or when there is nothing to do, -1 on error.
 */
int conf_import(struct snapraid_state* state, const char* src, const char* dst);

/**
 * The retention of the logs in a directory SnapRAID Daemon uses too.
 * Its configurations next to conf (snapraidd.conf, snapraidd-NAME.conf) are read
 * each time: when one of them logs in log_dir, the result is the longer of the
 * two retentions, or 0 (never delete) when it keeps its logs forever, so no log
 * is ever deleted before SnapRAID Daemon would delete it.
 * @return The days to keep the logs, 0 to keep them all.
 */
int import_log_retention(const char* conf, const char* log_dir, int days);

/** SnapRAID Daemon on this machine. */
struct import_his {
	int conf; /**< Its main configuration is next to the one of DiskFlux. */
	int running; /**< Its daemon, or one of its instances, runs. */
	int enabled; /**< Its service, or one of its instances, starts at boot. */
	char instances[512]; /**< Its instances with a configuration, separated by a space. */
};

/**
 * Look for SnapRAID Daemon on this machine: its configurations next to conf,
 * its services enabled in systemd, and its daemons running (from their pid files).
 */
void import_his_daemon(const char* conf, struct import_his* his);

/**
 * Self-test of the import.
 * @return 0 on success.
 */
int import_selftest(void);

#endif
