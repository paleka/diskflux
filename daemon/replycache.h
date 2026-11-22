// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Robert Paleka

#ifndef REPLYCACHE_H
#define REPLYCACHE_H

#include "str.h"

/*
 * Short-lived copies of the JSON of the endpoints every open page asks for,
 * shared by all the browsers: with many pages open the daemon builds a reply
 * once per period instead of once per page.
 *
 * A copy is used only while it is younger than the period asked by its
 * endpoint and nothing has changed since it was made: every POST, PUT, PATCH
 * or DELETE that reaches the daemon, and the end of every background job,
 * start a new generation, which drops all the copies. While such a request is
 * being handled no copy is used or made, so a page that sends a change and
 * reads again at once always sees the change.
 */

/** Slots of a cache, one per array (or other key) asking at the same time. */
#define REPLY_CACHE_SLOTS 8

struct reply_cache_slot {
	const void* key; /**< Owner of the reply, usually the state of an array. 0 if free. */
	uint64_t generation; /**< Generation the reply was made in. */
	uint64_t made_ms; /**< When the reply was made, os_tick_ms(). */
	char* text; /**< The reply. */
	size_t len; /**< Its length. */
};

struct reply_cache {
	const char* name; /**< For the log. */
	unsigned period_ms; /**< How long a reply is used. */
	struct reply_cache_slot slot[REPLY_CACHE_SLOTS];
};

#define REPLY_CACHE(name, period_ms) { name, period_ms, { { 0, 0, 0, 0, 0 } } }

/**
 * Start a new generation: the replies made before are no longer used.
 * Call it after anything that changes what the endpoints show, before telling
 * anyone that it is done.
 */
void reply_cache_changed(void);

/**
 * Around a request that may change something: from begin to end no reply is
 * used or kept, and each of them starts a new generation.
 */
void reply_cache_change_begin(void);
void reply_cache_change_end(void);

/**
 * The generation now. Read it before making a reply and pass it to reply_cache_put(),
 * so a change made while the reply was being built is not hidden by it.
 */
uint64_t reply_cache_generation(void);

/**
 * Append to out the reply of key, if there is one still good.
 * Return 1 if it was appended, 0 if the reply has to be made.
 */
int reply_cache_get(struct reply_cache* cache, const void* key, ss_t* out);

/**
 * Keep a copy of the reply text[0..len) of key, made in the given generation.
 */
void reply_cache_put(struct reply_cache* cache, const void* key, uint64_t generation, const char* text, size_t len);

/**
 * The same with an explicit time, for the tests.
 */
int reply_cache_get_at(struct reply_cache* cache, const void* key, ss_t* out, uint64_t now_ms);
void reply_cache_put_at(struct reply_cache* cache, const void* key, uint64_t generation, const char* text, size_t len, uint64_t now_ms);

/**
 * Free the copies of a cache.
 */
void reply_cache_done(struct reply_cache* cache);

int reply_cache_selftest(void);

#endif
