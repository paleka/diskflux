// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#include "os/portable.h"
#include "os/os.h"

#include "support.h"
#include "replycache.h"

/*
 * One lock for every cache: it is held only to compare a few numbers and copy a reply
 * of some KB, never while a reply is built, so the threads of the web server do not
 * wait on each other, and none of them waits on the state of the arrays.
 */
static pthread_mutex_t reply_cache_mutex = PTHREAD_MUTEX_INITIALIZER;
static uint64_t reply_cache_gen = 1;
static unsigned reply_cache_changing; /**< Requests that may change something, being handled now. */

void reply_cache_changed(void)
{
	pthread_mutex_lock(&reply_cache_mutex);
	++reply_cache_gen;
	pthread_mutex_unlock(&reply_cache_mutex);
}

void reply_cache_change_begin(void)
{
	pthread_mutex_lock(&reply_cache_mutex);
	++reply_cache_gen;
	++reply_cache_changing;
	pthread_mutex_unlock(&reply_cache_mutex);
}

void reply_cache_change_end(void)
{
	pthread_mutex_lock(&reply_cache_mutex);
	++reply_cache_gen;
	if (reply_cache_changing > 0)
		--reply_cache_changing;
	pthread_mutex_unlock(&reply_cache_mutex);
}

uint64_t reply_cache_generation(void)
{
	pthread_mutex_lock(&reply_cache_mutex);
	uint64_t gen = reply_cache_gen;
	pthread_mutex_unlock(&reply_cache_mutex);
	return gen;
}

static int slot_good(const struct reply_cache* cache, const struct reply_cache_slot* slot, const void* key, uint64_t now_ms)
{
	return reply_cache_changing == 0
	       && slot->key == key
	       && slot->text != 0
	       && slot->generation == reply_cache_gen
	       && now_ms >= slot->made_ms
	       && now_ms - slot->made_ms < cache->period_ms;
}

int reply_cache_get_at(struct reply_cache* cache, const void* key, ss_t* out, uint64_t now_ms)
{
	int found = 0;

	pthread_mutex_lock(&reply_cache_mutex);
	for (unsigned i = 0; i < REPLY_CACHE_SLOTS; ++i) {
		struct reply_cache_slot* slot = &cache->slot[i];
		if (slot_good(cache, slot, key, now_ms)) {
			ss_write(out, slot->text, slot->len);
			found = 1;
			break;
		}
	}
	pthread_mutex_unlock(&reply_cache_mutex);

	return found;
}

void reply_cache_put_at(struct reply_cache* cache, const void* key, uint64_t generation, const char* text, size_t len, uint64_t now_ms)
{
	char* copy = malloc(len + 1);
	if (copy == 0)
		return; /* only a cache */
	memcpy(copy, text, len);
	copy[len] = 0;

	char* old = 0;

	pthread_mutex_lock(&reply_cache_mutex);
	if (generation != reply_cache_gen || reply_cache_changing != 0) {
		/* something changed, or is changing, while the reply was built: it may show the old state */
		pthread_mutex_unlock(&reply_cache_mutex);
		free(copy);
		return;
	}

	/* the slot of the same key, else a free or unusable one, else the oldest */
	struct reply_cache_slot* pick = 0;
	for (unsigned i = 0; i < REPLY_CACHE_SLOTS && pick == 0; ++i)
		if (cache->slot[i].key == key)
			pick = &cache->slot[i];
	for (unsigned i = 0; i < REPLY_CACHE_SLOTS && pick == 0; ++i)
		if (cache->slot[i].key == 0 || !slot_good(cache, &cache->slot[i], cache->slot[i].key, now_ms))
			pick = &cache->slot[i];
	if (pick == 0) {
		pick = &cache->slot[0];
		for (unsigned i = 1; i < REPLY_CACHE_SLOTS; ++i)
			if (cache->slot[i].made_ms < pick->made_ms)
				pick = &cache->slot[i];
	}

	old = pick->text;
	pick->key = key;
	pick->generation = generation;
	pick->made_ms = now_ms;
	pick->text = copy;
	pick->len = len;
	pthread_mutex_unlock(&reply_cache_mutex);

	free(old);
}

int reply_cache_get(struct reply_cache* cache, const void* key, ss_t* out)
{
	return reply_cache_get_at(cache, key, out, os_tick_ms());
}

void reply_cache_put(struct reply_cache* cache, const void* key, uint64_t generation, const char* text, size_t len)
{
	reply_cache_put_at(cache, key, generation, text, len, os_tick_ms());
}

void reply_cache_done(struct reply_cache* cache)
{
	pthread_mutex_lock(&reply_cache_mutex);
	for (unsigned i = 0; i < REPLY_CACHE_SLOTS; ++i) {
		free(cache->slot[i].text);
		cache->slot[i].text = 0;
		cache->slot[i].key = 0;
	}
	pthread_mutex_unlock(&reply_cache_mutex);
}

/****************************************************************************/
/* self test */

static int expect_reply(struct reply_cache* cache, const void* key, uint64_t now_ms, const char* want, const char* what)
{
	ss_t s;
	ss_init(&s, 64);
	int found = reply_cache_get_at(cache, key, &s, now_ms);
	int ok;
	if (want == 0)
		ok = !found;
	else
		ok = found && (size_t)ss_len(&s) == strlen(want) && memcmp(ss_ptr(&s), want, strlen(want)) == 0;
	ss_done(&s);
	if (!ok) {
		fprintf(stderr, "Failed reply cache test: %s\n", what);
		return -1;
	}
	return 0;
}

int reply_cache_selftest(void)
{
	struct reply_cache cache = REPLY_CACHE("test", 1000);
	int a, b;
	int ret = -1;

	uint64_t gen = reply_cache_generation();
	reply_cache_put_at(&cache, &a, gen, "A1", 2, 10000);
	reply_cache_put_at(&cache, &b, gen, "B1", 2, 10000);

	if (expect_reply(&cache, &a, 10000, "A1", "same moment") != 0
		|| expect_reply(&cache, &a, 10999, "A1", "within the period") != 0
		|| expect_reply(&cache, &b, 10500, "B1", "a second key keeps its own reply") != 0
		|| expect_reply(&cache, &a, 11000, 0, "at the end of the period") != 0
		|| expect_reply(&cache, &a, 9000, 0, "a clock before the reply") != 0)
		goto bail;

	/* a newer reply replaces the old one of the same key */
	reply_cache_put_at(&cache, &a, gen, "A2", 2, 10500);
	if (expect_reply(&cache, &a, 10600, "A2", "the newer reply") != 0)
		goto bail;

	/* a change drops every reply */
	reply_cache_changed();
	if (expect_reply(&cache, &a, 10600, 0, "after a change") != 0
		|| expect_reply(&cache, &b, 10600, 0, "after a change, other key") != 0)
		goto bail;

	/* a reply built across a change is not kept */
	reply_cache_put_at(&cache, &a, gen, "OLD", 3, 10700);
	if (expect_reply(&cache, &a, 10700, 0, "a reply begun before a change") != 0)
		goto bail;

	/* while a change is handled no reply is used or kept, and none made before it after */
	gen = reply_cache_generation();
	reply_cache_put_at(&cache, &a, gen, "A3", 2, 10800);
	reply_cache_change_begin();
	if (expect_reply(&cache, &a, 10800, 0, "during a change") != 0) {
		reply_cache_change_end();
		goto bail;
	}
	reply_cache_put_at(&cache, &a, reply_cache_generation(), "MID", 3, 10800);
	reply_cache_change_end();
	if (expect_reply(&cache, &a, 10800, 0, "a reply made during a change") != 0)
		goto bail;
	reply_cache_put_at(&cache, &a, reply_cache_generation(), "A4", 2, 10800);
	if (expect_reply(&cache, &a, 10800, "A4", "a reply made after the change") != 0)
		goto bail;

	/* more keys than slots: the oldest goes, the newest stays */
	int k[REPLY_CACHE_SLOTS + 2];
	gen = reply_cache_generation();
	for (unsigned i = 0; i < REPLY_CACHE_SLOTS + 2; ++i)
		reply_cache_put_at(&cache, &k[i], gen, "K", 1, 20000 + i);
	if (expect_reply(&cache, &k[REPLY_CACHE_SLOTS + 1], 20100, "K", "the newest of many keys") != 0
		|| expect_reply(&cache, &k[0], 20100, 0, "the oldest of many keys") != 0)
		goto bail;

	ret = 0;
bail:
	reply_cache_done(&cache);
	return ret;
}
