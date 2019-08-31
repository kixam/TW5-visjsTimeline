/*\
title: $:/plugins/kixam/timeline/widget.timeline.js
type: application/javascript
module-type: widget

  A widget for displaying timelines using Vis.js.  http://visjs.org
  Continued from emkay's plugin at https://github.com/emkayonline/tw5visjs

  For full help see $:/plugins/kixam/timeline/help

\*/

/*jslint node: true, browser: true */
/*global $tw: false */

(function() {
  'use strict';

  var Widget = require("$:/core/modules/widgets/widget.js").widget;
  var moment = require("$:/plugins/kixam/moment/moment.js");
  if(typeof window !== 'undefined' && typeof window.moment !== 'function') {
    window.moment = moment;
  }
  var utils = require("$:/plugins/kixam/timeline/lib.utils.js");
  var vis = require("$:/plugins/kixam/timeline/vis-timeline.js");
  if(typeof window !== 'undefined' && typeof window.vis !== 'function') {
    window.vis = vis;
  }

  var TimelineWidget = function(parseTreeNode,options) {
    Widget.call(this);
    this.initialise(parseTreeNode,options);
  };

  TimelineWidget.prototype = new Widget();

  TimelineWidget.prototype.render = function(parent,nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();
    this.options = {orientation: "bottom"};
    this.tiddler = this.parentWidget;
    while(this.tiddler.parentWidget !== undefined && this.tiddler.tiddlerTitle === undefined && this.tiddler.transcludeTitle === undefined) {
      this.tiddler = this.tiddler.parentWidget;
    }
    this.tiddler = $tw.wiki.getTiddler(this.tiddler.tiddlerTitle || this.tiddler.transcludeTitle);
    this.warningTiddlerTitle = "$:/temp/plugins/kixam/visjstimeline/warning/" + this.tiddler.fields.title;
    this.persistentTiddlerTitle = "$:/temp/plugins/kixam/visjstimeline/persistent/" + this.tiddler.fields.title;
    this.hasCustomTime = false;
    this.twformat = "YYYYMMDDHHmmssSSS"

    var attrParseWorked = this.execute();
    if (attrParseWorked === undefined) {
      this.timelineHolder = $tw.utils.domMaker("div",{attributes:{style: "position: relative;"}});
      parent.insertBefore(this.timelineHolder,nextSibling);
      this.domNodes.push(this.timelineHolder);

      if(this.attributes["boxing"] !== "auto") {
        this.timelineHolder.style["height"]="100%";
        // -- adapted from felixhayashi's tiddlymap in widget.map.js
        this.sidebar = document.getElementsByClassName("tc-sidebar-scrollable")[0];
        this.isContainedInSidebar = (this.sidebar && this.sidebar.contains(this.parentDomNode));
        if(this.isContainedInSidebar) {
          this.parentDomNode.style["margin-top"]="-14px";
          this.parentDomNode.style["padding-right"]="2px";
        } else {
          this.parentDomNode.style["height"] = "auto";
        }
        parent.style["width"] = this.getAttribute("width", "100%");
        this.handleResizeEvent = this.handleResizeEvent.bind(this);
        window.addEventListener("resize", this.handleResizeEvent, false);
        this.handleResizeEvent();
        // --
        this.options["height"] = "100%";
      }

      this.createWarningButton();

      this.createTimeline();

      if(this.attributes["navpad"] !== undefined) {
        this.options["orientation"] = "top";
      }
      // default options must be set at this point, as we might add/change options from user through 'config'
      this.updateTimeline();

      if(this.attributes["navpad"] !== undefined) {
        this.createNavpad(); // must be created only after all options were processed
                             // e.g. for clickToUse, we observe vis-overlay, which will not exist if option is not processed
      }


    } else {
      utils.dispError(this.parseTreeNode.type+": Unexpected attribute(s) "+attrParseWorked.join(", "));
      this.refresh = function() {}; // disable refresh of this as it won't work with incorrrect attributes
    }
  };


  TimelineWidget.prototype.execute = function() {
    var attrParseWorked = utils.parseWidgetAttributes(this,{
           filter: { type: "string", defaultValue: "[!is[system]]"},
           captionField: { type: "string", defaultValue: "caption"},
           groupField: { type: "string", defaultValue: undefined},
           startDateField: { type: "string", defaultValue: "created"},
           endDateField:  { type: "string", defaultValue: undefined},
           format:  { type: "string", defaultValue: undefined},
           tipFormat:  { type: "string", defaultValue: undefined},
           customTime:  { type: "string", defaultValue: undefined},
           groupTags: {type: "string", defaultValue: undefined},
           boxing: {type: "string", defaultValue: "static"},
           navpad: {type: "string", defaultValue: undefined},
           config: {type: "string", defaultValue: undefined},
           persistent: {type: "string", defaultValue: undefined},
           });

    if ((attrParseWorked === undefined) && (this.filter)) {
      this.compiledFilter = this.wiki.compileFilter(this.filter);
    }

    return attrParseWorked;
  };

  TimelineWidget.prototype.getTimepointList = function(changedTiddlers) {
    var tiddlerList = [];
    // process the filter into an array of tiddler titles
    tiddlerList = this.compiledFilter.call(null, changedTiddlers, null);
    // If filter is a list of tiddlers it will return tiddlers even if they are not in changed Tiddlers
    if (changedTiddlers !== undefined) {
      tiddlerList = tiddlerList.filter(function (e) { return changedTiddlers[e];});
    }
    var self = this;
    var withoutDraftsList = tiddlerList.filter(function(optionTitle) {
      var optionTiddler = self.wiki.getTiddler(optionTitle);
      if (optionTiddler === undefined) {
        // tiddler may not exist if list attribute provided to widget, so exclude
        return true;
      } else {
        var isDraft = optionTiddler && optionTiddler.hasField("draft.of");
        return !isDraft;
      }
    });
    return withoutDraftsList;
  };
  /*
     Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
     */
  TimelineWidget.prototype.refresh = function(changedTiddlers) {
    var changedAttributes = this.computeAttributes();
    if(changedAttributes.filter
	|| changedAttributes.captionField
    || changedAttributes.startDateField
    || changedAttributes.endDateField
    || changedAttributes.tipFormat
    || changedAttributes.groupField
    || changedAttributes.customTime
    || changedAttributes.groupTags
    || changedAttributes.boxing
    || changedAttributes.navpad
    || changedAttributes.config) {
      this.refreshSelf();
      this.updateTimeline();
      return true;
    }
    if (this.displayedTiddlers.some(function (e) { return changedTiddlers[e.id]; })) {
      this.updateTimeline();
      return true;
    }
    var anyRelevantChanges = this.getTimepointList(changedTiddlers);
    if (anyRelevantChanges.length !== 0) {
      this.updateTimeline();
      return true;
    }
    this.handleResizeEvent();
  };

  TimelineWidget.prototype.createTimeline = function() {
    var data = [];
    // create the timeline
    this.timeline = new vis.Timeline(this.timelineHolder, data, this.options);
    this.timeline.fit();

    if(this.attributes["persistent"] !== undefined) {
      var persistentConfigTiddler = $tw.wiki.getTiddler(this.persistentTiddlerTitle);
      if(persistentConfigTiddler === undefined) {
        // duplicate initial settings to working tiddler if it does not exist
        var start = moment(this.timeline.getWindow().start),
            end = moment(this.timeline.getWindow().end),
            fields = {title: this.persistentTiddlerTitle,
                      text: "Timeline in [[" + this.tiddler.fields.title + "]] starts from {{!!timeline.start}} and ends at {{!!timeline.end}}"};
        if(start.isValid() && end.isValid() && start.isBefore(end)) {
          fields["timeline.start"] = this.format ? start.format(this.format) : start.format(this.twformat);
          fields["timeline.end"] = this.format ? end.format(this.format) : end.format(this.twformat);
        }
        persistentConfigTiddler = $tw.wiki.addTiddler(new $tw.Tiddler(fields));
      } else {
        // apply saved x-axis range from the working tiddler
        var start = moment(dateFieldToDate(persistentConfigTiddler.fields["timeline.start"], this.format)),
            end = moment(dateFieldToDate(persistentConfigTiddler.fields["timeline.end"], this.format));
        if(start.isValid() && end.isValid() && start.isBefore(end)) {
          this.timeline.setWindow(start,end);
        }
      }
      // monitor and save changes in x-axis range
      this.writeRange = false;
      this.handleRangeChanged = this.handleRangeChanged.bind(this);
      this.timeline.on('rangechanged', this.handleRangeChanged);
    }

    var self = this;
    this.timeline.on('click', function(properties) {
      // Check if background or a tiddler is selected
      if (properties.item !== null) {
        var toTiddlerTitle = properties.item;
        utils.displayTiddler(self, toTiddlerTitle);
      }
      else if(properties.group !== null && properties.what === "group-label") {
        var toTiddlerTitle = properties.group;
        if($tw.wiki.getTiddler(toTiddlerTitle)) {
          utils.displayTiddler(self, toTiddlerTitle);
        }
      }
    });
  };

  TimelineWidget.prototype.handleRangeChanged = function(properties) {
    if(properties.byUser || this.writeRange) {
      var start = moment(properties.start);
      var end = moment(properties.end);
      if(start.isValid() && end.isValid()) {
        utils.setTiddlerField(this.persistentTiddlerTitle, "timeline.start", this.format ? start.format(this.format) : start.format(this.twformat));
        utils.setTiddlerField(this.persistentTiddlerTitle, "timeline.end", this.format ? end.format(this.format) : end.format(this.twformat));
      }
    }
    this.writeRange = false;
  };

  // -- adapted from felixhayashi's tiddlymap in widget.map.js
  TimelineWidget.prototype.handleResizeEvent = function(event) {
    if(this.isContainedInSidebar) {
      var windowHeight = window.innerHeight;
      var canvasOffset = this.parentDomNode.getBoundingClientRect().top;
      var distanceBottom = this.getAttribute("bottom-spacing", "0px");
      var calculatedHeight = (windowHeight - canvasOffset - (this.isContainedInSidebar?3:0)) + "px";
      this.parentDomNode.style["height"] = "calc(" + calculatedHeight + " - " + distanceBottom + ")";
    } else if(this.attributes["boxing"] === "auto") {
      this.parentDomNode.style["height"] = "auto";
    } else {
      var height = this.getAttribute("height");
      this.parentDomNode.style["height"] = (height ? height : "300px");
    }
    if(this.timeline) {
      this.timeline.redraw(); // redraw timeline
    }
  };
  // --

  TimelineWidget.prototype.createWarningButton = function() {
    var button = $tw.utils.domMaker("div", {innerHTML: $tw.wiki.getTiddlerText("$:/core/images/warning","Warning"), class: "visjstimeline-warning", attributes: {title: "Not all tiddlers could be rendered",  style: "visibility: hidden"}});

    this.timelineHolder.appendChild(button);
    this.domNodes.push(button);

    this.handleWarningClick = this.handleWarningClick.bind(this);
    button.addEventListener("click", this.handleWarningClick, false);
  }

  TimelineWidget.prototype.handleWarningClick = function(event) {
    utils.displayTiddler(this, this.warningTiddlerTitle);
  }

  TimelineWidget.prototype.appendWarning = function(message) {
    if($tw.wiki.getTiddler(this.warningTiddlerTitle) === undefined) {
      var format = "Using ";
      if(this.format === undefined) {
        format += "[[TW5 date format|http://tiddlywiki.com/#DateFormat]]";
      } else {
        format += "[[moment.js format|http://momentjs.com/docs/#/parsing/string-format/]]: `" + this.format + "`";
      }
      var fields = {title: this.warningTiddlerTitle, text: "!!!Problems found while rendering `<$visjstimeline/>` in [["+this.tiddler.fields.title+"]]\n\n" + format + "\n\n|!Tiddler|!Problem|!Result|\n"};
      $tw.wiki.addTiddler(new $tw.Tiddler(fields));
    }
    utils.setTiddlerField(this.warningTiddlerTitle,"text", $tw.wiki.getTiddlerText(this.warningTiddlerTitle) + message + "\n");
    var button = this.timelineHolder.getElementsByClassName("visjstimeline-warning")[0];
    button.style["visibility"] = "visible";
  }

  TimelineWidget.prototype.resetWarning = function() {
    $tw.wiki.deleteTiddler(this.warningTiddlerTitle);
    var button = this.timelineHolder.getElementsByClassName("visjstimeline-warning")[0];
    button.style["visibility"] = "hidden";
  }

  TimelineWidget.prototype.createNavpad = function() {
    var navpad = $tw.utils.domMaker("div",{class: "vis-navigation visjstimeline-navpad"});

    this.timelineHolder.className = "vis-network";
    this.timelineHolder.appendChild(navpad);
    this.domNodes.push(navpad);

    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-up", id: "up", style: "visibility: hidden"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-down", id: "down", style: "visibility: hidden"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-left", id: "left"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-right", id: "right"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-zoomIn", id: "zoomIn"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-zoomOut", id: "zoomOut"}}));
    navpad.appendChild($tw.utils.domMaker("div",{attributes:{class: "vis-button vis-zoomExtends", id: "zoomExtends"}}));

    this.handleNavpadClick = this.handleNavpadClick.bind(this);
    for(var i=0; i<navpad.childNodes.length; i++) {
      this.domNodes.push(navpad.childNodes[i]);
      navpad.childNodes[i].addEventListener("click", this.handleNavpadClick, false);
    }

    var panel = this.timelineHolder.getElementsByClassName("vis-panel vis-center")[0];
    var top = panel.getElementsByClassName("vis-shadow vis-top")[0];
    var bottom = panel.getElementsByClassName("vis-shadow vis-bottom")[0];
    var overlay = this.timelineHolder.getElementsByClassName("vis-overlay")[0];

    this.handleItemsVisibilityChanged = this.handleItemsVisibilityChanged.bind(this);
    var self = this;
    var observer = new MutationObserver(function(mutations) {
      for(var i=0; i<mutations.length; i++) {
        self.handleItemsVisibilityChanged(mutations[i]);
      }});
    observer.observe(top, {attributes: true, subtree: false});
    observer.observe(bottom, {attributes: true, subtree: false});
    if(overlay !== undefined) { // clickToUse === true
      observer.observe(overlay, {attributes: true, subtree: false});
      navpad.style["visibility"] = "hidden";
    }
  }

  TimelineWidget.prototype.handleItemsVisibilityChanged = function(mutation) {
    if(mutation.attributeName === "style") {
      if((' ' + mutation.target.className + ' ').indexOf(' vis-overlay ') > -1) {
        // whole navpad visibility
        var timeline = this.timelineHolder.getElementsByClassName("vis-timeline")[0];
        var navpad = this.timelineHolder.getElementsByClassName("navpad")[0];
        if(navpad !== undefined) {
          navpad.style["visibility"] = (mutation.target.style["display"] === "none" ? "visible":"hidden");
        }
      } else {
        // up and down buttons visibility
        var cls = "vis-button " + ( (' ' + mutation.target.className + ' ').indexOf(' vis-top ') > -1 ? "vis-up":"vis-down" );
        var button = this.timelineHolder.getElementsByClassName(cls)[0];
        if(button !== undefined) {
          button.style["visibility"] = mutation.target.style["visibility"];
        }
      }
    }
  }

  TimelineWidget.prototype.handleNavpadClick = function(event) {
    var range = this.timeline.getWindow();
    var interval = range.end - range.start;
    var ratio = 0.2; // horizontal movement
    var step = 10; // vertical movement

    var centerdiv = this.timelineHolder.getElementsByClassName("vis-panel vis-center")[0];
    var contentdiv = centerdiv.getElementsByClassName("vis-content")[0];
    this.writeRange = true; // handle persistence
    switch (event.target.id) {
      case "up":
        centerdiv.getElementsByClassName("vis-shadow vis-bottom")[0].style["visibility"] = "visible";
        contentdiv.style["top"] = parseInt(contentdiv.style["top"]) + step + "px";
        if(parseInt(contentdiv.style["top"]) >= 0) {
          contentdiv.style["top"] = "0px";
          centerdiv.getElementsByClassName("vis-shadow vis-top")[0].style["visibility"] = "hidden";
        }
        break;
      case "down":
        centerdiv.getElementsByClassName("vis-shadow vis-top")[0].style["visibility"] = "visible";
        contentdiv.style["top"] = parseInt(contentdiv.style["top"]) - step + "px";
        if( Math.abs(parseInt(contentdiv.style["top"])) > contentdiv.getBoundingClientRect().height - centerdiv.getBoundingClientRect().height ) {
          contentdiv.style["top"] = contentdiv.getBoundingClientRect().height - centerdiv.getBoundingClientRect().height;
          centerdiv.getElementsByClassName("vis-shadow vis-bottom")[0].style["visibility"] = "hidden";
        }
        break;
      case "left":
        this.timeline.setWindow({
          start: range.start.valueOf() - interval * ratio,
          end  : range.end.valueOf()   - interval * ratio,
        });
        break;
      case "right":
        this.timeline.setWindow({
          start: range.start.valueOf() + interval * ratio,
          end  : range.end.valueOf()   + interval * ratio,
        });
        break;
      case "zoomIn":
        this.timeline.setWindow({
          start: range.start.valueOf() + interval * ratio,
          end  : range.end.valueOf()   - interval * ratio,
        });
        break;
      case "zoomOut":
        this.timeline.setWindow({
          start: range.start.valueOf() - interval * ratio,
          end  : range.end.valueOf()   + interval * ratio,
        });
        break;
      case "zoomExtends":
        this.timeline.fit();
        break;
      default:
        this.dispError("No such navtab action: " + action);
    }
  }

  function dateFieldToDate(dateField, dateFormat) {
    if(dateField === undefined) return;
    dateField = dateField.trim();
    var re = /moment\(["' ]*([^)"']*)["' ]*\)\.(add|subtract)\( *([^,]+) *,["' ]*([^)"']+)["' ]*\)/i;
    if (re.test(dateField)) {
      var res = re.exec(dateField),
          def = res[1],
          operation = res[2],
          qty = parseInt(res[3]),
          unit = res[4],
          m = (def.trim() === "" ? moment() : moment(def));
      if (operation === "add") {
        m.add(qty, unit);
      } else if(operation === "subtract"){
        m.subtract(qty, unit);
      }
      else m = moment.invalid();
      if (m.isValid()) {
        return m.toDate();
      }
    }
    else if (dateField === "now") {
        return new Date();
    }
    else if (dateField !== "") {
      if (dateFormat === undefined) {
        return $tw.utils.parseDate(dateField);
      } else {
        var m = moment(dateField, dateFormat, true);
        if (m.isValid()) {
          return m.toDate();
        }
      }
    }
  }

  function iconPrefix(icon, color, spanclass)
  {
    var text = "",
        iconTiddler = $tw.wiki.getTiddler(icon);
    if(iconTiddler !== undefined) {
      text = "</span>&nbsp;";
      var type = iconTiddler.fields.type || "image/svg+xml";
      if(type === "image/svg+xml") {
        text = iconTiddler.fields.text + text;
      } else {
        $tw.Wiki.parsers[type](type, iconTiddler.fields.text, iconTiddler.fields);
        var obj  = $tw.Wiki.parsers.tree[0];
        text = "></" + obj.tag + ">" + text;
        for(var k in obj.attributes) {
          text = " " + k + " = '" + obj.attributes[k].value + "'" + text;
        }
        text = "<" + obj.tag + text;
      }
      text = "<span class='" + spanclass + "'" + (color?" style='fill:"+color+"';":"") + ">" + text;
    }
    return text;
  }

  function addTimeData(self) {
    return function(current, tiddlerName) {
      var currentData = current.data;
      var currentGroups = current.groups;
      var currentErrors = current.errors;
      var theTiddler = self.wiki.getTiddler(tiddlerName);
      // tiddler may not exist if list attribute provided to widget
      if (theTiddler !== undefined) {
        var tiddlerStartDate = theTiddler.getFieldString(self.startDateField);
        var startDate = dateFieldToDate(tiddlerStartDate, self.format);
        if (!isNaN(startDate)) {
          var caption = theTiddler.getFieldString(self.captionField) || tiddlerName,
              description = theTiddler.fields.description || caption,
              color = theTiddler.fields.color || false,
              style = "border-color: " + color + ";" || "",
              icon = theTiddler.fields.icon;
          caption = iconPrefix(icon, color, "item-icon") + caption;
          if(self.tipFormat !== undefined) {
            description += "<br><br>" + self.startDateField + ": " + moment(startDate).format(self.tipFormat);
          }
          var newTimepoint = {id: tiddlerName, content: caption, title: description, style: style, start: startDate, type: 'point'};
          var tiddlerGroup = "";
          if (self.groupField !== undefined) {
            tiddlerGroup = theTiddler.getFieldString(self.groupField);
          } else if(self.groupTags !== undefined) {
            $tw.utils.each($tw.wiki.filterTiddlers(self.groupTags),
              function(tag) {if(theTiddler.hasTag(tag)) tiddlerGroup = tag;});
          }
          if(self.groupTags !== undefined || self.groupField !== undefined) {
            if (tiddlerGroup !== "") {
              newTimepoint.group = tiddlerGroup;
              currentGroups[tiddlerGroup] = true;
            } else {
              newTimepoint.group = "Global";
              currentGroups.Global = true;
            }
          }
          if (self.endDateField !== undefined ) {
            var tiddlerEndDate = theTiddler.getFieldString(self.endDateField);
            var endDate = dateFieldToDate(tiddlerEndDate, self.format);
            if(!isNaN(endDate) && endDate < startDate) {
              currentErrors.push("| [[" + tiddlerName + "]] |End date \"" + tiddlerEndDate + "\" (field `" + self.endDateField + "`) is before start date \"" + tiddlerStartDate + "\" (field `" + self.startDateField + "`)|Used start date as end date|");
              endDate = startDate;
            }
            else if(isNaN(endDate)) {
              if(tiddlerEndDate === "") {
                currentErrors.push("| [[" + tiddlerName + "]] |End date field `" + self.endDateField + "` is empty or does not exist|Used start date as end date|");
              } else {
                currentErrors.push("| [[" + tiddlerName + "]] |Could not parse end date \"" + tiddlerEndDate + "\" from field `" + self.endDateField + "`|Used start date as end date|");
              }
              endDate = startDate;
            }
            else if(self.tipFormat !== undefined) {
              newTimepoint.title += "<br>" + self.endDateField + ": " + moment(endDate).format(self.tipFormat);
            }

            newTimepoint.end = endDate;
            if (newTimepoint.end.getTime() != newTimepoint.start.getTime()) {
              newTimepoint.type = 'range';
              if(theTiddler.getFieldString("color") !== "") {
                newTimepoint.style += "border-width: 3px;" + utils.enhancedColorStyle(theTiddler.getFieldString("color"));
              }
            }
          }
          currentData.push(newTimepoint);
        } else {
          if(tiddlerStartDate === "") {
            currentErrors.push("| [[" + tiddlerName + "]] |Start date field `" + self.startDateField + "` is empty or does not exist|Not rendered|");
          } else {
            currentErrors.push("| [[" + tiddlerName + "]] |Could not parse start date \"" + tiddlerStartDate + "\" from field `" + self.startDateField + "`|Not rendered|");
          }
        }
      } else {
        currentErrors.push("| [[" + tiddlerName + "]] |Tiddler was not found|Not rendered|");
      }
      return {data: currentData, groups: currentGroups, errors: currentErrors};
    };
  }

  TimelineWidget.prototype.updateTimeline = function() {
    this.resetWarning();

    var langprefix = "$:/languages/".length,
        lang = $tw.wiki.getTiddlerText("$:/language").substring(langprefix, langprefix + 2);
    if(lang === "zh") {
      // TW5 does not use standard codes for Chinese
      var suffix = $tw.wiki.getTiddlerText("$:/language");
      suffix = suffix.substring(suffix.length-1);
      if(suffix === "s") {
        lang = "zh-cn"; //simplified
      } else {
        lang = "zh-tw"; //traditional
      }
    }
    this.options["locale"] = moment.locale([lang, "en"]);

    var timepointList = this.getTimepointList();
    var groups = {};
    if(this.groupTags !== undefined) {
      $tw.utils.each($tw.wiki.filterTiddlers(this.groupTags),
        function(tag) {groups[tag] = false;});
    }
    var result = timepointList.reduce(addTimeData(this), {data: [], groups: groups, errors: []});
    this.displayedTiddlers = result.data;
    this.timeline.setItems(result.data);
    if (this.customTime !== undefined) {
      if(this.hasCustomTime) {
        this.timeline.removeCustomTime();
        this.hasCustomTime = false;
      }
      var d = dateFieldToDate(this.customTime, this.format);
      if (d !== undefined) {
        this.timeline.addCustomTime(d);
        this.hasCustomTime = true;
      }
    }
    // override default options with these provided by the user, if any
    var config = $tw.wiki.getTiddlerData(this.attributes["config"], {});
    var whitelist = $tw.wiki.getTiddlerData("$:/plugins/kixam/timeline/validOptions", {"whitelist":[]}).whitelist;
    if(this.attributes["persistent"] !== undefined) {
      whitelist.start = undefined;
      whitelist.end = undefined;
    }
    for(var opt in config) {
      if(whitelist.indexOf(opt) > -1) this.options[opt] = config[opt];
    }
    this.timeline.setOptions(this.options);
    if (Object.keys(result.groups).length !== 0) {
      var theGroups = [];
      for (var group in result.groups) {
        if(result.groups[group]) {
          if(group === "Global") {
            theGroups.splice(0,0,{id: group,
                             content: "&mdash; Global &mdash;",
                               title: "(Global)",
                               style: "background-color:rgba(0,0,0,0); font-style:italic;"});
          } else {
            theGroups.push({id: group, content: group, title: group});
            var tiddler = $tw.wiki.getTiddler(group);
            if(tiddler !== undefined) {
              var icon = tiddler.fields.icon,
                  color = tiddler.fields.color || false,
                  caption = iconPrefix(icon, color, "group-icon") + "<p>" + (tiddler.fields.caption || group) + "</p>",
                  description = tiddler.fields.description || tiddler.fields.caption || group;
              if(color) {
                theGroups[theGroups.length-1].style = "border-width:3px; border-style:solid;"
                                                    + "border-bottom-width:3px; border-bottom-style:solid;"
                                                    + utils.enhancedColorStyle(color);
              }
              theGroups[theGroups.length-1].content = caption;
              theGroups[theGroups.length-1].title = description;
            }
          }
        }
      }
      this.timeline.setGroups(theGroups);
    }
    for(var i=0; i<result.errors.length; i++) {
      this.appendWarning(result.errors[i]);
    }

    this.timeline.fit();
    if(this.attributes["persistent"] !== undefined) {
      var persistentConfigTiddler = $tw.wiki.getTiddler(this.persistentTiddlerTitle),
          start = moment(dateFieldToDate(config.start || this.timeline.getWindow().start, this.format)),
          end = moment(dateFieldToDate(config.end || this.timeline.getWindow().end, this.format));
      if(persistentConfigTiddler === undefined) {
        // create working tiddler if it does not exist
        var fields = {title: this.persistentTiddlerTitle,
                      text: "Timeline in [[" + this.tiddler.fields.title + "]] starts from {{!!timeline.start}} and ends at {{!!timeline.end}}"};
        persistentConfigTiddler = $tw.wiki.addTiddler(new $tw.Tiddler(fields));
      }
      if(start.isValid() && end.isValid() && start.isBefore(end)) {
        // copy config settings to working tiddler
        utils.setTiddlerField(this.persistentTiddlerTitle, "timeline.start", this.format ? start.format(this.format) : start.format(this.twformat));
        utils.setTiddlerField(this.persistentTiddlerTitle, "timeline.end", this.format ? end.format(this.format) : end.format(this.twformat));
        // apply saved x-axis range from the working tiddler
        this.timeline.setWindow(start, end);
      }
    }
  };

  exports.visjstimeline = TimelineWidget;

  }
  ());
