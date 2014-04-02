/**
 * cuid.js
 * Collision-resistant UID generator for browsers and node.
 * Sequential for fast db lookups and recency sorting.
 * Safe for element IDs and server-side lookups.
 *
 * Extracted from CLCTR
 * 
 * Copyright (c) Eric Elliott 2012
 * MIT License
 */
//From: https://github.com/dilvie/cuid

/*global window, navigator, document, require, process, module */
(function(exports, selfBrowser, isBrowser){
  'use strict';
  var namespace = 'cuid',
    c = 0,
    blockSize = 4,
    base = 36,
    discreteValues = Math.pow(base, blockSize),

    pad = function pad(num, size) {
      var s = "000000000" + num;
      return s.substr(s.length-size);
    },

    randomBlock = function randomBlock() {
      return pad((Math.random() *
            discreteValues << 0)
            .toString(base), blockSize);
    },

    api = function cuid() {
      // Starting with a lowercase letter makes
      // it HTML element ID friendly.
      var letter = 'c', // hard-coded allows for sequential access

        // timestamp
        // warning: this exposes the exact date and time
        // that the uid was created.
        timestamp = (new Date().getTime()).toString(base),

        // Prevent same-machine collisions.
        counter,

        // A few chars to generate distinct ids for different
        // clients (so different computers are far less
        // likely to generate the same id)
        fingerprint = api.fingerprint(),

        // Grab some more chars from Math.random()
        random = randomBlock() + randomBlock() + randomBlock() + randomBlock();

        c = (c < discreteValues) ? c : 0;
        counter = pad(c.toString(base), blockSize);

      c++; // this is not subliminal

      return  (letter + timestamp + counter + fingerprint + random);
    };

  api.slug = function slug() {
    var date = new Date().getTime().toString(36),
      counter = c.toString(36).slice(-1),
      print = api.fingerprint().slice(0,1) +
        api.fingerprint().slice(-1),
      random = randomBlock().slice(-1);

    c++;

    return date.slice(2,4) + date.slice(-2) + 
      counter + print + random;
  };

    //fingerprint changes based on nodejs or browser setup
  api.fingerprint = isBrowser ?
      function browserPrint() {
          return pad((navigator.mimeTypes.length +
              navigator.userAgent.length).toString(36) +
              api.globalCount().toString(36), 4);
      }
    : function nodePrint() {
    var os = require('os'),

      padding = 2,
      pid = pad((process.pid).toString(36), padding),
      hostname = os.hostname(),
      length = hostname.length,
      hostId = pad((hostname)
        .split('')
        .reduce(function (prev, char) {
          return +prev + char.charCodeAt(0);
        }, +length + 36)
        .toString(36),
      padding);
    return pid + hostId;
  };

    api.globalCount = function globalCount() {
        // We want to cache the results of this
        var cache = (function calc() {
            var i,
                count = 0;

            for (i in selfBrowser) {
                count++;
            }

            return count;
        }());

        api.globalCount = function () { return cache; };
        return cache;
    };

    //set at the function itself!
    if(isBrowser)
        selfBrowser['win-base']['cuid'] = api;
    else
        module.exports = api;


})(typeof exports === 'undefined'? this['win-save']['cuid']={}: exports, this, typeof exports === 'undefined'? true : false);
