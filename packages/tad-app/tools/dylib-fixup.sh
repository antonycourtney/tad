#!/bin/bash
set -e
echo "dylib-fixup: Fixing up dylibs in " $@
install_name_tool -change /usr/local/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $@
install_name_tool -change /usr/local/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib $@
targetDir=$(dirname $@)
# duckdbDylib=$targetDir/libduckdb.dylib
# install_name_tool -change /usr/local/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $duckdbDylib
# install_name_tool -change /usr/local/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib $duckdbDylib
cp /usr/local/opt/openssl@3/lib/libcrypto.3.dylib $targetDir
cp /usr/local/opt/openssl@3/lib/libssl.3.dylib $targetDir
# finally, fix up libssl's ref to libcrypto:
sslDylib=$targetDir/libssl.3.dylib
# sigh -- make this work for either 3.0.2 or 3.0.3:
install_name_tool -change /usr/local/Cellar/openssl@3/3.0.2/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
install_name_tool -change /usr/local/Cellar/openssl@3/3.0.3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
echo "dylib-fixup: done."
