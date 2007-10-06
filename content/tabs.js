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

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

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

/**
 * provides functions for working with tabs
 * XXX: ATTENTION: We are planning to move to the FUEL API once we switch to
 * Firefox 3.0, then this class should go away and their tab methods should be used
 * @deprecated
 */
function Tabs() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    /** @param spec can either be:
     * - an absolute integer
     * - "" for the current tab
     * - "+1" for the next tab
     * - "-3" for the tab, which is 3 positions left of the current
     * - "$" for the last tab
     */
    function indexFromSpec(spec, wrap)
    {
        var position = getBrowser().tabContainer.selectedIndex;
        var length   = getBrowser().mTabs.length;
        var last     = length - 1;

        if (spec === undefined || spec === "")
            return position;

        if (typeof spec === "number")
            position = spec;
        else if (spec === "$")
            return last;
        else if (!spec.match(/^([+-]?\d+|)$/))
        {
            // TODO: move error reporting to ex-command?
            vimperator.echoerr("E488: Trailing characters");
            return false;
        }
        else
        {
            if (spec.match(/^([+-]\d+)$/)) // relative position +/-N
                position += parseInt(spec);
            else                           // absolute position
                position = parseInt(spec);
        }

        if (position > last)
            position = wrap ? position % length : last;
        else if (position < 0)
            position = wrap ? (position % length) + length: 0;

        return position;
    }

    var alternates = [null, null];

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // @returns the index of the currently selected tab starting with 0
    this.index = function(tab)
    {
        if (tab)
        {
            var length = getBrowser().mTabs.length;
            for (var i = 0; i < length; i++)
            {
                if (getBrowser().mTabs[i] == tab)
                    return i;
            }
            return -1;
        }

        return getBrowser().tabContainer.selectedIndex;
    }

    this.count = function()
    {
        return getBrowser().mTabs.length;
    }

    // TODO: implement filter
    // @returns an array of tabs which match filter
    this.get = function(filter)
    {
        var buffers = [];
        var browsers = getBrowser().browsers;
        for (var i in browsers)
        {
            var title = browsers[i].contentTitle || "(Untitled)";
            var uri = browsers[i].currentURI.spec;
            var number = i + 1;
            buffers.push([number, title, uri]);
        }
        return buffers;
    }

    this.getTab = function(index)
    {
        if (index)
            return getBrowser().mTabs[index];

        return getBrowser().tabContainer.selectedItem;
    }

    /*  spec == "" moves the tab to the last position as per Vim
     *  wrap causes the movement to wrap around the start and end of the tab list
     *  NOTE: position is a 0 based index
     *  FIXME: tabmove! N should probably produce an error
     */
    this.move = function(tab, spec, wrap)
    {
        if (spec === "")
            spec = "$"; // if not specified, move to the last tab -> XXX: move to ex handling?

        var index = indexFromSpec(spec, wrap);
        getBrowser().moveTabTo(tab, index);
    }

    /* quit_on_last_tab = 1: quit without saving session
     * quit_on_last_tab = 2: quit and save session
     */
    this.remove = function(tab, count, focus_left_tab, quit_on_last_tab)
    {
        if (count < 1) count = 1;

        if (quit_on_last_tab >= 1 && getBrowser().mTabs.length <= count)
            vimperator.quit(quit_on_last_tab == 2);

        if (focus_left_tab && tab.previousSibling)
            this.select("-1", false);

        getBrowser().removeTab(tab);
    }

    this.keepOnly = function(tab)
    {
        getBrowser().removeAllTabsBut(tab);
    }

    this.select = function(spec, wrap)
    {
        var index = indexFromSpec(spec, wrap);
        if (index === false)
        {
            vimperator.beep(); // XXX: move to ex-handling?
            return false;
        }
        getBrowser().mTabContainer.selectedIndex = index;
    }

    // TODO: when restarting a session FF selects the first tab and then the
    // tab that was selected when the session was created.  As a result the
    // alternate after a restart is often incorrectly tab 1 when there
    // shouldn't be one yet.
    this.updateSelectionHistory = function()
    {
        alternates = [this.getTab(), alternates[0]];
        this.alternate = alternates[1];
    }

    // TODO: move to v.buffers
    this.alternate = this.getTab();

    this.reload = function(tab, bypass_cache)
    {
        if (bypass_cache)
        {
            const nsIWebNavigation = Components.interfaces.nsIWebNavigation;
            const flags = nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
            getBrowser().getBrowserForTab(tab).reloadWithFlags(flags);
        }
        else
        {
            getBrowser().reloadTab(tab);
        }
    }

    this.reloadAll = function(bypass_cache)
    {
        if (bypass_cache)
        {
            for (var i = 0; i < getBrowser().mTabs.length; i++)
            {
                try
                {
                    this.reload(getBrowser().mTabs[i], bypass_cache)
                }
                catch (e) {
                    // FIXME: can we do anything useful here without stopping the
                    //        other tabs from reloading?
                }
            }
        }
        else
        {
            getBrowser().reloadAllTabs();
        }
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et: