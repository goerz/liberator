/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

/** @scope modules */

const modes = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = 1;     // NORMAL
    var extended = 0; // NONE

    var lastShown = null;

    var passNextKey = false;
    var passAllKeys = false;
    var isRecording = false;
    var isReplaying = false; // playing a macro

    var modeStack = [];

    function getModeMessage()
    {
        if (passNextKey && !passAllKeys)
            return "-- PASS THROUGH (next) --";
        else if (passAllKeys && !passNextKey)
            return "-- PASS THROUGH --";

        // when recording a macro
        let macromode = "";
        if (modes.isRecording)
            macromode = "recording";
        else if (modes.isReplaying)
            macromode = "replaying";

        let ext = "";
        if (extended & modes.MENU) // TODO: desirable?
            ext += " (menu)";
        ext += " --" + macromode;

        if (main in modeMap && typeof modeMap[main].display == "function")
            return "-- " + modeMap[main].display() + ext;
        return macromode;
    }

    // NOTE: Pay attention that you don't run into endless loops
    // Usually you should only indicate to leave a special mode like HINTS
    // by calling modes.reset() and adding the stuff which is needed
    // for its cleanup here
    function handleModeChange(oldMode, newMode, oldExtended)
    {

        switch (oldMode)
        {
            case modes.TEXTAREA:
            case modes.INSERT:
                editor.unselectText();
                break;

            case modes.VISUAL:
                if (newMode == modes.CARET)
                {
                    try
                    { // clear any selection made; a simple if (selection) does not work
                        let selection = window.content.getSelection();
                        selection.collapseToStart();
                    }
                    catch (e) {}
                }
                else
                    editor.unselectText();
                break;

            case modes.CUSTOM:
                plugins.stop();
                break;

            case modes.COMMAND_LINE:
                // clean up for HINT mode
                if (oldExtended & modes.HINTS)
                    hints.hide();
                commandline.close();
                break;
        }

        if (newMode == modes.NORMAL)
        {
            // disable caret mode when we want to switch to normal mode
            if (options.getPref("accessibility.browsewithcaret"))
                options.setPref("accessibility.browsewithcaret", false);

            statusline.updateUrl();
            liberator.focusContent(true);
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

        NONE: 0,

        __iterator__: function () util.Array.itervalues(this.all),

        get all() mainModes.slice(),

        get inputMode() main & (this.COMMAND_LINE | this.INPUT | this.TEXTAREA | this.COMPOSE),

        get mainModes() (mode for ([k, mode] in Iterator(modeMap)) if (!mode.extended && mode.name == k)),

        addMode: function (name, extended, options)
        {
            let disp = name.replace("_", " ", "g");
            this[name] = 1 << lastMode++;
            if (typeof extended == "object")
            {
                options = extended;
                extended = false;
            }
            modeMap[name] = modeMap[this[name]] = util.extend({
                extended: extended,
                mask: this[name],
                name: name,
                disp: disp
            }, options);
            modeMap[name].display = modeMap[name].display || function () disp;
            if (!extended)
                mainModes.push(this[name]);
        },

        getMode: function (name) modeMap[name],

        // show the current mode string in the command line
        show: function ()
        {
            let msg = "";
            if (options["showmode"])
                msg = getModeMessage();

            commandline.echo(msg, "ModeMsg", commandline.FORCE_SINGLELINE);
        },

        // add/remove always work on the extended mode only
        add: function (mode)
        {
            extended |= mode;
            this.show();
        },

        // helper function to set both modes in one go
        // if silent == true, you also need to take care of the mode handling changes yourself
        set: function (mainMode, extendedMode, silent, stack)
        {
            silent = (silent || main == mainMode && extended == extendedMode);
            // if a main mode is set, the extended is always cleared
            let oldMain = main, oldExtended = extended;
            if (typeof extendedMode === "number")
                extended = extendedMode;
            if (typeof mainMode === "number")
            {
                main = mainMode;
                if (!extendedMode)
                    extended = modes.NONE;

                if (main != oldMain)
                    handleModeChange(oldMain, mainMode, oldExtended);
            }
            liberator.triggerObserver("modeChange", [oldMain, oldExtended], [main, extended], stack);

            if (!silent)
                this.show();
        },

        push: function (mainMode, extendedMode, silent)
        {
            modeStack.push([main, extended]);
            this.set(mainMode, extendedMode, silent, { push: modeStack[modeStack.length - 1] });
        },

        pop: function (silent)
        {
            let a = modeStack.pop();
            if (a)
                this.set(a[0], a[1], silent, { pop: a });
            else
                this.reset(silent);
        },

        // TODO: Deprecate this in favor of addMode? --Kris
        setCustomMode: function (modestr, oneventfunc, stopfunc)
        {
            // TODO this.plugin[id]... ('id' maybe submode or what..)
            plugins.mode = modestr;
            plugins.onEvent = oneventfunc;
            plugins.stop = stopfunc;
        },

        // keeps recording state
        reset: function (silent)
        {
            modeStack = [];
            if (config.isComposeWindow)
                this.set(modes.COMPOSE, modes.NONE, silent);
            else
                this.set(modes.NORMAL, modes.NONE, silent);
        },

        remove: function (mode)
        {
            if (extended & mode)
            {
                extended &= ~mode;
                this.show();
            }
        },

        get passNextKey() passNextKey,
        set passNextKey(value) { passNextKey = value; this.show(); },

        get passAllKeys() passAllKeys,
        set passAllKeys(value) { passAllKeys = value; this.show(); },

        get isRecording()  isRecording,
        set isRecording(value) { isRecording = value; this.show(); },

        get isReplaying() isReplaying,
        set isReplaying(value) { isReplaying = value; this.show(); },

        get main() main,
        set main(value) { this.set(value); },

        get extended() extended,
        set extended(value) { this.set(null, value) }

    };

    var mainModes = [self.NONE];
    var lastMode = 0;
    var modeMap = {};

    // main modes, only one should ever be active
    self.addMode("NORMAL", { char: "n", display: -1 });
    self.addMode("INSERT", { char: "i" });
    self.addMode("VISUAL", { char: "v", display: function () "VISUAL" + (extended & modes.LINE ? " LINE" : "") });
    self.addMode("COMMAND_LINE", { char: "c" });
    self.addMode("CARET"); // text cursor is visible
    self.addMode("TEXTAREA", { char: "i" }); // text cursor is in a HTMLTextAreaElement
    self.addMode("CUSTOM",  { display: function () plugins.mode });
    // extended modes, can include multiple modes, and even main modes
    self.addMode("EX", true);
    self.addMode("HINTS", true);
    self.addMode("INPUT_MULTILINE", true);
    self.addMode("OUTPUT_MULTILINE", true);
    self.addMode("SEARCH_FORWARD", true);
    self.addMode("SEARCH_BACKWARD", true);
    self.addMode("SEARCH_VIEW_FORWARD", true);
    self.addMode("SEARCH_VIEW_BACKWARD", true);
    self.addMode("MENU", true); // a popupmenu is active
    self.addMode("LINE", true); // linewise visual mode
    self.addMode("PROMPT", true);

    config.modes.forEach(function (mode) { self.addMode.apply(self, mode); });

    return self;
    //}}}
})(); //}}}

// vim: set fdm=marker sw=4 ts=4 et:
