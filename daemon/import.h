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
 * DiskFlux, so the two never ask for the same port, and a net_web_root given as
 * a path is left out, because it would serve the pages of SnapRAID Daemon.
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
 * Self-test of the import.
 * @return 0 on success.
 */
int import_selftest(void);

#endif
