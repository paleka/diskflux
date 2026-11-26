bin_PROGRAMS = diskflux

# Avoid the installation of BSD/SystemD script with make distcheck
AM_DISTCHECK_CONFIGURE_FLAGS = --with-init-type=none

diskflux_CPPFLAGS = -DSYSCONFDIR="\"${sysconfdir}\"" -DDATADIR="\"${datadir}\"" \
	-DUSE_IPV6 -DNO_SSL -DNO_SSL_DL -DNO_CGI -DNO_FILES -DNO_FILESYSTEMS -DNO_THREAD_NAME -DNO_CACHING \
	-DMG_EXTERNAL_FUNCTION_mg_cry_internal_impl \
	-DMG_EXTERNAL_FUNCTION_log_access

diskflux_CFLAGS = $(ZLIB_CFLAGS) $(ZSTD_CFLAGS)
diskflux_LDADD = $(ZLIB_LIBS) $(ZSTD_LIBS)

# init system
if INSTALL_SYSTEMD
systemdsystemunitdir = @SERVICEDIR@
systemdsystemunit_DATA = diskflux.service
endif

if INSTALL_BSD_INIT
rcdir = @RCDIR@
rc_SCRIPTS = rc.diskflux
endif

noinst_DATA = rc.diskflux diskflux.service
CLEANFILES = rc.diskflux diskflux.service

# Web UI
COMMANDER_DIST = \
	index.html \
	site.webmanifest \
	image/favicon-16x16.png \
	image/android-chrome-512x512.png \
	image/apple-touch-icon.png \
	image/android-chrome-192x192.png \
	image/favicon-32x32.png \
	favicon.ico \
	css/style.css \
	css/simple.css \
	js/api.js \
	js/storage.js \
	js/simple.js \
	js/plain.js \
	js/prefs.js \
	js/confreview.js \
	js/conffile.js \
	js/arrays.js \
	js/app.js \
	js/init.js \
	js/ui.js \
	js/utils.js

BRUTALE_DIST = \
	$(COMMANDER_DIST) \
	css/fonts/BebasNeue-Regular.woff2 \
	css/fonts/PlusJakartaSans-Bold.woff2 \
	css/fonts/DMSans-Regular.woff2 \
	css/fonts/DMSans-Medium.woff2 \
	css/fonts/DMSans-Bold.woff2 \
	css/fonts/JetBrainsMono-Regular.woff2 \
	css/fonts/JetBrainsMono-Bold.woff2 \
	css/fonts/OFL

QUIET_DIST = \
	$(COMMANDER_DIST) \
	css/quiet.css \
	css/fonts/Inter-400.woff2 \
	css/fonts/Inter-500.woff2 \
	css/fonts/Inter-600.woff2 \
	css/fonts/Inter-700.woff2 \
	css/fonts/JetBrainsMono-Regular.woff2 \
	css/fonts/OFL-Inter \
	css/fonts/OFL-JetBrainsMono

data_DATA = quiet.zip commander.zip brutale.zip

quiet.zip: $(patsubst %, $(srcdir)/quiet/%, $(QUIET_DIST))
	cd $(srcdir)/quiet && $(ZIP) -0 -r -q $(abs_builddir)/quiet.zip $(QUIET_DIST)

commander.zip: $(patsubst %, $(srcdir)/commander/%, $(COMMANDER_DIST))
	cd $(srcdir)/commander && $(ZIP) -0 -r -q $(abs_builddir)/commander.zip $(COMMANDER_DIST)

brutale.zip: $(patsubst %, $(srcdir)/brutale/%, $(BRUTALE_DIST))
	cd $(srcdir)/brutale && $(ZIP) -0 -r -q $(abs_builddir)/brutale.zip $(BRUTALE_DIST)

# Windows
if HOST_WINDOWS
diskflux_LDADD += resource_res.o messages_res.o -ladvapi32 -luserenv

messages.h messages.rc: daemon/messages.mc
	$(WINDMC) $<

messages_res.o: messages.rc
	$(WINDRES) $< -o $@

resource_res.o: daemon/resource.rc daemon/resource.manifest
	$(WINDRES) --include-dir=. --include-dir=$(srcdir) $< -o $@

daemon/diskflux-mingwapp.$(OBJEXT): messages.h

CLEANFILES += resource_res.o messages.h messages.rc messages_res.o MSG00401.bin
endif

diskflux_SOURCES = \
	daemon/daemon.c \
	daemon/memory.c \
	daemon/state.c \
	daemon/runner.c \
	daemon/parser.c \
	daemon/scheduler.c \
	daemon/version.c \
	daemon/support.c \
	daemon/str.c \
	daemon/rest.c \
	daemon/web.c \
	daemon/zip.c \
	daemon/zio.c \
	daemon/conf.c \
	daemon/log.c \
	daemon/elem.c \
	daemon/report.c \
	daemon/notify.c \
	daemon/storage.c \
	daemon/host.c \
	daemon/arrays.c \
	daemon/replycache.c \
	daemon/import.c \
	daemon/smart.c \
	daemon/selftest.c \
	daemon/unixapp.c \
	daemon/mingwapp.c \
	os/unix.c \
	os/mingw.c \
	civetweb/civetweb.c \
	tommyds/tommy.c \
	monocypher/monocypher.c

noinst_HEADERS = \
	monocypher/monocypher.h \
	tommyds/tommychain.h \
	tommyds/tommyhash.h \
	tommyds/tommyhashtbl.h \
	tommyds/tommylist.h \
	tommyds/tommytree.h \
	tommyds/tommytypes.h \
	tommyds/tommyhash.c \
	tommyds/tommyhashtbl.c \
	tommyds/tommylist.c \
	tommyds/tommytree.c \
	jsmn/jsmn.h \
	civetweb/civetweb.h \
	civetweb/external_log_access.inl \
	civetweb/external_mg_cry_internal_impl.inl \
	civetweb/match.inl \
	civetweb/md5.inl \
	civetweb/response.inl \
	civetweb/sort.inl \
	os/portable.h \
	os/unix.h \
	os/mingw.h \
	os/os.h \
	daemon/app.h \
	daemon/memory.h \
	daemon/state.h \
	daemon/runner.h \
	daemon/parser.h \
	daemon/scheduler.h \
	daemon/support.h \
	daemon/str.h \
	daemon/rest.h \
	daemon/web.h \
	daemon/zip.h \
	daemon/zio.h \
	daemon/conf.h \
	daemon/log.h \
	daemon/elem.h \
	daemon/report.h \
	daemon/notify.h \
	daemon/storage.h \
	daemon/storage_int.h \
	daemon/host.h \
	daemon/arrays.h \
	daemon/replycache.h \
	daemon/import.h \
	daemon/smart.h \
	daemon/selftest.h \
	daemon/version.h

# Add the .version file in the distribution
dist-hook:
	$(srcdir)/autover.sh > $(distdir)/.version

LANG_CODES =

LIST_D = doc/diskflux.d $(patsubst %, doc/diskflux-%.d, $(LANG_CODES))

LIST_MAN = doc/diskflux.1 $(patsubst %, doc/diskflux-%.1, $(LANG_CODES))

LIST_TXT = doc/diskflux.txt $(patsubst %, doc/diskflux-%.txt, $(LANG_CODES))

LIST_XML = doc/diskflux.xml $(patsubst %, doc/diskflux-%.xml, $(LANG_CODES))

EXTRA_DIST = \
	test/ui/README \
	test/ui/storage.test.mjs \
	test/ui/arrays.test.mjs \
	test/ui/plain.test.mjs \
	test/ui/confreview.test.mjs \
	test/login-test.sh \
	test/server-actions-test.sh \
	autogen.sh autover.sh \
	README HISTORY INSTALL AUTHORS BLUEBOX \
	CHANGES-FORK ROADMAP-FORK installer.sh diskflux-upgrade \
	COPYING LICENSES/GPL-3.0 LICENSES/BSD-2-Clause LICENSES/MIT LICENSES/OFL \
	$(LIST_D) \
	$(LIST_MAN) \
	$(LIST_TXT) \
	m4/ax_pthread.m4 \
	m4/m4_ax_check_compile_flag.m4 \
	jsmn/LICENSE \
	civetweb/LICENSE.md \
	daemon/messages.mc \
	daemon/resource.rc \
	daemon/resource.manifest \
	configure.windows-x64 \
	diskflux.service.in rc.diskflux.in \
	makeslackware.sh.in \
	makeslackdist.sh.in \
	pkg/diskflux.SlackBuild.in \
	pkg/diskflux.info.in \
	pkg/slack-desc \
	pkg/doinst.sh \
	makedeb.sh.in \
	pkg/control.in \
	pkg/conffiles \
	pkg/preinst \
	pkg/postinst \
	pkg/prerm \
	pkg/postrm \
	maketransition.sh.in \
	pkg/transition/preinst \
	pkg/transition/postinst \
	pkg/transition/prerm \
	pkg/transition/move-to-diskflux \
	makerpm.sh.in \
	pkg/diskflux.spec.in \
	makearch.sh.in \
	makearchdist.sh.in \
	pkg/.INSTALL \
	pkg/.PKGINFO.in \
	pkg/PKGBUILD.in \
	pkg/.SRCINFO.in \
	makensis.sh.in \
	pkg/diskflux.nsis.in \
	pkg/diskflux.ico \
	diskflux.yaml \
	diskflux.service.in \
	rc.diskflux.in \
	diskflux.conf.example \
	quiet/index.html \
	quiet/site.webmanifest \
	quiet/image/favicon-16x16.png \
	quiet/image/android-chrome-512x512.png \
	quiet/image/apple-touch-icon.png \
	quiet/image/android-chrome-192x192.png \
	quiet/image/favicon-32x32.png \
	quiet/favicon.ico \
	quiet/css/style.css \
	quiet/css/simple.css \
	quiet/css/quiet.css \
	quiet/css/fonts/Inter-400.woff2 \
	quiet/css/fonts/Inter-500.woff2 \
	quiet/css/fonts/Inter-600.woff2 \
	quiet/css/fonts/Inter-700.woff2 \
	quiet/css/fonts/JetBrainsMono-Regular.woff2 \
	quiet/css/fonts/OFL-Inter \
	quiet/css/fonts/OFL-JetBrainsMono \
	quiet/js/init.js \
	quiet/js/ui.js \
	quiet/js/api.js \
	quiet/js/storage.js \
	quiet/js/simple.js \
	quiet/js/plain.js \
	quiet/js/prefs.js \
	quiet/js/confreview.js \
	quiet/js/conffile.js \
	quiet/js/arrays.js \
	quiet/js/app.js \
	quiet/js/utils.js \
	commander/index.html \
	commander/site.webmanifest \
	commander/image/favicon-16x16.png \
	commander/image/android-chrome-512x512.png \
	commander/image/apple-touch-icon.png \
	commander/image/android-chrome-192x192.png \
	commander/image/favicon-32x32.png \
	commander/favicon.ico \
	commander/css/style.css \
	commander/css/simple.css \
	commander/js/init.js \
	commander/js/ui.js \
	commander/js/api.js \
	commander/js/storage.js \
	commander/js/simple.js \
	commander/js/plain.js \
	commander/js/prefs.js \
	commander/js/confreview.js \
	commander/js/conffile.js \
	commander/js/arrays.js \
	commander/js/app.js \
	commander/js/utils.js \
	brutale/index.html \
	brutale/site.webmanifest \
	brutale/image/favicon-16x16.png \
	brutale/image/android-chrome-512x512.png \
	brutale/image/apple-touch-icon.png \
	brutale/image/android-chrome-192x192.png \
	brutale/image/favicon-32x32.png \
	brutale/favicon.ico \
	brutale/css/style.css \
	brutale/css/simple.css \
	brutale/js/init.js \
	brutale/js/ui.js \
	brutale/js/api.js \
	brutale/js/storage.js \
	brutale/js/simple.js \
	brutale/js/plain.js \
	brutale/js/prefs.js \
	brutale/js/confreview.js \
	brutale/js/conffile.js \
	brutale/js/arrays.js \
	brutale/js/app.js \
	brutale/js/utils.js \
	brutale/css/fonts/BebasNeue-Regular.woff2 \
	brutale/css/fonts/PlusJakartaSans-Bold.woff2 \
	brutale/css/fonts/DMSans-Regular.woff2 \
	brutale/css/fonts/DMSans-Medium.woff2 \
	brutale/css/fonts/DMSans-Bold.woff2 \
	brutale/css/fonts/JetBrainsMono-Regular.woff2 \
	brutale/css/fonts/JetBrainsMono-Bold.woff2 \
	brutale/css/fonts/OFL

man1_MANS = doc/diskflux.1

# Allow leftover .conf 
distuninstallcheck_listfiles = \
	find . -type f -print | grep -v 'etc/diskflux.conf'

clean-local:
	rm -f valgrind.log callgrind.log cachegrind.log
	rm -f quiet.zip commander.zip brutale.zip
	rm -f makeslackware.sh makeslackdist.sh pkg/diskflux.SlackBuild pkg/diskflux.info makedeb.sh maketransition.sh pkg/control makerpm.sh pkg/spec
	rm -fr *.plist

maintainer-clean-local:
	rm -f $(LIST_MAN)
	rm -f $(LIST_TXT)
	rm -f $(LIST_XML)
	rm -f diskflux-*.rpm diskflux_*.deb diskflux-*.txz diskflux-*.exe diskflux-*.tar.gz diskflux-*.tar.zst
	rm -f diskflux.src.tar.gz diskflux.tar.gz

install-data-hook:
# Install localized manpages
	for lang in $(LANG_CODES); do \
		mkdir -p $(DESTDIR)$(mandir)/$$lang/man1; \
		$(INSTALL_DATA) $(srcdir)/doc/diskflux-$$lang.1 $(DESTDIR)$(mandir)/$$lang/man1/diskflux.1; \
	done
	@echo ""
	@echo "=================================================================="
	@echo " $(PACKAGE_NAME) installation complete!"
	@echo "=================================================================="
	@echo ""
	@if test -z "$(DESTDIR)"; then \
		echo " Configuration:"; \
		if test -f $(sysconfdir)/diskflux.conf ; then \
			echo "  Existing configuration found at $(sysconfdir)/diskflux.conf"; \
			echo "  Your settings have been preserved."; \
		elif test -f /etc/diskflux.conf ; then \
			echo "  Existing configuration found at /etc/diskflux.conf"; \
			echo "  Your settings have been preserved."; \
		else \
			echo "  No configuration found. Installing default to:"; \
			echo "  $(sysconfdir)/diskflux.conf"; \
			$(INSTALL) -D -m 644 $(srcdir)/diskflux.conf.example $(sysconfdir)/diskflux.conf; \
		fi; \
	else \
		echo "DESTDIR is set ($(DESTDIR)), installing example only"; \
		echo "Real config should be created/managed by packaging script."; \
	fi
	@echo ""
	@echo "=================================================================="
# Install service/rc.d
if INSTALL_SYSTEMD
	@echo ""
	@echo " Detected systemd. To start the daemon now and at boot:"
	@echo "   sudo systemctl daemon-reload"
	@echo "   sudo systemctl enable --now diskflux"
	@echo ""
	@echo " To check status:"
	@echo "   systemctl status diskflux"
	@echo ""
	@echo " Once started, you can access the dashboard at:"
	@echo "    http://localhost:7700"
	@echo "=================================================================="
	@echo ""
endif
if INSTALL_BSD_INIT
	@echo ""
	@echo " Detected BSD-style init. To enable the daemon:"
	@echo "   sudo chmod +x $(rcdir)/rc.diskflux"
	@echo ""
	@echo " To start it at boot, add this to /etc/rc.d/rc.local:"
	@echo "   if [ -x $(rcdir)/rc.diskflux ]; then"
	@echo "     $(rcdir)/rc.diskflux start"
	@echo "   fi"
	@echo ""
	@echo " Or run manually: sudo $(rcdir)/rc.diskflux start"
	@echo ""
	@echo " Once started, you can access the dashboard at:"
	@echo "    http://localhost:7700"
	@echo "=================================================================="
	@echo ""
endif

uninstall-hook:
# Uninstall localized manpages
	for lang in $(LANG_CODES); do \
		rm -f $(DESTDIR)$(mandir)/$$lang/man1/diskflux.1; \
		rmdir --ignore-fail-on-non-empty $(DESTDIR)$(mandir)/$$lang/man1 2>/dev/null || true; \
		rmdir --ignore-fail-on-non-empty $(DESTDIR)$(mandir)/$$lang 2>/dev/null || true; \
	done
# Uninstall service/rc.d
if INSTALL_SYSTEMD
	@if test -z "$(DESTDIR)"; then \
		echo ""; \
		echo "=================================================================="; \
		echo "Stopping and disabling systemd service..."; \
		systemctl --no-reload stop diskflux.service 2>/dev/null || true; \
		systemctl --no-reload disable diskflux.service 2>/dev/null || true; \
		systemctl daemon-reload 2>/dev/null || true; \
		echo "Cleaning up runtime files..."; \
		rm -f /run/diskflux.pid; \
	fi
endif
if INSTALL_BSD_INIT
	@echo ""
	@echo "=================================================================="
	@if test -f "$(rcdir)/rc.diskflux"; then \
		echo " Stopping BSD-style service..."; \
		"$(rcdir)/rc.diskflux" stop 2>/dev/null || true; \
	else \
		echo " Service script not found at $(rcdir)/rc.diskflux, skipping stop."; \
	fi
	@echo ""
	@echo " Note: If you added diskflux to /etc/rc.d/rc.local, please"
	@echo " remove those lines manually to prevent boot errors."
endif
	@echo ""
	@echo "=================================================================="
	@echo " $(PACKAGE_NAME) has been uninstalled."
	@echo " Note: Configuration files and logs were preserved."
	@echo "=================================================================="
	@echo ""

# Basic dependencies
DAEMON_PREFIX = daemon/diskflux-
DAEMON_INCLUDES = \
	config.h \
	$(srcdir)/daemon/conf.h \
	$(srcdir)/daemon/app.h \
	$(srcdir)/daemon/elem.h \
	$(srcdir)/daemon/log.h \
	$(srcdir)/daemon/memory.h \
	$(srcdir)/daemon/notify.h \
	$(srcdir)/daemon/storage.h \
	$(srcdir)/daemon/storage_int.h \
	$(srcdir)/daemon/host.h \
	$(srcdir)/daemon/arrays.h \
	$(srcdir)/daemon/replycache.h \
	$(srcdir)/daemon/import.h \
	$(srcdir)/daemon/parser.h \
	$(srcdir)/daemon/report.h \
	$(srcdir)/daemon/rest.h \
	$(srcdir)/daemon/runner.h \
	$(srcdir)/daemon/scheduler.h \
	$(srcdir)/daemon/smart.h \
	$(srcdir)/daemon/state.h \
	$(srcdir)/daemon/support.h \
	$(srcdir)/daemon/str.h \
	$(srcdir)/daemon/version.h \
	$(srcdir)/daemon/web.h \
	$(srcdir)/daemon/zip.h \
	$(srcdir)/daemon/zio.h \
	$(srcdir)/os/mingw.h \
	$(srcdir)/os/os.h \
	$(srcdir)/os/portable.h \
	$(srcdir)/os/unix.h

$(DAEMON_PREFIX)conf.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)daemon.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)memory.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)elem.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)log.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)mingw.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)notify.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)storage.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)arrays.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)unixapp.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)mingwapp.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)selftest.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)parser.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)report.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)rest.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)runner.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)scheduler.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)version.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)smart.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)state.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)str.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)support.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)unix.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)web.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)zip.$(OBJEXT): $(DAEMON_INCLUDES)
$(DAEMON_PREFIX)zio.$(OBJEXT): $(DAEMON_INCLUDES)

# Rules for scripts
diskflux.service: diskflux.service.in
	sed \
		-e 's|@bindir[@]|$(bindir)|g' \
		-e 's|@sysconfdir[@]|$(sysconfdir)|g' \
		< $< > $@-t && mv $@-t $@

rc.diskflux: rc.diskflux.in
	$(AM_V_GEN)sed \
		-e 's|@bindir[@]|$(bindir)|g' \
		-e 's|@sysconfdir[@]|$(sysconfdir)|g' \
		< $< > $@-t && mv $@-t $@


# Rules for documentation
if HAVE_ADVD2
%.1 : %.d
	advd2 man < $< > $@

%.txt : %.d
	advd2 txt < $< | todos > $@

%.html : %.d
	advd2 html < $< > $@

%.xml : %.d
	advd2 xml < $< > $@
endif

check-local: diskflux$(EXEEXT)
	./diskflux$(EXEEXT) test
	@if command -v node >/dev/null 2>&1; then \
		node --test $(srcdir)/test/ui/storage.test.mjs $(srcdir)/test/ui/arrays.test.mjs $(srcdir)/test/ui/plain.test.mjs $(srcdir)/test/ui/confreview.test.mjs; \
	else \
		echo "node not found: skipping the tests of the Storage page"; \
	fi

MANUAL=./diskflux -f -N -i manual

run:
	$(MANUAL)

valgrind:
	valgrind \
		--tool=memcheck \
		--suppressions=valgrind.supp \
		--track-origins=yes \
		--read-var-info=yes \
		--leak-check=full \
		-v $(MANUAL) \
		2> valgrind.log
		tail valgrind.log

helgrind:
	valgrind \
		--tool=helgrind \
		--fair-sched=try \
		--suppressions=valgrind.supp \
		--gen-suppressions=all \
		-v $(MANUAL) \
		2> helgrind.log
		tail helgrind.log

heaptrack:
	/usr/local/heaptrack/bin/heaptrack $(MANUAL)

perf:
	@trap 'perf report; exit 1' INT; perf record -g -- $(MANUAL)

perfstat:
	perf stat -d -- $(MANUAL)
	
perfmem:
	@trap 'perf mem report; exit 1' INT; perf mem record -- $(MANUAL)

# Web distribution

web: $(LIST_XML)

# All docs

doc: $(LIST_MAN) $(LIST_TXT)
