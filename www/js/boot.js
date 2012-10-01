"use strict";

(function() {
    var documentReady = function( callback ) {
        var runOnce = true;
        var realCallback = function() {
            if ( runOnce ) {
                runOnce = false;

                callback();
            }
        };

        /* Internet Explorer */
        /*@cc_on
        @if (@_win32 || @_win64)
            document.write('<script id="ieScriptLoad" defer src="//:"><\/script>');
            document.getElementById('ieScriptLoad').onreadystatechange = function() {
                if (this.readyState == 'complete') {
                    realCallback();
                }
            };
        @end @*/

        /* Mozilla, Chrome, Opera */
        if (document.addEventListener) {
            document.addEventListener('DOMContentLoaded', realCallback, false);
        }

        /* Safari, iCab, Konqueror */
        if (/KHTML|WebKit|iCab/i.test(navigator.userAgent)) {
            var DOMLoadTimer = setInterval(function () {
                if (/loaded|complete/i.test(document.readyState)) {
                    clearInterval( DOMLoadTimer );
                    realCallback();
                }
            }, 100);
        }

        /* Other web browsers */
        window.onload = realCallback;
    };

    documentReady( function() {
        quby.main.runScriptTagsDisplay();
    } );
})();
