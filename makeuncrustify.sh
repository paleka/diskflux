#!/bin/sh

uncrustify -c uncrustify.cfg --replace --no-backup daemon/*.c daemon/*.h

sed -i 's/[[:blank:]]*$//' diskflux.conf.example
sed -i 's/[[:blank:]]*$//' diskflux.yaml
