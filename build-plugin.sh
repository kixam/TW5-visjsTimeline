#!/bin/bash
# this script will compile the vis-timeline library into a TW5 plugin

#####################################################################
# Script Configuration
#####################################################################

pluginPrefix="$:/plugins/kixam/vis-timeline" # prefix for all tiddlers of this plugin
targetDir="plugins/vis-timeline" # output path
moduleName="vis-timeline" # module's src name (and path)
srcPath="${moduleName}/dist" # module path
cssPath="${moduleName}/dist" # module's CSS path
fileName="vis-timeline-graph2d" # module's files names without their extension

#####################################################################
# Program
#####################################################################

#====================================================================
printf "Fetch upstream resources...\n"
#====================================================================

git submodule update --init --recursive --remote

#====================================================================
printf "Perform cleanup...\n"
#====================================================================

find "$targetDir" -name "*$moduleName.*" -exec rm -rf {} \;

if [ $COMPILE == 1 ]; then
  #====================================================================
  printf "Compile module with dependencies to separate TW5 modules...\n"
  #====================================================================
  
  res=$(cd $moduleName && npm run build -- -e moment,hammer)
fi

#====================================================================
printf "Copy styles...\n"
#====================================================================

# header with macro
header=\
'title: '${pluginPrefix}/${moduleName}.css'
type: text/vnd.tiddlywiki
tags: $:/tags/Stylesheet

\rules except list'

macro=\
'\define datauri(title)
<$macrocall $name="makedatauri" type={{$title$!!type}} text={{$title$}}/>
\end'

body=$(cat "$cssPath/$fileName.min.css")

printf "%s\n\n%s\n\n%s" "$header" "$macro" "$body" > "$targetDir/tiddlers/$moduleName.css.tid"

#====================================================================
printf "Copy and adapt scripts...\n"
#====================================================================

# header with macro
header=\
'/*\
title: '${pluginPrefix}/${moduleName}.js'
type: application/javascript
module-type: library

@preserve
\*/
var vis;if($tw.browser){
'

footer=\
'}exports.vis = vis;
'

body=$(cat $srcPath/$fileName.min.js)

printf "%s\n\n%s\n" "$header" "$body" "$footer" > $targetDir/$moduleName.js

# replace vanilla references to dependencies with references to TW5 plugins

sed -r -i -e 's|require\("moment"\)|require("$:/plugins/kixam/moment/moment.js")|' "$targetDir/$moduleName.js"
sed -r -i -e 's|require\("vis-data/peer/umd/vis-data.js"\)|require("$:/plugins/kixam/vis-data/vis-data.js")|' "$targetDir/$moduleName.js"
sed -r -i -e 's|define\(\["exports","moment","vis-data/peer/umd/vis-data.js"\]|define(["exports","$:/plugins/kixam/moment/moment.js","$:/plugins/kixam/vis-data/vis-data.js"]|' "$targetDir/$moduleName.js"

#====================================================================
printf "Update version information...\n"
#====================================================================

version="$(cd "$srcPath" && git describe --tags $(git rev-list --tags --max-count=1))"
version=${version:1}
version=`expr match "$version" '[^0-9]*\([0-9\.]*\)'` # clean any prefix or suffix
printf "Using $moduleName version $version\n"
sed -r -i -e "s/$moduleName version [^\"]*\"/$moduleName version $version\"/" "$targetDir/plugin.info"

exit
