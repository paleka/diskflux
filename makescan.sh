#!/bin/sh
#
# Run the Coverity Scan static analyzer
#

rm -r cov-int

make distclean

# Reconfigure (with force) to get the latest revision from git
autoreconf -f

if ! ./configure ; then
	exit 1
fi

export PATH=$PATH:../snapraid/contrib/cov-analysis-linux64-2024.12.1/bin

if ! cov-build --dir cov-int make; then
	exit 1
fi

REVISION=`sh autover.sh`

tar czf diskflux-$REVISION.tgz cov-int

rm -r cov-int

echo diskflux-$REVISION.tgz ready to upload to https://scan.coverity.com/projects/diskflux/builds/new
