#!/bin/bash

# we assume the repository is cloned in <TiddlyWiki repo dir>/contrib/<plugin repo dir>
# and that all required plugins are linked from <TiddlyWiki>/plugins/ as such: vis / moment / timeline

node ../../tiddlywiki.js . --build index

if [[ $? -eq 0 ]]
then
  mv output/* .
  rmdir output
fi