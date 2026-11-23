// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#include "os/portable.h"

#include "state.h"
#include "support.h"
#include "conf.h"
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
	return ret;
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

	/* every option the parser knows is in the list, and only those */
	ICHECK(import_known("maintenance_schedule") && import_known("net_auth_credential") && import_known("hook_docker_pause"));
	ICHECK(!import_known("engine_conf") && !import_known("array_parallel") && !import_known("unknown_option"));

	return 0;
}
