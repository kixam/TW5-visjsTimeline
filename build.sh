#!/bin/bash

# we assume the repository is cloned in <TiddlyWiki repo dir>/contrib/<author>/<plugin repo dir>
# and that all required plugins are linked from <TiddlyWiki repo dir>/plugins/<author>/* as such: vis / moment / timeline

node ../../../tiddlywiki.js . --build index

if [[ $? -eq 0 ]]
then
  mv output/* .
  rmdir output
fi
