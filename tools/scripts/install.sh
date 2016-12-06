#!/bin/bash
echo "Copying Tad.app to ~/Applications"
if [ -e ~/Applications/Tad.app ]
  then
    TEMPNAME=`mktemp /tmp/Tad.App.BAK.XXX`
    echo "~/Applications/Tad.app already exists -- removing (backup in $TEMPNAME)"
    mv ~/Applications/Tad.app $TEMPNAME
fi

cp -r ./Tad.app ~/Applications
echo "linking /usr/local/bin/tad to ~/Applications/Tad.app"
if [ -e /usr/local/bin/tad ]
  then
    TEMPNAME=`mktemp /tmp/tad.BAK.XXX`
    echo "/usr/local/bin/tad already exists -- removing (backup in $TEMPNAME)"
    mv /usr/local/bin/tad $TEMPNAME
fi
ln -s ~/Applications/Tad.app/Contents/MacOS/Tad /usr/local/bin/tad
echo "done."
echo
echo "Tad is now installed."
echo "Usage:"
echo "$ tad [csv-file]"
