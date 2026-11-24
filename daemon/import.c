// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#include "os/portable.h"

#include "app.h"
#include "state.h"
#include "support.h"
#include "conf.h"
#include "arrays.h"
#include "import.h"

/** First line of a configuration that holds an import: a second import is never made over it. */
#define IMPORT_MARK "# Settings imported from "

/**
 * The options of the configuration file of DiskFlux, as conf.c reads them.
 * engine_conf and array_parallel are left out: the first belongs to the other
 * arrays, the second does not exist in SnapRAID Daemon.
 */
static const char* IMPORT_KNOWN[] = {
	"sys_engine", "sys_log_directory", "sys_log_retention_days", "sys_log_compression", "sys_shutdown_on",
	"sys_smartignore",
	"net_enabled", "net_port", "net_acl", "net_security_headers", "net_allowed_origin", "net_config_full_access",
	"net_storage_admin", "net_web_root", "net_auth_credential", "net_login_change",
	"check_updates", "maintenance_schedule", "probe_interval_minutes", "spindown_idle_minutes",
	"sync_threshold_deletes", "sync_threshold_updates", "sync_prehash", "sync_prevent_truncations",
	"scrub_percentage", "scrub_older_than", "touch_zero_subseconds",
	"hook_run_as_user", "hook_script", "hook_docker_pause",
	"notify_syslog_enabled", "notify_syslog_level", "notify_run_as_user", "notify_heartbeat", "notify_start",
	"notify_result", "notify_result_level", "notify_differences",
	0
};

static int import_known(const char* key)
{
	for (unsigned i = 0; IMPORT_KNOWN[i]; ++i) {
		if (strcmp(key, IMPORT_KNOWN[i]) == 0)
			return 1;
	}
	return 0;
}

/**
 * The listening addresses of SnapRAID Daemon with the port of DiskFlux.
 * "127.0.0.1:7627" gives "127.0.0.1:7700", "7627" gives "7700",
 * "[::1]:7627,127.0.0.1:7627" gives "[::1]:7700,127.0.0.1:7700", an 's' after
 * the port is kept, and entries that end up the same are written once.
 * @return 0 on success, -1 if an entry cannot be read.
 */
static int import_net_port(const char* his, char* out, size_t out_size)
{
	char buf[256];
	char* save = 0;

	out[0] = 0;
	if (strlen(his) >= sizeof(buf))
		return -1;
	sncpy(buf, sizeof(buf), his);

	for (char* item = strtok_r(buf, ",", &save); item; item = strtok_r(0, ",", &save)) {
		char entry[128];
		char addr[96];
		int secure = 0;

		/* trim */
		while (*item && isspace((unsigned char)*item))
			++item;
		size_t len = strlen(item);
		while (len > 0 && isspace((unsigned char)item[len - 1]))
			item[--len] = 0;
		if (len == 0)
			continue;
		if (item[len - 1] == 's') {
			secure = 1;
			item[--len] = 0;
		}

		/* the address is what comes before the port: [IPv6]:PORT, IPv4:PORT, or PORT alone */
		addr[0] = 0;
		char* port = item;
		if (item[0] == '[') {
			char* close = strchr(item, ']');
			if (!close || close[1] != ':')
				return -1;
			size_t alen = close - item + 1;
			if (alen >= sizeof(addr))
				return -1;
			memcpy(addr, item, alen);
			addr[alen] = 0;
			port = close + 2;
		} else {
			char* colon = strrchr(item, ':');
			if (colon) {
				size_t alen = colon - item;
				if (alen == 0 || alen >= sizeof(addr))
					return -1;
				memcpy(addr, item, alen);
				addr[alen] = 0;
				port = colon + 1;
			}
		}
		if (*port == 0 || strspn(port, "0123456789") != strlen(port))
			return -1;

		snprintf(entry, sizeof(entry), "%s%s" IMPORT_PORT "%s", addr, addr[0] ? ":" : "", secure ? "s" : "");

		/* once each */
		int seen = 0;
		char copy[256];
		char* save2 = 0;
		sncpy(copy, sizeof(copy), out);
		for (char* e = strtok_r(copy, ",", &save2); e; e = strtok_r(0, ",", &save2)) {
			if (strcmp(e, entry) == 0)
				seen = 1;
		}
		if (seen)
			continue;
		if (out[0])
			sncat(out, out_size, ",");
		sncat(out, out_size, entry);
	}

	return out[0] ? 0 : -1;
}

/**
 * Tell if a line sets the key, as "key = value", or as "#key = value" when
 * commented is set.
 */
static int import_line_is(const char* line, const char* key, int commented)
{
	while (isspace((unsigned char)*line))
		++line;
	if (*line == '#') {
		if (!commented)
			return 0;
		++line;
		while (isspace((unsigned char)*line))
			++line;
	} else if (commented) {
		return 0;
	}
	size_t len = strlen(key);
	if (strncmp(line, key, len) != 0)
		return 0;
	line += len;
	while (isspace((unsigned char)*line))
		++line;
	return *line == '=';
}

struct import_item {
	char key[64];
	char* value;
};

/**
 * Put the imported values in the text of a configuration of DiskFlux, keeping
 * its comments. Each option takes the place of its line if the text sets it,
 * else of its commented example, else it's added at the end. A second line
 * setting the same option is commented, so the imported value is the one used.
 * The result starts with the mark of the import.
 */
static void import_merge(const char* text, struct import_item* item, unsigned count, const char* mark, ss_t* out)
{
	unsigned char* done = calloc_nofail(count ? count : 1, 1);
	char** lines = 0;
	unsigned n = 0;
	unsigned cap = 0;

	/* split in lines, without the end of line */
	const char* p = text;
	while (*p) {
		const char* e = strchr(p, '\n');
		size_t len = e ? (size_t)(e - p) : strlen(p);
		if (n == cap) {
			cap = cap ? cap * 2 : 64;
			lines = realloc_nofail(lines, cap * sizeof(char*));
		}
		lines[n] = malloc_nofail(len + 1);
		memcpy(lines[n], p, len);
		lines[n][len] = 0;
		if (len > 0 && lines[n][len - 1] == '\r')
			lines[n][len - 1] = 0;
		++n;
		p = e ? e + 1 : p + len;
	}

	/* the line each option goes on: the one setting it, else its commented example */
	int* at = malloc_nofail((count ? count : 1) * sizeof(int));
	for (unsigned k = 0; k < count; ++k) {
		at[k] = -1;
		for (unsigned i = 0; i < n && at[k] < 0; ++i) {
			if (import_line_is(lines[i], item[k].key, 0))
				at[k] = i;
		}
		for (unsigned i = 0; i < n && at[k] < 0; ++i) {
			if (import_line_is(lines[i], item[k].key, 1))
				at[k] = i;
		}
	}

	ss_prints(out, mark);
	ss_prints(out, "\n");
	for (unsigned i = 0; i < n; ++i) {
		int written = 0;
		for (unsigned k = 0; k < count; ++k) {
			if (at[k] == (int)i) {
				ss_printf(out, "%s = %s\n", item[k].key, item[k].value);
				done[k] = 1;
				written = 1;
			} else if (at[k] >= 0 && import_line_is(lines[i], item[k].key, 0)) {
				/* a later line setting it again would win over the imported value */
				ss_printf(out, "#%s\n", lines[i]);
				written = 1;
			}
		}
		if (!written) {
			ss_prints(out, lines[i]);
			ss_prints(out, "\n");
		}
		free(lines[i]);
	}

	int header = 0;
	for (unsigned k = 0; k < count; ++k) {
		if (done[k])
			continue;
		if (!header) {
			ss_prints(out, "\n### Imported from SnapRAID Daemon\n");
			header = 1;
		}
		ss_printf(out, "%s = %s\n", item[k].key, item[k].value);
	}

	free(lines);
	free(at);
	free(done);
}

/** Read a whole file. @return the text, 0 terminated, or 0 on error. */
static char* import_read(const char* path)
{
	FILE* f = fopen(path, "r");
	if (!f)
		return 0;
	ss_t s;
	ss_init(&s, 4096);
	char buf[4096];
	size_t got;
	while ((got = fread(buf, 1, sizeof(buf), f)) > 0)
		ss_write(&s, buf, got);
	int err = ferror(f);
	fclose(f);
	if (err) {
		ss_done(&s);
		return 0;
	}
	char* text = ss_dup(&s);
	ss_done(&s);
	return text;
}

/**
 * Tell if a configuration text loads in DiskFlux, with the parser the daemon
 * uses at start. The text is put in a temporary file for it.
 */
static int import_loads(struct snapraid_state* state, const char* text)
{
	char tmp[] = "/tmp/diskflux-import-XXXXXX";
	int fd = mkstemp(tmp);
	if (fd < 0)
		return 0;
	size_t len = strlen(text);
	int ok = write(fd, text, len) == (ssize_t)len;
	close(fd);

	if (ok) {
		char saved[PATH_MAX];
		sncpy(saved, sizeof(saved), state->config.conf);
		sncpy(state->config.conf, sizeof(state->config.conf), tmp);
		state_lock();
		ok = config_load_locked(state) == 0;
		state_unlock();
		sncpy(state->config.conf, sizeof(state->config.conf), saved);
	}

	unlink(tmp);
	return ok;
}

/** Write a file in place of another, through a temporary file in the same folder. */
static int import_write(const char* path, const char* text, mode_t mode)
{
	char tmp[PATH_MAX + 32];
	snprintf(tmp, sizeof(tmp), "%s.import-XXXXXX", path);
	int fd = mkstemp(tmp);
	if (fd < 0)
		return -1;
	size_t len = strlen(text);
	if (write(fd, text, len) != (ssize_t)len || fchmod(fd, mode) != 0 || fsync(fd) != 0) {
		close(fd);
		unlink(tmp);
		return -1;
	}
	close(fd);
	if (rename(tmp, path) != 0) {
		unlink(tmp);
		return -1;
	}
	return 0;
}

/**
 * Options of the machine: one value for the whole of DiskFlux, set in its main
 * configuration, never in the file of an array. The log directory is the
 * exception: an array keeps the one of the instance it comes from.
 */
static int import_machine(const char* key)
{
	static const char* MACHINE[] = {
		"sys_engine", "sys_log_retention_days", "sys_log_compression", "sys_shutdown_on",
		"net_enabled", "net_port", "net_acl", "net_security_headers", "net_allowed_origin",
		"net_config_full_access", "net_storage_admin", "net_web_root", "net_auth_credential", "net_login_change",
		"check_updates", "notify_syslog_enabled", "notify_syslog_level", 0
	};
	for (unsigned i = 0; MACHINE[i]; ++i) {
		if (strcmp(key, MACHINE[i]) == 0)
			return 1;
	}
	return 0;
}

static int import_instances(struct snapraid_state* state, const char* src);

int conf_import(struct snapraid_state* state, const char* src, const char* dst)
{
	char src_real[PATH_MAX];
	char dst_real[PATH_MAX];

	if (realpath(src, src_real) && realpath(dst, dst_real) && strcmp(src_real, dst_real) == 0) {
		fprintf(stderr, "Error: %s is the configuration of DiskFlux itself, nothing to import\n", src);
		return -1;
	}

	/* the file of SnapRAID Daemon is only read: it's opened read-only, once */
	char* his = import_read(src);
	if (!his) {
		fprintf(stderr, "Error: cannot read %s: %s\n", src, strerror(errno));
		return -1;
	}

	struct stat dst_st;
	int dst_exists = stat(dst, &dst_st) == 0;
	char* ours = dst_exists ? import_read(dst) : strdup_nofail("");
	if (!ours) {
		fprintf(stderr, "Error: cannot read %s: %s\n", dst, strerror(errno));
		free(his);
		return -1;
	}
	if (strncmp(ours, IMPORT_MARK, strlen(IMPORT_MARK)) == 0) {
		printf("%s already holds an import of the settings of SnapRAID Daemon: left as it is.\n", dst);
		free(his);
		free(ours);
		return 0;
	}

	/* the options of SnapRAID Daemon, the last line of each one winning as in its own parser */
	struct import_item item[64];
	unsigned count = 0;
	ss_t left;
	ss_init(&left, 1024);
	int credential = 0;

	char* save = 0;
	for (char* line = strtok_r(his, "\n", &save); line; line = strtok_r(0, "\n", &save)) {
		size_t len = strlen(line);
		while (len > 0 && isspace((unsigned char)line[len - 1]))
			line[--len] = 0;
		char* s = line;
		while (isspace((unsigned char)*s))
			++s;
		if (*s == 0 || *s == '#')
			continue;
		char* eq = strchr(s, '=');
		if (!eq) {
			ss_printf(&left, "  %s  (not an option line)\n", s);
			continue;
		}
		char* kend = eq;
		while (kend > s && isspace((unsigned char)kend[-1]))
			--kend;
		*kend = 0;
		char* val = eq + 1;
		while (isspace((unsigned char)*val))
			++val;

		char value[1024];
		if (strlen(val) >= sizeof(value)) {
			ss_printf(&left, "  %s  (value too long)\n", s);
			continue;
		}
		sncpy(value, sizeof(value), val);

		if (!import_known(s)) {
			ss_printf(&left, "  %s = %s  (not an option of DiskFlux)\n", s, value);
			continue;
		}
		if (strcmp(s, "net_port") == 0 && value[0] != 0) {
			char port[256];
			if (import_net_port(value, port, sizeof(port)) != 0) {
				ss_printf(&left, "  net_port = %s  (cannot be read)\n", value);
				continue;
			}
			sncpy(value, sizeof(value), port);
		}
		/* DiskFlux opens in its own theme; the others are chosen in its System page */
		if (strcmp(s, "net_web_root") == 0) {
			ss_printf(&left, "  net_web_root = %s  (DiskFlux opens in its own theme, Quiet)\n", value);
			continue;
		}

		/* the value must be one DiskFlux accepts: a refused one would stop it at start */
		char probe[1200];
		snprintf(probe, sizeof(probe), "%s = %s\n", s, value);
		if (!import_loads(state, probe)) {
			ss_printf(&left, "  %s = %s  (a value DiskFlux does not accept)\n", s, value);
			continue;
		}

		unsigned k;
		for (k = 0; k < count; ++k) {
			if (strcmp(item[k].key, s) == 0)
				break;
		}
		if (k == count) {
			if (count == sizeof(item) / sizeof(item[0]))
				continue;
			sncpy(item[k].key, sizeof(item[k].key), s);
			item[k].value = 0;
			++count;
		}
		free(item[k].value);
		item[k].value = strdup_nofail(value);
		if (strcmp(s, "net_auth_credential") == 0 && value[0] != 0)
			credential = 1;
	}

	char mark[PATH_MAX + 128];
	time_t now = time(0);
	struct tm tm;
	char when[32];
	strftime(when, sizeof(when), "%Y-%m-%d %H:%M", localtime_r(&now, &tm));
	snprintf(mark, sizeof(mark), IMPORT_MARK "%s on %s", src, when);

	ss_t out;
	ss_init(&out, 16384);
	import_merge(ours, item, count, mark, &out);
	char* text = ss_dup(&out);
	ss_done(&out);

	/* never leave a configuration DiskFlux would refuse at start */
	int ret = 0;
	if (!import_loads(state, text)) {
		fprintf(stderr, "Error: the configuration made from %s is not valid, %s was not changed\n", src, dst);
		ret = -1;
	} else {
		mode_t mode = dst_exists ? (dst_st.st_mode & 07777) : 0644;
		/* the credential gives access to the machine: not readable by every user */
		if (credential)
			mode &= 0700;
		if (import_write(dst, text, mode) != 0) {
			fprintf(stderr, "Error: cannot write %s: %s\n", dst, strerror(errno));
			ret = -1;
		}
	}

	if (ret == 0) {
		printf("Settings of SnapRAID Daemon imported from %s into %s (%s was not changed):\n", src, dst, src);
		for (unsigned k = 0; k < count; ++k) {
			if (strcmp(item[k].key, "net_auth_credential") == 0 && item[k].value[0] != 0)
				printf("  net_auth_credential = (the same login)\n");
			else
				printf("  %s = %s\n", item[k].key, item[k].value);
		}
		if (count == 0)
			printf("  none\n");
		if (ss_len(&left) > 0) {
			char* l = ss_dup(&left);
			printf("Left out:\n%s", l);
			free(l);
		}
	}

	for (unsigned k = 0; k < count; ++k)
		free(item[k].value);
	ss_done(&left);
	free(text);
	free(his);
	free(ours);

	/* the instances of SnapRAID Daemon next to its main file become arrays of DiskFlux */
	if (ret == 0)
		ret = import_instances(state, src);

	return ret;
}

/**
 * Import one instance of SnapRAID Daemon, /etc/snapraidd-NAME.conf, run by
 * snapraidd@NAME with the SnapRAID configuration /etc/snapraid-NAME.conf, as the
 * array NAME of DiskFlux, in the folder of its arrays. The array uses the
 * SnapRAID configuration of the instance where it is, and its log directory.
 * @return 0 if imported or left out with its reason, -1 on error.
 */
static int import_instance(struct snapraid_state* state, const char* dir, const char* stem, const char* name)
{
	char src[PATH_MAX];
	char engine[PATH_MAX];
	char logdir[PATH_MAX];
	char arrays[PATH_MAX];
	char dst[PATH_MAX + ARRAY_NAME_MAX + 8];
	char array[ARRAY_NAME_MAX];

	snprintf(src, sizeof(src), "%s/%s-%s.conf", dir, stem, name);
	/* the unit snapraidd@NAME runs: snapraidd -c /etc/snapraidd-NAME.conf -C /etc/snapraid-NAME.conf -i NAME */
	snprintf(engine, sizeof(engine), "%s/snapraid-%s.conf", dir, name);

	/* the names of the arrays of DiskFlux are lowercase */
	size_t len = strlen(name);
	if (len >= sizeof(array)) {
		printf("Instance %s of SnapRAID Daemon (%s) left out: its name is too long for an array of DiskFlux.\n", name, src);
		return 0;
	}
	for (size_t i = 0; i <= len; ++i)
		array[i] = tolower((unsigned char)name[i]);
	if (!state_name_valid(array) || strcmp(array, ARRAY_DEFAULT) == 0) {
		printf("Instance %s of SnapRAID Daemon (%s) left out: '%s' cannot be the name of an array of DiskFlux.\n", name, src, array);
		return 0;
	}

	arrays_dir(arrays, sizeof(arrays));
	snprintf(dst, sizeof(dst), "%s/%s.conf", arrays, array);
	if (access(dst, F_OK) == 0) {
		printf("Instance %s of SnapRAID Daemon (%s) left out: DiskFlux already has the array %s (%s).\n", name, src, array, dst);
		return 0;
	}

	char* his = import_read(src);
	if (!his) {
		printf("Instance %s of SnapRAID Daemon (%s) left out: it cannot be read (%s).\n", name, src, strerror(errno));
		return 0;
	}

	/* his default log directory of an instance: the one of the daemon, followed by -NAME */
	app_default_log(logdir, sizeof(logdir));
	sncat(logdir, sizeof(logdir), "-");
	sncat(logdir, sizeof(logdir), name);

	ss_t body;
	ss_t taken;
	ss_t left;
	ss_init(&body, 4096);
	ss_init(&taken, 1024);
	ss_init(&left, 1024);

	struct import_item item[64];
	unsigned count = 0;
	char* save = 0;
	for (char* line = strtok_r(his, "\n", &save); line; line = strtok_r(0, "\n", &save)) {
		size_t l = strlen(line);
		while (l > 0 && isspace((unsigned char)line[l - 1]))
			line[--l] = 0;
		char* s = line;
		while (isspace((unsigned char)*s))
			++s;
		if (*s == 0 || *s == '#')
			continue;
		char* eq = strchr(s, '=');
		if (!eq) {
			ss_printf(&left, "  %s  (not an option line)\n", s);
			continue;
		}
		char* kend = eq;
		while (kend > s && isspace((unsigned char)kend[-1]))
			--kend;
		*kend = 0;
		char* val = eq + 1;
		while (isspace((unsigned char)*val))
			++val;
		if (strlen(val) >= 1024) {
			ss_printf(&left, "  %s  (value too long)\n", s);
			continue;
		}
		if (!import_known(s)) {
			ss_printf(&left, "  %s = %s  (not an option of DiskFlux)\n", s, val);
			continue;
		}
		if (strcmp(s, "sys_log_directory") == 0) {
			sncpy(logdir, sizeof(logdir), val);
			continue;
		}
		if (import_machine(s)) {
			ss_printf(&left, "  %s = %s  (set once for the whole of DiskFlux, in its main configuration)\n", s, val);
			continue;
		}
		char probe[1200];
		snprintf(probe, sizeof(probe), "%s = %s\n", s, val);
		if (!import_loads(state, probe)) {
			ss_printf(&left, "  %s = %s  (a value DiskFlux does not accept)\n", s, val);
			continue;
		}
		unsigned k;
		for (k = 0; k < count; ++k) {
			if (strcmp(item[k].key, s) == 0)
				break;
		}
		if (k == count) {
			if (count == sizeof(item) / sizeof(item[0]))
				continue;
			sncpy(item[k].key, sizeof(item[k].key), s);
			item[k].value = 0;
			++count;
		}
		free(item[k].value);
		item[k].value = strdup_nofail(val);
	}

	time_t now = time(0);
	struct tm tm;
	char when[32];
	strftime(when, sizeof(when), "%Y-%m-%d %H:%M", localtime_r(&now, &tm));
	ss_printf(&body, IMPORT_MARK "%s on %s\n", src, when);
	ss_printf(&body, "# DiskFlux, configuration of the array '%s': the instance %s of SnapRAID Daemon.\n", array, name);
	ss_prints(&body, "# Same options of the main configuration file, without the ones of the machine (sys_*, net_*).\n\n");
	ss_prints(&body, "# The SnapRAID configuration file of this array, the one of the instance. It cannot be changed while the daemon runs.\n");
	ss_printf(&body, "engine_conf = %s\n\n", engine);
	ss_prints(&body, "# The log directory of the instance: the logs of the runs of both daemons are kept together.\n");
	ss_printf(&body, "sys_log_directory = %s\n\n", logdir);
	for (unsigned k = 0; k < count; ++k) {
		ss_printf(&body, "%s = %s\n", item[k].key, item[k].value);
		ss_printf(&taken, "  %s = %s\n", item[k].key, item[k].value);
	}

	char* text = ss_dup(&body);
	int ret = 0;

	/* the options are checked with the parser; engine_conf belongs to an array only */
	ss_t check;
	ss_init(&check, 4096);
	for (unsigned k = 0; k < count; ++k)
		ss_printf(&check, "%s = %s\n", item[k].key, item[k].value);
	ss_printf(&check, "sys_log_directory = %s\n", logdir);
	char* check_text = ss_dup(&check);
	ss_done(&check);

	if (!import_loads(state, check_text)) {
		printf("Instance %s of SnapRAID Daemon (%s) left out: its options do not make a valid configuration.\n", name, src);
	} else {
		mkdir(arrays, 0755);
		if (import_write(dst, text, 0644) != 0) {
			fprintf(stderr, "Error: cannot write %s: %s\n", dst, strerror(errno));
			ret = -1;
		} else {
			printf("Instance %s of SnapRAID Daemon imported as the array %s of DiskFlux, in %s (%s was not changed):\n", name, array, dst, src);
			printf("  engine_conf = %s%s\n", engine, access(engine, F_OK) == 0 ? "" : "  (not there yet: the array waits for it)");
			printf("  sys_log_directory = %s\n", logdir);
			char* t = ss_dup(&taken);
			printf("%s", t);
			free(t);
			if (ss_len(&left) > 0) {
				char* l = ss_dup(&left);
				printf("Left out:\n%s", l);
				free(l);
			}
		}
	}

	for (unsigned k = 0; k < count; ++k)
		free(item[k].value);
	free(check_text);
	free(text);
	ss_done(&body);
	ss_done(&taken);
	ss_done(&left);
	free(his);
	return ret;
}

/**
 * Import the instances of SnapRAID Daemon found next to its main file:
 * for /etc/snapraidd.conf, every /etc/snapraidd-NAME.conf.
 */
static int import_instances(struct snapraid_state* state, const char* src)
{
	char dir[PATH_MAX];
	char stem[PATH_MAX];

	sncpy(dir, sizeof(dir), src);
	char* slash = strrchr(dir, '/');
	if (slash) {
		sncpy(stem, sizeof(stem), slash + 1);
		*slash = 0;
		if (dir[0] == 0)
			sncpy(dir, sizeof(dir), "/");
	} else {
		sncpy(stem, sizeof(stem), dir);
		sncpy(dir, sizeof(dir), ".");
	}
	size_t slen = strlen(stem);
	if (slen > 5 && strcmp(stem + slen - 5, ".conf") == 0)
		stem[slen - 5] = 0;

	DIR* d = opendir(dir);
	if (!d)
		return 0;

	/* in a fixed order, so the report reads the same every time */
	sl_t names;
	sl_init(&names);
	struct dirent* ent;
	size_t stem_len = strlen(stem);
	while ((ent = readdir(d)) != 0) {
		size_t len = strlen(ent->d_name);
		if (len <= stem_len + 1 + 5 || strncmp(ent->d_name, stem, stem_len) != 0 || ent->d_name[stem_len] != '-'
			|| strcmp(ent->d_name + len - 5, ".conf") != 0)
			continue;
		char name[NAME_MAX + 1];
		size_t nlen = len - stem_len - 1 - 5;
		memcpy(name, ent->d_name + stem_len + 1, nlen);
		name[nlen] = 0;
		/* the instance names of SnapRAID Daemon */
		if (strspn(name, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-") != nlen)
			continue;
		sl_insert_str(&names, name);
	}
	closedir(d);
	tommy_list_sort(&names, sl_compare);

	int ret = 0;
	for (tommy_node* i = tommy_list_head(&names); i; i = i->next) {
		sn_t* sn = i->data;
		if (import_instance(state, dir, stem, sn->str) != 0)
			ret = -1;
	}
	sl_free(&names);
	return ret;
}

/** Compare two directories, as given or through their real path. */
static int import_same_dir(const char* a, const char* b)
{
	char ra[PATH_MAX];
	char rb[PATH_MAX];

	if (realpath(a, ra) && realpath(b, rb))
		return strcmp(ra, rb) == 0;

	size_t la = strlen(a);
	size_t lb = strlen(b);
	while (la > 1 && a[la - 1] == '/')
		--la;
	while (lb > 1 && b[lb - 1] == '/')
		--lb;
	return la == lb && strncmp(a, b, la) == 0;
}

/**
 * Read the log directory and the retention of a configuration of SnapRAID
 * Daemon, with its defaults: the log directory of the daemon, followed by
 * -NAME for an instance, and no deletion.
 * @return 0 if read, -1 if the file cannot be read.
 */
static int import_his_log(const char* path, const char* instance, char* dir, size_t dir_size, int* days)
{
	char* text = import_read(path);
	if (!text)
		return -1;

	app_default_log(dir, dir_size);
	if (instance) {
		sncat(dir, dir_size, "-");
		sncat(dir, dir_size, instance);
	}
	*days = 0;

	char* save = 0;
	for (char* line = strtok_r(text, "\n", &save); line; line = strtok_r(0, "\n", &save)) {
		char* s = line;
		while (isspace((unsigned char)*s))
			++s;
		if (*s == '#')
			continue;
		char* eq = strchr(s, '=');
		if (!eq)
			continue;
		char* kend = eq;
		while (kend > s && isspace((unsigned char)kend[-1]))
			--kend;
		*kend = 0;
		char* val = eq + 1;
		while (isspace((unsigned char)*val))
			++val;
		size_t l = strlen(val);
		while (l > 0 && isspace((unsigned char)val[l - 1]))
			val[--l] = 0;
		if (strcmp(s, "sys_log_directory") == 0) {
			sncpy(dir, dir_size, val);
		} else if (strcmp(s, "sys_log_retention_days") == 0) {
			int v;
			if (strint(&v, val) == 0 && v >= 0)
				*days = v;
		}
	}

	free(text);
	return 0;
}

int import_log_retention(const char* conf, const char* log_dir, int days)
{
	char dir[PATH_MAX];

	/* nothing deleted anyway */
	if (days == 0 || log_dir[0] == 0)
		return days;

	sncpy(dir, sizeof(dir), conf);
	char* slash = strrchr(dir, '/');
	if (!slash)
		return days;
	*slash = 0;
	if (dir[0] == 0)
		sncpy(dir, sizeof(dir), "/");

	DIR* d = opendir(dir);
	if (!d)
		return days;

	struct dirent* ent;
	while ((ent = readdir(d)) != 0) {
		const char* n = ent->d_name;
		size_t len = strlen(n);
		char instance[NAME_MAX + 1];
		const char* inst = 0;

		if (strcmp(n, "snapraidd.conf") == 0) {
			inst = 0;
		} else if (len > 15 && strncmp(n, "snapraidd-", 10) == 0 && strcmp(n + len - 5, ".conf") == 0) {
			memcpy(instance, n + 10, len - 15);
			instance[len - 15] = 0;
			inst = instance;
		} else {
			continue;
		}

		char path[PATH_MAX + NAME_MAX + 2];
		char his_dir[PATH_MAX];
		int his_days;
		snprintf(path, sizeof(path), "%s/%s", dir, n);
		if (import_his_log(path, inst, his_dir, sizeof(his_dir), &his_days) != 0)
			continue;
		if (!import_same_dir(his_dir, log_dir))
			continue;

		/* SnapRAID Daemon keeps these logs forever, or longer than DiskFlux */
		if (his_days == 0) {
			days = 0;
			break;
		}
		if (his_days > days)
			days = his_days;
	}
	closedir(d);

	return days;
}

/** Tell if the process of a pid file is a running snapraidd. */
static int import_pid_alive(const char* path)
{
	char buf[64];
	FILE* f = fopen(path, "r");
	if (!f)
		return 0;
	int got = fgets(buf, sizeof(buf), f) != 0;
	fclose(f);
	if (!got)
		return 0;
	int pid;
	size_t len = strlen(buf);
	while (len > 0 && isspace((unsigned char)buf[len - 1]))
		buf[--len] = 0;
	if (strint(&pid, buf) != 0 || pid <= 0)
		return 0;

	/* a pid file left behind can name a pid now used by another program */
	char comm_path[64];
	snprintf(comm_path, sizeof(comm_path), "/proc/%d/comm", pid);
	f = fopen(comm_path, "r");
	if (!f)
		return 0;
	got = fgets(buf, sizeof(buf), f) != 0;
	fclose(f);
	return got && strncmp(buf, "snapraidd", 9) == 0 && (buf[9] == '\n' || buf[9] == 0);
}

void import_his_daemon(const char* conf, struct import_his* his)
{
	char dir[PATH_MAX];

	memset(his, 0, sizeof(*his));

	sncpy(dir, sizeof(dir), conf);
	char* slash = strrchr(dir, '/');
	if (slash) {
		*slash = 0;
		if (dir[0] == 0)
			sncpy(dir, sizeof(dir), "/");
	} else {
		sncpy(dir, sizeof(dir), ".");
	}

	DIR* d = opendir(dir);
	if (d) {
		struct dirent* ent;
		while ((ent = readdir(d)) != 0) {
			const char* n = ent->d_name;
			size_t len = strlen(n);
			if (strcmp(n, "snapraidd.conf") == 0) {
				his->conf = 1;
			} else if (len > 15 && strncmp(n, "snapraidd-", 10) == 0 && strcmp(n + len - 5, ".conf") == 0) {
				if (his->instances[0])
					sncat(his->instances, sizeof(his->instances), " ");
				char name[NAME_MAX + 1];
				memcpy(name, n + 10, len - 15);
				name[len - 15] = 0;
				sncat(his->instances, sizeof(his->instances), name);
			}
		}
		closedir(d);
	}

	/* enabled: a link in a .wants folder of systemd, for the service or one of its instances */
	d = opendir("/etc/systemd/system");
	if (d) {
		struct dirent* ent;
		while (!his->enabled && (ent = readdir(d)) != 0) {
			size_t len = strlen(ent->d_name);
			if (len < 6 || strcmp(ent->d_name + len - 6, ".wants") != 0)
				continue;
			char wants[PATH_MAX];
			snprintf(wants, sizeof(wants), "/etc/systemd/system/%s", ent->d_name);
			DIR* w = opendir(wants);
			if (!w)
				continue;
			struct dirent* u;
			while ((u = readdir(w)) != 0) {
				if (strcmp(u->d_name, "snapraidd.service") == 0 || strncmp(u->d_name, "snapraidd@", 10) == 0) {
					his->enabled = 1;
					break;
				}
			}
			closedir(w);
		}
		closedir(d);
	}

	/* running: the pid file of its daemon, or of one of its instances, names a live snapraidd */
	if (import_pid_alive("/run/snapraidd.pid") || import_pid_alive("/tmp/snapraidd.pid")) {
		his->running = 1;
	} else {
		d = opendir("/run");
		if (d) {
			struct dirent* ent;
			while (!his->running && (ent = readdir(d)) != 0) {
				size_t len = strlen(ent->d_name);
				if (len > 14 && strncmp(ent->d_name, "snapraidd-", 10) == 0 && strcmp(ent->d_name + len - 4, ".pid") == 0) {
					char path[PATH_MAX];
					snprintf(path, sizeof(path), "/run/%s", ent->d_name);
					his->running = import_pid_alive(path);
				}
			}
			closedir(d);
		}
	}
}

/****************************************************************************/
/* selftest */

#define ICHECK(cond) do { if (!(cond)) { printf("selftest: import failed at line %d: %s\n", __LINE__, #cond); return -1; } } while (0)

static int import_merge_is(const char* text, const char* key, const char* value, const char* want)
{
	struct import_item item[1];
	sncpy(item[0].key, sizeof(item[0].key), key);
	item[0].value = (char*)value;
	ss_t out;
	ss_init(&out, 256);
	import_merge(text, item, 1, "#M", &out);
	char* got = ss_dup(&out);
	ss_done(&out);
	int ok = strcmp(got, want) == 0;
	if (!ok)
		printf("selftest: import_merge gave:\n%s---\nwanted:\n%s---\n", got, want);
	free(got);
	return ok;
}

int import_selftest(void)
{
	char out[256];

	/* net_port: his addresses, the port of DiskFlux */
	ICHECK(import_net_port("127.0.0.1:7627", out, sizeof(out)) == 0 && strcmp(out, "127.0.0.1:" IMPORT_PORT) == 0);
	ICHECK(import_net_port("7627", out, sizeof(out)) == 0 && strcmp(out, IMPORT_PORT) == 0);
	ICHECK(import_net_port("[::1]:7627", out, sizeof(out)) == 0 && strcmp(out, "[::1]:" IMPORT_PORT) == 0);
	ICHECK(import_net_port("[::]:7627", out, sizeof(out)) == 0 && strcmp(out, "[::]:" IMPORT_PORT) == 0);
	ICHECK(import_net_port("[::1]:7627,127.0.0.1:7627", out, sizeof(out)) == 0 && strcmp(out, "[::1]:" IMPORT_PORT ",127.0.0.1:" IMPORT_PORT) == 0);
	ICHECK(import_net_port("127.0.0.1:7627,127.0.0.1:8080", out, sizeof(out)) == 0 && strcmp(out, "127.0.0.1:" IMPORT_PORT) == 0);
	ICHECK(import_net_port(" 192.168.1.5:7627 , 7628 ", out, sizeof(out)) == 0 && strcmp(out, "192.168.1.5:" IMPORT_PORT "," IMPORT_PORT) == 0);
	ICHECK(import_net_port("7627s", out, sizeof(out)) == 0 && strcmp(out, IMPORT_PORT "s") == 0);
	ICHECK(import_net_port("[::1:7627", out, sizeof(out)) != 0);
	ICHECK(import_net_port("127.0.0.1:", out, sizeof(out)) != 0);
	ICHECK(import_net_port("localhost:abc", out, sizeof(out)) != 0);
	ICHECK(import_net_port("", out, sizeof(out)) != 0);

	/* lines */
	ICHECK(import_line_is("net_port = 1", "net_port", 0));
	ICHECK(import_line_is("  net_port=1", "net_port", 0));
	ICHECK(!import_line_is("#net_port = 1", "net_port", 0));
	ICHECK(import_line_is("#net_port = 1", "net_port", 1));
	ICHECK(import_line_is("# net_port = 1", "net_port", 1));
	ICHECK(!import_line_is("net_port = 1", "net_port", 1));
	ICHECK(!import_line_is("net_ports = 1", "net_port", 0));
	ICHECK(!import_line_is("# The net_port defines", "net_port", 1));

	/* merge: the line setting it, else its example, else at the end; a second setting commented */
	ICHECK(import_merge_is("# c\nscrub_percentage = 0.7\n", "scrub_percentage", "2", "#M\n# c\nscrub_percentage = 2\n"));
	ICHECK(import_merge_is("#sync_prehash = 1\nx = 1\n", "sync_prehash", "1", "#M\nsync_prehash = 1\nx = 1\n"));
	ICHECK(import_merge_is("#a = 1\na = 2\n", "a", "3", "#M\n#a = 1\na = 3\n"));
	ICHECK(import_merge_is("a = 1\nb = 2\na = 5\n", "a", "3", "#M\na = 3\nb = 2\n#a = 5\n"));
	ICHECK(import_merge_is("b = 2\n", "a", "3", "#M\nb = 2\n\n### Imported from SnapRAID Daemon\na = 3\n"));
	ICHECK(import_merge_is("", "a", "3", "#M\n\n### Imported from SnapRAID Daemon\na = 3\n"));
	ICHECK(import_merge_is("b = 2\r\n", "a", "", "#M\nb = 2\n\n### Imported from SnapRAID Daemon\na = \n"));

	/* retention in a directory shared with SnapRAID Daemon: never shorter than his */
	{
		char dir[] = "/tmp/diskflux-retention-XXXXXX";
		char path[PATH_MAX];
		char shared[PATH_MAX];
		char shared_slash[PATH_MAX];
		ICHECK(mkdtemp(dir) != 0);
		snprintf(shared, sizeof(shared), "%s/log", dir);
		snprintf(shared_slash, sizeof(shared_slash), "%s/log/", dir);
		snprintf(path, sizeof(path), "%s/diskflux.conf", dir);
		FILE* f = fopen(path, "w");
		ICHECK(f != 0);
		fclose(f);
		snprintf(path, sizeof(path), "%s/snapraidd.conf", dir);
		f = fopen(path, "w");
		ICHECK(f != 0);
		fprintf(f, "# his\nsys_log_directory = %s\nsys_log_retention_days = 120\n", shared);
		fclose(f);
		snprintf(path, sizeof(path), "%s/snapraidd-b.conf", dir);
		f = fopen(path, "w");
		ICHECK(f != 0);
		fprintf(f, "scrub_percentage = 2\n");
		fclose(f);
		char conf[PATH_MAX];
		snprintf(conf, sizeof(conf), "%s/diskflux.conf", dir);

		ICHECK(import_log_retention(conf, shared, 1) == 120);
		ICHECK(import_log_retention(conf, shared_slash, 1) == 120);
		ICHECK(import_log_retention(conf, shared, 200) == 200);
		ICHECK(import_log_retention(conf, shared, 0) == 0);
		ICHECK(import_log_retention(conf, "/somewhere/else", 7) == 7);
		/* the instance b logs in his default directory of an instance and keeps its logs forever */
		char def[PATH_MAX];
		app_default_log(def, sizeof(def));
		sncat(def, sizeof(def), "-b");
		ICHECK(import_log_retention(conf, def, 5) == 0);

		snprintf(path, sizeof(path), "%s/snapraidd.conf", dir);
		unlink(path);
		snprintf(path, sizeof(path), "%s/snapraidd-b.conf", dir);
		unlink(path);
		snprintf(path, sizeof(path), "%s/diskflux.conf", dir);
		unlink(path);
		ICHECK(import_log_retention(conf, shared, 1) == 1);
		rmdir(dir);
	}

	/* every option the parser knows is in the list, and only those */
	ICHECK(import_known("maintenance_schedule") && import_known("net_auth_credential") && import_known("hook_docker_pause"));
	ICHECK(!import_known("engine_conf") && !import_known("array_parallel") && !import_known("unknown_option"));

	return 0;
}
