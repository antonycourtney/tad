#!/bin/bash
set -e
echo "dylib-fixup: Fixing up dylibs in " $@
BREW_PREFIX=$(brew --prefix)
install_name_tool -change $BREW_PREFIX/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $@
install_name_tool -change $BREW_PREFIX/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib $@
targetDir=$(dirname $@)
# duckdbDylib=$targetDir/libduckdb.dylib
# install_name_tool -change $BREW_PREFIX/opt/openssl@3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $duckdbDylib
# install_name_tool -change $BREW_PREFIX/opt/openssl@3/lib/libssl.3.dylib @rpath/libssl.3.dylib $duckdbDylib
cp $BREW_PREFIX/opt/openssl@3/lib/libcrypto.3.dylib $targetDir
cp $BREW_PREFIX/opt/openssl@3/lib/libssl.3.dylib $targetDir
# finally, fix up libssl's ref to libcrypto:
sslDylib=$targetDir/libssl.3.dylib
# sigh -- make this work for a variety of openssl versions:
install_name_tool -change $BREW_PREFIX/Cellar/openssl@3/3.0.2/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
install_name_tool -change $BREW_PREFIX/Cellar/openssl@3/3.0.3/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
install_name_tool -change $BREW_PREFIX/Cellar/openssl@3/3.0.7/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
install_name_tool -change $BREW_PREFIX/Cellar/openssl@3/3.0.8/lib/libcrypto.3.dylib @rpath/libcrypto.3.dylib $sslDylib
echo "dylib-fixup: done."
