// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#ifndef LOOK_H
#define LOOK_H

/*
 * The looks of the pages: Quiet, Console, Commander and Brutale.
 *
 * A look is the folder or the .zip file named in net_web_root. The pages can
 * ask for another one only when net_web_root already names one of the looks:
 * the new value is the same place with the other name, never a path sent by
 * the browser. A web root with any other name is someone's own pages, and is
 * changed only in diskflux.conf.
 */

/** How many looks there are. */
#define LOOK_COUNT 4

/** Name of the look number i (0 to LOOK_COUNT - 1), in the order they are offered. */
const char* look_name(unsigned i);

/**
 * The look a web root serves: "quiet" for "quiet.zip", "/usr/share/diskflux/quiet.zip"
 * or "/ui/quiet/".
 * \return The name, or 0 if the web root is not one of the looks.
 */
const char* look_of_root(const char* root);

/**
 * The web root of another look, in the same place and of the same kind
 * (a .zip file or a folder) as the given one.
 * \return 0 on success, -1 if root is not a look, name is not a look, or dst is too small.
 */
int look_root(const char* root, const char* name, char* dst, size_t dst_size);

/**
 * Tell if the pages of a web root are on this machine: the .zip file, or the
 * index.html of the folder.
 */
int look_present(const char* root);

int look_selftest(void);

#endif
