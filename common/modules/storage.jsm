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

 © 2008: Kris Maglione <maglione.k at Gmail>
(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

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

var EXPORTED_SYMBOLS = ["storage"];

var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Components.interfaces.nsIPrefService)
                            .getBranch("extensions.liberator.datastore.");
var json = Components.classes["@mozilla.org/dom/json;1"]
                     .createInstance(Components.interfaces.nsIJSON);

function getCharPref(name)
{
    try
    {
        return prefService.getComplexValue(name, Components.interfaces.nsISupportsString).data;
    }
    catch (e) {}
}

function setCharPref(name, value)
{
    var str = Components.classes['@mozilla.org/supports-string;1']
                        .createInstance(Components.interfaces.nsISupportsString);
    str.data = value;
    return prefService.setComplexValue(name, Components.interfaces.nsISupportsString, str);
}

function loadPref(name, store, type)
{
    if (store)
        var pref = getCharPref(name);
    if (pref)
        var result = json.decode(pref);
    if (result instanceof type)
        return result;
}

function savePref(obj)
{
    if (obj.store)
        setCharPref(obj.name, obj.serial)
}

var prototype = {
    fireEvent: function (event, arg) { storage.fireEvent(this.name, event, arg) },
    save: function () { savePref(this) },
};

function ObjectStore(name, store, data)
{
    var object = data || {};

    this.__defineGetter__("store", function () store);
    this.__defineGetter__("name", function () name);
    this.__defineGetter__("serial", function () json.encode(object));

    this.set = function set(key, val)
    {
        var defined = key in object;
        var orig = object[key];
        object[key] = val;
        if (!defined)
            this.fireEvent("add", key);
        else if (orig != val)
            this.fireEvent("change", key);
    };

    this.remove = function remove(key)
    {
        var ret = object[key];
        delete object[key];
        this.fireEvent("remove", key);
        return ret;
    };

    this.get = function get(val) object[val];

    this.clear = function ()
    {
        object = {};
    };

    this.__iterator__ = function () Iterator(object);
}
ObjectStore.prototype = prototype;

function ArrayStore(name, store, data)
{
    var array = data || [];

    this.__defineGetter__("store",  function () store);
    this.__defineGetter__("name",   function () name);
    this.__defineGetter__("serial", function () json.encode(array));
    this.__defineGetter__("length", function () array.length);

    this.set = function set(index, value)
    {
        var orig = array[index];
        array[index] = value;
        this.fireEvent("change", index);
    };

    this.push = function push(value)
    {
        array.push(value);
        this.fireEvent("push", array.length);
    };

    this.pop = function pop(value)
    {
        var ret = array.pop();
        this.fireEvent("pop", array.length);
        return ret;
    };

    this.truncate = function truncate(length, fromEnd)
    {
        var ret = array.length;
        if (array.length > length)
        {
            if (fromEnd)
                array.splice(0, array.length - length);
            array.length = length;
            this.fireEvent("truncate", length);
        }
        return ret;
    };

    // XXX: Awkward.
    this.mutate = function mutate(aFuncName)
    {
        var funcName = aFuncName;
        arguments[0] = array;
        array = Array[funcName].apply(Array, arguments);
    };

    this.get = function get(index)
    {
        return index >= 0 ? array[index] : array[array.length + index];
    };

    this.__iterator__ = function () Iterator(array);
}
ArrayStore.prototype = prototype;

var keys = {};
var observers = {};

var storage = {
    newObject: function newObject(key, constructor, store, type, reload)
    {
        if (!(key in keys) || reload)
        {
            if (key in this && !reload)
                throw Error;
            keys[key] = new constructor(key, store, loadPref(key, store, type || Object));
            this.__defineGetter__(key, function () keys[key]);
        }
        return keys[key];
    },

    newMap: function newMap(key, store)
    {
        return this.newObject(key, ObjectStore, store);
    },

    newArray: function newArray(key, store)
    {
        return this.newObject(key, ArrayStore, store, Array);
    },

    addObserver: function addObserver(key, callback)
    {
        if (!(key in observers))
            observers[key] = [];
        if (observers[key].indexOf(callback) == -1)
            observers[key].push(callback);
    },

    removeObserver: function (key, callback)
    {
        if (!(key in observers))
            return;
        observers[key] = observers[key].filter(function (elem) elem != callback);
        if (observers[key].length == 0)
            delete obsevers[key];
    },

    fireEvent: function fireEvent(key, event, arg)
    {
        for each (callback in observers[key])
            callback(key, event, arg);
    },

    save: function save(key)
    {
        savePref(keys[key]);
    },

    saveAll: function storeAll()
    {
        for each (obj in keys)
            savePref(obj);
    },
};

// vim: set fdm=marker sw=4 sts=4 et ft=javascript: