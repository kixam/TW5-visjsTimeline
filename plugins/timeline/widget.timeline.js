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
  var utils = require("$:/plugins/kixam/timeline/widget.utils.js");
  var vis = require("$:/plugins/felixhayashi/vis/vis.js");

  var TimelineWidget = function(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
  };

  TimelineWidget.prototype = new Widget();

  TimelineWidget.prototype.render = function(parent,nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();
    this.options = {};

    var attrParseWorked = this.execute();
    if (attrParseWorked === undefined) {
      var timelineHolder = $tw.utils.domMaker("div",{});
      parent.insertBefore(timelineHolder,nextSibling);
      this.domNodes.push(timelineHolder);
      this.timelineHolder = timelineHolder;

      if(this.attributes["boxing"] !== "auto") {
        timelineHolder.style["height"]="100%";
        // -- adapted from felixhayashi's tiddlymap in widget.map.js
        this.sidebar = document.getElementsByClassName("tc-sidebar-scrollable")[0];
        this.isContainedInSidebar = (this.sidebar && this.sidebar.contains(this.parentDomNode));
        if(this.isContainedInSidebar) {
          this.parentDomNode.style["margin-top"]="-14px";
          this.parentDomNode.style["padding-right"]="2px";
        }
        parent.style["width"] = this.getAttribute("width", "100%");
        this.handleResizeEvent = this.handleResizeEvent.bind(this);
        window.addEventListener("resize", this.handleResizeEvent, false);
        this.handleResizeEvent();
        // --
        this.options["height"] = "100%";
      }

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
           groupField: { type: "string", defaultValue: undefined},
           startDateField: { type: "string", defaultValue: "created"},
           endDateField:  { type: "string", defaultValue: undefined},
           format:  { type: "string", defaultValue: undefined},
           customTime:  { type: "string", defaultValue: undefined},
           groupTags: {type: "string", defaultValue: undefined},
           boxing: {type: "string", defaultValue: "static"},
           navpad: {type: "string", defaultValue: undefined},
           config: {type: "string", defaultValue: undefined}
           });

    if ((attrParseWorked === undefined) && (this.filter)) {
      this.compiledFilter = this.wiki.compileFilter(this.filter);
    }

    return attrParseWorked;
  };

  TimelineWidget.prototype.getTimepointList = function(changedTiddlers) {
    var tiddlerList = [];
    // process the filter into an array of tiddler titles
    tiddlerList = this.compiledFilter.call(null, changedTiddlers, this.tiddler);
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
    if(changedAttributes.filter || changedAttributes.startDateField || changedAttributes.endDateField || changedAttributes.groupField) {
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
    this.timeline = new vis.Timeline(this.timelineHolder, data);

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

  // -- adapted from felixhayashi's tiddlymap in widget.map.js
  TimelineWidget.prototype.handleResizeEvent = function(event) {
    if(this.isContainedInSidebar) {
      var windowHeight = window.innerHeight;
      var canvasOffset = this.parentDomNode.getBoundingClientRect().top;
      var distanceBottom = this.getAttribute("bottom-spacing", "0px");
      var calculatedHeight = (windowHeight - canvasOffset - (this.isContainedInSidebar?3:0)) + "px";
      this.parentDomNode.style["height"] = "calc(" + calculatedHeight + " - " + distanceBottom + ")";
    } else {
      var height = this.getAttribute("height");
      this.parentDomNode.style["height"] = (height ? height : "300px");
    }
    if(this.timeline) {
      this.timeline.redraw(); // redraw timeline
    }
  };
  // --

  TimelineWidget.prototype.createNavpad = function() {
    var navpad = $tw.utils.domMaker("div",{class: "vis-navigation navpad"});

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
        utils.dispError("No such action: " + action);
    }
  }

  function dateFieldToDate(dateField, dateFormat) {
    dateField = dateField.trim();
    if (dateField === "now") {
      return new Date();
    }
    if (dateField !== "") {
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
          // var newTimepoint = {id: tiddlerName, content: tiddlerName, start: $tw.utils.formatDateString(startDate, "YYYY-0MM-0DD"), type: 'point'};
          var caption = theTiddler.fields.caption || tiddlerName,
              description = theTiddler.fields.description || caption,
              color = theTiddler.fields.color || false,
              style = "border-color: " + color + ";" || "",
              icon = theTiddler.fields.icon,
              iconTiddler = $tw.wiki.getTiddler(icon);
          if(iconTiddler !== undefined) {
            caption = "<span class='item-icon'" + (color?" style='fill:"+color+"';":"") + ">"
                    + iconTiddler.fields.text + "</span>&nbsp;"
                    + caption;
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
            if (!isNaN(endDate)) {
              // newTimepoint.end = $tw.utils.formatDateString(endDate, "YYYY-0MM-0DD");
              if (endDate < startDate) {
                currentErrors.push("End date ("+tiddlerEndDate+") on "+tiddlerName+"."+self.endDateField+" is before start date ("+tiddlerStartDate+") on "+tiddlerName+"."+self.startDateField);
              } else {
                newTimepoint.end = endDate;
                if (newTimepoint.end.getTime() != newTimepoint.start.getTime()) {
                  newTimepoint.type = 'range';
                  if(theTiddler.getFieldString("color") !== "") {
                    newTimepoint.style += "border-width: 3px;"
                                        + utils.enhancedColorStyle(theTiddler.getFieldString("color"));
                  }
                }
              }
            } else {
              currentErrors.push("Not a endDate ("+tiddlerEndDate+") on "+tiddlerName+"."+self.endDateField);
            }
          }
          currentData.push(newTimepoint);
        } else {
          currentErrors.push("Not a startDate ("+tiddlerStartDate+") on "+tiddlerName+"."+self.startDateField);
        }
      } else {
        currentErrors.push("Unknown tiddler "+tiddlerName);
      }
      return {data: currentData, groups: currentGroups, errors: currentErrors};
    };
  }

  TimelineWidget.prototype.updateTimeline = function() {
    var self = this;
    var timepointList = this.getTimepointList();
    var result = timepointList.reduce(addTimeData(self), {data: [], groups: {}, errors: []});
    this.displayedTiddlers = result.data;
    this.timeline.setItems(result.data);
    if (this.customTime !== undefined) {
      var d = dateFieldToDate(this.customTime, this.format);
      if (d !== undefined) {
        this.timeline.addCustomTime(d);
      }
    }
    // override default options with these provided by the user, if any
    var config = $tw.wiki.getTiddlerData(this.attributes["config"], {});
    var whitelist = $tw.wiki.getTiddlerData("$:/plugins/kixam/timeline/validOptions.json", {"whitelist":[]}).whitelist;
    for(var opt in config) {
      if(whitelist.indexOf(opt) > -1) this.options[opt] = config[opt];
    }
    this.timeline.setOptions(this.options);
    if (Object.keys(result.groups).length !== 0) {
      var theGroups = [];
      for (var group in result.groups) {
        theGroups.push({id: group, content: group, title: group});
        var tiddler = $tw.wiki.getTiddler(group);
        if(tiddler !== undefined) {
          var caption = "<span>" + (tiddler.fields.caption || group) + "</span>",
              description = tiddler.fields.description || tiddler.fields.caption || group,
              color = tiddler.fields.color || false,
              icon = tiddler.fields.icon,
              iconTiddler = $tw.wiki.getTiddler(icon);
          if(color) {
            theGroups[theGroups.length-1].style = "border-width:3px; border-style:solid;"
                                                + "border-bottom-width:3px; border-bottom-style:solid;"
                                                + utils.enhancedColorStyle(tiddler.fields.color);
          }
          if(iconTiddler !== undefined) {
            caption = "<span class='group-icon'" + (color?" style='fill:"+color+"';":"") + ">"
                    + iconTiddler.fields.text + "</span><br>"
                    + caption;
          }
          theGroups[theGroups.length-1].content = caption;
          theGroups[theGroups.length-1].title = description;
        }
      }
      this.timeline.setGroups(theGroups);
    }
    if (result.errors.length !== 0) {
      utils.dispError(this.parseTreeNode.type+": <ul><li>"+result.errors.join("</li><li>")+"</li></ul>");
    }
    this.timeline.fit();
  };

  exports.visjstimeline = TimelineWidget;

  }
  ());
