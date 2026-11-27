// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#include "os/portable.h"

#include "app.h"
#include "support.h"
#include "look.h"

static const char* LOOK[LOOK_COUNT] = { "quiet", "console", "commander", "brutale" };

const char* look_name(unsigned i)
{
	return i < LOOK_COUNT ? LOOK[i] : 0;
}

static int look_is_separator(char c)
{
#ifdef _WIN32
	return c == '/' || c == '\\';
#else
	return c == '/';
#endif
}

/**
 * Split a web root: where its last name starts, how long the name is without
 * ".zip" and the separators after it, and if it is a .zip file.
 */
static void look_split(const char* root, size_t* start, size_t* len, int* is_zip)
{
	size_t end = strlen(root);

	/* a folder may be written with separators at its end */
	while (end > 1 && look_is_separator(root[end - 1]))
		--end;

	size_t begin = end;
	while (begin > 0 && !look_is_separator(root[begin - 1]))
		--begin;

	*is_zip = end - begin > 4 && memcmp(root + end - 4, ".zip", 4) == 0;
	*start = begin;
	*len = end - begin - (*is_zip ? 4 : 0);

	/* "quiet.zip/" is a folder with an odd name, not the file: not a look */
	if (*is_zip && root[end] != 0)
		*len = 0;
}

const char* look_of_root(const char* root)
{
	size_t start, len;
	int is_zip;

	look_split(root, &start, &len, &is_zip);

	/* a folder is a look only with its place written: a bare name is a file of the data directory */
	if (!is_zip && start == 0)
		return 0;

	for (unsigned i = 0; i < LOOK_COUNT; ++i) {
		if (strlen(LOOK[i]) == len && memcmp(root + start, LOOK[i], len) == 0)
			return LOOK[i];
	}

	return 0;
}

int look_root(const char* root, const char* name, char* dst, size_t dst_size)
{
	size_t start, len;
	int is_zip;
	const char* look = 0;

	if (look_of_root(root) == 0)
		return -1;

	/* only the names of the looks: what is written in the configuration never comes from the request */
	for (unsigned i = 0; i < LOOK_COUNT; ++i) {
		if (strcmp(name, LOOK[i]) == 0)
			look = LOOK[i];
	}
	if (look == 0)
		return -1;

	look_split(root, &start, &len, &is_zip);

	int ret = snprintf(dst, dst_size, "%.*s%s%s", (int)start, root, look, is_zip ? ".zip" : "");
	if (ret < 0 || (size_t)ret >= dst_size)
		return -1;

	return 0;
}

int look_present(const char* root)
{
	char path[PATH_MAX + 16];
	struct stat st;
	size_t start, len;
	int is_zip;

	look_split(root, &start, &len, &is_zip);

	if (is_zip) {
		if (start == 0)
			app_default_data(path, sizeof(path), root); /* as web_reload() does */
		else
			snprintf(path, sizeof(path), "%s", root);
	} else {
		snprintf(path, sizeof(path), "%.*s/index.html", (int)(start + len), root);
	}

	return stat(path, &st) == 0 && S_ISREG(st.st_mode);
}

#define LCHECK(cond) \
	do { \
		if (!(cond)) { \
			printf("selftest: look: %s (line %d)\n", #cond, __LINE__); \
			return -1; \
		} \
	} while (0)

static int look_root_is(const char* root, const char* name, const char* expected)
{
	char out[64];

	if (look_root(root, name, out, sizeof(out)) != 0)
		return expected == 0;

	return expected != 0 && strcmp(out, expected) == 0;
}

int look_selftest(void)
{
	char tiny[8];

	LCHECK(look_name(0) != 0 && strcmp(look_name(0), "quiet") == 0);
	LCHECK(look_name(LOOK_COUNT - 1) != 0 && look_name(LOOK_COUNT) == 0);

	/* the look of a web root */
	LCHECK(look_of_root("quiet.zip") != 0 && strcmp(look_of_root("quiet.zip"), "quiet") == 0);
	LCHECK(look_of_root("/usr/share/diskflux/console.zip") != 0 && strcmp(look_of_root("/usr/share/diskflux/console.zip"), "console") == 0);
	LCHECK(look_of_root("/ui/brutale") != 0 && strcmp(look_of_root("/ui/brutale"), "brutale") == 0);
	LCHECK(look_of_root("/ui/commander/") != 0 && strcmp(look_of_root("/ui/commander/"), "commander") == 0);
	LCHECK(look_of_root("") == 0);
	LCHECK(look_of_root("/") == 0);
	LCHECK(look_of_root(".zip") == 0);
	LCHECK(look_of_root("quiet") == 0); /* a folder without its place is not served */
	LCHECK(look_of_root("mine.zip") == 0);
	LCHECK(look_of_root("/srv/www") == 0);
	LCHECK(look_of_root("/srv/quiet2") == 0);
	LCHECK(look_of_root("/srv/quiet.zip.old") == 0);
	LCHECK(look_of_root("Quiet.zip") == 0);
	LCHECK(look_of_root("/srv/quiet.zip/") == 0);

	/* another look, in the same place and of the same kind */
	LCHECK(look_root_is("quiet.zip", "console", "console.zip"));
	LCHECK(look_root_is("/usr/share/diskflux/quiet.zip", "brutale", "/usr/share/diskflux/brutale.zip"));
	LCHECK(look_root_is("/ui/quiet", "console", "/ui/console"));
	LCHECK(look_root_is("/ui/quiet/", "commander", "/ui/commander"));
	LCHECK(look_root_is("/ui/console", "console", "/ui/console"));

	/* nothing else is ever written */
	LCHECK(look_root_is("mine.zip", "console", 0));
	LCHECK(look_root_is("/srv/www", "console", 0));
	LCHECK(look_root_is("", "console", 0));
	LCHECK(look_root_is("quiet.zip", "mine", 0));
	LCHECK(look_root_is("quiet.zip", "../console", 0));
	LCHECK(look_root_is("quiet.zip", "/etc/passwd", 0));
	LCHECK(look_root_is("quiet.zip", "console.zip", 0));
	LCHECK(look_root_is("quiet.zip", "", 0));
	LCHECK(look_root("quiet.zip", "commander", tiny, sizeof(tiny)) != 0);

	return 0;
}
