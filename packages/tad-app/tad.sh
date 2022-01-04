#!/bin/bash
#
# Bash script for launching tad from command line,
# based on atom.sh from Tad text editor:
#  https://github.com/atom/atom
#
if [ "$(uname)" == 'Darwin' ]; then
  OS='Mac'
elif [ "$(expr substr $(uname -s) 1 5)" == 'Linux' ]; then
  OS='Linux'
else
  echo "Your platform ($(uname -a)) is not supported."
  exit 1
fi

if [ "$(basename $0)" == 'tad-beta' ]; then
  BETA_VERSION=true
else
  BETA_VERSION=
fi

export TAD_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT=true

while getopts ":wtfvh-:" opt; do
  case "$opt" in
    -)
      case "${OPTARG}" in
        wait)
          WAIT=1
          ;;
        help|version)
          REDIRECT_STDERR=1
          EXPECT_OUTPUT=1
          ;;
        foreground|test)
          EXPECT_OUTPUT=1
          ;;
      esac
      ;;
    w)
      WAIT=1
      ;;
    h|v)
      REDIRECT_STDERR=1
      EXPECT_OUTPUT=1
      ;;
    f|t)
      EXPECT_OUTPUT=1
      ;;
  esac
done

if [ $REDIRECT_STDERR ]; then
  exec 2> /dev/null
fi

if [ $EXPECT_OUTPUT ]; then
  export ELECTRON_ENABLE_LOGGING=1
fi

if [ $OS == 'Mac' ]; then
  if [ -n "$BETA_VERSION" ]; then
    TAD_APP_NAME="Tad Beta.app"
    TAD_EXECUTABLE_NAME="Tad Beta"
  else
    TAD_APP_NAME="Tad.app"
    TAD_EXECUTABLE_NAME="Tad"
  fi

  if [ -z "${TAD_PATH}" ]; then
    # If TAD_PATH isnt set, check /Applications and then ~/Applications for Tad.app
    if [ -x "/Applications/$TAD_APP_NAME" ]; then
      TAD_PATH="/Applications"
    elif [ -x "$HOME/Applications/$TAD_APP_NAME" ]; then
      TAD_PATH="$HOME/Applications"
    else
      # We havent found an Tad.app, use spotlight to search for Tad
      # TAD_PATH="$(mdfind "kMDItemCFBundleIdentifier == 'com.github.tad'" | grep -v ShipIt | head -1 | xargs -0 dirname)"

      # Exit if Tad can't be found
      if [ ! -x "$TAD_PATH/$TAD_APP_NAME" ]; then
        echo "Cannot locate Tad.app, it is usually located in /Applications. Set the TAD_PATH environment variable to the directory containing Tad.app."
        exit 1
      fi
    fi
  fi

  if [ $EXPECT_OUTPUT ]; then
    "$TAD_PATH/$TAD_APP_NAME/Contents/MacOS/$TAD_EXECUTABLE_NAME" --executed-from="$(pwd)" "$@"
    exit $?
  else
    # open -a "$TAD_PATH/$TAD_APP_NAME" -n --args --executed-from="$(pwd)" --pid=$$ --path-environment="$PATH" "$@"
    # echo "Starting $TAD_PATH/$TAD_APP_NAME" -n --args --executed-from="$(pwd)" "$@"
    open -a "$TAD_PATH/$TAD_APP_NAME" -n --args --executed-from="$(pwd)" "$@"
  fi
elif [ $OS == 'Linux' ]; then
  SCRIPT=$(readlink -f "$0")
  USR_DIRECTORY=$(readlink -f $(dirname $SCRIPT)/..)

  if [ -n "$BETA_VERSION" ]; then
    TAD_PATH="$USR_DIRECTORY/share/tad-beta/tad"
  else
    TAD_PATH="$USR_DIRECTORY/share/tad/tad"
  fi

  TAD_HOME="${TAD_HOME:-$HOME/.tad}"
  mkdir -p "$TAD_HOME"

  : ${TMPDIR:=/tmp}

  [ -x "$TAD_PATH" ] || TAD_PATH="$TMPDIR/tad-build/Tad/tad"

  if [ $EXPECT_OUTPUT ]; then
    "$TAD_PATH" --executed-from="$(pwd)" --pid=$$ "$@"
    exit $?
  else
    (
    nohup "$TAD_PATH" --executed-from="$(pwd)" --pid=$$ "$@" > "$TAD_HOME/nohup.out" 2>&1
    if [ $? -ne 0 ]; then
      cat "$TAD_HOME/nohup.out"
      exit $?
    fi
    ) &
  fi
fi

# Exits this process when Tad is used as $EDITOR
on_die() {
  exit 0
}
trap 'on_die' SIGQUIT SIGTERM

# If the wait flag is set, don't exit this process until Tad tells it to.
if [ $WAIT ]; then
  while true; do
    sleep 1
  done
fi
