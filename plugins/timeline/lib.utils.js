/*\
title: $:/plugins/kixam/timeline/widget.utils.js
type: application/javascript
module-type: library

  A library of reusable functions, used in the TW5-visjsTimeline plugin
  Continued from emkay's plugin at https://github.com/emkayonline/tw5visjs

\*/

/*jslint node: true, browser: true */
/*global $tw: false */


(function() {
  'use strict';

  // parseWidgetAttributes
  //
  // Utility to handle configuration attributes for a widget.
  // It handles validation, coercion and assignment of attribute values to the current widgets fields.
  // Parent and nextSibling are required so that any errors can be reported
  //
  // The attributeDefns are a object representing with a field for each attribute expected by the widget
  //
  // Each definition field is an object with two fields
  // type - This is used to coerce values before assignment (only string and integer are currently supported)
  // defaultValue - When an attribute is not provided in the plugin call, then this value should be used instead
  //
  // If an attribute is passed to the plugin that is not expected (i.e. in the attributeDefns object), then this function returns false
  // and an error message is output on the parent.  This should be shown instead of the widget's usual view.
  //
  function parseWidgetAttributes(self, attributeDefns) {
    var errors = [];
    for (var attr in self.attributes) {
      if (attributeDefns[attr] === undefined) {
        errors.push(attr);
      } else {
        if (attributeDefns[attr].type == "string") {
          self[attr] = self.attributes[attr];
        } else if (attributeDefns[attr].type == "integer") {
          self[attr] = parseInt(self.attributes[attr] );
          if (isNaN(self[attr])) {
            delete self[attr];
          }
        }
      }
    }
    if (errors.length !== 0) {
      return errors;
    }
    for (var attrDefn in attributeDefns) {
      if (self[attrDefn] === undefined) {
        self[attrDefn] = attributeDefns[attrDefn].defaultValue;
      }
    }
    return undefined;
  }

  function displayTiddler(self,toTiddlerTitle){
    var domTiddler = self.parentDomNode.parentNode;
    var bounds = domTiddler.getBoundingClientRect();
    var e = {
      type: "tm-navigate",
      navigateTo: toTiddlerTitle,
      navigateFromTitle: self.getVariable("currentTiddler"),
      navigateFromNode: domTiddler,
      navigateFromClientRect: { top: bounds.top, left: bounds.left, width: bounds.width, right: bounds.right, bottom: bounds.bottom, height: bounds.height
      }
    };
    self.dispatchEvent(e);
  }

  function enhancedColorStyle(csscolor) {
    var color = $tw.utils.parseCSSColor(csscolor);
    var style = null;
    if(color !== null) {
      for(var i=0;i<3;i++) color[i] = Math.floor(240 + color[i] / 17);

      style = "border-color: " + csscolor + ";"
            + "background-color: rgb(" + (color[0]).toString()+","
                                       + (color[1]).toString()+","
                                       + (color[2]).toString()+");";
    }
    return style;
  }

  // adapted from $tw.utils.error of $:/boot/boot.js
  function dispError(message, title, subtitle) {
    console.error($tw.node ? "\x1b[1;31m" + message + "\x1b[0m" : message);
    if($tw.browser && !$tw.node) {
        // Display an error message to the user
        var dm = $tw.utils.domMaker,
            heading = dm("h1",{text: (title || "Error with vis.js Timeline")}),
            prompt = dm("div",{text: (subtitle || "Please check the following:"), "class": "tc-error-prompt"}),
            message = dm("div",{innerHTML: message, attributes: {style: "text-align: left;"}}),
            button = dm("button",{text: "close"}),
            form = dm("form",{children: [heading,prompt,message,button], "class": "tc-error-form", attributes: {style: "background-color: rgb(75, 75, 255); border: 8px solid rgb(0, 0, 255);"}});
        document.body.insertBefore(form,document.body.firstChild);
        form.addEventListener("submit",function(event) {
            document.body.removeChild(form);
            event.preventDefault();
            return false;
        },true);
        return null;
    } else if(!$tw.browser) {
        // Exit if we're under node.js
        process.exit(1);
    }
  }

  function setTiddlerField(tiddlerTitle, field, value) {
     if(tiddlerTitle && field) {
       var fields = {
         title: tiddlerTitle
       };
       fields[field] = value;
       var tiddler = $tw.wiki.getTiddler(tiddlerTitle, true);
       $tw.wiki.addTiddler(new $tw.Tiddler(tiddler, fields));
     }
   }

  exports.parseWidgetAttributes = parseWidgetAttributes;
  exports.displayTiddler = displayTiddler;
  exports.enhancedColorStyle = enhancedColorStyle;
  exports.dispError = dispError;
  exports.setTiddlerField = setTiddlerField;
}
());
