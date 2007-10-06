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

function Buffer() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var zoom_levels = [ 1, 10, 25, 50, 75, 90, 100,
                        120, 150, 200, 300, 500, 1000, 2000 ];

    function setZoom(value, full_zoom)
    {
        if (value < 1 || value > 2000)
        {
            vimperator.echoerr("Zoom value out of range (1-2000%)");
            return false;
        }

        if (full_zoom)
            getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom = value / 100.0;
        else
            getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom = value / 100.0;

        vimperator.echo((full_zoom ? "Full zoom: " : "Text zoom: ") + value + "%");

        // TODO: shouldn't this just recalculate hint coords, rather than
        // unsuccessfully attempt to reshow hints?  i.e. isn't it just relying
        // on the recalculation side effect? -- djk
        // NOTE: we could really do with a zoom event...
        vimperator.hints.reshowHints();
    }

    function bumpZoomLevel(steps, full_zoom)
    {
        if (full_zoom)
            var value = getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom * 100.0;
        else
            var value = getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom * 100.0;

        var index = -1;
        if (steps <= 0)
        {
            for (var i = zoom_levels.length - 1; i >= 0; i--)
            {
                if ((zoom_levels[i] + 0.01) < value) // 0.01 for float comparison
                {
                    index = i + 1 + steps;
                    break;
                }
            }
        }
        else
        {
            for (var i = 0; i < zoom_levels.length; i++)
            {
                if ((zoom_levels[i] - 0.01) > value) // 0.01 for float comparison
                {
                    index = i - 1 + steps;
                    break;
                }
            }
        }
        if (index < 0 || index >= zoom_levels.length)
        {
            vimperator.beep();
            return;
        }
        setZoom(zoom_levels[index], full_zoom);
    }

    function checkScrollYBounds(win, direction)
    {
        // NOTE: it's possible to have scrollY > scrollMaxY - FF bug?
        if (direction > 0 && win.scrollY >= win.scrollMaxY || direction < 0 && win.scrollY == 0)
            vimperator.beep();
    }

    // both values are given in percent, -1 means no change
    function scrollToPercentiles(horizontal, vertical)
    {
        var win = document.commandDispatcher.focusedWindow;
        var h, v;

        if (horizontal < 0)
            h = win.scrollX;
        else
            h = win.scrollMaxX / 100 * horizontal;

        if (vertical < 0)
            v = win.scrollY;
        else
            v = win.scrollMaxY / 100 * vertical;

        win.scrollTo(h, v);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__defineGetter__("URL", function()
    {
        // TODO: .URL is not defined for XUL documents
        //return window.content.document.URL;
        return window.content.document.location.href;
    });

    this.__defineGetter__("pageHeight", function()
    {
        return getBrowser().mPanelContainer.boxObject.height; // FIXME: best way to do this?
    });

    this.__defineGetter__("textZoom", function()
    {
        return getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom * 100;
    });
    this.__defineSetter__("textZoom", function(value)
    {
        setZoom(value, false);
    });

    this.__defineGetter__("fullZoom", function()
    {
        return getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom * 100;
    });
    this.__defineSetter__("fullZoom", function(value)
    {
        setZoom(value, true);
    });

    this.__defineGetter__("title", function()
    {
        return window.content.document.title;
    });

    this.lastInputField = null; // used to keep track of the right field for "gi"

    // returns an XPathResult object
    this.evaluateXPath = function(expression, doc, elem, ordered)
    {
        if (!doc)
            doc = window.content.document;
        if (!elem)
            elem = doc;

        var result = doc.evaluate(expression, elem,
            function lookupNamespaceURI(prefix) {
              switch (prefix) {
                case 'xhtml':
                  return 'http://www.w3.org/1999/xhtml';
                default:
                  return null;
              }
            },
            ordered ? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE : XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        return result;
    }

    // in contrast to vim, returns the selection if one is made, 
    // otherwise tries to guess the current word unter the text cursor
    // NOTE: might change the selection 
    this.getCurrentWord = function()
    {
        var selection = window.content.getSelection().toString();

        if (!selection)
        {
            var selection_controller = getBrowser().docShell
                .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                .getInterface(Components.interfaces.nsISelectionDisplay)
                .QueryInterface(Components.interfaces.nsISelectionController);

            selection_controller.setCaretEnabled(true);
            selection_controller.wordMove(false, false);
            selection_controller.wordMove(true, true);
            selection = window.content.getSelection().toString();
        }

        return selection;
    }

    // TODO: move to v.buffers.list()
    this.list = function(fullmode)
    {
        if (fullmode)
        {
            // toggle the special buffer previw window
            if (vimperator.bufferwindow.visible())
            {
                vimperator.bufferwindow.hide();
            }
            else
            {
                var items = vimperator.completion.get_buffer_completions("");
                vimperator.bufferwindow.show(items);
                vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
            }
        }
        else
        {
            // TODO: move this to vimperator.buffers.get()
            var items = vimperator.completion.get_buffer_completions("");
            var number, indicator, title, url;

            var list = ":" + vimperator.commandline.getCommand() + "<br/>" + "<table>";
            for (var i = 0; i < items.length; i++)
            {
                if (i == vimperator.tabs.index())
                   indicator = " <span style=\"color: blue\">%</span> ";
                else if (i == vimperator.tabs.index(vimperator.tabs.alternate))
                   indicator = " <span style=\"color: blue\">#</span> ";
                else
                   indicator = "   ";

                [number, title] = items[i][0].split(/:\s+/, 2);
                url = items[i][1];
                url = url.replace(/>/, "&gt;").replace(/</, "&lt;");
                title = title.replace(/>/, "&gt;").replace(/</, "&lt;");

                list += "<tr><td align=\"right\">  " + number + "</td><td>" + indicator +
                        "</td><td style=\"width: 250px; max-width: 500px; overflow: hidden;\">" + title +
                        "</td><td><span style=\"color: green\">" + url + "</span></td></tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, true);
        }
    }

    this.scrollBottom = function()
    {
        scrollToPercentiles(-1, 100);
    }

    this.scrollColumns = function(cols)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        const COL_WIDTH = 20;

        if (cols > 0 && win.scrollX >= win.scrollMaxX || cols < 0 && win.scrollX == 0)
            vimperator.beep();

        win.scrollBy(COL_WIDTH * cols, 0);
    }

    this.scrollEnd = function()
    {
        scrollToPercentiles(100, -1);
    }

    this.scrollLines = function(lines)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        checkScrollYBounds(win, lines);
        win.scrollByLines(lines);
    }

    this.scrollPages = function(pages)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        checkScrollYBounds(win, pages);
        win.scrollByPages(pages);
    }

    this.scrollToPercentile = function(percentage)
    {
        scrollToPercentiles(-1, percentage);
    }

    this.scrollStart = function()
    {
        scrollToPercentiles(0, -1);
    }

    this.scrollTop = function()
    {
        scrollToPercentiles(-1, 0);
    }

    // TODO: allow callback for filtering out unwanted frames? User defined?
    this.shiftFrameFocus = function(count, forward)
    {
        try
        {
            var frames = [];

            // find all frames - depth-first search
            (function(frame)
            {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                for (var i = 0; i < frame.frames.length; i++)
                    arguments.callee(frame.frames[i])
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this
            var start = document.commandDispatcher.focusedWindow;
            frames = frames.filter(function(frame) {
                    frame.focus();
                    if (document.commandDispatcher.focusedWindow == frame)
                        return frame;
            });
            start.focus();

            // find the currently focused frame index
            // TODO: If the window is a frameset then the first _frame_ should be
            //       focused.  Since this is not the current FF behaviour,
            //       we initalize current to -1 so the first call takes us to the
            //       first frame.
            var current = -1;
            for (var i = 0; i < frames.length; i++)
            {
                if (frames[i] == document.commandDispatcher.focusedWindow)
                {
                    var current = i;
                    break;
                }
            }

            // calculate the next frame to focus
            var next = current;
            if (forward)
            {
                if (count > 1)
                    next = current + count;
                else
                    next++;

                if (next > frames.length - 1)
                {
                    if (current == frames.length - 1)
                        vimperator.beep(); // still allow the frame indicator to be activated

                    next = frames.length - 1;
                }
            }
            else
            {
                if (count > 1)
                    next = current - count;
                else
                    next--;

                if (next < 0)
                {
                    if (current == 0)
                        vimperator.beep(); // still allow the frame indicator to be activated

                    next = 0;
                }
            }

            // focus next frame and scroll into view
            frames[next].focus();
            if (frames[next] != window.content)
                frames[next].frameElement.scrollIntoView(false);

            // add the frame indicator
            var doc = frames[next].document;
            var indicator = doc.createElement("div");
            indicator.id = "vimperator-frame-indicator";
            // NOTE: need to set a high z-index - it's a crapshoot!
            var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                        "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
            indicator.setAttribute("style", style);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function() { doc.body.removeChild(indicator); }, 500);
        }
        catch (e)
        {
            // FIXME: fail silently here for now
            //vimperator.log(e);
        }
    }

    // updates the buffer preview in place only if list is visible
    this.updateBufferList = function()
    {
        if (!vimperator.bufferwindow.visible())
            return false;

        var items = vimperator.completion.get_buffer_completions("");
        vimperator.bufferwindow.show(items);
        vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
    }

    this.zoomIn = function(steps, full_zoom)
    {
        bumpZoomLevel(steps, full_zoom);
    }

    this.zoomOut = function(steps, full_zoom)
    {
        bumpZoomLevel(-steps, full_zoom);
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et: