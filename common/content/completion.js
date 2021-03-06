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

/**
 * Creates a new completion context.
 *
 * @class A class to provide contexts for command completion.
 * Manages the filtering and formatting of completions, and keeps
 * track of the positions and quoting of replacement text. Allows for
 * the creation of sub-contexts with different headers and quoting
 * rules.
 *
 * @param {nsIEditor} editor The editor for which completion is
 *     intended. May be a {CompletionContext} when forking a context,
 *     or a {string} when creating a new one.
 * @param {string} name The name of this context. Used when the
 *     context is forked.
 * @param {number} offset The offset from the parent context.
 * @author Kris Maglione <maglione.k@gmail.com>
 * @constructor
 */
function CompletionContext(editor, name, offset) //{{{
{
    if (!(this instanceof arguments.callee))
        return new arguments.callee(editor, name, offset);
    if (!name)
        name = "";

    let self = this;
    if (editor instanceof arguments.callee)
    {
        let parent = editor;
        name = parent.name + "/" + name;
        this.contexts = parent.contexts;
        if (name in this.contexts)
            self = this.contexts[name];
        else
            self.contexts[name] = this;

        /**
         * @property {CompletionContext} This context's parent. {null} when
         *     this is a top-level context.
         */
        self.parent = parent;

        ["filters", "keys", "title", "quote"].forEach(function (key)
            self[key] = parent[key] && util.cloneObject(parent[key]));
        ["anchored", "compare", "editor", "_filter", "filterFunc", "keys", "_process", "top"].forEach(function (key)
            self[key] = parent[key]);

        self.__defineGetter__("value", function () this.top.value);

        self.offset = parent.offset;
        self.advance(offset);

        /**
         * @property {boolean} Specifies that this context is not finished
         *     generating results.
         * @default false
         */
        self.incomplete = false;
        self.message = null;
        /**
         * @property {boolean} Specifies that this context is waiting for the
         *     user to press <Tab>. Useful when fetching completions could be
         *     dangerous or slow, and the user has enabled autocomplete.
         */
        self.waitingForTab = false;

        delete self._generate;
        delete self._ignoreCase;
        if (self != this)
            return self;
        ["_caret", "contextList", "maxItems", "onUpdate", "selectionTypes", "tabPressed", "updateAsync", "value"].forEach(function (key) {
            self.__defineGetter__(key, function () this.top[key]);
            self.__defineSetter__(key, function (val) this.top[key] = val);
        });
    }
    else
    {
        if (typeof editor == "string")
            this._value = editor;
        else
            this.editor = editor;
        this.compare = function (a, b) String.localeCompare(a.text, b.text);

        /**
         * @property {function} This function is called when we close
         *     a completion window with Esc or Ctrl-c. Usually this callback
         *     is only needed for long, asynchronous completions
         */
        this.cancel = null;
        /**
         * @property {function} The function used to filter the results.
         * @default Selects all results which match every predicate in the
         *     {@link #filters} array.
         */
        this.filterFunc = function (items)
        {
                let self = this;
                return this.filters.
                    reduce(function (res, filter) res.filter(function (item) filter.call(self, item)),
                            items);
        }
        /**
         * @property {Array} An array of predicates on which to filter the
         *     results.
         */
        this.filters = [function (item) {
            let text = Array.concat(item.text);
            for (let [i, str] in Iterator(text))
            {
                if (this.match(String(str)))
                {
                    item.text = String(text[i]);
                    return true;
                }
            }
            return false;
        }];
        /**
         * @property {boolean} Specifies whether this context results must
         *     match the filter at the beginning of the string.
         * @default true
         */
        this.anchored = true;
        /**
         * @property {Object} A map of all contexts, keyed on their names.
         *    Names are assigned when a context is forked, with its specified
         *    name appended, after a '/', to its parent's name. May
         *    contain inactive contexts. For active contexts, see
         *    {@link #contextList}.
         */
        this.contexts = { "": this };
        /**
         * @property {Object} A mapping of keys, for {@link #getKey}. Given
         *      { key: value }, getKey(item, key) will return values as such:
         *      if value is a string, it will return item.item[value]. If it's a
         *      function, it will return value(item.item).
         */
        this.keys = { text: 0, description: 1, icon: "icon" };
        /**
         * @property {number} This context's offset from the beginning of
         *     {@link #editor}'s value.
         */
        this.offset = offset || 0;
        /**
         * @property {function} A function which is called when any subcontext
         *     changes its completion list. Only called when
         *     {@link #updateAsync} is true.
         */
        this.onUpdate = function () true;
        /**
         * @property {CompletionContext} The top-level completion context.
         */
        this.top = this;
        this.__defineGetter__("incomplete", function () this.contextList.some(function (c) c.parent && c.incomplete));
        this.__defineGetter__("waitingForTab", function () this.contextList.some(function (c) c.parent && c.waitingForTab));
        this.reset();
    }
    /**
     * @property {Object} A general-purpose store for functions which need to
     *     cache data between calls.
     */
    this.cache = {};
    /**
     * @private
     * @property {Object} A cache for return values of {@link #generate}.
     */
    this.itemCache = {};
    /**
     * @property {string} A key detailing when the cached value of
     *     {@link #generate} may be used. Every call to
     *     {@link #generate} stores its result in {@link #itemCache}.
     *     When itemCache[key] exists, its value is returned, and
     *     {@link #generate} is not called again.
     */
    this.key = "";
    /**
     * @property {string} A message to be shown before any results.
     */
    this.message = null;
    this.name = name || "";
    /** @private */
    this._completions = []; // FIXME
    /**
     * Returns a key, as detailed in {@link #keys}.
     * @function
     */
    this.getKey = function (item, key) (typeof self.keys[key] == "function") ? self.keys[key].call(this, item.item) :
            key in self.keys ? item.item[self.keys[key]]
                             : item.item[key];
}

CompletionContext.Sort = {
    number: function (a, b) parseInt(b) - parseInt(a) || String.localeCompare(a, b),

    unsorted: null
};

CompletionContext.prototype = {
    // Temporary
    /**
     * @property {Object}
     *
     * An object describing the results from all sub-contexts. Results are
     * adjusted so that all have the same starting offset.
     *
     * @deprecated
     */
    get allItems()
    {
        try
        {
            let self = this;
            let minStart = Math.min.apply(Math, [context.offset for ([k, context] in Iterator(this.contexts)) if (context.items.length && context.hasItems)]);
            if (minStart == Infinity)
                minStart = 0;
            let items = this.contextList.map(function (context) {
                if (!context.hasItems)
                    return [];
                let prefix = self.value.substring(minStart, context.offset);
                return context.items.map(function makeItem(item) ({ text: prefix + item.text, item: item.item }));
            });
            return { start: minStart, items: util.Array.flatten(items), longestSubstring: this.longestAllSubstring }
        }
        catch (e)
        {
            liberator.reportError(e);
            return { start: 0, items: [], longestAllSubstring: "" }
        }
    },
    // Temporary
    get allSubstrings()
    {
        let contexts = this.contextList.filter(function (c) c.hasItems && c.items.length);
        let minStart = Math.min.apply(Math, contexts.map(function (c) c.offset));
        let lists = contexts.map(function (context) {
            let prefix = context.value.substring(minStart, context.offset);
            return context.substrings.map(function (s) prefix + s);
        });

        let substrings = lists.reduce(
                function (res, list) res.filter(function (str) list.some(function (s) s.substr(0, str.length) == str)),
                lists.pop());
        if (!substrings) // FIXME: How is this undefined?
            return [];
        return util.Array.uniq(substrings);
    },
    // Temporary
    get longestAllSubstring()
    {
        return this.allSubstrings.reduce(function (a, b) a.length > b.length ? a : b, "");
    },

    get caret() this._caret - this.offset,
    set caret(val) this._caret = val + this.offset,

    get compare() this._compare || function () 0,
    set compare(val) this._compare = val,

    get completions() this._completions || [],
    set completions(items)
    {
        // Accept a generator
        if ({}.toString.call(items) != '[object Array]')
            items = [x for (x in Iterator(items))];
        delete this.cache.filtered;
        delete this.cache.filter;
        this.cache.rows = [];
        this.hasItems = items.length > 0;
        this._completions = items;
        let self = this;
        if (this.updateAsync && !this.noUpdate)
            liberator.callInMainThread(function () { self.onUpdate.call(self) });
    },

    get createRow() this._createRow || template.completionRow, // XXX
    set createRow(createRow) this._createRow = createRow,

    get filterFunc() this._filterFunc || util.identity,
    set filterFunc(val) this._filterFunc = val,

    get filter() this._filter != null ? this._filter : this.value.substr(this.offset, this.caret),
    set filter(val)
    {
        delete this._ignoreCase;
        return this._filter = val
    },

    get format() ({
        anchored: this.anchored,
        title: this.title,
        keys: this.keys,
        process: this.process
    }),
    set format(format)
    {
        this.anchored = format.anchored,
        this.title = format.title || this.title;
        this.keys = format.keys || this.keys;
        this.process = format.process || this.process;
    },

    get message() this._message || (this.waitingForTab ? "Waiting for <Tab>" : null),
    set message(val) this._message = val,

    get proto()
    {
        let res = {};
        for (let i in Iterator(this.keys))
        {
            let [k, v] = i;
            let _k = "_" + k;
            if (typeof v == "string" && /^[.[]/.test(v))
                v = eval("(function (i) i" + v + ")")
            if (typeof v == "function")
                res.__defineGetter__(k, function () _k in this ? this[_k] : (this[_k] = v(this.item)));
            else
                res.__defineGetter__(k, function () _k in this ? this[_k] : (this[_k] = this.item[v]));
            res.__defineSetter__(k, function (val) this[_k] = val);
        }
        return res;
    },

    get regenerate() this._generate && (!this.completions || !this.itemCache[this.key] || this.cache.offset != this.offset),
    set regenerate(val) { if (val) delete this.itemCache[this.key] },

    get generate() !this._generate ? null : function ()
    {
        if (this.offset != this.cache.offset)
            this.itemCache = {};
        this.cache.offset = this.offset;
        if (!this.itemCache[this.key])
            this.itemCache[this.key] = this._generate.call(this) || [];
        return this.itemCache[this.key];
    },
    set generate(arg)
    {
        this.hasItems = true;
        this._generate = arg;
        //**/ liberator.dump(this.name + ": set generate()");
        if (this.background && this.regenerate)
        {
            //**/ this.__i = (this.__i || 0) + 1;
            //**/ let self = this;
            //**/ function dump(msg) liberator.callInMainThread(function () liberator.dump(self.name + ":" + self.__i + ": " + msg));
            //**/ dump("set generate() regenerating");

            let lock = {};
            this.cache.backgroundLock = lock;
            this.incomplete = true;
            let thread = this.getCache("backgroundThread", liberator.newThread);
            //**/ dump(thread);
            liberator.callAsync(thread, this, function () {
                //**/ dump("In async");
                if (this.cache.backgroundLock != lock)
                {
                    //**/ dump("Lock !ok");
                    return;
                }
                let items = this.generate();
                //**/ dump("Generated");
                if (this.cache.backgroundLock != lock)
                {
                    //**/ dump("Lock !ok");
                    return;
                }
                this.incomplete = false;
                //**/ dump("completions=");
                this.completions = items;
                //**/ dump("completions==");
            });
        }
    },

    get ignoreCase()
    {
        if ("_ignoreCase" in this)
            return this._ignoreCase;
        let mode = options["wildcase"];
        if (mode == "match")
            return this._ignoreCase = false;
        if (mode == "ignore")
            return this._ignoreCase = true;
        return this._ignoreCase = !/[A-Z]/.test(this.filter);
    },
    set ignoreCase(val) this._ignoreCase = val,

    get items()
    {
        if (!this.hasItems || this.backgroundLock)
            return [];
        if (this.cache.filtered && this.cache.filter == this.filter)
            return this.cache.filtered;
        this.cache.rows = [];
        let items = this.completions;
        if (this.generate && !this.background)
        {
            // XXX
            this.noUpdate = true;
            this.completions = items = this.generate();
            this.noUpdate = false;
        }
        this.cache.filter = this.filter;
        if (items == null)
            return items;

        let self = this;
        delete this._substrings;

        let proto = this.proto;
        let filtered = this.filterFunc(items.map(function (item) ({ __proto__: proto, item: item })));
        if (this.maxItems)
            filtered = filtered.slice(0, this.maxItems);

        if (options.get("wildoptions").has("sort") && this.compare)
            filtered.sort(this.compare);
        let quote = this.quote;
        if (quote)
            filtered.forEach(function (item) {
                item.unquoted = item.text;
                item.text = quote[0] + quote[1](item.text) + quote[2];
            })
        return this.cache.filtered = filtered;
    },

    get process() // FIXME
    {
        let self = this;
        let process = this._process;
        process = [process[0] || template.icon, process[1] || function (item, k) k];
        let first = process[0];
        let filter = this.filter;
        if (!this.anchored)
            process[0] = function (item, text) first.call(self, item, template.highlightFilter(item.text, filter));
        return process;
    },
    set process(process)
    {
        this._process = process;
    },

    get substrings()
    {
        let items = this.items;
        if (items.length == 0 || !this.hasItems)
            return [];
        if (this._substrings)
            return this._substrings;

        let fixCase = this.ignoreCase ? String.toLowerCase : util.identity;
        let text = fixCase(items[0].unquoted || items[0].text);
        let filter = fixCase(this.filter);
        if (this.anchored)
        {
            function compare (text, s) text.substr(0, s.length) == s;
            substrings = util.map(util.range(filter.length, text.length + 1),
                function (end) text.substring(0, end));
        }
        else
        {
            function compare (text, s) text.indexOf(s) >= 0;
            substrings = [];
            let start = 0;
            let idx;
            let length = filter.length;
            while ((idx = text.indexOf(filter, start)) > -1 && idx < text.length)
            {
                for (let end in util.range(idx + length, text.length + 1))
                    substrings.push(text.substring(idx, end));
                start = idx + 1;
            }
        }
        substrings = items.reduce(
                function (res, item) res.filter(function (str) compare(fixCase(item.unquoted || item.text), str)),
                substrings);
        let quote = this.quote;
        if (quote)
            substrings = substrings.map(function (str) quote[0] + quote[1](str));
        return this._substrings = substrings;
    },

    /**
     * Advances the context <b>count</b> characters. {@link #filter} is
     * advanced to match. If {@link #quote} is non-null, its prefix and suffix
     * are set to the null-string.
     *
     * This function is still imperfect for quoted strings. When
     * {@link #quote} is non-null, it adjusts the count based on the quoted
     * size of the <b>count</b>-character substring of the filter, which is
     * accurate so long as unquoting and quoting a string will always map to
     * the original quoted string, which is often not the case.
     *
     * @param {number} count The number of characters to advance the context.
     */
    advance: function advance(count)
    {
        delete this._ignoreCase;
        if (this.quote)
        {
            count = this.quote[0].length + this.quote[1](this.filter.substr(0, count)).length;
            this.quote[0] = "";
            this.quote[2] = "";
        }
        this.offset += count;
        if (this._filter)
            this._filter = this._filter.substr(count);
    },

    cancelAll: function ()
    {
        for (let [,context] in Iterator(this.contextList))
        {
            if (context.cancel)
                context.cancel();
        }
    },

    /**
     * Gets a key from {@link #cache}, setting it to <b>defVal</b> if it
     * doesn't already exists.
     * @param {string} key
     * @param defVal
     */
    getCache: function (key, defVal)
    {
        if (!(key in this.cache))
            this.cache[key] = defVal();
        return this.cache[key];
    },

    getItems: function getItems(start, end)
    {
        let self = this;
        let items = this.items;
        let step = start > end ? -1 : 1;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end ? end : items.length);
        return util.map(util.range(start, end, step), function (i) items[i]);
    },

    getRows: function getRows(start, end, doc)
    {
        let self = this;
        let items = this.items;
        let cache = this.cache.rows;
        let step = start > end ? -1 : 1;
        start = Math.max(0, start || 0);
        end = Math.min(items.length, end != null ? end : items.length);
        for (let i in util.range(start, end, step))
            yield [i, cache[i] = cache[i] || util.xmlToDom(self.createRow(items[i]), doc)];
    },

    fork: function fork(name, offset, self, completer)
    {
        if (typeof completer == "string")
            completer = self[completer]
        let context = new CompletionContext(this, name, offset);
        this.contextList.push(context);
        if (completer)
            return completer.apply(self || this, [context].concat(Array.slice(arguments, arguments.callee.length)));
        return context;
    },

    getText: function getText(item)
    {
        let text = item[self.keys["text"]];
        if (self.quote)
            return self.quote(text);
        return text;
    },

    highlight: function highlight(start, length, type)
    {
        try // Firefox <3.1 doesn't have repaintSelection
        {
            this.selectionTypes[type] = null;
            const selType = Ci.nsISelectionController["SELECTION_" + type];
            const editor = this.editor;
            let sel = editor.selectionController.getSelection(selType);
            if (length == 0)
                sel.removeAllRanges();
            else
            {
                let range = editor.selection.getRangeAt(0).cloneRange();
                range.setStart(range.startContainer, this.offset + start);
                range.setEnd(range.startContainer, this.offset + start + length);
                sel.addRange(range);
            }
            editor.selectionController.repaintSelection(selType);
        }
        catch (e) {}
    },

    // FIXME
    _match: function _match(filter, str)
    {
        if (this.ignoreCase)
        {
            filter = filter.toLowerCase();
            str = str.toLowerCase();
        }
        if (this.anchored)
            return str.substr(0, filter.length) == filter;
        return str.indexOf(filter) > -1;
    },

    match: function match(str)
    {
        return this._match(this.filter, str);
    },

    reset: function reset()
    {
        let self = this;
        if (this.parent)
            throw Error();
        // Not ideal.
        for (let type in this.selectionTypes)
            this.highlight(0, 0, type);

        /**
         * @property {[CompletionContext]} A list of active
         *     completion contexts, in the order in which they were
         *     instantiated.
         */
        this.contextList = [];
        this.offset = 0;
        this.process = [];
        this.selectionTypes = {};
        this.tabPressed = false;
        this.title = ["Completions"];
        this.updateAsync = false;
        try
        {
            this.waitingForTab = false;
        }
        catch (e) {}

        this.cancelAll();

        if (this.editor)
        {
            this.value = this.editor.selection.focusNode.textContent;
            this._caret = this.editor.selection.focusOffset;
        }
        else
        {
            this.value = this._value;
            this._caret = this.value.length;
        }
        //for (let key in (k for ([k, v] in Iterator(self.contexts)) if (v.offset > this.caret)))
        //    delete this.contexts[key];
        for each (let context in this.contexts)
        {
            context.hasItems = false;
            try
            {
                context.incomplete = false;
            }
            catch (e) {}
        }
    },

    /**
     * Wait for all subcontexts to complete.
     *
     * @param {boolean} interruptible When true, the call may be interrupted
     *    via <C-c>, in which case, "Interrupted" may be thrown.
     * @param {number} timeout The maximum time, in milliseconds, to wait.
     *    If 0 or null, wait indefinately.
     */
    wait: function wait(interruptable, timeout)
    {
        let end = Date.now() + timeout;
        while (this.incomplete && (!timeout || Date.now() > end))
            liberator.threadYield(false, interruptable);
        return this.incomplete;
    }
}; //}}}

/**
 * @instance completion
 */
function Completion() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const EVAL_TMP = "__liberator_eval_tmp";

    function Javascript()
    {
        const OFFSET = 0, CHAR = 1, STATEMENTS = 2, DOTS = 3, FULL_STATEMENTS = 4, COMMA = 5, FUNCTIONS = 6;
        let stack = [];
        let functions = [];
        let top = [];  // The element on the top of the stack.
        let last = ""; // The last opening char pushed onto the stack.
        let lastNonwhite = ""; // Last non-whitespace character we saw.
        let lastChar = "";     // Last character we saw, used for \ escaping quotes.
        let compl = [];
        let str = "";

        let lastIdx = 0;

        let cacheKey = null;

        this.completers = {};

        // Some object members are only accessible as function calls
        function getKey(obj, key)
        {
            try
            {
                return obj[key];
            }
            catch (e)
            {
                return undefined;
            }
        }

        this.iter = function iter(obj)
        {
            let iterator = ([k, getKey(obj, k)] for (k in obj));
            try
            {
                // The point of 'for k in obj' is to get keys
                // that are accessible via . or [] notation.
                // Iterators quite often return values of no
                // use whatsoever for this purpose, so, we try
                // this rather dirty hack of getting a standard
                // object iterator for any object that defines its
                // own.
                if ("__iterator__" in obj)
                {
                    let oldIter = obj.__iterator__;
                    delete obj.__iterator__;
                    iterator = Iterator(obj);
                    obj.__iterator__ = oldIter;
                }
            }
            catch (e) {}
            return iterator;
        }

        // Search the object for strings starting with @key.
        // If @last is defined, key is a quoted string, it's
        // wrapped in @last after @offset characters are sliced
        // off of it and it's quoted.
        this.objectKeys = function objectKeys(obj)
        {
            // Things we can dereference
            if (["object", "string", "function"].indexOf(typeof obj) == -1)
                return [];
            if (!obj)
                return [];

            // XPCNativeWrappers, etc, don't show all accessible
            // members until they're accessed, so, we look at
            // the wrappedJSObject instead, and return any keys
            // available in the object itself.
            let orig = obj;

            if (modules.isPrototypeOf(obj))
                compl = [v for (v in Iterator(obj))];
            else
            {
                if (getKey(obj, 'wrappedJSObject'))
                    obj = obj.wrappedJSObject;
                // v[0] in orig and orig[v[0]] catch different cases. XPCOM
                // objects are problematic, to say the least.
                compl = [v for (v in this.iter(obj))
                    if ((typeof orig == "object" && v[0] in orig) || getKey(orig, v[0]) !== undefined)];
            }

            // And if wrappedJSObject happens to be available,
            // return that, too.
            if (getKey(orig, 'wrappedJSObject'))
                compl.push(["wrappedJSObject", obj]);

            // Add keys for sorting later.
            // Numbers are parsed to ints.
            // Constants, which should be unsorted, are found and marked null.
            compl.forEach(function (item) {
                let key = item[0];
                if (!isNaN(key))
                    key = parseInt(key);
                else if (/^[A-Z_][A-Z0-9_]*$/.test(key))
                    key = "";
                item.key = key;
            });

            return compl;
        }

        this.eval = function eval(arg, key, tmp)
        {
            let cache = this.context.cache.eval;
            let context = this.context.cache.evalContext;

            if (!key)
                key = arg;
            if (key in cache)
                return cache[key];

            context[EVAL_TMP] = tmp;
            try
            {
                return cache[key] = liberator.eval(arg, context);
            }
            catch (e)
            {
                return null;
            }
            finally
            {
                delete context[EVAL_TMP];
            }
        }

        // Get an element from the stack. If @n is negative,
        // count from the top of the stack, otherwise, the bottom.
        // If @m is provided, return the @mth value of element @o
        // of the stack entry at @n.
        let get = function get(n, m, o)
        {
            let a = stack[n >= 0 ? n : stack.length + n];
            if (o != null)
                a = a[o];
            if (m == null)
                return a;
            return a[a.length - m - 1];
        }

        function buildStack(filter)
        {
            let self = this;
            // Push and pop the stack, maintaining references to 'top' and 'last'.
            let push = function push(arg)
            {
                top = [i, arg, [i], [], [], [], []];
                last = top[CHAR];
                stack.push(top);
            }
            let pop = function pop(arg)
            {
                if (top[CHAR] != arg)
                {
                    self.context.highlight(top[OFFSET], i - top[OFFSET], "SPELLCHECK");
                    self.context.highlight(top[OFFSET], 1, "FIND");
                    throw new Error("Invalid JS");
                }
                if (i == self.context.caret - 1)
                    self.context.highlight(top[OFFSET], 1, "FIND");
                // The closing character of this stack frame will have pushed a new
                // statement, leaving us with an empty statement. This doesn't matter,
                // now, as we simply throw away the frame when we pop it, but it may later.
                if (top[STATEMENTS][top[STATEMENTS].length - 1] == i)
                    top[STATEMENTS].pop();
                top = get(-2);
                last = top[CHAR];
                let ret = stack.pop();
                return ret;
            }

            let i = 0, c = "";     // Current index and character, respectively.

            // Reuse the old stack.
            if (str && filter.substr(0, str.length) == str)
            {
                i = str.length;
                if (this.popStatement)
                    top[STATEMENTS].pop();
            }
            else
            {
                stack = [];
                functions = [];
                push("#root");
            }

            // Build a parse stack, discarding entries as opening characters
            // match closing characters. The stack is walked from the top entry
            // and down as many levels as it takes us to figure out what it is
            // that we're completing.
            str = filter;
            let length = str.length;
            for (; i < length; lastChar = c, i++)
            {
                c = str[i];
                if (last == '"' || last == "'" || last == "/")
                {
                    if (lastChar == "\\") // Escape. Skip the next char, whatever it may be.
                    {
                        c = "";
                        i++;
                    }
                    else if (c == last)
                        pop(c);
                }
                else
                {
                    // A word character following a non-word character, or simply a non-word
                    // character. Start a new statement.
                    if (/[a-zA-Z_$]/.test(c) && !/[\w$]/.test(lastChar) || !/[\w\s$]/.test(c))
                        top[STATEMENTS].push(i);

                    // A "." or a "[" dereferences the last "statement" and effectively
                    // joins it to this logical statement.
                    if ((c == "." || c == "[") && /[\w$\])"']/.test(lastNonwhite)
                    ||  lastNonwhite == "." && /[a-zA-Z_$]/.test(c))
                            top[STATEMENTS].pop();

                    switch (c)
                    {
                        case "(":
                            // Function call, or if/while/for/...
                            if (/[\w$]/.test(lastNonwhite))
                            {
                                functions.push(i);
                                top[FUNCTIONS].push(i);
                                top[STATEMENTS].pop();
                            }
                        case '"':
                        case "'":
                        case "/":
                        case "{":
                            push(c);
                            break;
                        case "[":
                            push(c);
                            break;
                        case ".":
                            top[DOTS].push(i);
                            break;
                        case ")": pop("("); break;
                        case "]": pop("["); break;
                        case "}": pop("{"); // Fallthrough
                        case ";":
                            top[FULL_STATEMENTS].push(i);
                            break;
                        case ",":
                            top[COMMA].push(i);
                            break;
                    }

                    if (/\S/.test(c))
                        lastNonwhite = c;
                }
            }

            this.popStatement = false;
            if (!/[\w$]/.test(lastChar) && lastNonwhite != ".")
            {
                this.popStatement = true;
                top[STATEMENTS].push(i);
            }

            lastIdx = i;
        }

        this.complete = function _complete(context)
        {
            this.context = context;

            let self = this;
            try
            {
                buildStack.call(this, context.filter);
            }
            catch (e)
            {
                if (e.message != "Invalid JS")
                    liberator.reportError(e);
                lastIdx = 0;
                return;
            }

            let cache = this.context.cache;
            this.context.getCache("eval", Object);
            this.context.getCache("evalContext", function () ({ __proto__: userContext }));

            // Okay, have parse stack. Figure out what we're completing.

            // Find any complete statements that we can eval before we eval our object.
            // This allows for things like: let doc = window.content.document; let elem = doc.createElement...; elem.<Tab>
            let prev = 0;
            for (let [,v] in Iterator(get(0)[FULL_STATEMENTS]))
            {
                let key = str.substring(prev, v + 1);
                if (checkFunction(prev, v, key))
                    return;
                this.eval(key);
                prev = v + 1;
            }

            // Don't eval any function calls unless the user presses tab.
            function checkFunction(start, end, key)
            {
                let res = functions.some(function (idx) idx >= start && idx < end);
                if (!res || self.context.tabPressed || key in cache.eval)
                    return false;
                self.context.waitingForTab = true;
                return true;
            }

            // For each DOT in a statement, prefix it with TMP, eval it,
            // and save the result back to TMP. The point of this is to
            // cache the entire path through an object chain, mainly in
            // the presence of function calls. There are drawbacks. For
            // instance, if the value of a variable changes in the course
            // of inputting a command (let foo=bar; frob(foo); foo=foo.bar; ...),
            // we'll still use the old value. But, it's worth it.
            function getObj(frame, stop)
            {
                let statement = get(frame, 0, STATEMENTS) || 0; // Current statement.
                let prev = statement;
                let obj;
                let cacheKey;
                for (let [i, dot] in Iterator(get(frame)[DOTS].concat(stop)))
                {
                    if (dot < statement)
                        continue;
                    if (dot > stop || dot <= prev)
                        break;
                    let s = str.substring(prev, dot);

                    if (prev != statement)
                        s = EVAL_TMP + "." + s;
                    cacheKey = str.substring(statement, dot);

                    if (checkFunction(prev, dot, cacheKey))
                        return [];

                    prev = dot + 1;
                    obj = self.eval(s, cacheKey, obj);
                }
                return [[obj, cacheKey]]
            }

            function getObjKey(frame)
            {
                let dot = get(frame, 0, DOTS) || -1; // Last dot in frame.
                let statement = get(frame, 0, STATEMENTS) || 0; // Current statement.
                let end = (frame == -1 ? lastIdx : get(frame + 1)[OFFSET]);

                cacheKey = null;
                let obj = [[cache.evalContext, "Local Variables"], [userContext, "Global Variables"],
                           [modules, "modules"], [window, "window"]]; // Default objects;
                // Is this an object dereference?
                if (dot < statement) // No.
                    dot = statement - 1;
                else // Yes. Set the object to the string before the dot.
                    obj = getObj(frame, dot);

                let [, space, key] = str.substring(dot + 1, end).match(/^(\s*)(.*)/);
                return [dot + 1 + space.length, obj, key];
            }

            function fill(context, obj, name, compl, anchored, key, last, offset)
            {
                context.title = [name];
                context.anchored = anchored;
                context.filter = key;
                context.itemCache = context.parent.itemCache;
                context.key = name;

                if (last != null)
                    context.quote = [last, function (text) util.escapeString(text.substr(offset), ""), last];
                else // We're not looking for a quoted string, so filter out anything that's not a valid identifier
                    context.filters.push(function (item) /^[a-zA-Z_$][\w$]*$/.test(item.text));

                compl.call(self, context, obj);
            }

            function complete(objects, key, compl, string, last)
            {
                let orig = compl;
                if (!compl)
                {
                    compl = function (context, obj)
                    {
                        context.process = [null, function highlight(item, v) template.highlight(v, true)];
                        // Sort in a logical fashion for object keys:
                        //  Numbers are sorted as numbers, rather than strings, and appear first.
                        //  Constants are unsorted, and appear before other non-null strings.
                        //  Other strings are sorted in the default manner.
                        let compare = context.compare;
                        context.compare = function (a, b)
                        {
                            if (!isNaN(a.item.key) && !isNaN(b.item.key))
                                return a.item.key - b.item.key;
                            return isNaN(b.item.key) - isNaN(a.item.key) || compare(a.item.key, b.item.key);
                        }
                        if (!context.anchored) // We've already listed anchored matches, so don't list them again here.
                            context.filters.push(function (item) util.compareIgnoreCase(item.text.substr(0, this.filter.length), this.filter));
                        if (obj == cache.evalContext)
                            context.regenerate = true;
                        context.generate = function () self.objectKeys(obj);
                    }
                }
                // TODO: Make this a generic completion helper function.
                let filter = key + (string || "");
                for (let [,obj] in Iterator(objects))
                {
                    this.context.fork(obj[1], top[OFFSET], this, fill,
                        obj[0], obj[1], compl, compl != orig, filter, last, key.length);
                }
                if (orig)
                    return;
                for (let [,obj] in Iterator(objects))
                {
                    obj[1] += " (substrings)";
                    this.context.fork(obj[1], top[OFFSET], this, fill,
                        obj[0], obj[1], compl, false, filter, last, key.length);
                }
            }

            // In a string. Check if we're dereferencing an object.
            // Otherwise, do nothing.
            if (last == "'" || last == '"')
            {
                //
                // str = "foo[bar + 'baz"
                // obj = "foo"
                // key = "bar + ''"
                //

                // The top of the stack is the sting we're completing.
                // Wrap it in its delimiters and eval it to process escape sequences.
                let string = str.substring(get(-1)[OFFSET] + 1, lastIdx);
                string = eval(last + string + last);

                function getKey()
                {
                    if (last == "")
                        return "";
                    // After the opening [ upto the opening ", plus '' to take care of any operators before it
                    let key = str.substring(get(-2, 0, STATEMENTS), get(-1, null, OFFSET)) + "''";
                    // Now eval the key, to process any referenced variables.
                    return this.eval(key);
                }

                // Is this an object accessor?
                if (get(-2)[CHAR] == "[") // Are we inside of []?
                {
                    // Stack:
                    //  [-1]: "...
                    //  [-2]: [...
                    //  [-3]: base statement

                    // Yes. If the [ starts at the beginning of a logical
                    // statement, we're in an array literal, and we're done.
                     if (get(-3, 0, STATEMENTS) == get(-2)[OFFSET])
                        return;

                    // Beginning of the statement upto the opening [
                    let obj = getObj(-3, get(-2)[OFFSET]);

                    return complete.call(this, obj, getKey(), null, string, last);
                }

                // Is this a function call?
                if (get(-2)[CHAR] == "(")
                {
                    // Stack:
                    //  [-1]: "...
                    //  [-2]: (...
                    //  [-3]: base statement

                    // Does the opening "(" mark a function call?
                    if (get(-3, 0, FUNCTIONS) != get(-2)[OFFSET])
                        return; // No. We're done.

                    let [offset, obj, func] = getObjKey(-3);
                    if (!obj.length)
                        return;
                    obj = obj.slice(0, 1);

                    try
                    {
                        var completer = obj[0][0][func].liberatorCompleter;
                    }
                    catch (e) {}
                    if (!completer)
                        completer = this.completers[func];
                    if (!completer)
                        return;

                    // Split up the arguments
                    let prev = get(-2)[OFFSET];
                    let args = [];
                    for (let [i, idx] in Iterator(get(-2)[COMMA]))
                    {
                        let arg = str.substring(prev + 1, idx);
                        prev = idx;
                        args.__defineGetter__(i, function () self.eval(arg));
                    }
                    let key = getKey();
                    args.push(key + string);

                    compl = function (context, obj)
                    {
                        let res = completer.call(self, context, func, obj, args);
                        if (res)
                            context.completions = res;
                    }

                    obj[0][1] += "." + func + "(... [" + args.length + "]";
                    return complete.call(this, obj, key, compl, string, last);
                }

                // In a string that's not an obj key or a function arg.
                // Nothing to do.
                return;
            }

            //
            // str = "foo.bar.baz"
            // obj = "foo.bar"
            // key = "baz"
            //
            // str = "foo"
            // obj = [modules, window]
            // key = "foo"
            //

            let [offset, obj, key] = getObjKey(-1);

            // Wait for a keypress before completing the default objects.
            if (!this.context.tabPressed && key == "" && obj.length > 1)
            {
                this.context.waitingForTab = true;
                this.context.message = "Waiting for key press";
                return;
            }

            if (!/^(?:[a-zA-Z_$][\w$]*)?$/.test(key))
                return; // Not a word. Forget it. Can this even happen?

            try
            { // FIXME
                var o = top[OFFSET];
                top[OFFSET] = offset;
                return complete.call(this, obj, key);
            }
            finally
            {
                top[OFFSET] = o;
            }
        }
    };
    let javascript = new Javascript();

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

        setFunctionCompleter: function setFunctionCompleter(funcs, completers)
        {
            funcs = Array.concat(funcs);
            for (let [,func] in Iterator(funcs))
            {
                func.liberatorCompleter = function liberatorCompleter(context, func, obj, args) {
                    let completer = completers[args.length - 1];
                    if (!completer)
                        return [];
                    return completer.call(this, context, obj, args);
                };
            }
        },

        // FIXME
        _runCompleter: function _runCompleter(name, filter, maxItems)
        {
            let context = CompletionContext(filter);
            context.maxItems = maxItems;
            let res = context.fork.apply(context, ["run", 0, this, name].concat(Array.slice(arguments, 3)));
            if (res) // FIXME
                return { items: res.map(function (i) ({ item: i })) };
            context.wait(true);
            return context.allItems;
        },

        runCompleter: function runCompleter(name, filter, maxItems)
        {
            return this._runCompleter.apply(this, Array.slice(arguments))
                       .items.map(function (i) i.item);
        },

        listCompleter: function listCompleter(name, filter, maxItems)
        {
            let context = CompletionContext(filter || "");
            context.maxItems = maxItems;
            context.fork.apply(context, ["list", 0, completion, name].concat(Array.slice(arguments, 3)));
            context = context.contexts["/list"];
            context.wait();

            let list = template.commandOutput(
                <div highlight="Completions">
                    { template.completionRow(context.title, "CompTitle") }
                    { template.map(context.items, function (item) context.createRow(item), null, 100) }
                </div>);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// COMPLETION TYPES ////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        get javascriptCompleter() javascript,

        javascript: function _javascript(context) javascript.complete(context),

        // filter a list of urls
        //
        // may consist of search engines, filenames, bookmarks and history,
        // depending on the 'complete' option
        // if the 'complete' argument is passed like "h", it temporarily overrides the complete option
        url: function url(context, complete)
        {
            let numLocationCompletions = 0; // how many async completions did we already return to the caller?
            let start = 0;
            let skip = context.filter.match("^.*" + options["urlseparator"]); // start after the last 'urlseparator'
            if (skip)
                context.advance(skip[0].length);

            // Will, and should, throw an error if !(c in opts)
            Array.forEach(complete || options["complete"], function (c) {
                let completer = completion.urlCompleters[c];
                context.fork.apply(context, [c, 0, completion, completer.completer].concat(completer.args));
            });
        },

        urlCompleters: {},

        addUrlCompleter: function addUrlCompleter(opt)
        {
            let completer = UrlCompleter.apply(null, Array.slice(arguments));
            completer.args = Array.slice(arguments, completer.length);
            this.urlCompleters[opt] = completer;
        },

        urls: function (context, tags)
        {
            let compare = String.localeCompare;
            let contains = String.indexOf
            if (context.ignoreCase)
            {
                compare = util.compareIgnoreCase;
                contains = function (a, b) a && a.toLowerCase().indexOf(b.toLowerCase()) > -1;
            }

            if (tags)
                context.filters.push(function (item) tags.
                    every(function (tag) (item.tags || []).
                        some(function (t) !compare(tag, t))));

            context.anchored = false;
            if (!context.title)
                context.title = ["URL", "Title"];

            context.fork("additional", 0, this, function (context) {
                context.title[0] += " (additional)";
                context.filter = context.parent.filter; // FIXME
                context.completions = context.parent.completions;
                // For items whose URL doesn't exactly match the filter,
                // accept them if all tokens match either the URL or the title.
                // Filter out all directly matching strings.
                let match = context.filters[0];
                context.filters[0] = function (item) !match.call(this, item);
                // and all that don't match the tokens.
                let tokens = context.filter.split(/\s+/);
                context.filters.push(function (item) tokens.every(
                        function (tok) contains(item.url, tok) ||
                                       contains(item.title, tok)));

                let re = RegExp(tokens.filter(util.identity).map(util.escapeRegex).join("|"), "g");
                function highlight(item, text, i) process[i].call(this, item, template.highlightRegexp(text, re));
                let process = [template.icon, function (item, k) k];
                context.process = [
                    function (item, text) highlight.call(this, item, item.text, 0),
                    function (item, text) highlight.call(this, item, text, 1)
                ];
            });
        }
        //}}}
    };

    const UrlCompleter = new Struct("name", "description", "completer");

    return self;
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
