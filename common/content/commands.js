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

// Do NOT create instances of this class yourself, use the helper method
// commands.add() instead
/**
 * A class representing Ex commands. Instances are created by
 * the {@link Commands} class.
 *
 * @param {string[]} specs The names by which this command can be invoked.
 *     These are specified in the form "com[mand]" where "com" is a unique
 *     command name prefix.
 * @param {string} description A short one line description of the command.
 * @param {function} action The action invoked by this command when executed.
 * @param {Object} extraInfo An optional extra configuration hash. The
 *     following properties are supported.
 *         argCount  - see {@link Command#argCount}
 *         bang      - see {@link Command#bang}
 *         completer - see {@link Command#completer}
 *         count     - see {@link Command#count}
 *         heredoc   - see {@link Command#heredoc}
 *         literal   - see {@link Command#literal}
 *         options   - see {@link Command#options}
 *         serial    - see {@link Command#serial}
 * @optional
 * @private
 */
function Command(specs, description, action, extraInfo) //{{{
{
    specs = Array.concat(specs);

    if (!extraInfo)
        extraInfo = {};

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    function parseSpecs(specs)
    {
        // Whoever wrote the following should be ashamed. :(
        // Good grief! I have no words... -- djk ;-)
        // let shortNames = longNames = names = [];
        let names = [];
        let longNames = [];
        let shortNames = [];

        for (let [,spec] in Iterator(specs))
        {
            let matches = spec.match(/(\w+)\[(\w+)\](\w*)/);

            if (matches)
            {
                shortNames.push(matches[1] + matches[3]);
                longNames.push(matches[1] + matches[2] + matches[3]);
                // order as long1, short1, long2, short2
                names.push(matches[1] + matches[2]);
                names.push(matches[1]);
            }
            else
            {
                longNames.push(spec);
                names.push(spec);
            }
        }

        return { names: names, longNames: longNames, shortNames: shortNames };
    };

    let expandedSpecs = parseSpecs(specs);
    /**
     * @property {string[]} All of this command's name specs. e.g., "com[mand]"
     */
    this.specs      = specs;
    /** @property {string[]} All of this command's short names, e.g., "com" */
    this.shortNames = expandedSpecs.shortNames;
    /**
     * @property {string[]} All of this command's long names, e.g., "command"
     */
    this.longNames = expandedSpecs.longNames;

    /** @property {string} The command's canonical name. */
    this.name = this.longNames[0];
    /** @property {string[]} All of this command's long and short names. */
    this.names = expandedSpecs.names; // return all command name aliases

    /** @property {string} This command's description, as shown in :exusage */
    this.description = description || "";
    /**
     * @property {function (Args)} The function called to execute this command.
     */
    this.action = action;
    /**
     * @property {string} This command's argument count spec.
     * @see Commands#parseArguments
     */
    this.argCount = extraInfo.argCount || 0;
    /**
     * @property {function (CompletionContext, Args)} This command's completer.
     * @see CompletionContext
     */
    this.completer = extraInfo.completer || null;
    /** @property {boolean} Whether this command accepts a here document. */
    this.hereDoc = extraInfo.hereDoc || false;
    /**
     * @property {Array} The options this command takes.
     * @see Commands@parseArguments
     */
    this.options = extraInfo.options || [];
    /**
     * @property {boolean} Whether this command may be called with a bang,
     *     e.g., :com!
     */
    this.bang = extraInfo.bang || false;
    /**
     * @property {boolean} Whether this command may be called with a count,
     *     e.g., :12bdel
     */
    this.count = extraInfo.count || false;
    /**
     * @property {boolean} At what index this command's literal arguments
     *     begin. For instance, with a value of 2, all arguments starting with
     *     the third are parsed as a single string, with all quoting characters
     *     passed literally. This is especially useful for commands which take
     *     key mappings or Ex command lines as arguments.
     */
    this.literal = extraInfo.literal == null ? null : extraInfo.literal;
    /**
     * @property {function} Should return an array of <b>Object</b>s suitable
     *     to be passed to {@link Commands#commandToString}, one for each past
     *     invocation which should be restored on subsequent @liberator
     *     startups.
     */
    this.serial = extraInfo.serial;

    /**
     * @property {boolean} Specifies whether this is a user command.  User
     *     commands may be created by plugins, or directly by users, and,
     *     unlike basic commands, may be overwritten. Users and plugin authors
     *     should create only user commands.
     */
    this.isUserCommand = extraInfo.isUserCommand || false;
    /**
     * @property {string} For commands defined via :command, contains the Ex
     *     command line to be executed upon invocation.
     */
    this.replacementText = extraInfo.replacementText || null;
}

Command.prototype = {

    /**
     * Execute this command.
     *
     * @param {string} args The args to be parsed and passed to
     *     {@link #action}.
     * @param {boolean} bang Whether this command was executed with a trailing
     *     !.
     * @deprecated
     * @param {number} count Whether this command was executed with a leading
     *     count.
     * @deprecated
     * @param {Object} modifiers Any modifiers to be passed to {@link #action}.
     */
    execute: function (args, bang, count, modifiers)
    {
        // XXX
        bang = !!bang;
        count = (count === undefined) ? -1 : count;
        modifiers = modifiers || {};

        let self = this;
        function exec(args)
        {
            // FIXME: Move to parseCommand?
            args = self.parseArgs(args);
            if (!args)
                return;
            args.count = count;
            args.bang = bang;
            self.action.call(self, args, bang, count, modifiers);
        }

        if (this.hereDoc)
        {
            let matches = args.match(/(.*)<<\s*(\S+)$/);
            if (matches && matches[2])
            {
                commandline.inputMultiline(RegExp("^" + matches[2] + "$", "m"),
                    function (args) { exec(matches[1] + "\n" + args); });
                return;
            }
        }

        exec(args);
    },

    /**
     * Returns whether this command may be invoked via <b>name</b>.
     *
     * @param {string} name
     * @returns {boolean}
     */
    hasName: function (name)
    {
        for (let [,spec] in Iterator(this.specs))
        {
            let fullName = spec.replace(/\[(\w+)]$/, "$1");
            let index = spec.indexOf("[");
            let min = index == -1 ? fullName.length : index;

            if (fullName.indexOf(name) == 0 && name.length >= min)
                return true;
        }

        return false;
    },

    /**
     * A helper function to parse an argument string.
     *
     * @param {string} args The argument string to parse.
     * @param {CompletionContext} complete A completion context.
     *     Non-null when the arguments are being parsed for completion
     *     purposes.
     * @param {Object} extra Extra keys to be spliced into the
     *     returned Args object.
     * @returns {Args}
     * @see Commands#parseArgs
     */
    parseArgs: function (args, complete, extra) commands.parseArgs(args, this.options, this.argCount, false, this.literal, complete, extra)

}; //}}}

/**
 * @instance commands
 */
function Commands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var exCommands = [];

    const QUOTE_STYLE = "vimperator";

    const quoteMap = {
        "\n": "n",
        "\t": "t"
    };
    function quote(q, list)
    {
        let re = RegExp("[" + list + "]", "g");
        return function (str) q + String.replace(str, re, function ($0) $0 in quoteMap ? quoteMap[$0] : ("\\" + $0)) + q;
    }
    const complQuote = { // FIXME
        '"': ['"', quote("", '\n\t"\\\\'), '"'],
        "'": ["'", quote("", "\\\\'"), "'"],
        "":  ["", quote("",  "\\\\ "), ""]
    };
    const quoteArg = {
        '"': quote('"', '\n\t"\\\\'),
        "'": quote("'", "\\\\'"),
        "":  quote("",  "\\\\ ")
    };

    function parseBool(arg)
    {
        if (/^(true|1|on)$/i.test(arg))
            return true;
        if (/^(false|0|off)$/i.test(arg))
            return false;
        return NaN;
    }
    const ArgType = new Struct("description", "parse");
    const argTypes = [
        null,
        ArgType("no arg",  function (arg) !arg || null),
        ArgType("boolean", parseBool),
        ArgType("string",  function (val) val),
        ArgType("int",     parseInt),
        ArgType("float",   parseFloat),
        ArgType("list",    function (arg) arg && arg.split(/\s*,\s*/))
    ];

    // returns [count, parsed_argument]
    function parseArg(str)
    {
        let arg = "";
        let quote = null;
        let len = str.length;

        while (str.length && !/^\s/.test(str))
        {
            let res;

            switch (QUOTE_STYLE)
            {
                case "vim-sucks":
                    if (res = str.match = str.match(/^()((?:[^\\\s]|\\.)+)((?:\\$)?)/))
                        arg += res[2].replace(/\\(.)/g, "$1");
                    break;

                case "vimperator":
                    if (res = str.match(/^()((?:[^\\\s"']|\\.)+)((?:\\$)?)/))
                        arg += res[2].replace(/\\(.)/g, "$1");
                    else if (res = str.match(/^(")((?:[^\\"]|\\.)*)("?)/))
                        arg += eval(res[0] + (res[3] ? "" : '"'));
                    else if (res = str.match(/^(')((?:[^\\']|\\.)*)('?)/))
                        arg += res[2].replace(/\\(.)/g, function (n0, n1) /[\\']/.test(n1) ? n1 : n0);
                    break;

                case "rc-ish":
                    if (res = str.match = str.match(/^()((?:[^\\\s"']|\\.)+)((?:\\$)?)/))
                        arg += res[2].replace(/\\(.)/g, "$1");
                    else if (res = str.match(/^(")((?:[^\\"]|\\.)*)("?)/))
                        arg += eval(res[0] + (res[3] ? "" : '"'));
                    else if (res = str.match(/^(')((?:[^']|'')*)('?)/))
                        arg += res[2].replace("''", "'", "g");
                    break;

                case "pythonesque":
                    if (res = str.match = str.match(/^()((?:[^\\\s"']|\\.)+)((?:\\$)?)/))
                        arg += res[2].replace(/\\(.)/g, "$1");
                    else if (res = str.match(/^(""")((?:.?.?[^"])*)((?:""")?)/))
                        arg += res[2];
                    else if (res = str.match(/^(")((?:[^\\"]|\\.)*)("?)/))
                        arg += eval(res[0] + (res[3] ? "" : '"'));
                    else if (res = str.match(/^(')((?:[^\\']|\\.)*)('?)/))
                        arg += res[2].replace(/\\(.)/g, function (n0, n1) /[\\']/.test(n1) ? n1 : n0);
                    break;
            }

            if (!res)
                break;
            if (!res[3])
                quote = res[1];
            if (!res[1])
                quote = res[3];
            str = str.substr(res[0].length);
        }

        return [len - str.length, arg, quote];
    }

    function addCommand(command, isUserCommand, replace)
    {
        if (exCommands.some(function (c) c.hasName(command.name)))
        {
            if (isUserCommand && replace)
                commands.removeUserCommand(command.name);
            else
            {
                liberator.log("Warning: :" + command.name + " already exists, NOT replacing existing command.", 1);
                return false;
            }
        }

        exCommands.push(command);

        return true;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

        // FIXME: remove later, when our option handler is better
        /**
         * @property {number} The option argument is unspecified. Any argument
         *     is accepted and caller is responsible for parsing the return
         *     value.
         * @final
         */
        OPTION_ANY: 0,

        /**
         * @property {number} The option doesn't accept an argument.
         * @final
         */
        OPTION_NOARG: 1,
        /**
         * @property {number} The option accepts a boolean argument.
         * @final
         */
        OPTION_BOOL: 2,
        /**
         * @property {number} The option accepts a string argument.
         * @final
         */
        OPTION_STRING: 3,
        /**
         * @property {number} The option accepts an integer argument.
         * @final
         */
        OPTION_INT: 4,
        /**
         * @property {number} The option accepts a float argument.
         * @final
         */
        OPTION_FLOAT: 5,
        /**
         * @property {number} The option accepts a string list argument.
         *     E.g. "foo,bar"
         * @final
         */
        OPTION_LIST: 6,

        /**
         * @property {number} Indicates that no count was specified for this
         *     command invocation.
         * @final
         */
        COUNT_NONE: -1,
        /**
         * @property {number} Indicates that the full buffer range (1,$) was
         *     specified for this command invocation.
         * @final
         */
        // FIXME: this isn't a count at all
        COUNT_ALL: -2, // :%...

        /** @property {Iterator(Command)} @private */
        __iterator__: function ()
        {
            let sorted = exCommands.sort(function (a, b) a.name > b.name);
            return util.Array.itervalues(sorted);
        },

        /** @property {string} The last executed Ex command line. */
        repeat: null,

        /**
         * Adds a new default command.
         *
         * @param {string[]} names The names by which this command can be
         *     invoked. The first name specified is the command's canonical
         *     name.
         * @param {string} description A description of the command.
         * @param {function} action The action invoked by this command.
         * @param {Object} extra An optional extra configuration hash.
         * @optional
         */
        add: function (names, description, action, extra)
        {
            return addCommand(new Command(names, description, action, extra), false, false);
        },

        /**
         * Adds a new user-defined command.
         *
         * @param {string[]} names The names by which this command can be
         *     invoked. The first name specified is the command's canonical
         *     name.
         * @param {string} description A description of the command.
         * @param {function} action The action invoked by this command.
         * @param {Object} extra An optional extra configuration hash.
         * @param {boolean} replace Overwrite an existing command with the same
         *     canonical name.
         */
        addUserCommand: function (names, description, action, extra, replace)
        {
            extra = extra || {};
            extra.isUserCommand = true;
            description = description || "User defined command";

            return addCommand(new Command(names, description, action, extra), true, replace);
        },

        /**
         * Returns the specified command invocation object serialized to
         * an executable Ex command string.
         *
         * @param {Object} args The command invocation object.
         * @returns {string}
         */
        commandToString: function (args)
        {
            let res = [args.command + (args.bang ? "!" : "")];
            function quote(str) quoteArg[/\s/.test(str) ? '"' : ""](str);

            for (let [opt, val] in Iterator(args.options || {}))
            {
                res.push(opt);
                if (val != null)
                    res.push(quote(val));
            }
            for (let [,arg] in Iterator(args.arguments || []))
                res.push(quote(arg));

            let str = args.literalArg;
            if (str)
                res.push(/\n/.test(str) ? "<<EOF\n" + str.replace(/\n$/, "") + "\nEOF" : str);
            return res.join(" ");
        },

        /**
         * Returns the command with matching <b>name</b>.
         *
         * @param {string} name The name of the command to return. This can be
         *     any of the command's names.
         * @returns {Command}
         */
        get: function (name)
        {
            return exCommands.filter(function (cmd) cmd.hasName(name))[0] || null;
        },

        /**
         * Returns the user-defined command with matching <b>name</b>.
         *
         * @param {string} name The name of the command to return. This can be
         *     any of the command's names.
         * @returns {Command}
         */
        getUserCommand: function (name)
        {
            return exCommands.filter(function (cmd) cmd.isUserCommand && cmd.hasName(name))[0] || null;
        },

        /**
         * Returns all user-defined commands.
         *
         * @returns {Command[]}
         */
        getUserCommands: function ()
        {
            return exCommands.filter(function (cmd) cmd.isUserCommand);
        },

        // TODO: should it handle comments?
        //     : it might be nice to be able to specify that certain quoting
        //     should be disabled E.g. backslash without having to resort to
        //     using literal etc.
        //     : I'm not sure documenting the returned object here, and
        //     elsewhere, as type Args rather than simply Object makes sense,
        //     especially since it is further augmented for use in
        //     Command#action etc.
        /**
         * Parses <b>str</b> for options and plain arguments.
         *
         * The returned <b>Args</b> object is an augmented array of arguments.
         * Any key/value pairs of <b>extra</b> will be available and the
         * following additional properties:
         *     -opt       - the value of the option -opt if specified
         *     string     - the original argument string <b>str</b>
         *     literalArg - any trailing literal argument
         *
         * Quoting rules:
         *     '-quoted strings   - only ' and \ itself are escaped
         *     "-quoted strings   - also ", \n and \t are translated
         *     non-quoted strings - everything is taken literally apart from "\
         *                          " and "\\"
         *
         * @param {string} str The Ex command-line string to parse. E.g.
         *     "-x=foo -opt=bar arg1 arg2"
         * @param {Array} options The options accepted. These are specified as
         *     an array [name, type, validator, completions]. E.g.
         *     options = [[["-force"], OPTION_NOARG],
         *                [["-fullscreen", "-f"], OPTION_BOOL],
         *                [["-language"], OPTION_STRING, validateFunc, ["perl", "ruby"]],
         *                [["-speed"], OPTION_INT],
         *                [["-acceleration"], OPTION_FLOAT],
         *                [["-accessories"], OPTION_LIST, null, ["foo", "bar"]],
         *                [["-other"], OPTION_ANY]];
         * @param {string} argCount The number of arguments accepted.
         *            "0": no arguments
         *            "1": exactly one argument
         *            "+": one or more arguments
         *            "*": zero or more arguments (default if unspecified)
         *            "?": zero or one arguments
         * @param {boolean} allowUnknownOptions Whether unspecified options
         *     should cause an error.
         * @param {number} literal The index at which any literal arg begins.
         *     See {@link Command#literal}.
         * @param {CompletionContext} complete The relevant completion context
         *     when the args are being parsed for completion.
         * @param {Object} extra Extra keys to be spliced into the returned
         *     Args object.
         * @returns {Args}
         */
        parseArgs: function (str, options, argCount, allowUnknownOptions, literal, complete, extra)
        {
            function getNextArg(str)
            {
                let [count, arg, quote] = parseArg(str);
                if (quote == "\\" && !complete)
                    return [,,,"Trailing \\"];
                if (quote && !complete)
                    return [,,,"E114: Missing quote: " + quote];
                return [count, arg, quote];
            }

            if (!options)
                options = [];

            if (!argCount)
                argCount = "*";

            var args = [];       // parsed options
            args.__iterator__ = function () util.Array.iteritems(this);
            args.string = str;   // for access to the unparsed string
            args.literalArg = "";

            // FIXME!
            for (let [k, v] in Iterator(extra || []))
                args[k] = v;

            var invalid = false;
            // FIXME: best way to specify these requirements?
            var onlyArgumentsRemaining = allowUnknownOptions || options.length == 0 || false; // after a -- has been found
            var arg = null;
            var count = 0; // the length of the argument
            var i = 0;
            var completeOpts;

            // XXX
            function matchOpts(arg)
            {
                // Push possible option matches into completions
                if (complete && !onlyArgumentsRemaining)
                    completeOpts = [[opt[0], opt[0][0]] for ([i, opt] in Iterator(options)) if (!(opt[0][0] in args))];
            }
            function resetCompletions()
            {
                completeOpts = null;
                args.completeArg = null;
                args.completeOpt = null;
                args.completeFilter = null;
                args.completeStart = i;
                args.quote = complQuote[""];
            }
            if (complete)
            {
                resetCompletions();
                matchOpts("");
                args.completeArg = 0;
            }

            function echoerr(error)
            {
                if (complete)
                    complete.message = error;
                else
                    liberator.echoerr(error);
            }

            outer:
            while (i < str.length || complete)
            {
                // skip whitespace
                while (/\s/.test(str[i]) && i < str.length)
                    i++;
                if (i == str.length && !complete)
                    break;

                if (complete)
                    resetCompletions();

                var sub = str.substr(i);
                if ((!onlyArgumentsRemaining) && /^--(\s|$)/.test(sub))
                {
                    onlyArgumentsRemaining = true;
                    i += 2;
                    continue;
                }

                var optname = "";
                if (!onlyArgumentsRemaining)
                {
                    for (let [,opt] in Iterator(options))
                    {
                        for (let [,optname] in Iterator(opt[0]))
                        {
                            if (sub.indexOf(optname) == 0)
                            {
                                invalid = false;
                                arg = null;
                                quote = null;
                                count = 0;
                                let sep = sub[optname.length];
                                if (sep == "=" || /\s/.test(sep) && opt[1] != this.OPTION_NOARG)
                                {
                                    [count, arg, quote, error] = getNextArg(sub.substr(optname.length + 1));
                                    if (error)
                                        return void liberator.echoerr(error);

                                    // if we add the argument to an option after a space, it MUST not be empty
                                    if (sep != "=" && !quote && arg.length == 0)
                                        arg = null;

                                    count++; // to compensate the "=" character
                                }
                                else if (!/\s/.test(sep) && sep != undefined) // this isn't really an option as it has trailing characters, parse it as an argument
                                    invalid = true;

                                let context = null;
                                if (!complete && quote)
                                {
                                    liberator.echoerr("Invalid argument for option " + optname);
                                    return null;
                                }

                                if (!invalid)
                                {
                                    if (complete && count > 0)
                                    {
                                        args.completeStart += optname.length + 1;
                                        args.completeOpt = opt;
                                        args.completeFilter = arg;
                                        args.quote = complQuote[quote] || complQuote[""];
                                    }
                                    let type = argTypes[opt[1]];
                                    if (type && (!complete || arg != null))
                                    {
                                        let orig = arg;
                                        arg = type.parse(arg);
                                        if (arg == null || (typeof arg == "number" && isNaN(arg)))
                                        {
                                            if (!complete || orig != "" || args.completeStart != str.length)
                                                echoerr("Invalid argument for " + type.description + " option: " + optname);
                                            if (complete)
                                                complete.highlight(args.completeStart, count - 1, "SPELLCHECK");
                                            else
                                                return null;
                                        }
                                    }

                                    // we have a validator function
                                    if (typeof opt[2] == "function")
                                    {
                                        if (opt[2].call(this, arg) == false)
                                        {
                                            echoerr("Invalid argument for option: " + optname);
                                            if (complete)
                                                complete.highlight(args.completeStart, count - 1, "SPELLCHECK");
                                            else
                                                return null;
                                        }
                                    }

                                    args[opt[0][0]] = opt[1] == this.OPTION_NOARG || arg; // always use the first name of the option
                                    i += optname.length + count;
                                    if (i == str.length)
                                        break outer;
                                    continue outer;
                                }
                                // if it is invalid, just fall through and try the next argument
                            }
                        }
                    }
                }

                matchOpts(sub);

                if (complete)
                {
                    if (argCount == "0" || args.length > 0  && (/[1?]/.test(argCount)))
                        complete.highlight(i, sub.length, "SPELLCHECK");
                }

                if (args.length == literal)
                {
                    if (complete)
                        args.completeArg = args.length;
                    args.literalArg = sub;
                    args.push(sub);
                    args.quote = null;
                    break;
                }

                // if not an option, treat this token as an argument
                let [count, arg, quote, error] = getNextArg(sub);
                if (error)
                    return void liberator.echoerr(error);

                if (complete)
                {
                    args.quote = complQuote[quote] || complQuote[""];
                    args.completeFilter = arg || "";
                }
                else if (count == -1)
                {
                    liberator.echoerr("Error parsing arguments: " + arg);
                    return null;
                }
                else if (!onlyArgumentsRemaining && /^-/.test(arg))
                {
                    liberator.echoerr("Invalid option: " + arg);
                    return null;
                }

                if (arg != null)
                    args.push(arg);
                if (complete)
                    args.completeArg = args.length - 1;

                i += count;
                if (count <= 0 || i == str.length)
                    break;
            }

            if (complete)
            {
                if (args.completeOpt)
                {
                    let opt = args.completeOpt;
                    let context = complete.fork(opt[0][0], args.completeStart);
                    context.filter = args.completeFilter;
                    if (typeof opt[3] == "function")
                        var compl = opt[3](context, args);
                    else
                        compl = opt[3] || [];
                    context.title = [opt[0][0]];
                    context.quote = args.quote;
                    context.completions = compl;
                }
                complete.advance(args.completeStart);
                complete.title = ["Options"];
                if (completeOpts)
                    complete.completions = completeOpts;
            }

            // check for correct number of arguments
            if (args.length == 0 && /^[1+]$/.test(argCount) ||
                    literal != null && /[1+]/.test(argCount) && !/\S/.test(args.literalArg || ""))
            {
                if (!complete)
                {
                    liberator.echoerr("E471: Argument required");
                    return null;
                }
            }
            else if (args.length == 1 && (argCount == "0") ||
                     args.length > 1  && /^[01?]$/.test(argCount))
            {
                echoerr("E488: Trailing characters");
                return null;
            }

            return args;
        },

        /**
         * Parses a complete Ex command.
         *
         * The parsed string is returned as an Array like
         * [count, command, bang, args]:
         *     count   - any count specified
         *     command - the Ex command name
         *     bang    - whether the special "bang" version was called
         *     args    - the commands full argument string
         * E.g. ":2foo! bar" -> [2, "foo", true, "bar"]
         *
         * @param {string} str The Ex command line string.
         * @returns {Array}
         */
        // FIXME: why does this return an Array rather than Object?
        parseCommand: function (str)
        {
            // remove comments
            str.replace(/\s*".*$/, "");

            // 0 - count, 1 - cmd, 2 - special, 3 - args
            let matches = str.match(/^:*(\d+|%)?([a-zA-Z]+|!)(!)?(?:\s*(.*?))?$/);
            //var matches = str.match(/^:*(\d+|%)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
            if (!matches)
                return [null, null, null, null];

            let [, count, cmd, special, args] = matches;

            // parse count
            if (count)
                count = count == "%" ? this.COUNT_ALL: parseInt(count, 10);
            else
                count = this.COUNT_NONE;

            return [count, cmd, !!special, args || ""];
        },

        /** @property @private */
        get complQuote() complQuote, // XXX: needed?

        /** @property @private */
        get quoteArg() quoteArg, // XXX: needed?

        /**
         * Remove the user-defined command with matching <b>name</b>.
         *
         * @param {string} name The name of the command to remove. This can be
         *     any of the command's names.
         */
        removeUserCommand: function (name)
        {
            exCommands = exCommands.filter(function (cmd) !(cmd.isUserCommand && cmd.hasName(name)));
        },

        // FIXME: still belong here? Also used for autocommand parameters.
        /**
         * Returns a string with all tokens in <b>string</b> matching "<key>"
         * replaced with "value". Where "key" is a property of the specified
         * <b>tokens</b> object and "value" is the corresponding value. The
         * <lt> token can be used to include a literal "<" in the returned
         * string. Any tokens prefixed with "q-" will be quoted except for
         * <q-lt> which is treated like <lt>.
         *
         * @param {string} str The string with tokens to replace.
         * @param {Object} tokens A map object whose keys are replaced with its
         *     values.
         * @returns {string}
         */
        replaceTokens: function replaceTokens(str, tokens)
        {
            return str.replace(/<((?:q-)?)([a-zA-Z]+)?>/g, function (match, quote, token) {
                if (token == "lt") // Don't quote, as in Vim (but, why so in Vim? You'd think people wouldn't say <q-lt> if they didn't want it)
                    return "<";
                let res = tokens[token];
                if (res == undefined) // Ignore anything undefined
                    res = "<" + token + ">";
                if (quote && typeof res != "number")
                    return quoteArg['"'](res);
                return res;
            });
        }
    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_mappings", function () {
        mappings.add(config.browserModes,
            ["@:"], "Repeat the last Ex command",
            function (count)
            {
                if (commands.repeat)
                {
                    for (let i in util.interruptibleRange(0, Math.max(count, 1), 100))
                        liberator.execute(commands.repeat);
                }
                else
                    liberator.echoerr("E30: No previous command line");
            },
            { flags: Mappings.flags.COUNT });
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    function userCommand(args, modifiers)
    {
        let tokens = {
            args:  this.argCount && args.string,
            bang:  this.bang && args.bang ? "!" : "",
            count: this.count && args.count
        };

        liberator.execute(commands.replaceTokens(this.replacementText, tokens));
    }

    // TODO: offer completion.ex?
    var completeOptionMap = {
        abbreviation: "abbreviation", altstyle: "alternateStyleSheet",
        bookmark: "bookmark", buffer: "buffer", color: "colorScheme",
        command: "command", dialog: "dialog", dir: "directory",
        environment: "environment", event: "autocmdEvent", file: "file",
        help: "help", highlight: "highlightGroup", javascript: "javascript",
        macro: "macro", mapping: "userMapping", menu: "menuItem",
        option: "option", preference: "preference", search: "search",
        shellcmd: "shellCommand", sidebar: "sidebar", url: "url",
        usercommand: "userCommand"
    };

    // TODO: Vim allows commands to be defined without {rep} if there are {attr}s
    // specified - useful?
    self.add(["com[mand]"],
        "List and define commands",
        function (args)
        {
            let cmd = args[0];

            if (cmd != null && /\W/.test(cmd))
                return void liberator.echoerr("E182: Invalid command name");

            if (args.literalArg)
            {
                let nargsOpt       = args["-nargs"] || "0";
                let bangOpt        = "-bang"  in args;
                let countOpt       = "-count" in args;
                let descriptionOpt = args["-description"] || "User-defined command";
                let completeOpt    = args["-complete"];

                let completeFunc = null; // default to no completion for user commands

                if (completeOpt)
                {
                    if (/^custom,/.test(completeOpt))
                    {
                        completeOpt = completeOpt.substr(7);
                        completeFunc = function ()
                        {
                            try
                            {
                                var completer = liberator.eval(completeOpt);

                                if (!(completer instanceof Function))
                                    throw new TypeError("User-defined custom completer '" + completeOpt + "' is not a function");
                            }
                            catch (e)
                            {
                                // FIXME: should be pushed to the MOW
                                liberator.echoerr("E117: Unknown function: " + completeOpt);
                                liberator.log(e);
                                return undefined;
                            }
                            return completer.apply(this, Array.slice(arguments));
                        };
                    }
                    else
                        completeFunc = completion[completeOptionMap[completeOpt]];
                }

                let added = commands.addUserCommand([cmd],
                                descriptionOpt,
                                userCommand,
                                {
                                    argCount: nargsOpt,
                                    bang: bangOpt,
                                    count: countOpt,
                                    completer: completeFunc,
                                    replacementText: args.literalArg
                                }, args.bang);

                if (!added)
                    liberator.echoerr("E174: Command already exists: add ! to replace it");
            }
            else
            {
                function completerToString(completer)
                {
                    if (completer)
                        return [k for ([k, v] in Iterator(completeOptionMap)) if (completer == completion[v])][0] || "custom";
                    else
                        return "";
                }

                // TODO: using an array comprehension here generates flakey results across repeated calls
                //     : perhaps we shouldn't allow options in a list call but just ignore them for now
                let cmds = exCommands.filter(function (c) c.isUserCommand && (!cmd || c.name.match("^" + cmd)));

                if (cmds.length > 0)
                {
                    let str = template.tabular(["", "Name", "Args", "Range", "Complete", "Definition"], ["padding-right: 2em;"],
                        ([cmd.bang ? "!" : " ",
                          cmd.name,
                          cmd.argCount,
                          cmd.count ? "0c" : "",
                          completerToString(cmd.completer),
                          cmd.replacementText || "function () { ... }"]
                         for ([,cmd] in Iterator(cmds))));

                    commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else
                    liberator.echomsg("No user-defined commands found");
            }
        },
        {
            bang: true,
            completer: function (context) completion.userCommand(context),
            options: [
                [["-nargs"], self.OPTION_STRING,
                     function (arg) /^[01*?+]$/.test(arg), ["0", "1", "*", "?", "+"]],
                [["-bang"], self.OPTION_NOARG],
                [["-count"], self.OPTION_NOARG],
                [["-description"], self.OPTION_STRING],
                // TODO: "E180: invalid complete value: " + arg
                [["-complete"], self.OPTION_STRING,
                     function (arg) arg in completeOptionMap || /custom,\w+/.test(arg),
                     function (context) [[k, ""] for ([k, v] in Iterator(completeOptionMap))]]
            ],
            literal: 1,
            serial: function () [
                {
                    command: this.name,
                    bang: true,
                    options: util.Array.toObject(
                        [[v, typeof cmd[k] == "boolean" ? null : cmd[k]]
                         // FIXME: this map is expressed multiple times
                         for ([k, v] in Iterator({ argCount: "-nargs", bang: "-bang", count: "-count", description: "-description" }))
                         // FIXME: add support for default values to parseArgs
                         if (k in cmd && cmd[k] != "0" && cmd[k] != "User-defined command")]),
                    arguments: [cmd.name],
                    literalArg: cmd.replacementText
                }
                for ([k, cmd] in Iterator(exCommands))
                if (cmd.isUserCommand && cmd.replacementText)
            ]
        });

    self.add(["comc[lear]"],
        "Delete all user-defined commands",
        function ()
        {
            commands.getUserCommands().forEach(function (cmd) { commands.removeUserCommand(cmd.name); });
        },
        { argCount: "0" });

    self.add(["delc[ommand]"],
        "Delete the specified user-defined command",
        function (args)
        {
            let name = args[0];

            if (commands.get(name))
                commands.removeUserCommand(name);
            else
                liberator.echoerr("E184: No such user-defined command: " + name);
        },
        {
            argCount: "1",
            completer: function (context) completion.userCommand(context)
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function () {
        completion.setFunctionCompleter(commands.get, [function () ([c.name, c.description] for (c in commands))]);

        completion.command = function command(context) {
            context.title = ["Command"];
            context.keys = { text: "longNames", description: "description" };
            context.completions = [k for (k in commands)];
        };

        // provides completions for ex commands, including their arguments
        completion.ex = function ex(context) {
            // if there is no space between the command name and the cursor
            // then get completions of the command name
            let [count, cmd, bang, args] = commands.parseCommand(context.filter);
            let [, prefix, junk] = context.filter.match(/^(:*\d*)\w*(.?)/) || [];
            context.advance(prefix.length)
            if (!junk)
                return context.fork("", 0, this, "command");

            // dynamically get completions as specified with the command's completer function
            let command = commands.get(cmd);
            if (!command)
            {
                context.highlight(0, cmd.length, "SPELLCHECK");
                return;
            }

            [prefix] = context.filter.match(/^(?:\w*[\s!]|!)\s*/);
            let cmdContext = context.fork(cmd, prefix.length);
            let argContext = context.fork("args", prefix.length);
            args = command.parseArgs(cmdContext.filter, argContext, { count: count, bang: bang });
            if (args)
            {
                // FIXME: Move to parseCommand
                args.count = count;
                args.bang = bang;
                if (!args.completeOpt && command.completer)
                {
                    cmdContext.advance(args.completeStart);
                    cmdContext.quote = args.quote;
                    cmdContext.filter = args.completeFilter;
                    try
                    {
                        let compObject = command.completer.call(command, cmdContext, args);
                        if (compObject instanceof Array) // for now at least, let completion functions return arrays instead of objects
                            compObject = { start: compObject[0], items: compObject[1] };
                        if (compObject != null)
                        {
                            cmdContext.advance(compObject.start);
                            cmdContext.filterFunc = null;
                            cmdContext.completions = compObject.items;
                        }
                    }
                    catch (e)
                    {
                        liberator.reportError(e);
                    }
                }
            }
        };

        completion.userCommand = function userCommand(context) {
            context.title = ["User Command", "Definition"];
            context.keys = { text: "name", description: "replacementText" };
            context.completions = commands.getUserCommands();
        };
    });
    //}}}

    return self;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
