"use strict";

/**
 * @license
 * 
 * Quby Compiler
 * Copyright 2010 - 2012 Joseph Lenton
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of the <organization> nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"use strict";

/*
 * TODO Optimizations:
 *
 * re-add the symbol id to rule lookup. So...
 *
 * ParserRule.parseRules add:
 *      var rules = this.compiled.rules[ symbol.id ]
 *
 * ... and use that to know which set of rules to jump to, and
 * so skip some others.
 */
/**
 * @license
 *
 * parse.js | A parser building framework
 * by Joseph Lenton
 *
 * All of Parse lives under the 'parse' variable.
 * It's a bit like jQuery, parse can be used as a function or
 * you can call one of it's provided methods.
 *
 * It also tries to be natural to read and write. For example:
 *
 *  parse.
 *          either( thisThing, orThat ).
 *          onMatch( doSomething );
 *
 *  parse.
 *          a( foo ).
 *          then( bar ).
 *          thenEither( foobar, foobarAlt );
 *
 * == Terminal Functions | Character Comparisons ==
 *
 * Before we begin, it's important you know one thing:
 *
 *  !!! Character comparsions are done by 'character code' !!!
 *
 * Character codes are the integer that represents a code,
 * which is returned with 'string.charCodeAt( i )'.
 *
 * see: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/charCodeAt
 *
 * This means that instead of:
 *
 *      c === '&'
 *
 * ... you do ...
 *
 *      code === 38 // the code for an ampersand
 *
 * You can find a list of JS character codes here:
 *
 * // TODO insert character code listings
 *
 * Why? There are a few reasons:
 *
 *  = character codes are faster to get out from a string
 *  = dealing with just codes is faster then supplying both
 *    code and character.
 *  = comparisons is faster with codes then characters
 *
 * At the date of writing, the above rules would save as much
 * as 50ms, on 300kb of code, in Firefox 9 on my 2.5ghz PC.
 *
 * parse.js was built for my Quby language, where it's common
 * for code to take up more then 300kb (standard library +
 * a whole game).
 *
 * There are games built in Quby which take up as much as 1mb;
 * so although it's a small optimization, that speed
 * improvement quickly becomes noticeable.
 *
 * There are advantages with this. For example you can do range
 * comparisons with codes. Such as:
 *
 *      if (
 *              (code >=  97 && code <= 122) || // it's a lower case a-z
 *              (code >=  65 && code <=  90)    // it's an uppper case a-z
 *      ) {
 *          // we have an a-z letter
 *      }
 *
 * The above is much shorter then:
 *
 *      if (
 *              c === 'a' || c === 'b' || c === 'c' ||
 *              c === 'd' || c === 'e' || c === 'f' ||
 *              c === 'g' || c === 'h' || c === 'i' || ...
 *
 * == Terminal Functions | Building ==
 *
 * When a terminal function is called, all source code is
 * passed in, along with the current position in the parsing.
 *
 * The index points to the current character the terminal
 * should be looking at. The terminal function then returns
 * a new location, which is greater then i, stating how many
 * characters it is taking.
 *
 * So for example if you want to take 1 character, then you
 * return i+1.
 *
 * Another example. Lets say the word at the beginning of the
 * code is '&&', and you want to accept '&&', then you return
 * i+2. 2 is the length of '&&' (it's two characters long).
 *
 * For example here is the function for parsing and:
 *
 *      var AMPERSAND = 38;
 *      var logicalAnd = parse.terminal(
 *              function(src, i, code, len) {
 *                  if (
 *                                         code === AMPERSAND &&
 *                          src.charCodeAt(i+1) === AMPERSAND
 *                  ) {
 *                      return i+2;
 *                  }
 *              }
 *      );
 *
 * Lets break that down a little. When the function is called,
 * calling 'src.charCodeAt(i)' will return the first '&'.
 * However the given parameter 'c' is this already, so you
 * don't have to call it in every terminal (minor optimization).
 *
 * To clarify: code === src.charCharAt(i)
 *
 * So then we look ahead, by performing src.charCodeAt(i+1). By
 * looking ahead, adding 1 to i, we can then check the
 * following character, and see if this also points to '&'.
 *
 * If they are both '&', and so we have found '&&', then we
 * return i+2 to say we are matching 2 characters.
 *
 * If you don't want to move, then either return the value of
 * i, or undefined. Just calling return, without any value, is
 * enough to automatically give you no match.
 *
 * Finally 'len' is the total length of src. It's useful for
 * when you run any loops that continously chomp, to help
 * avoiding infinite loops.
 *
 * == What happens if no terminals match? ==
 *
 * It'll move on by just 1 char at a time until one does match.
 * Once it reaches the end of the error section, it will then
 * call the 'symbol error handler'.
 *
 * By default this just raises an exception, and stops parsing.
 * So you must set one!
 *
 * This can done through:
 *
 *      parse.onSymbolError( function( input, start, end ) {
 *          // error handling code here
 *      } );
 *
 * Where:
 *
 *  = Input - the text we are parsing
 *  = start - the index of the start of the error, in input
 *  = end   - the index of the end of the error, in input
 *
 * The return value is ignored.
 *
 * == What is "infinite resursion rule" ? ==
 *
 * Take this piece of code:
 *
 *     var expression = parse();
 *     expression.then( expression );
 *
 * It will look for it's self, which in turn looks for it's
 * self, which looks for it's self, and then again, and
 * continues looking for it's self, forever.
 *
 * 'Infinite recursion rule' is a way of stopping this when
 * the parser is built, but only works if you try it directly.
 *
 * For example it will not prevent:
 *
 *      var foo = parse(),
 *          bar = parse();
 *
 *      foo.then( bar );
 *      bar.then( foo );
 *
 * This will not be caused, because the infinite recursion is
 * not direct. It is up to you to prevent the above from
 * happening!
 *
 * Another example:
 *
 *      var foo = parse(),
 *          bar = parse();
 *
 *      foo.or( foo, bar );
 *
 * Here it will always test 'foo', before 'bar', which in turn
 * means it will end up being infinitely recursive. The
 * correct code is to use 'this' as the last or, such as:
 *
 *      foo.or( bar, foo );
 *
 * As long as bar is not recursive, then this will always
 * succeed.
 *
 * What if bar doesn't match? At runtime it will check for
 * parsing 'this' against 'this', and this will cause a syntax
 * error.
 *
 * == How do I get more parse's? ==
 *
 * The provided parse object, at window.parse, is a global
 * parse and secretly shares data with it's rules. It should
 * only be used for building _one_ parser!
 *
 * If you want more then one parser, then you need to make a
 * new parse. You can make a new parse through:
 *
 *     var newParse = new parse();
 *
 * Both 'newParse' and 'window.parse' are both different
 * Parse instances.
 *
 * This works thanks to some JS hackery, allowing parse to be
 * use as a constructor as well as the other magical things it
 * can do.
 */
/*
 * = Notes on parameters =
 *
 * Lots of functions take parameters as 'a' and 'b'. This is
 * undescriptive because I don't know what those parameters
 * are. This happens if the function can be called in
 * different ways.
 *
 * Any functions that take this should define the 'actual'
 * parameters at the top, and then sort them out asap.
 *
 * They should _not_ be worked out later, in order to help
 * keep the code clean and better laid out (i.e. parameters
 * go at the top).
 *
 * Constructors should also be defined in a way so they can be
 * called with no args, this is needed for Terminal, Terminals
 * and ParserRule constructors.
 *
 * = Symbol vs Terminal =
 *
 * A terminal is something we plan to match. For example 'if'
 * is a terminal.
 *
 * A symbol is a matching terminal. For example there could be
 * 4 'if' symbols, at different locations in the source code,
 * but only one 'if' terminal, which is used to find them all.
 */
var parse = window['parse'] = (function( window, undefined ) {
    var tabLog = function( indents ) {
        var str = '';
        for ( var i = 0; i < indents; i++ ) {
            str += '    ';
        }

        arguments[0] = str;
        console.log.apply( console, arguments );
    };


    /**
     * ASCII codes for characters.
     *
     * @type {number}
     * @const
     */
    var TAB     =  9, // \t
        SLASH_N = 10, // \n
        SLASH_R = 13, // \r

        SPACE = 32,
        EXCLAMATION = 33,
        DOUBLE_QUOTE = 34,
        HASH = 35,
        DOLLAR = 36,
        PERCENT = 37,
        AMPERSAND = 38,
        SINGLE_QUOTE = 39,
        LEFT_PAREN = 40,
        RIGHT_PAREN = 41,
        STAR = 42, // *
        PLUS = 43,
        COMMA = 44,
        MINUS = 45,
        FULL_STOP = 46,
        SLASH = 47,

        ZERO = 48,
        ONE = 49,
        TWO = 50,
        THREE = 51,
        FOUR = 52,
        FIVE = 53,
        SIX = 54,
        SEVEN = 55,
        EIGHT = 56,
        NINE = 57,

        COLON = 58,
        SEMI_COLON = 59,

        LESS_THAN = 60,
        EQUAL = 61,
        GREATER_THAN = 62,
        QUESTION_MARK = 63,
        AT = 64,

        UPPER_A = 65,
        UPPER_F = 70,
        UPPER_Z = 90,

        LEFT_SQUARE = 91,
        BACKSLASH = 92,
        RIGHT_SQUARE = 93,
        CARET = 94,
        UNDERSCORE = 95,

        LOWER_A = 97,
        LOWER_B = 98,
        LOWER_C = 99,
        LOWER_D = 100,
        LOWER_E = 101,
        LOWER_F = 102,
        LOWER_G = 103,
        LOWER_H = 104,
        LOWER_I = 105,
        LOWER_J = 106,
        LOWER_K = 107,
        LOWER_L = 108,
        LOWER_M = 109,
        LOWER_N = 110,
        LOWER_O = 111,
        LOWER_P = 112,
        LOWER_Q = 113,
        LOWER_R = 114,
        LOWER_S = 115,
        LOWER_T = 116,
        LOWER_U = 117,
        LOWER_V = 118,
        LOWER_W = 119,
        LOWER_X = 120,
        LOWER_Y = 121,
        LOWER_Z = 122,

        LEFT_BRACE = 123,
        BAR = 124,
        RIGHT_BRACE = 125,
        TILDA = 126;

    /**
     * @nosideeffects
     * @const
     * @param {number} code
     * @return {boolean}
     */
    var isHexCode = function(code) {
        return (code >= ZERO && code <= NINE) || // a number
               (code >= LOWER_A && code <= LOWER_F) || // lower a-z
               (code >= UPPER_A && code <= UPPER_F);   // UPPER A-Z
    };

    var isAlphaNumericCode = function(code) {
        return (
                (code >=  LOWER_A && code <= LOWER_Z) || // lower case letter
                (code >=  UPPER_A && code <= UPPER_Z) || // upper case letter
                (code === UNDERSCORE) ||
                (code >=  ZERO && code <= NINE)     // a number
        );
    };

    var isAlphaCode = function(code) {
        return (code >= LOWER_A && code <= LOWER_Z) ||
               (code >= UPPER_A && code <= UPPER_Z) ;
    };

    /**
     * @nosideeffects
     * @const
     * @param {number} code
     * @return {boolean}
     */
    var isNumericCode = function(code) {
        return (code >= ZERO && code <= NINE) ; // a number
    };

    /**
     * @return True if f is a function object, and false if not.
     */
    var isFunction = function(f) {
        return ( f instanceof Function ) || ( typeof f == 'function');
    };

    /*  **  **  **  **  **  **  **  **  **  **  **  **  **
     *
     *          Terminal
     *
     * The Terminal prototype, for representing a terminal
     * symbol to match.
     *
     * It also includes helper functions. These should be
     * left as local functions, so Google Closure will
     * inline them.
     *
     *  **  **  **  **  **  **  **  **  **  **  **  **  */

    /**
     * Generates a 1 character match function, that does not
     * take into account of word boundaries.
     *
     * So this should only be used on things like '+' or '-',
     * and not letters or numbers.
     *
     * @nosideeffects
     * @const
     */
    var newCharacterMatch = function( match ) {
        var matchCode = match.charCodeAt(0);

        return function(src, i, code, len) {
            if ( code === matchCode ) {
                return i+1;
            } else {
                return undefined;
            }
        };
    };

    /**
     * Generates a match function for the match given,
     * that does take into account word boundaries.
     *
     * The match only matches if it is followed by not
     * a letter, number or underscore.
     *
     * The end of the program counts as a word boundary.
     *
     * @nosideeffects
     * @const
     */
    /*
     * Yes, it contains lots of hard coded match routines.
     *
     * This is because most keywords will be short, not long,
     * and so this allows those short matches to be as quick
     * as possible.
     *
     * Remember these will be called thousands of times, so
     * it does matter, especially with FF 9's crappy
     * interpreter that gets used on first run!
     *
     * Plus it's faster to check chars indevidually on short
     * strings (like 'if', 'while', 'def', 'new', etc),
     * instead of using indexOf or substrings.
     *
     * @see http://jsperf.com/word-match-test
     */
    var newWordMatch = function( match ) {
        if ( isWordCode(match.charCodeAt(match.length-1)) ) {
            return newWordMatchBoundary(match);
        } else {
            return newWordMatchNoBoundary(match);
        }
    };

    var newWordMatchBoundary = function( match ) {
        var m0 = match.charCodeAt(0),
            m1 = match.charCodeAt(1),
            m2 = match.charCodeAt(2),
            m3 = match.charCodeAt(3),
            m4 = match.charCodeAt(4),
            m5 = match.charCodeAt(5),
            m6 = match.charCodeAt(6),
            m7 = match.charCodeAt(7);

        if ( match.length === 1 ) {
            return function(src, i, code, len) {
                if ( m0 === code && !isWordCharAt(src, i+1) ) {
                    return i+1;
                }
            };
        } else if ( match.length === 2 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        !isWordCharAt(src, i+2)
                ) {
                    return i + 2;
                }
            };
        } else if ( match.length === 3 ) {
            return function(src, i, code, len) {
                if ( m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        !isWordCharAt(src, i+3)
                ) {
                    return i + 3;
                }
            };
        } else if ( match.length === 4 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        !isWordCharAt(src, i+4)
                ) {
                    return i + 4;
                }
            };
        } else if ( match.length === 5 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        !isWordCharAt(src, i+5)
                ) {
                    return i + 5;
                }
            };
        } else if ( match.length === 6 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        !isWordCharAt(src, i+6)
                ) {
                    return i + 6;
                }
            };
        } else if ( match.length === 7 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6) &&
                        !isWordCharAt(src, i+7)
                ) {
                    return i + 7;
                }
            };
        } else if ( match.length === 8 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6) &&
                        m7 === src.charCodeAt(i+7) &&
                        !isWordCharAt(src, i+8)
                ) {
                    return i + 8;
                }
            };
        } else {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6) &&
                        m7 === src.charCodeAt(i+7)
                ) {
                    var keyLen = src.length;

                    // starts at 7, to avoid the tests above!
                    for ( var j = 7; j < keyLen; j++ ) {
                        if ( src.charCodeAt(i+j) !== match.charCodeAt(j) ) {
                            return undefined;
                        }
                    }

                    /*
                     * Check for things following the keyword.
                     * For example if we are matching 'null',
                     * then it must fail on 'nullify',
                     * since it's clear not null.
                     *
                     * This happens if we are at the end of input,
                     * or if a non-identifier character follows.
                     */
                    if ( ! isWordCharAt(src, i+keyLen) ) {
                        return i+keyLen;
                    }
                }

                return undefined;
            };
        }
    };

    var newWordMatchNoBoundary = function( match ) {
        var m0 = match.charCodeAt(0),
            m1 = match.charCodeAt(1),
            m2 = match.charCodeAt(2),
            m3 = match.charCodeAt(3),
            m4 = match.charCodeAt(4),
            m5 = match.charCodeAt(5),
            m6 = match.charCodeAt(6),
            m7 = match.charCodeAt(7);

        if ( match.length === 1 ) {
            return function(src, i, code, len) {
                if ( m0 === code ) {
                    return i+1;
                }
            };
        } else if ( match.length === 2 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1)
                ) {
                    return i + 2;
                }
            };
        } else if ( match.length === 3 ) {
            return function(src, i, code, len) {
                if ( m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2)
                ) {
                    return i + 3;
                }
            };
        } else if ( match.length === 4 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3)
                ) {
                    return i + 4;
                }
            };
        } else if ( match.length === 5 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4)
                ) {
                    return i + 5;
                }
            };
        } else if ( match.length === 6 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5)
                ) {
                    return i + 6;
                }
            };
        } else if ( match.length === 7 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6)
                ) {
                    return i + 7;
                }
            };
        } else if ( match.length === 8 ) {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6) &&
                        m7 === src.charCodeAt(i+7)
                ) {
                    return i + 8;
                }
            };
        } else {
            return function(src, i, code, len) {
                if (
                        m0 === code &&
                        m1 === src.charCodeAt(i+1) &&
                        m2 === src.charCodeAt(i+2) &&
                        m3 === src.charCodeAt(i+3) &&
                        m4 === src.charCodeAt(i+4) &&
                        m5 === src.charCodeAt(i+5) &&
                        m6 === src.charCodeAt(i+6) &&
                        m7 === src.charCodeAt(i+7)
                ) {
                    var keyLen = src.length;

                    // starts at 7, to avoid the tests above!
                    for ( var j = 7; j < keyLen; j++ ) {
                        if ( src.charCodeAt(i+j) !== match.charCodeAt(j) ) {
                            return undefined;
                        }
                    }
                }

                return undefined;
            };
        }
    };

    /**
     * By 'code', it means the actual number that
     * represents the character. This is the value
     * returned by 'charCodeAt' by the String object.
     *
     * Characters which are for words includes:
     * underscore, the letter a to z (upper and lower),
     * and the numbers 0 to 9.
     *
     * @nosideeffects
     * @const
     * @param {number} A code for a character.
     * @return {boolean} True if it is a word character, and false if not.
     */
    var isWordCode = function( code ) {
        return (
                (code >=  97 && code <= 122) || // lower case letter
                (code >=  48 && code <=  57) || // a number
                (code === 95)                || // underscore
                (code >=  65 && code <=  90)    // uppper case letter
        );
    };

    /**
     * This is a helper version of 'isWordCode'.
     *
     * The parameters might look odd, but this is
     * to avoid having to also call 'charCodeAt'
     * every time I want to use this whilst parsing.
     *
     * i can lie outside of src, it'll just return
     * false.
     *
     * @nosideeffects
     * @const
     * @param {string} src A string to check the character of.
     * @param {number} i The index of the character to check in the string.
     * @return {boolean}
     */
    var isWordCharAt = function( src, i ) {
        return isWordCode( src.charCodeAt(i) );
    };

    /**
     * The value used to denote a terminal with no ID.
     *
     * These terminals are hidden from the outside world, and
     * so shouldn't be tracked or exposed in any way.
     *
     * They also don't directly relate to the parsing rules,
     * hence why they cannot be indexed by ID.
     */
    var INVALID_TERMINAL = 0;

    /**
     * The multiple types for a terminal.
     */
    var TYPE_FUNCTION       = 1,
        TYPE_WORD_CODE      = 2,
        TYPE_CODE           = 3,
        TYPE_STRING         = 4,
        TYPE_ARRAY          = 5;

    /**
     * Given a string, this turns it into an array of char codes,
     * and returns the result.
     *
     * Note that it's 'character codes', not 'characters'.
     * So that means the underlying ASCII/Unicode numbers,
     * not the actual characters themselves.
     *
     * @param {string} str The string to convert to an array.
     * @return An array of character codes for the string given.
     */
    var stringToCodes = function( str ) {
        var len = str.length,
            arr = new Array( len );

        for ( var i = 0; i < len; i++ ) {
            arr[i] = str.charCodeAt( i );
        }

        return arr;
    }

    /**
     * Format the terminal name into a readable one, i.e.
     *     'ELSE_IF' => 'else if'
     *      'leftBracket' => 'left bracket'
     */
    var formatTerminalName = function(str) {
        /*
         * - reaplce camelCase in the middle to end of the string,
         * - lowerCase anything left (start of string)
         * - turn underscores into spaces
         * - uppercase the first letter of each word
         */
        return str.
                replace( /([^A-Z])([A-Z]+)/g, function(t,a,b) { return a + ' ' + b; } ).
                replace( '_', ' ' ).
                toLowerCase().
                replace( /\b([a-z])/g, function(t, letter) { return letter.toUpperCase(); } );
    }

    /**
     * If given a string, it will match if it is
     * followed by a word boundary.
     *
     * If a function is given, then you can run the test
     * yourself, and decide it's behaviour.
     *
     * If a number is given, it's presumed to be a code
     * character. In this case it is matched against 'code'.
     *
     * If an array is given, then each element is turned into
     * a terminal, and then the test for this terminal is to
     * match one of those terminals.
     *
     * About the 'returnMatch' flag. If the given match is a function,
     * then it will return the match. If the flag is not a function,
     * then it will return this terminal.
     *
     * The idea is that if your supplying the character, such as to match '+',
     * then you don't need the substring (you already know it's going to be '+').
     * So this allows this to avoid the cost of making 1,000s of substrings out
     * of the given input.
     *
     * @param match The item to use for the matching test.
     * @param name Optional, a name for this terminal (for error reporting).
     */
    var Terminal = function( match, name ) {
        this.id = INVALID_TERMINAL;

        /**
         * A name for this terminal.
         *
         * Used for error reporting, so you can have something readable,
         * rather then things like 'E_SOMETHING_END_BLAH_TERMINAL'.
         */
        var nameSupplied = ( name !== undefined );
        this.termName = !nameSupplied ?
                "<Anonymous Terminal>" :
                name ;

        /**
         * When true, this has been explicitely named.
         * 
         * When false, this has been named as a result
         * of this constructor.
         *
         * It's a flag that exists so other code knows
         * if it should, or shouldn't, override the name
         * automatically.
         */
        this.isExplicitelyNamed = false;

        /**
         * The type of this terminal.
         *
         * Default is zero, which is invalid.
         */
        this.type = 0;

        /**
         * A post match callback that can be run,
         * when a match has been found.
         *
         * Optional.
         */
        this.onMatchFun = null;

        /**
         * The type of this terminal.
         *
         * This determines the algorithm used to match,
         * or not match, bits against the source code
         * when parsing symbols.
         */
        this.isLiteral = false;

        /**
         * If this is a literal, then this will give the length
         * of that literal being searched for.
         *
         * For a string, this is the length of that string.
         * For a number, this is 1.
         *
         * For non-literals, this is 0, but should not be used.
         */
        this.literalLength = 0;

        /**
         * There are two ways to work out if a terminal matches
         * or not.
         *
         * The first is by overriding the 'test' with it's own
         * function.
         *
         * The other is to apply a special type, such as TYPE_CODE,
         * and then place the data for it here.
         *
         * When it has no data, it is null.
         */
        this.testData = null;

        /**
         * An optional event to run after a symbol has been matched.
         *
         * Gives the option to move the offset on further, whilst ignoring
         * symbols.
         */
        this.postMatch = null;

        /**
         * Some terminals are silently hidden away,
         * this is so they can still see their parents.
         */
        this.terminalParent = null;

        if ( match instanceof Terminal ) {
            return match;
        } else if ( isFunction(match) ) {
            this.isLiteral = false;
            this.testData = match;
            this.type = TYPE_FUNCTION;
        } else {
            this.isLiteral = true;

            var matchType = typeof match ;

            /*
             * A single character.
             * - a character code (number)
             * - a single character (1 length string)
             */
            if (
                    matchType === 'number' ||
                    (
                            (matchType === 'string' || match instanceof String) &&
                             match.length === 1
                    )
            ) {
                if ( matchType === 'string' ) {
                    if ( ! nameSupplied ) {
                        this.termName = "'" + match + "'";
                    }

                    match = match.charCodeAt( 0 );
                } else {
                    if ( ! nameSupplied ) {
                        this.termName = "'" + String.fromCharCode( match ) + "'";
                    }
                }

                this.literalLength = 1;
                this.isLiteral = true;

                this.type = isWordCode(match) ?
                        TYPE_WORD_CODE :
                        TYPE_CODE ;

                this.testData = match;

            /*
             * String primative, or string object.
             *
             * This is a string with a length longer than 1,
             * a length of zero will raise an error,
             * and 1 length is caught by the clause above.
             */
            } else if ( matchType === 'string' || match instanceof String ) {
                this.literalLength = match.length;
                this.isLiteral = true;
                this.type = TYPE_STRING;

                if ( match.length === 0 ) {
                    throw new Error( "Empty string given for Terminal" );
                } else {
                    this.testData = stringToCodes( match );

                    if ( ! nameSupplied ) {
                        if ( match > 20 ) {
                            this.termName = "'" + match.substring( 0, 20 ) + "'";
                        } else {
                            this.termName = "'" + match + "'";
                        }
                    }
                }

            /*
             * An array of matches to match against.
             * For example, multiple string keywords
             * in an array.
             */
            } else if ( match instanceof Array ) {
                var mTerminals = [];
                var isLiteral = true,
                    literalLength = Number.MAX_VALUE;

                for ( var i = 0; i < match.length; i++ ) {
                    var innerTerm = new Terminal( match[i], name );

                    if ( innerTerm.isLiteral ) {
                        literalLength = Math.min( literalLength, innerTerm.literalLength );
                    } else {
                        isLiteral = false;
                    }

                    innerTerm.setParentTerm( this );
                    mTerminals[i] = innerTerm;
                }

                this.type = TYPE_ARRAY ;
                this.isLiteral = isLiteral;
                this.literalLength = literalLength;
                this.testData = mTerminals;
            // errors!
            } else if ( match === undefined ) {
                throw new Error( "undefined match given" );
            } else if ( match === null ) {
                throw new Error( "null match given" );
            } else {
                throw new Error( "unknown match given" );
            }
        }

        Object.preventExtensions( this );
    }

    Terminal.prototype.getParentTerm = function() {
        if ( this.terminalParent !== null ) {
            return this.terminalParent.getParentTerm();
        } else {
            return this;
        }
    }

    Terminal.prototype.setParentTerm = function( parent ) {
        this.terminalParent = parent;
    }

    Terminal.prototype['name'] = function( name ) {
        if ( arguments.length === 0 ) {
            return this.termName;
        } else {
            this.termName = name;
            return this;
        }
    }

    Terminal.prototype['setName'] = function( name ) {
        this.name = name;
    }

    Terminal.prototype.setID = function( id ) {
        this.id = id;

        /*
         * Arrays are silently removed,
         * so pass the id on,
         * otherwise the grammar breaks.
         */
        if ( this.type === TYPE_ARRAY ) {
            for ( var i = 0; i < this.testData.length; i++ ) {
                this.testData[i].setID( id );
            }
        }

        return this;
    }

    /**
     * The 'symbolMatch' event allows you to run a callback straight after the
     * symbol has been matched, and before any others.
     *
     * Optionall you can also move the offset on further, by returning a new
     * index.
     *
     * One use for this is to allow certain symbols to eat end of line
     * characters after they have been matched, such as '+' or '='.
     *
     * @param callback The callback to run; null for no callback, or a valid function.
     */
    Terminal.prototype['symbolMatch'] = function( callback ) {
        if ( callback !== null && ! isFunction(callback)) {
            throw new Error("symbolMatch callback is not valid: " + callback);
        }

        this.postMatch = callback;

        return this;
    };

    /**
     * Returns the test used for matching this symbol, during the symbolization
     * stage. This is either the test set when this was created, or the test
     * auto-generated.
     *
     * This is mostly for debugging purposes, or if you want to pull out the
     * test and re-use it elsewhere.
     */
    Terminal.prototype['getTest'] = function() {
        return this.test;
    };

    /**
     * This callback is run when the symbol is matched.
     *
     * If takes the form:
     *  function( str, offset ) { }
     *
     * Where:
     *  str - this is the string that matches, if this is a terminal that will
     *        grab a match.
     *  offset - The index position of the match.
     *
     * The 'str' thing might seem odd, but basicly matches which are certain,
     * don't bother supplying a string. For example if you have a symbol that
     * matches 'if', then there is no point in supplying the 'if' text for the
     * 'if' symbol. We know it's going to be 'if'!
     *
     * @param callback The function to call (or null to clear a previous one).
     * @return This object to allow chaining.
     */
    Terminal.prototype['onMatch'] = function( callback ) {
        if ( ! callback ) {
            this.onMatchFun = null;
        } else {
            this.onMatchFun = callback;
        }

        return this;
    };

    /*  **  **  **  **  **  **  **  **  **  **  **  **  **
     *
     *          Parser
     *
     * This includes the parser rules for building the
     * expressions, and the core 'Parser' interface.
     *
     *  **  **  **  **  **  **  **  **  **  **  **  **  */

     var SymbolError = function( i, str ) {
         this['isSymbol'] = true;

         this['offset'] = i;
         this['match']  = str;
     };

     var TerminalError = function( i, terminal, match ) {
         if ( i instanceof Symbol ) {
             return new TerminalError(
                    i.offset,
                    i.terminal,
                    i.match
             );
         } else {
             this['isTerminal']     = true;

             this['offset']         = i;
             this['terminal']       = terminal;
             this['terminalName']   = terminal.termName;
             this['match']          = match;
             this['isLiteral']      = terminal.isLiteral;
         }
     };

     /**
      * A wrapper for holding the Symbol result information.
      *
      * It's essentially a struct like object.
      */
     var Symbol = function( terminal, offset, str ) {
         this['terminal']       = terminal;
         this['offset']         = offset  ;
         this['match']          = str     ;
     };

     /**
      * Converts this to what it should be for the 'onMatch' callbacks.
      *
      * If there is no callback set on the inner symbol, then this is returned.
      * If there is a callback, then it is run, and the result is returned.
      */
     Symbol.prototype.onFinish = function() {
         var onMatch = this.terminal.onMatchFun;

         if ( onMatch !== null ) {
             return onMatch( this['match'], this['offset'] );
         } else {
             return this;
         }
     }

    /**
     * This wraps the output from parsing the symbols.
     *
     * Errors are stored here to allow them to be returned
     * with the symbols that got parsed.
     *
     * Moving through the symbols can be done in two ways.
     * First you can move along by the 'id index', which allows
     * you to 'peekID'. You can use this to check for maching
     * terminals, and you can move 'back'.
     *
     * Once you've got a match, you call 'finalizeMove', and
     * you can now get out the current symbol.
     *
     * It might seem like an odd API, but all this hackery is
     * done so the SymbolResult can do less work if the parser
     * is shifting back and forth. They end up becomming i++
     * and i-- operations.
     *
     * @param errors Any errors that occurred during parsing.
     * @param symbols The symbol result object.
     * @param symbolIDs The ID of the symbol found, in order of symbols found.
     * @param symbolLength The number of symbols found.
     */
    /*
     * Note that strings is compacted down. This means you
     * need to know if a string is to be skipped or not.
     */
    var SymbolResult = function(
            errors,

            symbols,
            symbolIDs,

            symbolLength
    ) {
        this.errors = errors;

        this.symbols   = symbols;
        this.symbolIDs = symbolIDs;

        this.length = symbolLength;
        this.symbolIndex = 0;
        this.i = 0;
        this.maxI = 0;

        this.currentString = null;
        this.currentID = INVALID_TERMINAL;
        this.stringI = -1;

        if ( symbolLength > 0 ) {
            this.currentID = this.symbolIDs[0];
        }

        Object.preventExtensions( this );
    };

    /**
     * @return The current index for the current symbol ID.
     */
    SymbolResult.prototype.idIndex = function() {
        return this.i;
    };
    
    /**
     * If i has moved past maxI,
     * then this will update maxI to the i value.
     * 
     * Otherwise i is left unchanged.
     */
    SymbolResult.prototype.updateMax = function() {
        if ( this.i > this.maxI ) {
            this.maxI = this.i;
        }
    };

    /**
     * @return The maximum id value the symbol result has moved up to.
     */
    SymbolResult.prototype.maxID = function() {
        if ( this.i > this.maxI ) {
            return this.i;
        } else {
            return this.maxI;
        }
    };

    SymbolResult.prototype.maxSymbol = function() {
        return this.symbols[ this.maxID()-1 ];
    };

    SymbolResult.prototype.hasErrors = function() {
        return this.errors.length > 0;
    };

    SymbolResult.prototype.getTerminals = function() {
        var symbols = [];

        for ( var i = 0; i < this.length; i++ ) {
            symbols[i] = this.symbols[i].terminal;
        }

        return symbols;
    };

    SymbolResult.prototype.getErrors = function() {
        return this.errors;
    };

    /**
     * @return True if this currently points to a symbol.
     */
    SymbolResult.prototype.hasMore = function() {
        return this.symbolIndex < this.length;
    };

    SymbolResult.prototype.isMoving = function() {
        return this.i !== this.symbolIndex;
    };

    SymbolResult.prototype.finalizeMove = function() {
        var i = this.i;

        if ( i < this.length ) {
            this.currentID = this.symbolIDs[i];
            this.symbolIndex = i;
        } else {
            this.currentID = INVALID_TERMINAL;
            this.i = this.symbolIndex = this.length;
        }
    };

    SymbolResult.prototype.next = function() {
        this.i++;

        if ( this.i < this.length ) {
            this.currentID = this.symbolIDs[this.i];
            return this.symbols[ this.i-1 ];
        } else if ( this.i === this.length ) {
            this.currentID = INVALID_TERMINAL;
            return this.symbols[ this.i-1 ];
        } else {
            this.currentID = INVALID_TERMINAL;
            return null;
        }
    };

    SymbolResult.prototype.back = function( increments ) {
        var i = this.i;

        if ( i > this.maxI ) {
            this.maxI = i;
        }

        this.i = (i -= increments);

        if ( i < this.symbolIndex ) {
            throw new Error("Moved back by more increments then the last finalize move location");
        } else {
            this.currentID = this.symbolIDs[i];
        }
    };

    SymbolResult.prototype.skip = function() {
        this.i++;
        this.finalizeMove();

        return this.symbols[ this.i-1 ];
    };

    SymbolResult.prototype.index = function() {
        return this.symbolIndex;
    };

    SymbolResult.prototype.idIndex = function() {
        return this.i;
    };

    SymbolResult.prototype.peekID = function() {
        if ( this.i >= this.length ) {
            return INVALID_TERMINAL;
        }

        return this.currentID;
    };

    /**
     * Given a list of terminals, and terminals to rule
     * mappings. Both of these are expected to be sparse
     * arrays, so this compressed them down.
     *
     * Note that compression is based on 'terminals'. Each
     * element in the given terminals is expected to relate
     * to each mapping in terminalsToRules.
     *
     * For example the terminal located at 'terminals[3]',
     * should also be the same terminal used in 'terminalsToRules[3]'.
     *
     * As a result, if terminalsToRules[3] is actually empty
     * (there is no mapping to any rules), then this is
     * preserved.
     *
     * The only bits that are chucked out is if 'terminals[3]'
     * is undefined, in which case all elements from 3 onwards
     * are shifted down.
     *
     * Returned is an object holding:
     *  = terminals - the compressed list of terminals
     *  = idToTerms - a sparse array of terminal ID's to terminals.
     */
    var compressTerminals = function( terminals ) {
        var termIDToTerms = [];

        /*
         * Compact the lists down to exclude any terminals
         * we didn't capture, these are terminals that
         * were created, but never used in any rules.
         *
         * But both tables _must_ be kept in sync, so only
         * delete when missing from both.
         *
         * As 'terminals' is a list of _all_ terminals,
         * then it is the complete list.
         */
        var literalTerms    = [],
            nonLiteralTerms = [];

        compressTerminalsInner( termIDToTerms, literalTerms, nonLiteralTerms, terminals );

        literalTerms.sort( function(a, b) {
            return b.literalLength - a.literalLength;
        } );

        return {
                literals    : literalTerms,
                terminals   : nonLiteralTerms,
                idToTerms   : termIDToTerms
        };
    };

    var compressTerminalsInner = function( termIDToTerms, literalTerms, nonLiteralTerms, terminals ) {
        for ( var k in terminals ) {
            if ( terminals.hasOwnProperty(k) ) {
                var term = terminals[k];

                if ( term.type === TYPE_ARRAY ) {
                    compressTerminalsInner(
                            termIDToTerms,
                            literalTerms,
                            nonLiteralTerms,
                            term.testData
                    )
                } else {
                    termIDToTerms[ term.id ] = term;

                    if ( term.isLiteral ) {
                        literalTerms.push( term )
                    } else {
                        nonLiteralTerms.push( term )
                    }
                }
            }
        }
    }

    /**
     * Used when searching for terminals to use for parsing,
     * during the compilation phase.
     */
    var addRule = function( rule, terminals, id, allRules ) {
        if ( rule instanceof Terminal ) {
            var termID = rule.id;

            if ( termID !== INVALID_TERMINAL ) {
                terminals[ termID ] = rule;
            }

            return id;
        } else {
            return rule.optimizeScan( terminals, id, allRules );
        }
    };

    /**
     * @const
     * @private
     * @type {number}
     */
    var NO_RECURSION = 0;

    /**
     * @const
     * @private
     * @type {number}
     */
    var RECURSION = 1;

    /**
     * Used to denote when no internal compileID has been set.
     *
     * As this is a positive number, a negative number is used
     * to denote when no compilation has taken place.
     *
     * @const
     * @private
     * @type {number}
     */
    var NO_COMPILE_ID = -1;

    /**
     *
     */
    /*
     * = What is 'compiledLookups' ? =
     *
     * The grammar is built into a big tree. Technically it's not, because it
     * includes recursive rules, but lets just imagine recursion isn't present.
     *
     * When symbols come in, the standard algorithm is to search all branches in
     * order until a matching set of rules are found. The problem is that this
     * includes searching on branches where there is no possibility of matching.
     *
     * For example if you had 'a = 1+1', the 'a' variable symbol will be used to
     * search the branches for while loops, if statements, function definitions,
     * class definitions, and so on. This is even though none of those could
     * possibly match.
     *
     * So to cut down on all this searching, 'compiledLookups' is a version of the
     * 'rules' which maps symbolID to rules. That way a ParserRule can jump straight
     * to the branches which match; or return if none of them match.
     *
     * This allows it to cut down on the amount of searching needed.
     */
    var ParserRule = function( parse ) {
        /**
         * A callback to call when this is done.
         */
        this.finallyFun = null;

        /**
         * States if this is compiled yet, or not.
         *
         * When null, no compilation has taken place. When not
         * null, it has.
         */
        this.compiled = null;
        this.compiledLookups = null;

        /**
         * Records how long the call to 'compile' takes to execute.
         */
        this.compileTime = 0;
        this.compiledId  = NO_COMPILE_ID;

        /**
         * The global parse instance this is working with.
         *
         * @const
         */
        this.parseParent = parse;

        /**
         * The parser rules, includes terminals.
         *
         * @const
         */
        this.rules = [];

        this.isOptional = [];

        /**
         * Choice parser rules can be built from multiple 'or' calls,
         * so we store them, and then push them onto 'rules' when they are done.
         *
         * They are stored here.
         */
        this.currentOr = null;

        /**
         * A flag to say 'or this expression' in the or list.
         * This expression is always added at the end.
         *
         * @type {boolean}
         */
        this.orThisFlag = false;

        /**
         * A flag used to denote if this is being called recursively.
         * This is used in two places:
         *  = grabbingTerminals
         *  = when parsing symbols
         *
         * This to avoid calling it recursively, as we only
         * need to visit each ParserRule once.
         */
        this.isRecursive = NO_RECURSION;

        /**
         * This flag is for when we recursively clear the recursion flag, but we
         * can't use 'isRecursive' to track cyclic routes, becasue we are
         * clearing it. So we use this one instead.
         */
        this.isClearingRecursion = false;

        /**
         * Used to count how many times we have re-entered the parseInner whilst
         * parsing.
         * 
         * However this is cleared when the number of symbol position is changed.
         * This way recursion is allowed, as we chomp symbols.
         */
        this.recursiveCount = 0;

        /**
         * A true recursive counter.
         *
         * This states how many times we are currently inside of this parser.
         * Unlike 'recursiveCount', this never lies.
         *
         * It exists so we can clear some items when we _first_ enter a rule.
         */
        this.internalCount = 0;

        this.isCyclic = false;
        this.isSeperator = false;

        this.hasBeenUsed = false;

        Object.preventExtensions( this );
    };

    ParserRule.prototype.cyclicOr = function( rules ) {
        if ( this.rules.length > 0 ) {
            throw new Error("Cyclic rules cannot have any other rules");
        }

        this.orAll( rules );
        this.endCurrentOr();

        this.isCyclic = true;

        if ( this.rules.length === 1 && this.rules[0] instanceof Array ) {
            this.rules = this.rules[0];
        } else {
            throw new Error("Internal error, cyclic rule setup has gone wrong (this is a parse.js bug)");
        }
    };

    /**
     * This is short-hand for generating a repeatSeperator, using the main Parse,
     * and adding it as a 'then' rule.
     *
     * Note that at least 1 rule must match.
     *
     * @param match The rule to be matching and collecting.
     * @param seperator The seperator between each match.
     * @return This parser rule.
     */
    ParserRule.prototype['repeatSeperator'] = function( match, seperator ) {
        return this.seperatingRule( match, seperator );
    };

    /**
     * The same as 'repeatSeperator', only matching is optional.
     *
     * @param match The rule to be matching and collecting.
     * @param seperator The seperator between each match.
     * @return This parser rule.
     */
    ParserRule.prototype['optionalSeperator'] = function( match, seperator ) {
        return this.seperatingRule( match, seperator ).
                markOptional( true );
    };

    ParserRule.prototype.seperatingRule = function( match, seperator ) {
        this.endCurrentOr();

        return this.thenSingle(
                this.parseParent().markSeperatingRule( match, seperator )
        );
    };

    ParserRule.prototype.markSeperatingRule = function( match, seperator ) {
        this.thenAll( match );
        this.thenAll( seperator );

        this.endCurrentOr();

        this.isSeperator = true;

        return this;
    };

    ParserRule.prototype.errorIfInLeftBranch = function( rule ) {
        if ( this.rules.length !== 0 ) {
            var left = this.rules[0];

            if ( left instanceof Array ) {
                for ( var i = 0; i < left.length; i++ ) {
                    var leftRule = left[i];

                    if ( leftRule === rule ) {
                        throw new Error( "First sub-rule given leads to a recursive definition (infinite loop at runtime)" );
                    } else if ( leftRule instanceof ParserRule ) {
                        leftRule.errorIfInLeftBranch( rule );
                    }
                }
            } else {
                if ( left === rule ) {
                    throw new Error( "First sub-rule given leads to a recursive definition (infinite loop at runtime)" );
                } else if ( left instanceof ParserRule ) {
                    left.errorIfInLeftBranch( rule );
                }
            }
        }
    };

    /**
     * @param ignoreSpecial Pass in true to skip the cyclic check.
     */
    ParserRule.prototype.errorIfEnded = function( ignoreSpecial ) {
        if ( this.compiled !== null ) {
            throw new Error("New rule added, but 'finally' has already been called");
        }

        if ( (this.isCyclic || this.isSeperator) && !ignoreSpecial ) {
            throw new Error("Cannot add more rules to a special ParserRule");
        }
    };

    /**
     * Parses the next items as being optional to each other.
     *
     * Multiple arguments can be given, or you can follow with more
     * 'or' options.
     */
    ParserRule.prototype['or'] = function() {
        return this.orAll( arguments );
    };

    /**
     * 'either' is _exactly_ the same as 'or'.
     *
     * It is supported to allow parser code to be easier to read.
     * For example:
     *  operator = parse().either( plus ).or( subtract );
     *
     * It reads outlod as:
     *  "operator equals parse either plus or subtract"
     *
     * Ok it's not perfect, but it's nicer then if it was:
     *  "operator equals parse or plus or subtract"
     *
     * Internally, 'either' is just set to 'or', so it is
     * _literally_ the same method, with no added overhead.
     *
     * See 'or' for usage details.
     */
    ParserRule.prototype['either'] =
            ParserRule.prototype['or'];

    /**
     * Breaks with the previous rule, to start an entirely new 'or'.
     *
     * For example if you did:
     *
     *  parse.
     *          either( foos ).
     *          thenEither( bars );
     *
     * You will have it grab any of the 'foos' rules, and then followed by any
     * of the 'bars' rules.
     *
     * 'thenOr' is an alias for 'thenEither'.
     */
    ParserRule.prototype['thenOr'] = function() {
        this.endCurrentOr();
        return this.orAll( arguments );
    };

    ParserRule.prototype['thenEither'] =
            ParserRule.prototype['thenOr'];

    /**
     * Marks the last item in the rules set as being optional, or not optional.
     *
     * Optional rules can be skipped.
     */
    ParserRule.prototype.markOptional = function( isOptional ) {
        var rulesLen = this.rules.length;

        if ( rulesLen === 0 ) {
            throw new Error("Item being marked as optional, when there are no rules.");
        }

        this.isOptional[ rulesLen-1 ] = isOptional ?
                1 :
                0 ;

        return this;
    };

    /**
     * This is an optional 'then' rule.
     *
     * Each of the values given is marked as being 'optional', and chomped if
     * a match is found, and skipped if a match fails.
     */
    ParserRule.prototype['optional'] = function() {
        return this.optionalAll( arguments );
    };

    ParserRule.prototype.optionalAll = function( obj ) {
        this.endCurrentOr();
        return this.helperAll( 'optionalSingle', obj );
    };

    ParserRule.prototype.optionalSingle = function( obj ) {
        this.thenSingle( obj );
        this.markOptional( true );
    };

    ParserRule.prototype['optionalThis'] = function() {
        return this['optional']( this );
    };

    /**
     * Same as 'either', except all values given are optional.
     * With this having no-match is acceptable.
     *
     * @return This ParserRule instance.
     */
    ParserRule.prototype['maybe'] =
            ParserRule.prototype['optional'];

    ParserRule.prototype['maybeThis'] =
            ParserRule.prototype['optionalThis'];

    ParserRule.prototype['orThis'] = function() {
        this.orAll( arguments );

        this.orThisFlag = true;

        return this;
    };

    ParserRule.prototype.endCurrentOr = function() {
        var currentOr = this.currentOr;

        if ( this.orThisFlag ) {
            if ( currentOr === null ) {
                throw new Error("infinite recursive parse rule, this given as 'or/either' condition, with no alternatives.");
            } else {
                currentOr.push( this );
            }

            this.orThisFlag = false;
        }

        if ( currentOr !== null ) {
            /*
             * If still building the left branch,
             * check if we are cyclic.
             */
            if ( this.rules.length === 0 ) {
                for ( var j = 0; j < currentOr.length; j++ ) {
                    var or = currentOr[j];

                    if ( or instanceof ParserRule ) {
                        or.errorIfInLeftBranch( this );
                    }
                }
            }

            this.rules.push( currentOr );
            this.markOptional( false );

            this.currentOr = null;
        }
    };

    ParserRule.prototype.orAll = function( obj ) {
        return this.helperAll( 'orSingle', obj );
    };

    ParserRule.prototype.orSingle = function( other ) {
        if ( this.currentOr !== null ) {
            this.currentOr.push( other );
        } else {
            this.currentOr = [ other ];
        }
    };

    ParserRule.prototype['then'] = function() {
        return this.thenAll( arguments );
    };

    ParserRule.prototype.thenAll = function( obj ) {
        this.endCurrentOr();
        return this.helperAll( 'thenSingle', obj );
    };

    ParserRule.prototype.helperAll = function( singleMethod, obj ) {
        this.errorIfEnded();

        if ( ! obj ) {
            if ( obj === undefined ) {
                throw new Error( "Undefined 'then' rule given." );
            } else {
                throw new Error( "Unknown 'then' rule given of type " + typeof(obj) );
            }
        } else if (
                obj instanceof ParserRule ||
                obj instanceof Terminal
        ) {
            this[singleMethod]( obj );
        // something that can be used as a terminal
        } else if (
                typeof obj === 'string' || obj instanceof String ||
                typeof obj === 'number' || obj instanceof Number ||
                isFunction(obj)
        ) {
            this[singleMethod]( this.parseParent['terminal']( obj ) );
        // arguments or array
        } else if ( (typeof (obj.length)) === 'number' ) {
            for ( var i = 0; i < obj.length; i++ ) {
                this.helperAll( singleMethod, obj[i] );
            }
        // ??? maybe an object of terminals?
        } else {
            for ( var k in obj ) {
                if ( obj.hasOwnProperty(k) ) {
                    this.helperAll( singleMethod, obj[k] );
                }
            }
        }

        return this;
    };

    /**
     * 'a' is _exactly_ the same as 'then'.
     *
     * It is supplied to allow code to be more readable.
     * For eample:
     *
     *  var whileLoop = parse().a( startWhile ).
     *          then( condition, statements ).
     *          onMatch( closingWhile );
     *
     * If you asked someone to read it outloud,
     * they will probably say:
     *  "while loop equals parse a start while,
     *   then condition and statements,
     *   then finally closing while"
     *
     * It's not perfect, but it's pretty close to proper
     * english, which is the point of the method.
     *
     * Internally 'a' is just set to 'then', so it is
     * _literally_ the same method, with no added overhead.
     *
     * See 'then' for usage details, since it's the same.
     */
    ParserRule.prototype['a'] = ParserRule.prototype['then'];

    ParserRule.prototype.thenSingle = function( rule ) {
        if ( rule === this && this.rules.length === 0 ) {
            throw new Error( "infinite recursive parse rule, 'this' given as 'then' parse rule." );
        } else {
            if ( this.rules.length === 0 && rule instanceof ParserRule ) {
                rule.errorIfInLeftBranch( this );
            }

            this.rules.push( rule );
            this.markOptional( false );
        }

        return this;
    };

    /**
     *
     */
    ParserRule.prototype['onMatch'] = function( callback ) {
        this.endCurrentOr();

        this.finallyFun = callback;

        return this;
    };

    /**
     * Sets up this parser to be ready for use.
     *
     * This is called automatically when the parser is first
     * used, so calling this manually is optional.
     *
     * The advantage of calling this manually is that you can
     * chose to take the 'hit' of any expense from calling it.
     *
     * You should _not_ add any more rules to this parser rule,
     * or to any of it's children, or create any new terminals
     * with 'Parse', after this has been called!
     *
     * In short, once this is called, do not build any more on
     * to this parser!
     *
     * If called multiple times, then subsequent calls are
     * ignored.
     */
    ParserRule.prototype['compile'] = function() {
        if ( this.compiled === null ) {
            var start = Date.now();
            this.compiled = this.optimize();
            this.compileTime = Date.now() - start;
        }

        return this;
    };

    var bruteScan = function( parserRule, seenRules, idsFound ) {
        if ( seenRules[parserRule.compiledId] !== true ) {
            seenRules[parserRule.compiledId] = true;

            var rules      = parserRule.rules,
                isOptional = parserRule.isOptional;

            /*
             * We are interested in all branches on the left side, up to and
             * including, the first non-optional branch.
             *
             * This is because we might have to come down here for an optional
             * term, or skip it.
             */
            var i = 0;
            do {
                var rule = rules[i];

                if ( rule instanceof Terminal ) {
                    if ( rule.id !== INVALID_TERMINAL ) {
                        idsFound[ rule.id ] = true;
                    }
                } else if ( rule instanceof Array ) {
                    for ( var j = 0; j < rule.length; j++ ) {
                        var r = rule[j];

                        if ( r instanceof Terminal ) {
                            if ( r.id !== INVALID_TERMINAL ) {
                                idsFound[ r.id ] = true;
                            }
                        } else {
                            bruteScan( r, seenRules, idsFound );
                        }
                    }
                } else {
                    bruteScan( rule, seenRules, idsFound );
                }

                i++;
            } while ( i < rules.length && isOptional[i] );
        } else {
            return;
        }
    };

    var addRuleToLookup = function( id, ruleLookup, rule ) {
        var arrLookup = ruleLookup[id];

        if ( arrLookup === undefined ) {
            ruleLookup[id] = rule;
        } else if ( arrLookup instanceof Array ) {
            arrLookup.push( rule );
        } else {
            ruleLookup[id] = [ arrLookup, rule ];
        }
    }

    var callParseDebug = function( debugCallback, symbols, compileTime, symbolTime, rulesTime, totalTime ) {
        if ( debugCallback ) {
            var times = {};

            times['compile'] = compileTime;
            times['symbols'] = symbolTime;
            times['rules']   = rulesTime ;
            times['total']   = totalTime ;

            debugCallback( symbols.getTerminals(), times );
        }
    }

    ParserRule.prototype.terminalScan = function() {
        if ( this.compiledLookups === null ) {
            var rules   = this.rules,
                len     = rules.length,
                lookups = new Array( len );

            for ( var i = 0; i < len; i++ ) {
                var rule = rules[i],
                    ruleLookup = [];

                // an 'or' rule
                if ( rule instanceof Array ) {
                    for ( var j = 0; j < rule.length; j++ ) {
                        var r = rule[j];

                        if ( r instanceof Terminal ) {
                            addRuleToLookup( r.id, ruleLookup, r );
                        } else {
                            var ids  = [],
                                seen = [];

                            bruteScan( r, seen, ids );

                            // merge this rules lookups in
                            for ( var id in ids ) {
                                addRuleToLookup( id, ruleLookup, r );
                            }
                        }
                    }
                // an 'then' rule
                } else if ( rule instanceof Terminal ) {
                    addRuleToLookup( rule.id, ruleLookup, rule );
                } else {
                    var ids  = [],
                        seen = [];

                    bruteScan( rule, seen, ids );

                    // merge this rules lookups in
                    for ( var id in ids ) {
                        addRuleToLookup( id, ruleLookup, rule );
                    }
                }

                lookups[i] = ruleLookup;
            }

            this.compiledLookups = lookups;
        }
    };

    /**
     * Where optimizations are placed.
     */
    /*
     * // TODO Implement this comment.
     *
     * If the ParserRule only contains one Terminal,
     * or one ParserRule, then it's moved up.
     *
     * This way when it comes to the actual parsing,
     * have managed to chop out a few functions calls.
     */
    ParserRule.prototype.optimize = function() {
        var terminals = new Array( this.parseParent.getNumTerminals() );

        var allRules = [];
        var len = this.optimizeScan( terminals, 0, allRules );

        for ( var i = 0; i < len; i++ ) {
            allRules[i].terminalScan();
        }

        return compressTerminals( terminals );
    };

    /**
     * Converts the rules stored in this parser into a trie
     * of rules.
     */
    ParserRule.prototype.optimizeScan = function(terminals, id, allRules) {
        if ( this.isRecursive === NO_RECURSION ) {
            if ( this.compiledId === NO_COMPILE_ID ) {
                this.compiledId = id;
                allRules[id] = this;

                id++;
            }

            this.endCurrentOr();

            this.isRecursive = RECURSION;

            var rules = this.rules,
                len = rules.length;

            if ( len === 0 ) {
                throw new Error("No rules in parserRule");
            } else if ( len > 1 && this.finallyFun === null && !this.isSeperator ) {
                throw new Error("No onMatch provided for parser rule, when there are multiple conditions");
            } else {
                for ( var i = 0; i < len; i++ ) {
                    var rule = rules[i];

                    // an 'or' rule
                    if ( rule instanceof Array ) {
                        for ( var j = 0; j < rule.length; j++ ) {
                            id = addRule( rule[j], terminals, id, allRules );
                        }
                    // an 'then' rule
                    } else {
                        id = addRule( rule, terminals, id, allRules );
                    }
                }
            }

            this.isRecursive = NO_RECURSION;
        }

        return id;
    };

    /**
     * The same as 'parse', but the string used internally is in
     * lowercase. This is useful for simplifying your parser,
     * if the syntax is case insensetive.
     *
     * The matches returned are not lower-cased, they will be taken
     * from the input given.
     *
     * The lowercase only affects the terminals, and nothing else.
     *
     * @param {string} input The text to parse.
     * @param callback A function to call when parsing is complete.
     */
    ParserRule.prototype['parseLowerCase'] = function( input, callback ) {
        this.parseInner( input, input.toLowerCase(), callback );
    };

    /**
     * The same as 'parseLowerCase', only this hands your terminals
     * upper case source instead of lower case.
     *
     * Like 'parseLowerCase', this only affects what the terminals
     * see, and doesn't not affect the values that get matched.
     *
     * @param {string} input The text to parse.
     * @param callback A function to call when parsing is complete.
     */
    ParserRule.prototype['parseUpperCase'] = function( input, callback ) {
        this.parseInner( input, input.toUpperCase(), callback );
    };

    /**
     * Compiles this rule and then parses the given input.
     *
     * This rule, or any children, should not be altered once
     * this has been compiled.
     *
     * A call needs to be provided which the result and any errors will be
     * passed into. Both of these are arrays.
     *
     * The errors is an array containing every error that has occurred, and will
     * be an empty array when there are no errors.
     *
     * The rules of this ParserRule will be applied repeatedly on every symbol
     * found. The result array given contains the results from each of these
     * runs.
     *
     * @param {string} displaySrc The text used when creating substrings, or for parsing.
     * @param {string} parseSrc optional, an alternative source code used for parsing.
     * @param callback A function to call when parsing is complete.
     * @param debugCallback An optional debugging callback, which if provided, will be called with debugging info.
     */
    ParserRule.prototype['parse'] = function( displaySrc, parseSrc, callback, debugCallback ) {
        if ( callback === undefined ) {
            callback = parseSrc;
            parseSrc = displaySrc;
        }

        this.parseInner( displaySrc, parseSrc, callback, debugCallback );
    };

    ParserRule.prototype.parseInner = function( input, parseInput, callback, debugCallback ) {
        if (
                debugCallback !== undefined &&
                debugCallback !== null &&
                !isFunction(debugCallback)
        ) {
            throw new Error("Invalid debugCallback object given");
        }

        var self  = this,
            compileTime = this.compileTime,
            start = Date.now();

        this.parseSymbols( input, parseInput, function(symbols, symbolsTime) {
            if ( symbols.hasErrors() ) {
                callback( [], symbols.getErrors() );
                callParseDebug( debugCallback, symbols,
                        compileTime,
                        symbolsTime,
                        0,
                        Date.now() - start
                );
            } else {
                var rulesStart = Date.now();
                var result     = self.parseRules( symbols, input, parseInput );
                var rulesTime  = Date.now() - rulesStart;

                window['util']['future']['run']( function() {
                    callback( result.result, result.errors );
                    callParseDebug( debugCallback, symbols,
                            compileTime,
                            symbolsTime,
                            rulesTime,
                            Date.now() - start
                    );
                } );
            }
        })
    };

    ParserRule.prototype['symbolize'] = function( input, callback ) {
        this.symbolizeInner( input, input, callback );
    };

    ParserRule.prototype['symbolizeLowerCase'] = function( input, callback ) {
        this.symbolizeInner( input, input.toLowerCase(), callback );
    };

    ParserRule.prototype['symbolizeUpperCase'] = function( input, callback ) {
        this.symbolizeInner( input, input.toUpperCase(), callback );
    };

    ParserRule.prototype.symbolizeInner = function( input, parseInput, callback ) {
        this.parseSymbols( input, parseInput, function(symbols) {
            callback( symbols.getTerminals(), symbols.getErrors() );
        });
    };

    /**
     * Does the actual high level organisation or parsing the
     * source code.
     *
     * Callbacks are used internally, so it gets spread across
     * multiple JS executions.
     */
    ParserRule.prototype.parseSymbols = function( input, parseInput, callback ) {
        if ( ! isFunction(callback) ) {
            throw new Error("No callback provided for parsing");
        }

        this.endCurrentOr();

        this['compile']();

        if ( this.hasBeenUsed ) {
            this.clearRecursionFlag();
            this.hasBeenUsed = false;
        }

        var _this = this;

        window['util']['future']['run']( function() {
            var start = Date.now();
            var symbols = _this.parseSymbolsInner(
                    input,
                    parseInput,
                    _this.parseParent.timeSymbolsFlag
            );
            var time = Date.now() - start;

            callback( symbols, time );
        } );
    };

    /**
     * Resets the internal recursion flags.
     *
     * The flags are used to ensure the parser cannot run away,
     * but can be left in a strange state between use.
     */
    ParserRule.prototype.clearRecursionFlag = function() {
        if ( ! this.isClearingRecursion ) {
            this.isClearingRecursion = true;

            this.isRecursive = NO_RECURSION;
            this.recursiveCount = 0;

            for ( var i = 0; i < this.rules.length; i++ ) {
                var rule = this.rules[i];

                if ( rule instanceof Array ) {
                    for ( var j = 0; j < rule.length; j++ ) {
                        var r = rule[j];

                        if ( r instanceof ParserRule ) {
                            r.clearRecursionFlag();
                        }
                    }
                } else if ( rule instanceof ParserRule ) {
                    rule.clearRecursionFlag();
                }
            }

            this.isClearingRecursion = false;
        }
    };

    ParserRule.prototype.parseRules = function( symbols, inputSrc, src ) {
        this.hasBeenUsed = true;

        /*
         * Iterate through all symbols found, then going
         * through the grammar rules in order.
         * We jump straight to grammar rules using the
         * 'termsToRules' lookup.
         */

        var errors   = [],
            hasError = null;

		if ( symbols.hasMore() ) {
			var onFinish = this.ruleTest( symbols, inputSrc );

            if ( onFinish !== null ) {
                symbols.finalizeMove();

                if ( ! symbols.hasMore() ) {
                    return {
                            result: onFinish(),
                            errors: errors
                    };
                } else {
                    errors.push( new TerminalError(symbols.maxSymbol()) );
                }
            } else {
                errors.push( new TerminalError(symbols.maxSymbol()) );
            }
        }

        return {
                result: null,
                errors: errors
        };
    };

    ParserRule.prototype.ruleTest = function( symbols, inputSrc ) {
        if ( this.isSeperator || this.isCyclic ) {
            var args = null;

            if ( this.isSeperator ) {
                args = this.ruleTestSeperator( symbols, inputSrc );
            } else {
                args = this.ruleTestCyclic( symbols, inputSrc );
            }

            if ( args === null ) {
                return null;
            } else {
                var finallyFun = this.finallyFun;

                if ( finallyFun === null ) {
                    return function() {
                        for ( var i = 0; i < args.length; i++ ) {
                            var arg = args[i];

                            if ( isFunction(arg) ) {
                                arg = arg();
                            } else if ( arg instanceof Symbol ) {
                                arg = arg.onFinish();
                            }

                            if ( arg === undefined ) {
                                throw new Error("onMatch result is undefined");
                            }

                            args[i] = arg;
                        }

                        return args;
                    };
                } else {
                    return function() {
                        for ( var i = 0; i < args.length; i++ ) {
                            var arg = args[i];

                            if ( isFunction(arg) ) {
                                arg = arg();
                            } else if ( arg instanceof Symbol ) {
                                arg = arg.onFinish();
                            }

                            if ( arg === undefined ) {
                                throw new Error("onMatch result is undefined");
                            }

                            args[i] = arg;
                        }

                        return finallyFun( args );
                    };
                }
            }
        } else {
            var args = this.ruleTestNormal( symbols, inputSrc );

            if ( args === null ) {
                return null;
            } else {
                var finallyFun = this.finallyFun;

                if ( finallyFun === null ) {
                    finallyFun = 0;
                }

                if ( isFunction(finallyFun) ) {
                    return function() {
                        // evaluate all args, bottom up
                        for ( var i = 0; i < args.length; i++ ) {
                            var arg = args[i];

                            if ( isFunction(arg) ) {
                                var r = arg();

                                if ( r === undefined ) {
                                    throw new Error("onMatch result is undefined");
                                } else {
                                    args[i] = r;
                                }
                            } else if ( arg instanceof Symbol ) {
                                var r = arg.onFinish();

                                if ( r === undefined ) {
                                    throw new Error("onMatch result is undefined");
                                } else {
                                    args[i] = r;
                                }
                            }
                        }

                        return finallyFun.apply( null, args );
                    };
                } else {
                    var index = finallyFun|0;

                    if ( index >= args.length ) {
                        throw Error( "onMatch index is out of bounds: " + finallyFun );
                    } else {
                        var arg = args[ finallyFun ];

                        return function() {
                            if ( isFunction(arg) ) {
                                var r = arg();

                                if ( r === undefined ) {
                                    throw new Error("onMatch result is undefined");
                                } else {
                                    return r;
                                }
                            } else if ( arg instanceof Symbol ) {
                                var r = arg.onFinish();

                                if ( r === undefined ) {
                                    throw new Error("onMatch result is undefined");
                                } else {
                                    return r;
                                }
                            } else {
                                return arg;
                            }
                        };
                    }
                }
            }
        }
    };

    ParserRule.prototype.ruleTestSeperator = function( symbols, inputSrc ) {
        var lookups  = this.compiledLookups,
            peekID   = symbols.peekID(),
            onFinish = null,
            rules    = lookups[0],
            rule     = rules[peekID];

        if ( rule === undefined ) {
            return null;
        } else {
            var symbolI = symbols.idIndex(),
                args = null;

            if ( this.isRecursive === symbolI ) {
                if ( this.recursiveCount > 2 ) {
                    return null;
                } else {
                    this.recursiveCount++;
                }
            } else {
                this.recursiveCount = 0;
                this.isRecursive = symbolI;
            }

            if ( rule instanceof ParserRule ) {
                onFinish = rule.ruleTest( symbols, inputSrc );

                if ( onFinish === null ) {
                    this.isRecursive = symbolI;
                    if ( this.recursiveCount > 0 ) {
                        this.recursiveCount--;
                    }

                    return null;
                } else {
                    args = [ onFinish ];
                }
            } else if ( rule instanceof Array ) {
                var ruleLen = rule.length;

                for ( var j = 0; j < ruleLen; j++ ) {
                    var r = rule[j];

                    if ( r instanceof ParserRule ) {
                        onFinish = r.ruleTest( symbols, inputSrc );

                        if ( onFinish !== null ) {
                            args = [ onFinish ];
                            break;
                        }
                    } else if ( r.id === peekID ) {
                        args = [ symbols.next() ];
                        break;
                    }
                }
            } else if ( rule.id === peekID ) {
                args = [ symbols.next() ];
            } else {
                if ( this.recursiveCount > 0 ) {
                    this.recursiveCount--;
                }

                return null;
            }

            var separators = lookups[1];
            while ( symbols.hasMore() ) {
                symbolI = symbols.idIndex();
                peekID  = symbols.peekID();

                var separator = separators[peekID],
                    hasSeperator = false;

                if ( separator === undefined ) {
                    break;
                } else if ( separator instanceof Array ) {
                    for ( var j = 0; j < separator.length; j++ ) {
                        var r = separator[j];

                        if (
                            r instanceof ParserRule &&
                            r.ruleTest(symbols, inputSrc) !== null
                        ) {
                            hasSeperator = true;
                            break;
                        } else if ( r.id === peekID  ) {
                            symbols.next();
                            hasSeperator = true;
                            break;
                        }
                    }
                } else if (
                        (
                                ( separator instanceof ParserRule ) &&
                                separator.ruleTest(symbols, inputSrc) !== null
                        ) || (
                                separator.id === peekID &&
                                symbols.next()
                        )
                ) {
                    hasSeperator = true;
                }

                if ( hasSeperator ) {
                    peekID = symbols.peekID();
                    rule   = rules[peekID];

                    if ( rule === undefined ) {
                        symbols.back( symbols.idIndex()-symbolI );
                        break;
                    } else if ( rule instanceof ParserRule ) {
                        onFinish = rule.ruleTest( symbols, inputSrc );

                        if ( onFinish === null ) {
                            symbols.back( symbols.idIndex()-symbolI );
                            break;
                        } else {
                            args.push( onFinish );
                        }
                    } else if ( rule instanceof Array ) {
                        var ruleLen = rule.length,
                            success = false;

                        for ( var j = 0; j < ruleLen; j++ ) {
                            var r = rule[j];

                            if ( r instanceof ParserRule ) {
                                onFinish = r.ruleTest( symbols, inputSrc );

                                if ( onFinish !== null ) {
                                    args.push( onFinish );
                                    success = true;
                                    break;
                                }
                            } else if ( r.id === peekID ) {
                                args.push( symbols.next() );
                                success = true;
                                break;
                            }
                        }

                        if ( ! success ) {
                            symbols.back( symbols.idIndex()-symbolI );
                            break;
                        }
                    } else if ( rule.id === peekID ) {
                        args.push( symbols.next() );
                    } else {
                        symbols.back( symbols.idIndex()-symbolI );
                        break;
                    }
                } else {
                    break;
                }
            }


            if ( args === null ) {
                // needs to remember it's recursive position when we leave
                this.isRecursive = symbolI;
                if ( this.recursiveCount > 0 ) {
                    this.recursiveCount--;
                }

                return null;
            } else {
                this.isRecursive = NO_RECURSION;
                return args;
            }
        }
    };

    ParserRule.prototype.ruleTestNormal = function( symbols, inputSrc ) {
        /*
         * Recursive re-entrance rules.
         *
         * We need to prevent re-entry in order to disallow accidentally
         * infinitely recursive rules. These should be allowed in grammars, but
         * cannot be allowed in this.
         *
         * However we do allow some recursion, within limits. These rules are:
         *  = If the symbol position has moved on.
         *    In short this is an indicator that the previous rules are chomping
         *    symbols, and so the last time this was called, the symbol was
         *    different to how it's being called right now.
         *  = Recursiveness is allowed to occur twice.
         *    This is to allow searching into the sub-trees, in order for
         *    recursive grammars to be allowed.
         */
        var startSymbolI = symbols.idIndex(),
            peekID = symbols.peekID();

        if ( this.internalCount === 0 ) {
            this.recursiveCount = 0;
        }

        this.internalCount++;

        if ( this.isRecursive === startSymbolI ) {
            if ( this.recursiveCount > 2 ) {
                this.internalCount--;

                return null;
            } else {
                this.recursiveCount++;
            }
        } else {
            this.recursiveCount = 0;
            this.isRecursive    = startSymbolI;
        }

        var lookups  = this.compiledLookups,
            optional = this.isOptional,
            onFinish = null,
            args     = null;

        /*
         * If somethign goes wrong, it just returns, there and then.
         *
         * If they are all allowed, including optional rules taht fail, then
         * args are returned. This is even if args is null, in which case it
         * becomes an array of 'nulls'.
         */
        for (
                var i = 0, len = lookups.length;
                i < len;
                i++
        ) {
            /*
             * Lookup used to jump straight to the rules we are interested in.
             * It also allows us to quit early, if we won't find what we are
             * after.
             */
            var rule = lookups[i][peekID];

            if ( rule === undefined ) {
                if ( optional[i] === 0 ) {
                    if ( i !== 0 ) {
                        symbols.back( symbols.idIndex()-startSymbolI );
                    }

                    // needs to remember it's recursive position when we leave
                    this.isRecursive = startSymbolI;
                    if ( this.recursiveCount > 0 ) {
                        this.recursiveCount--;
                    }

                    args = null;
                    break;
                } else {
                    if ( args === null ) {
                        args = [ null ];
                        this.isRecursive = NO_RECURSION;
                    } else {
                        args.push( null );
                    }
                }
            } else {
                // 'or' rules
                if ( rule instanceof Array ) {
                    var ruleLen = rule.length;

                    for ( var j = 0; j < ruleLen; j++ ) {
                        var r = rule[j];

                        if ( r instanceof ParserRule ) {
                            onFinish = r.ruleTest( symbols, inputSrc );

                            if ( onFinish !== null ) {
                                break;
                            }
                        } else if ( r.id === peekID ) {
                            onFinish = symbols.next();
                            break;
                        }
                    }
                // 'then' rules
                } else if ( rule instanceof ParserRule ) {
                    onFinish = rule.ruleTest( symbols, inputSrc );
                // terminal rule
                } else if ( peekID === rule.id ) {
                    onFinish = symbols.next();
                }

                // it is only the first iteration where recursiveness is not allowed,
                // so we always turn it off
                if ( onFinish === null && optional[i] === 0 ) {
                    symbols.back( symbols.idIndex()-startSymbolI );

                    // needs to remember it's recursive position when we leave
                    this.isRecursive = startSymbolI;

                    args = null;
                    break;
                } else {
                    if ( args === null ) {
                        args = [ onFinish ];
                        this.isRecursive = NO_RECURSION;
                    } else {
                        args.push( onFinish );
                    }

                    onFinish = null;
                    peekID = symbols.peekID();
                }
            }
        }

        if ( this.recursiveCount > 0 ) {
            this.recursiveCount--;
        }

        this.internalCount--;
        return args;
    };

    ParserRule.prototype.ruleTestCyclic = function( symbols, inputSrc ) {
        var args = null,
            lookups = this.compiledLookups,
            len = lookups.length,
            onFinish = null;

        while ( symbols.hasMore() ) {
            for ( var i = 0; i < len; i++ ) {
                var peekID = symbols.peekID(),
                    rule = lookups[i][peekID];

                if ( rule === undefined ) {
                    return args;
                } else {
                    if ( rule instanceof ParserRule ) {
                        onFinish = rule.ruleTest( symbols, inputSrc );
                    } else if ( rule instanceof Array ) {
                        for ( var j = 0; j < rule.length; j++ ) {
                            var r = rule[j];

                            if ( r instanceof ParserRule ) {
                                onFinish = r.ruleTest( symbols, inputSrc );
                                break;
                            } else if ( r.id === peekID ) {
                                onFinish = symbols.next();
                                break;
                            }
                        }
                    } else if ( rule.id === peekID ) {
                        onFinish = symbols.next();
                    }

                    if ( onFinish !== null ) {
                        break;
                    }
                }
            }

            if ( onFinish !== null ) {
                if ( args === null ) {
                    args = [ onFinish ];
                } else {
                    args.push( onFinish );
                }

                onFinish = null;
            } else {
                break;
            }
        }

        return args;
    };

    /**
     * Note that the number of symbols, strings, and indexes
     * returned may be larger then the length stated.
     *
     * This is because the arrays are created at larger sizes
     * then normal, as a speed optimization. This is except
     * for 'errors' and 'strings'.
     *
     * Errors is a list of all error matches.
     *
     * Strings contains each string, in order for each
     * terminal which stated to grab a match. If the terminal
     * did not state to grab a match, then nothing is stored.
     *
     * // todo should symbols store terminals instead of ids?
     *
     * Returned is an object containing:
     *   errors: all errors received during the parse
     *
     *   length: the number of symbols found
     *  symbols: the id of each symbol found
     *  indexes: index of each match in the src input
     *
     *  strings: a substrings for each symbol, where the terminal stated to return a string
     */
    ParserRule.prototype.parseSymbolsInner = function( inputSrc, src ) {
        var symbolI     = 0,

            len         = src.length,

            symbols     = [],
            symbolIDs   = [],

            ignores     = this.parseParent.getIgnores(),
            literals    = this.compiled.literals,
            terminals   = this.compiled.terminals,

            allTerms    = ignores.concat( literals, terminals ),

            ignoresLen  = ignores.length,
            literalsLen = ignoresLen + literals.length,
            termsLen    = literalsLen + terminals.length,

            ignoresTests = new Array( ignoresLen ),
            literalsData = new Array( literalsLen ),
            literalsType = new Array( literalsLen ),
            termTests    = new Array( termsLen ),

            symbolIDToTerms = this.compiled.idToTerms,

            postMatches = new Array( termsLen ),

            termTests   = new Array( termsLen ),
            termIDs     = new Array( termsLen ),
            multipleIgnores = ( ignores.length > 1 ),

            /**
             * An invalid index in the string, used to denote
             * no error.
             *
             * @const
             * @private
             */
            NO_ERROR = -1,
            errorStart = NO_ERROR,
            errors = [];

        /*
         * Move the test, id and returnMathFlag so they are on
         * their own.
         *
         * Tests get stored in a conventional array.
         *
         * ID is stored in a type array (if available), and
         * the return flag is stored by shifting the id 16
         * places to the left when it is set.
         */
        for ( var i = 0; i < allTerms.length; i++ ) {
            var term = allTerms[i],
                test = term.testData;

            if ( i < ignoresLen ) {
                ignoresTests[i] = test;
            } else if ( i < literalsLen ) {
                literalsData[i] = term.testData;
                literalsType[i] = term.type;
            } else {
                termTests[i] = test;
            }

            var mostUpper = term.getParentTerm();
            if ( mostUpper !== term ) {
                allTerms[i] = mostUpper;
            }

            postMatches[i] = mostUpper.postMatch;
            termIDs[i]     = mostUpper.id;
        }

        if ( terminals.length === 0 ) {
            throw new Error("No terminals provided");
        } else {
            var i = 0;

            scan:
            while ( i < len ) {
                var code = src.charCodeAt( i );

                /*
                 * All terminals are put in one array,
                 * with the ignores at the beginning,
                 * and the non-ignores taking up the second
                 * half.
                 *
                 * We iterate through, checking all ignores
                 * first, then automatically moving onto
                 * non ignores after.
                 *
                 * If anything is found, we jump back to
                 * the beginning (through 'j = 0'), so we
                 * check the ignores before _every_ symbol.
                 *
                 * This includes if we find an ignore,
                 * since ignore terminals might go in the
                 * order: 'whitespace', 'comment',
                 * 'whitespace', 'comment', etc.
                 */

                var j = 0;
                var r;

                /*
                 * Test the 'ignores', i.e. whitespace.
                 */
                
                while ( j < ignoresLen ) {
                    r = ignoresTests[j]( src, i, code, len );

                    if ( r !== undefined && r !== false && r > i ) {
                        code = src.charCodeAt( r );

                        var postMatchEvent = postMatches[j];
                        if ( postMatchEvent !== null ) {
                            var r2 = postMatchEvent( src, r, code, len );

                            if ( r2 !== undefined && r2 > r ) {
                                i = r2;
                                code = src.charCodeAt( r2 );
                            } else {
                                i = r;
                            }
                        } else {
                            i = r;
                        }

                        if ( multipleIgnores ) {
                            j = 0;
                        }
                    } else {
                        j++;
                    }
                }

                /*
                 * Test 'literals', i.e. keywords like 'if'
                 */

                r = 0;
                scan_literals:
                while ( j < literalsLen ) {
                    var type  = literalsType[j],
                        match = literalsData[j];

                    /*
                     * A string,
                     * but it is actually an array of code characters.
                     */
                    if ( type === TYPE_STRING ) {
                        var testLen = match.length;

                        for ( var testI = 0; testI < testLen; testI++ ) {
                            if ( src.charCodeAt(i+testI) !== match[testI] ) {
                                j++;
                                continue scan_literals;
                            }
                        }

                        if ( ! isWordCharAt(src, i+testI) ) {
                            r = i+testI;
                        } else {
                            j++;
                            continue scan_literals;
                        }

                    /*
                     * Non-alphanumeric codes, such as '+'.
                     */
                    } else if ( type === TYPE_CODE ) {
                        if ( code === match ) {
                            r = i+1;
                        } else {
                            j++;
                            continue scan_literals;
                        }
                        
                    /*
                     * Single alpha-numeric codes, such as 'a' or 'b'.
                     *
                     * I expect it is unpopular, which is why it is last.
                     */
                    } else if ( type === TYPE_WORD_CODE ) {
                        if ( code === match && !isWordCode(src.charCodeAt(i+1)) ) {
                            r = i+1;
                        } else {
                            j++;
                            continue scan_literals;
                        }
                    } 

                    if ( r > i ) {
                        symbolIDs[symbolI] = termIDs[j];
                        symbols[ symbolI++ ] = new Symbol( allTerms[j], i, null );

                        // If we were in error mode,
                        // report the error section.
                        //
                        // This is from the last terminal,
                        // to this one, but ignores whitespace.
                        if ( errorStart !== NO_ERROR ) {
                            errors.push( new SymbolError(
                                    errorStart,
                                    inputSrc.substring( errorStart, i )
                            ) );

                            errorStart = NO_ERROR;
                        }

                        var postMatchEvent = postMatches[j];
                        if ( postMatchEvent !== null ) {
                            code = src.charCodeAt( r );

                            var r2 = postMatchEvent( src, r, code, len );

                            if ( r2 !== undefined && r2 > r ) {
                                i = r2;
                            } else {
                                i = r;
                            }
                        } else {
                            i = r;
                        }

                        continue scan;
                    }

                    j++;
                }

                /*
                 * Test 'non-literals', i.e. variable.
                 */

                while ( j < termsLen ) {
                    r = termTests[j]( src, i, code, len );

                    if ( r !== undefined && r !== false && r > i ) {
                        symbolIDs[symbolI] = termIDs[j];

                        symbols[ symbolI++ ] = new Symbol(
                                allTerms[j],
                                i,
                                inputSrc.substring( i, r )
                        );

                        // If we were in error mode,
                        // report the error section.
                        //
                        // This is from the last terminal,
                        // to this one, but ignores whitespace.
                        if ( errorStart !== NO_ERROR ) {
                            errors.push( new SymbolError(
                                    errorStart,
                                    inputSrc.substring( errorStart, i )
                            ) );

                            errorStart = NO_ERROR;
                        }

                        var postMatchEvent = postMatches[j];
                        if ( postMatchEvent !== null ) {
                            code = src.charCodeAt( r );

                            var r2 = postMatchEvent( src, r, code, len );

                            if ( r2 !== undefined && r2 > r ) {
                                i = r2;
                            } else {
                                i = r;
                            }
                        } else {
                            i = r;
                        }

                        continue scan;
                    }

                    j++;
                }

                /*
                 * Deal with failure.
                 */

                errorStart = i;
                i++;
            }

            if ( errorStart !== NO_ERROR && errorStart < len ) {
                errors.push( new SymbolError(
                        errorStart,
                        inputSrc.substring( errorStart, i )
                ) );
            }

            return new SymbolResult(
                    errors,

                    symbols,
                    symbolIDs,

                    symbolI
            );
        }
    };

    /*  **  **  **  **  **  **  **  **  **  **  **  **  **
     *
     *          Parse
     *
     * This is the core Parse section, which is the API people
     * actually see.
     *
     * This includes the hidden ParseFactory, which builds
     * Parse instances (and allows them to be used
     * constructors).
     *
     * That is where Parse is defined, and built.
     *
     *  **  **  **  **  **  **  **  **  **  **  **  **  */

    /**
     * The point of the ParseFactory,
     * is that it allows Parse to create new Parse objects
     * within it's constructor.
     *
     * Parse can recursively build Parse.
     *
     * This is to support the ability to have multiple
     * versions of parse simultanously.
     *
     * @private
     */
    /*
     * This is to ensure the Parse 'instances' are always
     * callable functions, and not Objects.
     */
    var ParseFactory = function() {
        /**
         * Both a constructor for creating new Parse's,
         * but also a callable object for building ParserRules.
         *
         * @param a The first parameter, optional (that's about as specific as it gets for a one liner).
         * @return A new Parse instance if used as a constructor, otherwise a ParserRule.
         */
        var Parse = function( a ) {
            /*
             * Detect if this is being called as a constructor.
             *
             * The first condition checks if the setup process has been
             * completed, which it hasn't, if this.hasConstructor is false.
             *
             * The second ensures that 'this' instance is a Parse object, which
             * is true if this is being used as a constructor.
             *
             * Don't worry if your brain hurts, mine does too.
             */
            if (
                    this &&
                    this.hasConstructed !== true &&
                    this instanceof Parse
            ) {
                return ParseFactory();
            } else {
                if ( arguments.length === 0 ) {
                    return new ParserRule( Parse );
                } else {
                    var rule = new ParserRule( Parse );

                    for ( var i = 0; i < arguments.length; i++ ) {
                        rule.thenAll( arguments[i] );
                    }

                    return rule;
                }
            }
        };

        /**
         * A counting id used for easily and uniquely
         * identifying terminals.
         *
         * It's used over a hash code so we can place the
         * terminals inside of an array later.
         *
         * @type {number}
         */
        Parse.terminalID = INVALID_TERMINAL+1;

        /**
         * This is a flag to state that this instance of Parse
         * has been built.
         *
         * The issue is that I don't know if the constructor
         * is called as a constructor or not with the 'this
         * instanceof Parse' check.
         *
         * Calls such as: Parse.call( parseObj ) would return
         * true, since it's called in the context of a Parse
         * object.
         *
         * However as this flag is only set to true _after_
         * the constructor has completed, I know that if it's
         * true in the constructor, then the constructor is
         * bogus.
         *
         * @type {boolean}
         */
        Parse.hasConstructed = true;

        /**
         * An array of Terminals to ignore.
         *
         * These are tested before the main terminals.
         */
        Parse.ignores = [];

        /**
         * @return {number} The number of terminals created with this Parse.
         */
        Parse.getNumTerminals = function() {
            return this.terminalID;
        };

        Parse['or'] = function() {
            return this.call( this ).orAll( arguments );
        };

        Parse['either'] =
                Parse['or'];

        Parse['then'] = function() {
            return this.apply( this, arguments );
        };

        Parse['a'] =
                Parse['then'];

        Parse['optional'] = function() {
            return this.call( this ).optionalAll( arguments );
        };

        Parse['maybe'] =
                Parse['optional'];

        /**
         * Sets to always ignore the terminal given.
         *
         * For example to always ignore spaces:
         *  parse.ignore( ' ' )
         * 
         * You can also just use one of the provided terminals,
         * for example:
         * 
         *  Parse.ignore( Parse.WHITESPACE );
         * 
         * Multiple parameters can also be provided, for example:
         * 
         *  Parse.ignore( ' ', '\n', ';', '\t', '\r' );
         * 
         * @param terminal The terminal to always be ignoring.
         * @return This Parse object, for method chaining.
         */
        Parse['ignore'] = function() {
            for ( var i = 0; i < arguments.length; i++ ) {
                Parse.ignoreSingle( arguments[i] );
            }

            return this;
        };

        Parse.ignoreSingle = function( terminal ) {
            if ( terminal instanceof String || isFunction(terminal) ) {
                Parse.ignoreSingle( Parse['terminal'](terminal) );
            } else if ( terminal instanceof Terminal ) {
                Parse.ingoreInner( terminal );
            } else if ( terminal instanceof Array ) {
                for ( var i = 0; i < terminal.length; i++ ) {
                    Parse.ignoreSingle( Parse.terminalsInner(terminal[i], null) );
                }
            } else if ( terminal instanceof Object ) {
                for ( var k in terminal ) {
                    if ( terminal.hasOwnProperty(k) ) {
                        Parse.ignoreSingle( Parse.terminalsInner(terminal[k], k) );
                    }
                }
            } else {
                throw new Error("unknown ignore terminal given");
            }
        };

        /**
         * @return A list of all ignores set to be used.
         */
        Parse.getIgnores = function() {
            return this.ignores;
        };

        Parse.ingoreInner = function( t ) {
            this.ignores.push( t );
        };

        /**
         * If an object that contains matches is given, then
         * each one is turned into a terminal, and a new
         * object containing them is returned.
         *
         * Otherwise if the item is an array, or one match,
         * this is turned into a terminal, and returned.
         *
         * This also works recursively, so arrays of arrays of
         * matches is turned into terminals.
         */
        Parse['terminals'] = function( obj ) {
            return Parse.terminalsInner( obj, null );
        };

        Parse.terminalsInner = function( obj, termName ) {
            if ( obj instanceof Object && !isFunction(obj) && !(obj instanceof Array) ) {
                var terminals = {};

                for ( var name in obj ) {
                    if ( obj.hasOwnProperty(name) ) {
                        terminals[name] = Parse.terminalsInner( obj[name], name );
                    }
                }

                return terminals;
            } else if ( termName !== null ) {
                return Parse['terminal']( obj, formatTerminalName(termName) );
            } else {
                return Parse['terminal']( obj );
            }
        }

        /**
         * Turns the given item into a single terminal.
         *
         * @param match The item used for this terminal to match against.
         * @param termName Optional, a name for this terminal, for error reporting.
         */
        Parse['terminal'] = function( match, termName ) {
            if ( match instanceof Terminal ) {
                return match;
            } else {
                return new Terminal( match, termName ).setID( this.terminalID++ );
            }
        };

        Parse['a'] = function() {
            return Parse.apply( null, arguments );
        };

        /**
         * Used for creating a special ParserRule, which cannot be altered,
         * that creates a list of rules.
         *
         * These rules are seperated by the seperator given. For example for
         * parameters:
         *  parse.repeatSeperator( variable, comma )
         *
         * and that will match:
         *  variable
         *  variable comma variable
         *  variable comma variable comma variable
         *
         * Note how the comma is always between each variable. It won't match
         * commas on the outside.
         */
        Parse['repeatSeperator'] = function( match, seperator ) {
            return new ParserRule( this )['repeatSeperator']( match, seperator );
        };

        Parse['optionalSeperator'] = function( match, seperator ) {
            return new ParserRule( this )['optionalSeperator']( match, seperator );
        };

        /**
         * A special, one-off ParserRule. This will run the statements given
         * repeatedly, until none of them match.
         *
         * This allows certain recursive rules to be built trivially.
         *
         * It's onMatch is called multiple times, allowing you to build up
         */
        Parse['repeatEither'] = function() {
            var rule = new ParserRule( this );

            rule.cyclicOr( arguments );

            return rule;
        };

        /**
         * Code checking utility functions.
         * 
         * Each of these functions must be given the 'charCodeAt' value,
         * from a string, to check. Hence why they are listed under 'code'.
         */
        Parse['code'] = {
                'isNumeric'         : isNumericCode,
                'isHex'             : isHexCode,
                'isAlpha'           : isAlphaCode,
                'isAlphaNumeric'    : isAlphaNumericCode
        };

        /*
         * These are the terminals provided by Parse,
         * which people can use to quickly build a language.
         */

        /**
         * A terminal for capturing tabs and spaces. It does _not_ include
         * end of lines.
         * 
         * For the end of line version, use Parse.WHITESPACE_AND_END_OF_LINE
         */
        Parse['terminal']['WHITESPACE'] = function(src, i, code, len) {
            while ( code === SPACE || code === TAB ) {
                i++;
                code = src.charCodeAt( i );
            }

            return i;
        };

        /**
         * A terminal that matches: tabs, spaces, \n and \r characters.
         */
        Parse['terminal']['WHITESPACE_AND_END_OF_LINE'] = function(src, i, code, len) {
            while ( code === SPACE || code === TAB || code === SLASH_N || code === SLASH_R ) {
                i++;
                code = src.charCodeAt( i );
            }

            return i;
        };
        
        /**
         * A number terminal.
         */
        Parse['terminal']['NUMBER'] = function(src, i, code, len) {
            if ( code < ZERO || code > NINE ) {
                return;
            // 0x hex number
            } else if (
                    code === ZERO &&
                    src.charCodeAt(i+1) === LOWER_X
            ) {
                i += 1;

                do {
                    i++;
                    code = src.charCodeAt( i );
                } while (
                        code === UNDERSCORE ||
                        isHexCode( code )
                )
            // normal number
            } else {
                var start = i;
                do {
                    i++;
                    code = src.charCodeAt( i );
                } while (
                        code === UNDERSCORE ||
                        ( code >= ZERO && code <= NINE )
                )

                // Look for Decimal Number
                if (
                        src.charCodeAt(i) === FULL_STOP &&
                        isNumericCode( src.charCodeAt(i+1) )
                ) {
                    var code;
                    i++;

                    do {
                        i++;
                        code = src.charCodeAt(i);
                    } while (
                            code === UNDERSCORE ||
                            ( code >= ZERO && code <= NINE )
                    )
                }
            }

            return i;
        };

        /**
         * A C-style single line comment terminal.
         * 
         * Matches everything from a // onwards.
         */
        Parse['terminal']['C_SINGLE_LINE_COMMENT'] = function(src, i, code, len) {
            if ( code === SLASH && src.charCodeAt(i+1) === SLASH ) {
                i++;

                do {
                    i++;
                    code = src.charCodeAt(i);
                } while (
                        i  <  len  &&
                        code !== SLASH_N
                );

                return i;
            }
        };

        /**
         * A C-like multi line comment, matches everything from '/ *' to a '* /', (without the spaces).
         */
        Parse['terminal']['C_MULTI_LINE_COMMENT'] = function(src, i, code, len) {
            if ( code === SLASH && src.charCodeAt(i+1) === STAR ) {
                // this is so we end up skipping two characters,
                // the / and the *, before we hit the next char to check
                i++;

                do {
                    i++;

                    // error!
                    if ( i >= len ) {
                        return;
                    }
                } while ( ! (
                        src.charCodeAt(i  ) === STAR &&
                        src.charCodeAt(i+1) === SLASH
                ) );

                // plus 2 to include the end of the comment
                return i+2;
            }
        };

        /**
         * A terminal for a string, double or single quoted.
         */
        Parse['terminal']['STRING'] = function(src, i, code, len) {
            var start = i;

            // double quote string
            if ( code === DOUBLE_QUOTE ) {
                do {
                    i++;

                    // error!
                    if ( i >= len ) {
                        return;
                    }
                } while ( ! (
                        src.charCodeAt(i  ) === DOUBLE_QUOTE &&
                        src.charCodeAt(i-1) !== BACKSLASH
                ) )

                return i+1;
            // single quote string
            } else if ( code === SINGLE_QUOTE ) {
                do {
                    i++;

                    // error!
                    if ( i >= len ) {
                        return;
                    }
                } while ( ! (
                        src.charCodeAt(i  ) === SINGLE_QUOTE &&
                        src.charCodeAt(i-1) !== BACKSLASH
                ) )

                return i+1;
            }
        };

        Object.preventExtensions( Parse );

        return Parse;
    };

    return ParseFactory();
} )(window);
"use strict";

var util = window['util'] = {};

(function(Date) {
    if ( Date['now'] === undefined ) {
        Date['now'] = function() {
            return (new Date()).getTime();
        }
    }
})(window['Date']);

(function(Object) {
    if ( Object['preventExtensions'] === undefined ) {
        /**
         * AFAIK Object.preventExtensions cannot be faked,
         * so we just add an empty stub,
         * so we can still call it where it's not supported.
         *
         * Personally I don't really care if it's not always
         * supported, as long as it works when I am developing.
         */
        Object['preventExtensions'] = function() { /* do nothing */ }
    }
})(window['Object']);

(function( util ) {
    var calculateName = function() {
        if ( navigator.appName === 'Opera' ) {
            return 'opera';
        } else if ( navigator.appName === 'Microsoft Internet Explorer' ) {
            return 'ie';
        } else {
            var agent = navigator.userAgent.toString();

            if ( agent.indexOf("Chrome/") != -1 ) {
                return 'chrome';
            } else if ( agent.indexOf("Safari/") != -1 ) {
                return 'safari';
            } else if ( navigator.appName === 'Netscape' ) {
                return 'mozilla';
            } else {
                return 'unknown';
            }
        }
    };

    var browserName = calculateName();

    util.klass = function( init ) {
        var proto = init.prototype;

        for ( var i = 1; i < arguments.length; i++ ) {
            var funs = arguments[i];

            if ( funs === undefined ) {
                throw new Error("undefined function info given");
            }

            if ( typeof funs === 'function' || funs instanceof Function ) {
                funs = funs.prototype;
            }

            for ( var k in funs ) {
                if ( funs.hasOwnProperty(k) ) {
                    proto[k] = funs[k];
                }
            }
        }

        return init;
    }

    util.browser = {
            isIE      : browserName === 'ie'     ,
            isMozilla : browserName === 'mozilla',
            isChrome  : browserName === 'chrome' ,
            isOpera   : browserName === 'opera'  ,
            isSafari  : browserName === 'safari'
    };

    /**
     * Creates a new JS object, copies all the properties across from source
     * to the clone, and then returns the object.
     *
     * Note that the type of the object will be different.
     */
    util.clone = function( source ) {
        if ( source ) {
            if ( source instanceof Array ) {
                return source.splice(0);
            } else {
                var ClonePrototype = function() {};
                ClonePrototype.prototype = source;

                var copy = new ClonePrototype();

                // copy all attributes across,
                // but skip prototype items
                for ( var k in source ) {
                    if ( source.hasOwnProperty(k) ) {
                        copy[k] = source[k];
                    }
                }

                return copy;
            }
        } else {
            return source;
        }
    };

    util.array = {
        /**
         * Given the 'arguments' variable, this will convert it to a proper
         * JavaScript Array and return it.
         *
         * @param args An 'arguments' object to convert.
         * @param offset Optional, defaults to 0. Where in the array to start iteration.
         * @return An array containing all the values in the given 'arguments'.
         */
        /* Online blogs advise Array.slice, but most arguments are short (less then
         * 10 elements) and in those situations a brute force approach is actually
         * much faster!
         */
        argumentsToArray: function( args, i ) {
            var len, arr;

            // iterating from the start to the end
            if ( i === undefined || i === 0 ) {
                len = args.length;
                arr = new Array( len );

                for ( ; i < len; i++ ) {
                    arr[i] = args[i];
                }
            // offset is past the end of the arguments array
            } else if ( i >= args.length ) {
                return [];
            } else {
                len = args.length - i;
                arr = new Array( len );

                for ( var j = 0; j < len; j++ ) {
                    arr[j] = args[j+i];
                }
            }

            return arr;
        },

        contains: function (arr, val) {
            return (arr[val] ? true : false);
        },

        randomSort: function (arr) {
            arr.sort(function () {
                return (Math.round(Math.random()) - 0.5);
            });
        },

        remove: function (arr, arrayIndex) {
            arr.splice(arrayIndex, 1);
        },

        addAll: function( dest, src ) {
            var destI = dest.length;
            var newLen = (dest.length += src.length);
            var srcI = 0;
            
            for ( ; destI < newLen; destI++ ) {
                dest[destI] = src[srcI++];
            }
        }
    };

    util.string = {
        trim : function(str) {
            str = str.replace( /^\s\s*/, '' );
            var ws = /\s/;
            var i = str.length;

            while (ws.test(str.charAt(--i))) { }
            return str.slice(0, i + 1);
        },

        /**
         * If given a string, then a new string with the first letter capitalized is returned.
         *
         * Otherwise whatever was given is returned, with no error reported.
         */
        capitalize : function(str) {
            if ( typeof(str) == 'string' && str.length > 0 ) {
                // capitalize the first letter
                return str.charAt(0).toUpperCase() + str.slice(1);
            } else {
                return str;
            }
        }
    };

    util.future = {
        DEFAULT_INTERVAL: 10,
        isRunning: false,
        funs: [],

        addFuns: function( fs ) {
            for ( var i = 0; i < fs.length; i++ ) {
                util.future.runFun( fs[i] );
            }
        },

        run: function() {
            util.future.addFuns( arguments );

            if ( ! util.future.isRunning ) {
                util.future.once( util.future.next );
            }
        },

        runFun: function( f ) {
            util.future.ensureFun( f );

            if ( util.future.isRunning ) {
                util.future.funs.unshift( f );
            } else {
                util.future.funs.push( f );
            }
        },

        map: function( values, f ) {
            util.future.ensureFun( f );

            var fs = [];
            // this is to ensure all values are in their own unique scope
            var addFun = function( value, f, fs ) {
                fs.push( function() {
                    f( value );
                } );
            };

            for (var i = 0; i < values.length; i++) {
                addFun( values[i], f, fs );
            }

            util.future.addFuns( fs );
            util.future.run();
        },

        next: function() {
            if ( util.future.funs.length > 0 ) {
                if ( util.future.isRunning === false ) {
                    util.future.isRunning = true;

                    var fun = util.future.funs.shift();

                    util.future.once(
                            function() {
                                fun();
                                util.future.isRunning = false;

                                util.future.next();
                            }
                    );
                }
            } else {
                util.future.isRunning = false;
            }
        },

        ensureFun: function(f) {
            if ( ! (f instanceof Function) ) {
                throw new Error("Function expected.");
            }
        },

        interval: function( callback, element ) {
            var requestAnimFrame = util.future.getRequestAnimationFrame();

            if ( requestAnimFrame !== null ) {
                var isRunningHolder = {isRunning: true};

                var recursiveCallback = function() {
                    if ( isRunningHolder.isRunning ) {
                        callback();
                        requestAnimFrame( recursiveCallback, element );
                    }
                }

                requestAnimFrame( recursiveCallback, element );

                return isRunningHolder;
            } else {
                return setInterval( callback, util.future.DEFAULT_INTERVAL );
            }
        },

        clearInterval: function( tag ) {
            if ( tag.isRunning ) {
                tag.isRunning = false;
            } else {
                clearInterval( tag );
            }
        },

        getRequestAnimationFrame : function() {
            return  window.requestAnimationFrame       ||
                    window.webkitRequestAnimationFrame ||
                    window.mozRequestAnimationFrame    ||
                    window.oRequestAnimationFrame      ||
                    window.msRequestAnimationFrame     ||
                    null ;
        },

        once: function() {
            var request = util.future.getRequestAnimationFrame();

            for ( var i = 0, len = arguments.length; i < len; i++ ) {
                var fun = arguments[i];

                if ( request !== null ) {
                    request( fun );
                } else {
                    setTimeout( fun, util.future.DEFAULT_INTERVAL );
                }
            }
        }
    };

    util.ajax = {
            post: function(url, callback, data, isBlocking, timestamp) {
                return util.ajax.call(
                        'POST',
                        url,
                        callback,
                        data,
                        isBlocking,
                        timestamp
                );
            },

            get: function(url, callback, data, isBlocking, timestamp) {
                return util.ajax.call(
                        'GET',
                        url,
                        callback,
                        data,
                        isBlocking,
                        timestamp
                );
            },

            call: function(method, url, callback, passData, async, timestamp) {
                method = method.toLowerCase();

                var ajaxObj = window.XMLHttpRequest ? new window.XMLHttpRequest              :
                        ActiveXObject         ? new ActiveXObject("Microsoft.XMLHTTP") :
                        null ;

                if ( ! ajaxObj ) {
                    return null;
                } else {
                    ajaxObj.onreadystatechange = function() {
                        if ( ajaxObj.readyState == 4 ) {
                            callback(
                                    ajaxObj.responseText,
                                    ajaxObj.status,
                                    ajaxObj.responseXML
                            );
                        }
                    }

                    if ( method === 'post' ) {
                        if ( timestamp ) {
                            url += '?timestamp=' + Date.now();
                        }

                        ajaxObj.open( "POST", url, async );
                        ajaxObj.setRequestHeader( "Content-type", "application/x-www-form-urlencoded" );
                        ajaxObj.setRequestHeader( "Content-Length", passData.length );
                        ajaxObj.send(passData);
                    } else if ( method === 'get' ) {
                        url += '?' + passData;

                        if ( timestamp ) {
                            url += '&timestamp=' + Date.now();
                        }

                        ajaxObj.open( "GET", url, async );
                        ajaxObj.send( null );
                    } else {
                        throw new Error( "unknown method given, should be 'get' or 'post'" );
                    }

                    return ajaxObj;
                }
            }
    };
})( util );
"use strict";
var quby = window['quby'] || {};

(function( quby, util ) {
    /**
     * AST
     *
     * Objects for defining the abstract syntax tree are defined
     * here. A new function is here for representing every aspect
     * of the possible source code that can be parsed.
     */
    /*
     * Functions, classes, variables and other items in Quby have both a 'name'
     * and a 'callName'. This describes some of their differences.
     *
     * = Names =
     * These are for display purposes. However names should be be considered to
     * be unique, and so entirely different names can refer to the same thing.
     *
     * For example 'object' and 'Object' are different names but can potentially
     * refer to the same thing. However what they refer to also depends on context,
     * for example one might be a function called object and the other might be
     * the Object class. In that context they refer to entirely different things.
     *
     * In short, Names are used for displaying information and should never be
     * used for comparison.
     *
     * = CallNames =
     * callNames however are unique. They are always in lower case, include no
     * spaces and include their context in their formatting. This means it is
     * safe to directly compare callNames (i.e. 'callName1 == callName2').
     * It is also safe to use them in defining JSON object properties.
     *
     * The format functions in quby.runtime should be used for creating callNames
     * from names. They are also designed to ensure that a callName of one context
     * cannot refer to a callName of a different context.
     *
     * This is achieved by appending context unique identifiers to the beginning
     * of the callName stating it's context (function, variable, class, etc).
     *
     * They are 'context unique' because one context prefix does not clash with
     * another contexts prefix.
     */
    var qubyAst = quby.ast = {};

    /**
     * There are times when it's much easier to just pass
     * an empty, silently-do-nothing, object into out
     * abstract syntax tree.
     *
     * That is what this is for, it will silently do nothing
     * on both validate and print.
     *
     * Do not extend this! Extend the Syntax one instead.
     */
    var EmptyStub = util.klass(
            function( offset ) {
                this.offst = offset;
            },
            {
                validate: function(v) {},
                print   : function(p) {}
            }
    );

    /*
     * These functions do the actual modifications to the class.
     * They alter the class structure, inserting new nodes to add more functionality.
     *
     * They are run as methods of the FunctionGenerator prototype.
     *
     * Add more here to have more class modifiers.
     */
    var functionGeneratorFactories = {
        // prefix hard coded into these functions
        get: function( v, fun, param ) {
            return new qubyAst.FunctionReadGenerator( fun, 'get', param );
        },
        set: function( v, fun, param ) {
            return new qubyAst.FunctionWriteGenerator( fun, 'set', param );
        },
        getset: function( v, fun, param ) {
            return new qubyAst.FunctionReadWriteGenerator( fun, 'get', 'set', param );
        },

        read: function( v, fun, param ) {
            return new qubyAst.FunctionReadGenerator( fun, '', param );
        },
        write: function( v, fun, param ) {
            return new qubyAst.FunctionWriteGenerator( fun, '', param );
        },
        attr: function( v, fun, param ) {
            return new qubyAst.FunctionReadWriteGenerator( fun, '', '', param );
        }
    };

    /**
     * Class Modifiers are psudo-functions you can call within a class.
     * For example 'get x' to generate the method 'getX()'.
     */
    /*
     * Lookup the function generator, and then expand the given function into multiple function generators.
     * So get x, y, z becomes three 'get' generators; getX, getY and getZ.
     */
    var getFunctionGenerator = function( v, fun ) {
        var name = fun.name.toLowerCase();
        var modifierFactory = functionGeneratorFactories[ name ];

        if ( modifierFactory ) {
            var params = fun.parameters;

            // this is to avoid building a FactoryGenerators middle-man collection
            if ( params.length === 1 ) {
                return modifierFactory( v, fun, params.getStmts()[0] );
            } else {
                var generators = [];

                // sort the good parameters from the bad
                // they must all be Varaibles
                params.each(function(p) {
                    generators.push( modifierFactory(v, fun, p) );
                });

                if ( generators.length > 0 ) {
                    return new qubyAst.TransparentList( generators );
                } else {
                    return new EmptyStub();
                }
            }
        } else {
            return null;
        }
    };

    /*
     * ### PUBLIC ###
     */

    qubyAst.Syntax = util.klass(
            function(offset) {
                this.offset = offset;
            },

            {
                print: function (printer) {
                    quby.runtime.error("Internal", "Error, print has not been overridden");
                },

                /**
                 * Helper print function, for printing values in an if, while or loop condition.
                 * When called, this will store the result in a temporary variable, and test against
                 * Quby's idea of false ('false' and 'null').
                 */
                printAsCondition: function (p) {
                    p.appendPre( 'var ', quby.runtime.TEMP_VARIABLE, ';' );

                    p.append('((', quby.runtime.TEMP_VARIABLE, '=');
                    this.print(p);
                    p.append(') !== null && ', quby.runtime.TEMP_VARIABLE, ' !== false)');

                    // needed to prevent memory leaks
                    p.appendPost( 'delete ', quby.runtime.TEMP_VARIABLE, ';' );
                },

                validate: function(v) {
                    quby.runtime.error("Internal", "Error, validate has not been overridden");
                },

                setOffset: function(offset) {
                    this.offset = offset;
                },
                getOffset: function() {
                    return this.offset;
                }
            }
    );

    /**
     * The most basic type of statement list.
     * Just wraps an array of statements,
     * and passes the calls to validate and print on to them.
     */
    qubyAst.TransparentList = util.klass(
            function ( stmts ) {
                this.stmts = stmts;
            },

            {
                getStmts: function() {
                    return this.stmts;
                },

                validate: function(v) {
                    var stmts = this.stmts;

                    for ( var i = 0; i < stmts.length; i++ ) {
                        stmts[i].validate( v );
                    }
                },

                print: function(p) {
                    var stmts = this.stmts;

                    for ( var i = 0; i < stmts.length; i++ ) {
                        stmts[i].print( p );
                        p.endStatement();
                    }
                }
            }
    );

    qubyAst.SyntaxList = util.klass(
            function (strSeperator, appendToLast) {
                this.stmts = [];
                this.seperator = strSeperator;
                this.offset = null;
                this.length = 0;
                this.appendToLast = appendToLast;
            },
            {
                add: function (stmt) {
                    this.ensureOffset( stmt );
                    this.stmts.push(stmt);
                    this.length++;

                    return this;
                },
                unshift: function(stmt) {
                    this.ensureOffset( stmt );
                    this.stmts.unshift( stmt );
                    this.length++;

                    return this;
                },
                ensureOffset: function(stmt) {
                    if ( !this.offset ) {
                        this.offset = stmt.offset;
                    }
                },
                print: function (p) {
                    var length = this.stmts.length;

                    for (var i = 0; i < length; i++) {
                        this.stmts[i].print(p);

                        if (this.appendToLast || i < length - 1) {
                            p.append(this.seperator);
                        }
                    }
                },

                set: function( arr ) {
                    this.stmts = arr;
                    this.length = arr.length;

                    if ( arr.length > 0 ) {
                        this.ensureOffset( arr[0] );
                    }

                    return this;
                },

                validate: function (v) {
                    for (var i = 0; i < this.stmts.length; i++) {
                        this.stmts[i].validate(v);
                    }
                },

                each: function( fun ) {
                    for ( var i = 0; i < this.stmts.length; i++ ) {
                        fun( this.stmts[i] );
                    }
                },

                getStmts: function() {
                    return this.stmts;
                }
            }
    );

    qubyAst.Statements = util.klass(
            function ( stmtsArray ) {
                qubyAst.SyntaxList.call( this, '', false );

                if ( stmtsArray !== undefined ) {
                    this.set( stmtsArray );
                }
            },

            qubyAst.SyntaxList,
            {
                print: function(p) {
                    p.printArray( this.getStmts() );
                }
            }
    );

    qubyAst.Parameters = util.klass(
            function() {
                qubyAst.SyntaxList.call(this, ',', false);

                this.blockParam = null;
                this.errorParam = null;
                this.blockParamPosition = -1;

                for ( var i = 0; i < arguments.length; i++ ) {
                    this.add( arguments[i] );
                }
            },

            qubyAst.SyntaxList,
            {
                /**
                 * Adds to the ends of the parameters.
                 */
                /*
                 * Override the add so that block parameters are stored seperately from
                 * other parameters.
                 */
                add: function(param) {
                    if ( param.isBlockParam ) {
                        this.setBlockParam( param );
                    } else {
                        qubyAst.SyntaxList.call( this, param );
                    }

                    return this;
                },

                /**
                 * Adds to the beginning of the parameters.
                 */
                addFirst: function (param) {
                    if (param.isBlockParam) {
                        this.setBlockParam(param);
                    } else {
                        qubyAst.SyntaxList.call( this, param );

                        this.getStmts().pop();
                        this.getStmts().unshift(param);
                    }

                    return this;
                },

                set: function( params ) {
                    for ( var i = 0; i < params.length; i++ ) {
                        if ( params[i].isBlockParam ) {
                            this.setBlockParam( params[i] );
                            params.splice( i, 1 );
                        }
                    }

                    return qubyAst.SyntaxList.prototype.set.call( this, params );
                },

                /**
                 * Sets the block parameter for this set of parameters.
                 * This can only be set once, and no more parameters should be set after
                 * this has been called.
                 *
                 * @param blockParam A block parameter for this set of parameters.
                 */
                setBlockParam: function( blockParam ) {
                    // You can only have 1 block param.
                    // If a second is given, store it later for a validation error.
                    if (this.blockParam !== null) {
                        this.errorParam = blockParam;
                    } else {
                        this.blockParam = blockParam;
                        // Record the position so we can check if it's the last parameter or not.
                        this.blockParamPosition = this.getStmts().length;
                    }
                },

                getBlockParam: function () {
                    return this.blockParam;
                },

                validate: function (v) {
                    if (this.blockParam != null) {
                        if (this.errorParam != null) {
                            v.parseError(this.errorParam.offset, "Only one block parameter is allowed.");
                        } else if (this.blockParamPosition < this.getStmts().length) {
                            v.parseError(this.bockParam.offset, "Block parameter must be the last parameter.");
                        }
                    }

                    qubyAst.SyntaxList.prototype.validate.call( this, v );

                    if (this.blockParam != null) {
                        this.blockParam.validate(v);
                    }
                }
            }
    );

    qubyAst.Mappings = util.klass(
            function ( mappings ) {
                qubyAst.SyntaxList.call(this, ',', false);

                this.set( mappings );
            },
            qubyAst.SyntaxList
    );

    qubyAst.StmtBlock = util.klass(
            function( condition, stmts ) {
                if ( condition != null ) {
                    qubyAst.Syntax.call(this, condition.offset);
                } else {
                    qubyAst.Syntax.call(this, stmts.offset);
                }

                this.condition = condition;
                this.stmts = stmts;
            },

            qubyAst.Syntax,
            {
                validate: function (v) {
                    if (this.condition !== null) {
                        this.condition.validate(v);
                    }

                    this.stmts.validate(v);
                },

                getCondition: function() {
                    return this.condition;
                },
                getStmts: function() {
                    return this.stmts;
                },

                printBlockWrap: function( p, preCondition, postCondition, postBlock ) {
                    p.append( preCondition );
                    this.getCondition().printAsCondition(p)
                    p.append( postCondition ).flush();
                    this.getStmts().print(p);
                    p.append( postBlock );
                }
            }
    );

    qubyAst.IfStmt = util.klass(
            function (ifs, elseIfs, elseBlock) {
                qubyAst.Syntax.call(this, ifs.offset);

                this.ifStmts = ifs;
                this.elseIfStmts = elseIfs;
                this.elseStmt = elseBlock;
            },

            qubyAst.Syntax,
            {
                validate: function (v) {
                    this.ifStmts.validate(v);

                    if (this.elseIfStmts !== null) {
                        this.elseIfStmts.validate(v);
                    }

                    if (this.elseStmt !== null) {
                        this.elseStmt.validate(v);
                    }
                },

                print: function (p) {
                    this.ifStmts.print(p);

                    if ( this.elseIfStmts !== null ) {
                        p.append('else ');
                        this.elseIfStmts.print(p);
                    }

                    if ( this.elseStmt !== null ) {
                        p.append('else{');
                        this.elseStmt.print(p);
                        p.append('}');
                    }
                }
            }
    );

    qubyAst.IfElseIfs = util.klass(
            function () {
                qubyAst.SyntaxList.call(this, 'else ', false);
            },
            
            qubyAst.SyntaxList
    );

    qubyAst.IfBlock = util.klass(
            function (condition, stmts) {
                qubyAst.StmtBlock.call(this, condition, stmts);
            },

            qubyAst.StmtBlock,
            {
                print: function (p) {
                    this.printBlockWrap( p, 'if(', '){', '}' );
                }
            }
    );

    qubyAst.WhileLoop = util.klass(
            function (condition, stmts) {
                qubyAst.StmtBlock.call(this, condition, stmts);
            },

            qubyAst.StmtBlock,
            {
                print: function (p) {
                    this.printBlockWrap( p, 'while(', '){', '}' );
                }
            }
    );

    qubyAst.UntilLoop = util.klass(
            function (condition, stmts) {
                qubyAst.StmtBlock.call(this, condition, stmts);
            },

            qubyAst.StmtBlock,
            {
                print: function (p) {
                    this.printBlockWrap( p, 'while(!(', ')){', '}' );
                }
            }
    );

    qubyAst.LoopWhile = util.klass(
            function (condition, stmts) {
                qubyAst.StmtBlock.call(this, condition, stmts);
            },

            qubyAst.StmtBlock,
            {
                print: function (p) {
                    // flush isn't needed here,
                    // because statements on the first line will always take place
                    p.append('do{');
                    this.getStmts().print(p);
                    p.append('}while(');
                    this.getCondition().printAsCondition(p);
                    p.append(')');
                }
            }
    );

    qubyAst.LoopUntil = util.klass(
            function (condition, stmts) {
                qubyAst.StmtBlock.call(this, condition, stmts);
            },

            qubyAst.StmtBlock,
            {
                print: function (p) {
                    p.append('do{');
                    this.getStmts().print(p);
                    p.append('}while(!(');
                    this.getCondition().printAsCondition(p);
                    p.append('))');
                }
            }
    );

    /**
     * This describes the signature of a class. This includes information
     * such as this classes identifier and it's super class identifier.
     */
    qubyAst.ClassHeader = util.klass(
            function (identifier, extendsId) {
                qubyAst.Syntax.call(this, identifier.offset);

                if (extendsId == null) {
                    this.extendsCallName = quby.runtime.ROOT_CLASS_CALL_NAME;
                    this.extendsName = quby.runtime.ROOT_CLASS_NAME;
                } else {
                    this.extendsCallName = quby.runtime.formatClass(extendsId.value);
                    this.extendsName = extendsId.value;
                }

                this.classId  = identifier;
                this.extendId = extendsId;
                this.value    = identifier.value;
            },

            qubyAst.Syntax,
            {
                validate: function (v) {
                    var name = this.classId.lower;

                    if (this.hasSuper()) {
                        var extendName = this.extendId.lower;
                        var extendStr  = this.extendId.value;

                        if (name == extendName) {
                            v.parseError(this.offset, "Class '" + this.value + "' is extending itself.");
                        } else if (quby.runtime.isCoreClass(name)) {
                            v.parseError(this.offset, "Core class '" + this.value + "' cannot extend alternate class '" + extendStr + "'.");
                        } else if (quby.runtime.isCoreClass(extendName)) {
                            v.parseError(this.offset, "Class '" + this.value + "' cannot extend core class '" + extendStr + "'.");
                        }
                    }
                },

                /**
                 * Returns true if there is a _declared_ super class.
                 *
                 * Note that if this returns false then 'getSuperCallName' and
                 * 'getSuperName' will return the name of the root class (i.e.
                 * Object).
                 */
                hasSuper: function () {
                    return this.extendId !== null;
                },

                /**
                 * Returns the call name for the super class to this class header.
                 */
                getSuperCallName: function () {
                    return this.extendsCallName;
                },

                /**
                 * Returns the name of the super class to this class header.
                 */
                getSuperName: function () {
                    return this.extendsName;
                }
            }
    );

    /**
     * TODO
     */
    qubyAst.ModuleDefinition = util.klass(
            function (name, statements) {
                qubyAst.Syntax.call(this, name.offset);
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    // TODO
                },
                validate: function (v) {
                    // TODO
                }
            }
    );

    qubyAst.ClassDefinition = util.klass(
            function (name, statements) {
                /*
                 * Extension Class
                 *
                 * A real JS prototype, or existing type, which we are adding stuff
                 * to.
                 */
                if ( quby.runtime.isCoreClass(name.classId.lower) ) {
                    return new qubyAst.ExtensionClassDefinition(name, statements);
                /*
                 * Quby class
                 *
                 * Entirely user declared and created.
                 */
                } else {
                    qubyAst.Syntax.call( this, name.offset );

                    this.header = name;
                    this.name = name.value;
                    this.statements = statements;
                    this.callName = quby.runtime.formatClass(name.value);

                    this.classValidator = null;
                }
            },

            qubyAst.Syntax,
            {
                validate: function (v) {
                    v.ensureOutFun(this, "Class '" + this.name + "' defined within a function, this is not allowed.");
                    v.ensureOutBlock(this, "Class '" + this.name + "' defined within a block, this is not allowed.");

                    // validator stored for printing later (validation check made inside)
                    this.classValidator = v.setClass(this);
                    this.header.validate(v);

                    if ( this.statements !== null ) {
                        this.statements.validate(v);
                    }

                    v.unsetClass();
                },

                print: function (p) {
                    return this.classValidator.printOnce(p);
                },

                getHeader: function () {
                    return this.header;
                },

                /**
                 * This returns it's parents callName, unless this does not have
                 * a parent class (such as if this is the root class).
                 *
                 * Then it will return null.
                 *
                 * @return The callName for the parent class of this class.
                 */
                getSuperCallName: function () {
                    var superCallName = this.header.getSuperCallName();

                    if (superCallName == this.callName) {
                        return null;
                    } else {
                        return superCallName;
                    }
                }
            }
    );

    /**
     * Extension Classes are ones that extend an existing prototype.
     * For example Number, String or Boolean.
     *
     * This also includes the extra Quby prototypes such as Array (really QubyArray)
     * and Hash (which is really a QubyHash).
     */
    qubyAst.ExtensionClassDefinition = util.klass(
            function (name, statements) {
                qubyAst.Syntax.call(this, name.offset);

                this.name = name.value;
                this.header = name;
                this.callName = quby.runtime.formatClass( name.value );
                this.statements = statements;
                this.isExtensionClass = true;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    p.setCodeMode(false);

                    if ( this.statements !== null ) {
                        p.appendExtensionClassStmts( this.name, this.statements.getStmts() );
                    }

                    p.setCodeMode(true);
                },

                validate: function (v) {
                    v.ensureOutClass(this, "Classes cannot be defined within another class.");

                    v.setClass(this);
                    this.header.validate(v);

                    if ( this.statements !== null ) {
                        this.statements.validate(v);
                    }

                    v.unsetClass();
                },

                /*
                 * The parent class of all extension classes is the root class,
                 * always.
                 */
                getSuperCallName: function () {
                    return quby.runtime.ROOT_CLASS_CALL_NAME;
                }
            }
    );

    /**
     * Defines a function or method definition.
     */
    qubyAst.Function = util.klass(
            function( name, parameters, stmtBody ) {
                qubyAst.Syntax.call( this, name.offset );

                this.isMethod   = false;
                this.name       = name.value;
                this.parameters = parameters;

                if ( parameters !== null ) {
                    this.blockParam = parameters.getBlockParam();
                    this.callName   = quby.runtime.formatFun( name.value, parameters.length );
                } else {
                    this.blockParam = null ;
                    this.callName   = quby.runtime.formatFun( name.value, 0 );
                }

                this.stmtBody = stmtBody;

                this.preVariables = [];
            },

            qubyAst.Syntax,
            {
                addPreVariable: function (variable) {
                    this.preVariables.push(variable);
                },

                validate: function (v) {
                    this.isMethod = v.isInsideClass();

                    var isOutFun = true;
                    if (v.isInsideFun()) {
                        var otherFun = v.getCurrentFun();
                        var strOtherType = ( otherFun.isMethod ? "method" : "function" );

                        v.parseError(this.offset, "Function '" + this.name + "' is defined within " + strOtherType + " '" + otherFun.name + "', this is not allowed.");
                        isOutFun = false;
                    } else {
                        var strType = (this.isMethod ? "Method" : "Function");

                        v.ensureOutBlock(this, strType + " '" + this.name + "' is within a block, this is not allowed.");
                    }

                    if ( isOutFun ) {
                        v.defineFun(this);
                        v.pushFunScope(this);
                    }

                    v.setParameters(true, true);
                    if ( this.parameters !== null ) {
                        this.parameters.validate(v);
                    }
                    v.setParameters(false);

                    if ( this.stmtBody !== null ) {
                        this.stmtBody.validate(v);
                    }

                    if (isOutFun) {
                        v.popScope();
                    }
                },

                print: function (p) {
                    if (!this.isMethod) {
                        p.setCodeMode(false);
                    }

                    if (this.isMethod && !this.isConstructor) {
                        p.append(this.callName, '=function');
                    } else {
                        p.append('function ', this.callName);
                    }

                    this.printParameters(p);
                    this.printBody(p);

                    if (!this.isMethod) {
                        p.setCodeMode(true);
                    }
                },

                printParameters: function (p) {
                    p.append('(');

                    if ( this.getNumParameters() > 0 ) {
                        this.parameters.print(p);
                        p.append(',');
                    }

                    p.append( quby.runtime.BLOCK_VARIABLE, ')');
                },

                printBody: function (p) {
                    p.append('{');

                    this.printPreVars(p);
                    p.flush();

                    if ( this.stmtBody !== null ) {
                        this.stmtBody.print(p);
                    }

                    // all functions must guarantee they return something...
                    p.append('return null;', '}');
                },

                printPreVars: function (p) {
                    /*
                     * Either pre-print all local vars + the block var,
                     * or print just the block var.
                     */
                    if ( this.preVariables.length > 0 ) {
                        p.append( 'var ' );

                        for (var i = 0; i < this.preVariables.length; i++) {
                            if ( i > 0 ) {
                                p.append(',');
                            }

                            var variable = this.preVariables[i];
                            p.append(variable.callName, '=null');
                        }

                        if ( this.blockParam != null ) {
                            p.append(',');
                            this.blockParam.print( p );
                            p.append( '=', quby.runtime.BLOCK_VARIABLE, ';' );
                        }

                        p.endStatement();
                    } else if ( this.blockParam != null ) {
                        p.append( 'var ' );
                        this.blockParam.print( p );
                        p.append( '=', quby.runtime.BLOCK_VARIABLE, ';' );
                    }
                },

                getNumParameters: function () {
                    return ( this.parameters !== null ) ?
                            this.parameters.length :
                            0 ;
                }
            }
    );

    /**
     * Defines a constructor for a class.
     */
    qubyAst.Constructor = util.klass(
            function (sym, parameters, stmtBody) {
                qubyAst.Function.call(this, sym, parameters, stmtBody);

                this.isConstructor = true;
                this.className = '';
                this.klass = null;
            },

            qubyAst.Function,
            {
                setClass: function (klass) {
                    this.klass = klass;

                    this.callName = quby.runtime.formatNew(klass.name, this.getNumParameters());

                    this.className = klass.callName;
                },

                validate: function (v) {
                    if ( v.ensureInClass(this, "Constructors must be defined within a class.") ) {
                        this.setClass( v.getCurrentClass().klass );

                        this.isExtensionClass = v.isInsideExtensionClass();
                        if ( this.isExtensionClass ) {
                            v.ensureAdminMode( this, "Cannot add constructor to core class: '" + v.getCurrentClass().klass.name + "'" );
                        }

                        v.setInConstructor(true);
                        qubyAst.Function.prototype.validate.call( this, v );
                        v.setInConstructor(false);
                    }
                },

                printParameters: function (p) {
                    p.append('(');

                    if ( ! this.isExtensionClass ) {
                        p.append( quby.runtime.THIS_VARIABLE, ',' );
                    }

                    if (
                            this.parameters !== null &&
                            this.parameters.length > 0
                    ) {
                        this.parameters.print(p);
                        p.append(',');
                    }

                    p.append( quby.runtime.BLOCK_VARIABLE, ')' );
                },

                printBody: function (p) {
                    p.append('{');

                    this.printPreVars(p);
                    p.endStatement();

                    if ( this.stmtBody !== null ) {
                        this.stmtBody.print(p);
                    }

                    if ( ! this.isExtensionClass ) {
                        p.append('return ', quby.runtime.THIS_VARIABLE, ';');
                    }

                    p.append( '}' );
                }
            }
    );

    qubyAst.AdminMethod = util.klass(
            function (name, parameters, stmtBody) {
                qubyAst.Function.call(this, name, parameters, stmtBody);

                this.callName = this.name;
            },

            qubyAst.Function,
            {
                validate: function (v) {
                    v.ensureAdminMode(this, "Admin (or hash) methods cannot be defined without admin rights.");

                    if (v.ensureInClass(this, "Admin methods can only be defined within a class.")) {
                        qubyAst.Function.prototype.validate.call( this, v );
                    }
                }
            }
    );

    /*
    * If this is used from within a class, then it doesn't know if it's a
    * function call, 'foo()', or a method call, 'this.foo()'.
    *
    * This is issue is resolved through 'lateBind' where the class resolves
    * it during validation.
    *
    * This function presumes it's calling a function (not a method) until
    * it is told otherwise.
    *
    * There is also a third case. It could be a special class function,
    * such as 'get x, y' or 'getset img' for generating accessors (and other things).
    */
    qubyAst.FunctionCall = util.klass(
            function (name, parameters, block) {
                qubyAst.Syntax.call(this, name.offset);

                this.name = name.value;
                this.parameters = parameters;

                var numParams = ( parameters !== null ) ? parameters.length : 0 ;
                this.callName = quby.runtime.formatFun( name.value, numParams );

                this.block = block;
                this.functionGenerator = null;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    if ( this.functionGenerator ) {
                        this.functionGenerator.print(p);
                    } else {
                        if ( this.isMethod ) {
                            p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass), '.');
                        }

                        this.printFunCall(p);
                    }
                },

                printFunCall: function (p) {
                    p.append(this.callName, '(');
                    this.printParams(p);
                    p.append(')');
                },

                printParams: function (p) {
                    // parameters
                    if (this.getNumParameters() > 0) {
                        this.parameters.print(p);
                        p.append(',');
                    }

                    // block parameter
                    if (this.block !== null) {
                        this.block.print(p);
                    } else {
                        p.append('null');
                    }
                },

                setIsMethod: function () {
                    this.isMethod = true;
                },

                /**
                 * This FunctionCall needs to declare it's self to the Validator,
                 * so the Validator knows it exists. This is done in this call,
                 * so it's detached from validating parameters and blocks.
                 *
                 * In practice, this means you can put your call to validate this as a method,
                 * a 'this.method', or something else, by changing this method.
                 *
                 * By default, this states this is a function.
                 */
                validateThis: function(v) {
                    v.useFun(this);
                },

                validate: function (v) {
                    var generator = null;

                    if ( v.isInsideClassDefinition() ) {
                        this.functionGenerator = generator = getFunctionGenerator( v, this );

                        if ( generator === null ) {
                            v.parseError(this.offset, "Function '" + this.name + "' called within definition of class '" + v.getCurrentClass().klass.name + "', this is not allowed.");
                        } else if ( block !== null ) {
                            v.parseError(this.offset, "'" + this.name + "' modifier of class '" + v.getCurrentClass().klass.name + "', cannot use a block.");
                        } else {
                            generator.validate( v );
                        }

                        return false;
                    } else {
                        if ( this.parameters !== null ) {
                            this.parameters.validate(v);
                        }

                        this.isInsideExtensionClass = v.isInsideExtensionClass();

                        this.validateThis( v );

                        if ( this.block != null ) {
                            this.block.validate(v);
                        }
                    }
                },

                getNumParameters: function () {
                    return ( this.parameters !== null ) ? this.parameters.length : 0 ;
                }
            }
    );

    qubyAst.MethodCall = util.klass(
            function (expr, name, parameters, block) {
                qubyAst.FunctionCall.call(this, name, parameters, block);

                this.isMethod = true;
                this.expr = expr;
            },

            qubyAst.FunctionCall,
            {
                print: function (p) {
                    if (this.expr.isThis) {
                        qubyAst.FunctionCall.prototype.print.call( this, p );
                    } else {
                        this.printExpr(p);
                        p.append('.');
                        this.printFunCall(p);
                    }
                },

                printExpr: function(p) {
                    var e = this.expr;

                    if ( e.isLiteral ) {
                        p.append( '(' );
                        e.print( p );
                        p.append( ')' );
                    } else {
                        e.print( p );
                    }
                },

                validateThis: function(v) {
                    if ( this.expr.isThis && v.isInsideClass() ) {
                        v.useThisClassFun(this);
                    } else {
                        v.useFun( this );
                    }
                },

                validate: function (v) {
                    this.expr.validate(v);

                    qubyAst.FunctionCall.prototype.validate.call( this, v );
                },

                appendLeft: function( expr ) {
                    if ( this.expr !== null ) {
                        this.expr.appendLeft( expr );
                    } else {
                        this.expr = expr;
                    }

                    return this;
                }
            }
    );

    qubyAst.SuperCall = util.klass(
            function (name, parameters, block) {
                qubyAst.FunctionCall.call(this, name, parameters, block);
            },

            qubyAst.FunctionCall,
            {
                print: function (p) {
                    if ( this.superKlassVal !== undefined ) {
                        var superKlass = this.superKlassVal.klass.name;
                        var superConstructor = quby.runtime.formatNew(superKlass, this.getNumParameters());

                        p.append(superConstructor, '(', quby.runtime.THIS_VARIABLE, ',');
                        this.printParams(p);
                        p.append(')');
                    }
                },

                validate: function (v) {
                    if ( v.ensureInConstructor(this, "Super can only be called from within a constructor.") ) {
                        this.klassVal = v.getCurrentClass();

                        // _this fixes alias issues within the callback
                        var _this = this;

                        v.onEndValidate(function (v) {
                            var header = _this.klassVal.klass.getHeader();
                            var superCallName = header.getSuperCallName();
                            _this.superKlassVal = v.getClass(superCallName);

                            if (_this.superKlassVal == undefined) {
                                if (!quby.runtime.isCoreClass(header.getSuperName().toLowerCase())) {
                                    v.parseError(_this.offset, "Calling super to a non-existant super class: '" + _this.klassVal.klass.getHeader().getSuperName() + "'.");
                                }
                            } else if (!_this.superKlassVal.hasNew(_this)) {
                                var superName = _this.superKlassVal.klass.name;
                                v.parseError(_this.offset, "No constructor found with " + _this.getNumParameters() + " parameters for super class: '" + superName + "'.");
                            }
                        });
                    }

                    if ( this.parameters !== null ) {
                        this.parameters.validate(v);
                    }

                    if (this.block !== null) {
                        this.block.validate(v);
                    }
                }
            }
    );

    qubyAst.NewInstance = util.klass(
            function(name, parameters, block) {
                qubyAst.FunctionCall.call(this, name, parameters, block);

                this.className = quby.runtime.formatClass( name.value );
                this.callName  = quby.runtime.formatNew(name.value, this.getNumParameters());
            },

            qubyAst.FunctionCall,
            {
                print: function (p) {
                    p.append( this.callName, '(' );

                    // if a standard class,
                    // make a new empty object and pass it in as the first parameter
                    if ( ! this.isExtensionClass ) {
                        p.append('new ', this.className, '(),');
                    }

                    this.printParams(p);

                    p.append(')');
                },

                validate: function (v) {
                    if ( this.parameters !== null ) {
                        this.parameters.validate(v);
                    }

                    if ( this.block !== null ) {
                        this.block.validate(v);
                    }

                    // this can only be validated after the classes have been fully defined
                    var _this = this;
                    v.onEndValidate(function (v) {
                        var klassVal = v.getClass(_this.className);

                        if ( klassVal ) {
                            if (
                                   (!klassVal.hasNew(_this))
                                || (klassVal.noNews() && _this.getNumParameters() > 0)
                            ) {
                                var klass = klassVal.klass;

                                if ( klassVal.noNews() && klass.isExtensionClass ) {
                                    v.parseError(_this.offset, "Cannot manually create new instances of '" + klass.name + "', it doesn't have a constructor.");
                                } else {
                                    v.parseError(_this.offset, "Called constructor for class '" + klass.name + "' with wrong number of parameters: " + _this.getNumParameters());
                                }
                            } else {
                                _this.isExtensionClass = klassVal.klass.isExtensionClass;
                            }
                        } else {
                            v.parseError(_this.offset, "Making new instance of undefined class: '" + _this.name);
                        }
                    });
                }
            }
    );

    qubyAst.ReturnStmt = util.klass(
            function (expr) {
                qubyAst.Syntax.call(this, expr.offset);

                this.expr = expr;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    p.append('return ');

                    this.expr.print(p);
                },
                validate: function (v) {
                    if (!v.isInsideFun() && !v.isInsideBlock()) {
                        v.parseError(this.offset, "Return cannot be used outside a function or a block.");
                    }

                    this.expr.validate(v);
                }
            }
    );

    qubyAst.YieldStmt = util.klass(
            function (offsetObj, args) {
                qubyAst.Syntax.call(this, offsetObj.offset);

                if ( args === undefined ) {
                    args = null;
                }

                this.parameters = args;
            },

            qubyAst.Syntax,
            {
                validate: function (v) {
                    v.ensureInFun(this, "Yield can only be used from inside a function.");

                    if ( this.parameters !== null ) {
                        this.parameters.validate(v);
                    }
                },

                print: function (p) {
                    var paramsLen = ( this.parameters !== null ) ?
                            this.parameters.length :
                            0 ;

                    p.appendPre('quby_ensureBlock(', quby.runtime.BLOCK_VARIABLE, ', ', paramsLen, ');');
                    p.append(quby.runtime.BLOCK_VARIABLE, '(');

                    if ( this.parameters !== null ) {
                        this.parameters.print( p );
                    }

                    p.append(')');
                }
            }
    );

    qubyAst.FunctionBlock = util.klass(
            function (parameters, statements) {
                qubyAst.Syntax.call( this,
                        // only pass in the offset if we have it,
                        // otherwise a null value
                        ( parameters !== null ) ?
                                parameters.offset :
                                null
                );

                this.parameters = parameters;
                this.stmtBody   = statements;

                this.mismatchedBraceWarning = false;
            },

            qubyAst.Syntax,
            {
                setMismatchedBraceWarning: function() {
                    this.mismatchedBraceWarning = true;
                },

                print: function (p) {
                    p.append('function(');

                    if ( this.parameters !== null ) {
                        this.parameters.print(p);
                    }

                    p.append('){').flush();

                    if ( this.stmtBody !== null ) {
                        this.stmtBody.print(p);
                    }

                    p.append(
                            'return null;',
                            '}'
                    );
                },

                validate: function (v) {
                    if ( this.mismatchedBraceWarning ) {
                        v.strictError( this.getOffset(), "mismatched do-block syntax (i.e. 'do something() }')" );
                    }

                    v.pushBlockScope();

                    if ( this.parameters !== null ) {
                        v.setParameters(true, false);
                        this.parameters.validate(v);
                        v.setParameters(false);
                    }

                    if ( this.stmtBody !== null ) {
                        this.stmtBody.validate(v);
                    }

                    v.popScope();
                },

                getNumParameters: function () {
                    return ( this.parameters !== null ) ?
                            this.parameters.length :
                            0 ;
                }
            }
    );

    qubyAst.Lambda = util.klass(
            function (parameters, statements) {
                qubyAst.FunctionBlock.call( this, parameters, statements );
            },

            qubyAst.FunctionBlock,
            {
                print: function(p) {
                    p.append('(');
                    qubyAst.FunctionBlock.prototype.print.call( this, p );
                    p.append(')');
                }
            }
    );

    /**
     * @param offset The source code offset for this Expr.
     * @param isResultBool An optimization flag. Pass in true if the result of this Expression will always be a 'true' or 'false'. Optional, and defaults to false.
     */
    qubyAst.Expr = util.klass(
            function (offset, isResultBool) {
                qubyAst.Syntax.call(this, offset);

                this.isResultBool = (!! isResultBool);
            },

            qubyAst.Syntax,
            {
                printAsCondition: function (p) {
                    if ( this.isResultBool ) {
                        this.print(p);
                    } else {
                        qubyAst.Syntax.prototype.printAsCondition.call( this, p );
                    }
                }
            }
    );

    /**
     * This is to allow an expression, mostly an operation, to swap it's
     * self out and rebalance the expression tree.
     *
     * It does this by copying it's self, then inserting the copy deeper
     * into the expression tree, and this then referenced the expression
     * tree now references the top of the tree.
     */
    qubyAst.BalancingExpr = util.klass(
            function( offset, isResultBool )
            {
                qubyAst.Expr.call( this, offset, isResultBool );

                this.balanceDone = false;
                this.proxyExpr   = null;
            },

            qubyAst.Expr,
            {
                isBalanced: function( v ) {
                    if ( this.balanceDone ) {
                        return true;
                    } else {
                        var newExpr = this.rebalance();

                        if ( newExpr !== this ) {
                            newExpr.validate( v );

                            return false;
                        } else {
                            return true;
                        }
                    }
                },

                validate: function( v ) {
                    if ( this.proxyExpr !== null ) {
                        this.proxyExpr.validate( v );
                    } else {
                        qubyAst.Expr.prototype.validate.call( this, v );
                    }
                },
                print: function( v ) {
                    if ( this.proxyExpr !== null ) {
                        this.proxyExpr.print( v );
                    } else {
                        qubyAst.Expr.prototype.print.call( this, v );
                    }
                },
                printAsCondition: function( v ) {
                    if ( this.proxyExpr !== null ) {
                        this.proxyExpr.printAsCondition( v );
                    } else {
                        qubyAst.Expr.prototype.printAsCondition.call( this, v );
                    }
                },

                rebalance: function() {
                    this.balanceDone = true;

                    var expr = this.onRebalance();

                    if ( expr !== this ) {
                        this.proxyExpr = expr;

                        return this;
                    } else {
                        return this;
                    }
                },

                onRebalance: function() {
                    throw new Error("rebalance is not implemented");
                }
            }
    );

    qubyAst.ExprParenthesis = util.klass(
            function( expr ) {
                qubyAst.Syntax.call(this, expr.offset);

                this.expr = expr;
            },

            qubyAst.Syntax,
            {
                validate: function(v) {
                    this.expr.validate(v);
                },

                print: function(p) {
                    p.append('(');
                    this.expr.print(p);
                    p.append(')');
                },

                printAsCondition: function(p) {
                    p.append('(');
                    this.expr.printAsCondition(p);
                    p.append(')');
                }
            }
    );

    /*
     * All single operations have precedence of 1.
     */
    qubyAst.SingleOp = util.klass(
            function (expr, strOp, isResultBool) {
                qubyAst.BalancingExpr.call(this, expr.offset, isResultBool);

                this.expr  = expr;
                this.strOp = strOp;
            },

            qubyAst.BalancingExpr,
            {
                validate: function (v) {
                    if ( this.isBalanced(v) ) {
                        this.expr.validate(v);
                    }
                },

                print: function (p) {
                    p.append('(', this.strOp);
                    this.expr.print(p);
                    p.append(')');
                },

                onRebalance: function() {
                    // swap if expr has higher precedence then this
                    var expr = this.expr,
                        exprPrecedence = expr.precedence;

                    if ( expr.rebalance !== undefined ) {
                        expr = expr.rebalance();
                    }

                    if (
                            exprPrecedence !== undefined &&
                            exprPrecedence > 1
                    ) {
                        var copy = util.clone( this );
                        copy.expr = expr.performBalanceSwap(copy, 1);
                        return expr;
                    } else {
                        return this;
                    }
                }
            }
    );

    qubyAst.SingleSub = util.klass(
            function (expr) {
                qubyAst.SingleOp.call( this, expr, "-", false );
            },
            
            qubyAst.SingleOp
    );

    qubyAst.Not = util.klass(
            function (expr) {
                qubyAst.SingleOp.call( this, expr, "!", true );
            },

            qubyAst.SingleOp,
            {
                print: function(p) {
                    var temp = p.getTempVariable();

                    p.appendPre('var ', temp, ';');

                    p.append('(((', temp, '=');
                    this.expr.print(p);
                    p.append(') === null || ', temp, ' === false) ? true : false)');

                    // needed to prevent memory leaks
                    p.appendPost('delete ', temp, ';');
                }
            }
    );

    /**
     * 0 is the tightest, most binding precendence, often
     * known as the 'highest precedence'.
     *
     * Higher numbers lower the priority of the precedence.
     * For example * binds tighter than +, so you might
     * assign the precedences:
     *
     *      + -> 3
     *      * -> 4
     *
     * ... giving * a higher precedence than +.
     *
     * @param left
     * @param right
     * @param strOp
     * @param isResultBool
     * @param precedence Lower is higher, must be a number.
     */
    qubyAst.Op = util.klass(
            function (left, right, strOp, isResultBool, precedence) {
                var offset = left ? left.offset : null;
                qubyAst.BalancingExpr.call( this, offset, isResultBool );

                if ( precedence === undefined ) {
                    throw new Error("undefined precedence given.");
                }
                this.precedence = precedence;

                this.left  = left;
                this.right = right;

                this.strOp = strOp;
            },

            qubyAst.BalancingExpr,
            {
                print: function (p) {
                    var bracket = quby.compilation.hints.doubleBracketOps();

                    if ( bracket ) {
                        p.append('((');
                    } else {
                        p.append('(');
                    }
                    this.left.print(p);
                    if ( bracket ) {
                        p.append( ')' );
                    }

                    p.append( this.strOp );

                    if ( bracket ) {
                        p.append( '(' );
                    }
                    this.right.print(p);
                    if ( bracket ) {
                        p.append('))');
                    } else {
                        p.append(')');
                    }
                },

                validate: function (v) {
                    if ( this.isBalanced(v) ) {
                        this.right.validate(v);
                        this.left.validate(v);
                    }
                },

                onRebalance: function() {
                    var right = this.right;

                    if ( right.rebalance !== undefined ) {
                        right = right.rebalance();
                    }

                    var rightPrecedence = right.precedence,
                        precedence = this.precedence;

                    if (
                            rightPrecedence !== undefined &&
                            rightPrecedence > precedence
                    ) {
                        var copy = util.clone( this );
                        copy.right = right.performBalanceSwap( copy, precedence );

                        return right;
                    } else {
                        return this;
                    }
                },

                performBalanceSwap: function( newLeft, precedence ) {
                    var leftP = this.left.precedence,
                        oldLeft;
                    
                    /*
                     * Left is either an node,
                     * or it has higher precedence.
                     */
                    if ( leftP !== undefined ) {
                        if ( leftP <= precedence ) {
                            oldLeft = this.left;
                            this.left = newLeft;

                            return oldLeft;
                        } else {
                            return this.left.performBalanceSwap( newLeft, precedence );
                        }
                    } else {
                        oldLeft = this.left;
                        this.left = newLeft;

                        return oldLeft;
                    }

                    return null;
                },

                appendLeft: function( left ) {
                    if ( this.left !== null ) {
                        this.left.appendLeft( left );
                    } else if ( left ) {
                        this.setOffset( left.offset );
                        this.left = left;
                    }

                    return this;
                }
            }
    );

    /**
     * Most of the operators just extend quby.syntax.Op,
     * without adding anything to it.
     *
     * This is a helper function to make that shorthand.
     *
     * @param {string} symbol The JS string symbol for when this operator is printed.
     * @param {number} precedence The precendence for this operator.
     * @param isResultBool Optional, true if the result is a boolean, otherwise it defaults to false.
     */
    var newShortOp = function( symbol, precedence, isResultBool ) {
        if ( isResultBool === undefined ) {
            isResultBool = false;
        }

        return util.klass(
                function( left, right ) {
                    qubyAst.Op.call( this, left, right, symbol, isResultBool, precedence );
                },

                qubyAst.Op
        );
    };

    /*
     * These are in order of precedence,
     * numbers and order taken from: http://en.wikipedia.org/wiki/Order_of_operations
     *
     * Lower is higher!
     */

    /* Shifting Operations */
    qubyAst.ShiftLeft  = newShortOp( "<<", 5 );
    qubyAst.ShiftRight = newShortOp( ">>", 5 );

    /* Greater/Less Comparison */
    qubyAst.LessThan            = newShortOp( "<" , 6, true );
    qubyAst.LessThanEqual       = newShortOp( "<=", 6, true );
    qubyAst.GreaterThan         = newShortOp( ">" , 6, true );
    qubyAst.GreaterThanEqual    = newShortOp( ">=", 6, true );

    /* Equality Comparison */
    qubyAst.Equality            = newShortOp( "==", 7, true );
    qubyAst.NotEquality         = newShortOp( "!=", 7, true );

    /* Bit Functions */
    qubyAst.BitAnd = newShortOp( '&', 8 );
    qubyAst.BitOr  = newShortOp( '|', 8 );

    qubyAst.BoolOp = util.klass(
            function(left, right, syntax, precedence) {
                qubyAst.Op.call(this, left, right, syntax, false, precedence);

                this.useSuperPrint = false;
            },

            qubyAst.Op,
            {
                /**
                 * Temporarily swap to the old print, then print as a condition,
                 * then swap back.
                 */
                print: function(p) {
                    if ( this.useSuperPrint ) {
                        qubyAst.Op.prototype.print.call( this, p );
                    } else {
                        this.useSuperPrint = true;
                        this.printAsCondition();
                        this.useSuperPrint = false;
                    }
                }
            }
    );

    qubyAst.BoolOr = util.klass(
            function (left, right) {
                qubyAst.BoolOp.call(this, left, right, "||", 12);
            },

            qubyAst.BoolOp,
            {
                print: function(p) {
                    var temp = p.getTempVariable();

                    p.appendPre('var ', temp, ';');

                    p.append('(((', temp, '=');
                    this.left.print(p);
                    p.append(') === null || ', temp, ' === false) ? (');
                    this.right.print(p);
                    p.append(') : ', temp, ')');

                    // needed to prevent memory leaks
                    p.appendPost('delete ', temp, ';');
                }
            }
    );

    qubyAst.BoolAnd = util.klass(
            function (left, right) {
                qubyAst.BoolOp.call(this, left, right, "&&", 11);
            },

            qubyAst.BoolOp,
            {
                print: function(p) {
                    var temp = p.getTempVariable();

                    p.appendPre('var ', temp, ';');

                    p.append('(((', temp, '=');
                    this.left.print(p);
                    p.append(') === null || ', temp, ' === false) ? ', temp, ' : (');
                    this.right.print(p);
                    p.append('))');

                    // needed to prevent memory leaks
                    p.appendPost('delete ', temp, ';');
                }
            }
    );

    /* ### Maths ### */

    qubyAst.Divide = newShortOp( "/", 3 );
    qubyAst.Mult   = newShortOp( "*", 3 );
    qubyAst.Mod    = newShortOp( "%", 3 );
    qubyAst.Add    = newShortOp( "+", 4 );
    qubyAst.Sub    = newShortOp( "-", 4 );

    qubyAst.Power = util.klass(
            function (left, right) {
                qubyAst.Op.call(this, left, right, '**', false, 2);
            },

            qubyAst.Op,
            {
                print: function (p) {
                    p.append('Math.pow(');
                    this.left.print(p);
                    p.append(',');
                    this.right.print(p);
                    p.append(')');
                }
            }
    ),

    /*
     * ### Assignments ###
     */

    /*
     * Has the highest precedence, giving it the lowest priority.
     */
    qubyAst.Mapping = util.klass(
            function (left, right) {
                qubyAst.Op.call( this, left, right, ":", false, 100 );
            },

            qubyAst.Op,
            {
                print: function (p) {
                    this.left.print(p);
                    p.append(',');
                    this.right.print(p);
                }
            }
    );

    qubyAst.Assignment = util.klass(
            function (left, right) {
                qubyAst.Op.call(this, left, right, '=', false, 14);

                this.isCollectionAssignment = false;
            },

            qubyAst.Op,
            {
                setCollectionMode: function() {
                    this.isCollectionAssignment = true;
                },

                validate: function(v) {
                    if ( this.left.setAssignment === undefined ) {
                        v.parseError( this.left.getOffset() || this.getOffset(), "Illegal assignment" );
                    } else {
                        if ( this.left.setAssignment(v, this) !== false ) {
                            qubyAst.Op.prototype.validate.call( this, v );
                        }
                    }
                },

                print: function (p) {
                    if ( this.isCollectionAssignment ) {
                        p.append('quby_setCollection(');
                        this.left.print(p);
                        p.append(',');
                        this.right.print(p);
                        p.append(')');
                    } else {
                        this.left.print(p);
                        p.append('=');
                        this.right.print(p);
                    }
                }
            }
    );

    qubyAst.Identifier = util.klass(
            function (identifier, callName) {
                qubyAst.Expr.call(this, identifier.offset);

                this.identifier = identifier.value;
                this.callName   = callName;
            },

            qubyAst.Expr,
            {
                print: function (p) {
                    p.append(this.callName);
                }
            }
    );
    qubyAst.FieldIdentifier = util.klass(
            function (identifier) {
                // set temporary callName (the identifier.value)
                qubyAst.Identifier.call(this, identifier, identifier.value);
            },

            qubyAst.Identifier,
            {
                validate: function (v) {
                    if (
                            v.ensureInClass(this, "Field '" + this.identifier + "' is used outside of a class, they can only be used inside.")
                    ) {
                        // set the correct field callName
                        this.callName = quby.runtime.formatField(
                                v.getCurrentClass().klass.name,
                                this.identifier
                        );
                        this.isInsideExtensionClass = v.isInsideExtensionClass();

                        this.validateField(v);
                    }
                },
                validateField: function (v) {
                    quby.runtime.error("Internal", "Error, validateField of FieldIdentifier has not been overrided.");
                }
            }
    );

    /*
     * ### Variables ###
     */

    qubyAst.Variable = util.klass(
            function (identifier) {
                qubyAst.Identifier.call(this, identifier, quby.runtime.formatVar(identifier.value));

                this.isAssignment = false;
                this.useVar = false;
            },

            qubyAst.Identifier,
            {
                validate: function (v) {
                    // assigning to this variable
                    if ( this.isAssignment ) {
                        v.assignVar(this);
                        // blocks can alter local variables, allowing var prevents this.
                        this.useVar = ! v.isInsideBlock();
                    // reading from this variable
                    } else {
                        if ( v.isInsideParameters() ) {
                            // it presumes scope has already been pushed by the function it's within
                            if ( v.containsLocalVar(this) ) {
                                v.parseError( this.offset, "Parameter variable name used multiple times, var: '" + this.identifier + "'." );
                            }

                            v.assignVar(this);
                        } else {
                            if ( ! v.containsVar(this) ) {
                                v.parseError( this.offset, "Variable used before it's assigned to, var: " + this.identifier );
                            }
                        }
                    }
                },

                print: function(p) {
                    if ( this.isAssignment && this.useVar ) {
                        p.append( 'var ' );
                    }

                    qubyAst.Identifier.prototype.print.call( this, p );
                },

                setAssignment: function(v) {
                    this.isAssignment = true;
                }
            }
    );

    qubyAst.GlobalVariable = util.klass(
            function (identifier) {
                qubyAst.Identifier.call( this, identifier, quby.runtime.formatGlobal(identifier.value) );

                this.isGlobal = true;
                this.isAssignment = false;
            },

            qubyAst.Identifier,
            {
                print: function (p) {
                    if ( this.isAssignment ) {
                        qubyAst.Identifier.prototype.print.call( this, p );
                    } else {
                        p.append('quby_checkGlobal(', this.callName, ',\'', this.identifier, '\')');
                    }
                },

                validate: function (v) {
                    if ( this.isAssignment ) {
                        // check if the name is blank, i.e. $
                        if ( this.identifier.length === 0 ) {
                            v.parseError( this.offset, "Global variable name is blank" );
                        } else {
                            v.assignGlobal( this );
                        }
                    } else {
                        if (v.ensureOutParameters(this, "Global variable cannot be used as a parameter, global: '" + this.identifier + "'.")) {
                            v.useGlobal(this);
                        }
                    }
                },

                setAssignment: function(v) {
                    this.isAssignment = true;
                }
            }
    );

    qubyAst.ParameterBlockVariable = util.klass(
            function (identifier) {
                qubyAst.Variable.call( this, identifier );

                this.isBlockParam = true;
            },

            qubyAst.Variable,
            {
                validate: function (v) {
                    v.ensureInFunParameters(this, "Block parameters must be defined within a functions parameters.");
                    qubyAst.Variable.prototype.validate.call( this, v );
                }
            }
    );
    qubyAst.FieldVariable = util.klass(
            function( identifier ) {
                qubyAst.FieldIdentifier.call( this, identifier );

                this.klass = null;
                this.isAssignment = false;
            },

            qubyAst.FieldIdentifier,
            {
                validate: function (v) {
                    if (
                            v.ensureOutParameters( this, "Class field '" + this.identifier + "' used as a parameter." ) &&
                            v.ensureInMethod( this, "Class field '" + this.identifier + "' is used outside of a method." )
                    ) {
                        qubyAst.FieldIdentifier.prototype.validate.call( this, v );
                        this.klass = v.getCurrentClass().klass;
                    }
                },

                validateField: function (v) {
                    if ( this.isAssignment ) {
                        v.assignField(this);
                    } else {
                        v.useField( this );
                        this.isConstructor = v.isConstructor();
                    }
                },

                print: function (p) {
                    if ( this.klass ) {
                        if ( this.isAssignment ) {
                            p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass), '.', this.callName);
                        } else {
                            var strName = this.identifier +
                                    quby.runtime.FIELD_NAME_SEPERATOR +
                                    this.klass.name ;

                            // this is about doing essentially either:
                            //     ( this.field == undefined ? error('my_field') : this.field )
                            //  ... or ...
                            //     getField( this.field, 'my_field' );
                            var thisVar = quby.runtime.getThisVariable(this.isInsideExtensionClass);
                            if (quby.compilation.hints.useInlinedGetField()) {
                                p.append(
                                        '(',
                                            thisVar, ".", this.callName,
                                            '===undefined?quby.runtime.fieldNotFoundError(' + thisVar + ',"', strName, '"):',
                                            thisVar, ".", this.callName,
                                        ')'
                                );
                            } else {
                                p.append(
                                        "quby_getField(",
                                            thisVar, ".", this.callName, ',',
                                            thisVar, ",'",
                                            strName,
                                        "')"
                                );
                            }
                        }
                    }
                },

                setAssignment: function(v) {
                    this.isAssignment = true;
                }
            }
    );

    qubyAst.ThisVariable = util.klass(
            function( sym ) {
                qubyAst.Syntax.call( this, sym.offset );

                this.isThis = true;
            },

            qubyAst.Syntax,
            {
                validate: function(v) {
                    if (v.ensureOutParameters(this, "'this' object is referenced as a parameter (which isn't allowed).")) {
                        v.ensureInMethod(this, "'this' object is referenced outside of a class method (or you've named a variable 'this' which isn't allowed).");
                    }

                    this.isInsideExtensionClass = v.isInsideExtensionClass();
                    this.isConstructor = v.isConstructor();
                },
                print: function(p) {
                    p.append(quby.runtime.getThisVariable(this.isInsideExtensionClass));
                },

                setAssignment: function(v) {
                    v.parseError( this.offset, "Cannot assign a value to 'this'" );

                    return false;
                }
            }
    );

    /*
     * ### Arrays ###
     */

    qubyAst.ArrayAccess = util.klass(
            function( array, index ) {
                qubyAst.Syntax.call(
                        this,
                        (array !== null ? array.offset : null)
                )

                this.array = array;
                this.index = index;

                this.isAssignment = false;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    if ( this.isAssignment ) {
                        this.array.print(p);
                        p.append(',');
                        this.index.print(p);
                    } else {
                        p.append('quby_getCollection(');
                        this.array.print(p);
                        p.append(',');
                        this.index.print(p);
                        p.append(')');
                    }
                },

                validate: function (v) {
                    this.index.validate(v);
                    this.array.validate(v);
                },

                appendLeft: function( array ) {
                    if ( this.array !== null ) {
                        this.array.appendLeft( array );
                    } else if ( array ) {
                        this.setOffset( array.offset );
                        this.array = array;
                    }

                    return this;
                },

                setAssignment: function(v, parentAss) {
                    this.isAssignment = true;
                    parentAss.setCollectionMode();
                }
            }
    );

    qubyAst.ArrayDefinition = util.klass(
            function (parameters) {
                var offset;
                if ( parameters ) {
                    offset = parameters.offset;
                } else {
                    parameters = null;
                    offset = null;
                }

                qubyAst.Syntax.call(this, offset);

                this.parameters = parameters;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    p.append('(new QubyArray([');

                    if ( this.parameters !== null ) {
                        this.parameters.print(p);
                    }

                    p.append(']))');
                },

                validate: function (v) {
                    if ( this.parameters !== null ) {
                        this.parameters.validate(v);
                    }
                }
            }
    );

    qubyAst.HashDefinition = util.klass(
            function (parameters) {
                qubyAst.ArrayDefinition.call(this, parameters);
            },

            qubyAst.ArrayDefinition,
            {
                print: function (p) {
                    p.append('(new QubyHash(');

                    if ( this.parameters !== null ) {
                        this.parameters.print(p);
                    }

                    p.append('))');
                }
            }
    );

    /* Literals */
    qubyAst.Literal = util.klass(
            function (val, value, isTrue) {
                qubyAst.Expr.call(this, val.offset);

                this.isLiteral = true;
                this.isTrue = (!!isTrue);

                this.value = ( ! value ) ?
                        val.value :
                        value ;
            },

            qubyAst.Expr,
            {
                validate: function (v) {
                    // do nothing
                },
                print: function (p) {
                    var str = String(this.value);
                    p.append( String(this.value) );
                },

                /**
                 * If this literal evaluates to true, then 'true' is printed.
                 * Otherwise 'false'.
                 */
                printAsCondition: function(p) {
                    if ( this.isTrue ) {
                        p.append('true');
                    } else {
                        p.append('false');
                    }
                }
            }
    );

    qubyAst.Symbol = util.klass(
            function (sym) {
                qubyAst.Literal.call(this, sym);
                this.callName = quby.runtime.formatSymbol(this.value);
            },

            qubyAst.Literal,
            {
                validate: function (v) {
                    v.addSymbol(this);
                },
                print: function (p) {
                    p.append(this.callName);
                }
            }
    );

    qubyAst.String = util.klass(
            function (sym) {
                sym.value = sym.value.replace( /\n/g, "\\n" );
                return new qubyAst.Literal(sym, undefined, true);
            },

            qubyAst.Literal
    );

    qubyAst.Number = util.klass(
            function(sym) {
                qubyAst.Literal.call(this, sym, undefined, true);
            },

            qubyAst.Literal,
            {
                validate: function(v) {
                    var origNum = this.value,
                        num = origNum.replace( /_+/g, '' ),
                        decimalCount = 0;

                    // TODO validate num

                    if ( num.indexOf('.') === -1 ) {
                        this.value = num|0;
                    } else {
                        this.value = parseFloat(num);
                    }
                }
            }
    );

    qubyAst.Bool = util.klass(
            function (sym) {
                return new qubyAst.Literal( sym, undefined, sym.value );
            },
            qubyAst.Literal
    );

    qubyAst.Null = util.klass(
            function (sym) {
                return new qubyAst.Literal(sym, 'null', false);
            },
            qubyAst.Literal
    );

    /*
     * ### Function Generating stuff ###
     */

    /**
     * The base FunctionGenerator prototype. This does basic checks to ensure
     * the function we want to create actually exists.
     *
     * It handles storing common items.
     */
    qubyAst.FunctionGenerator = util.klass(
            function( obj, methodName, numParams ) {
                this.obj = obj;
                this.offset = obj.offset;

                this.klass = null;

                // the name of this modifier, i.e. read, write, attr, get, set, getset
                this.modifierName = obj.name;

                // flag used for checking if it's a generator,
                // only used inside this FunctionGenerator
                this.isGenerator = true;

                // the name of the method this generates
                this.name = methodName;
                this.callName = quby.runtime.formatFun( methodName, numParams );
            },

            {
                /* This validation code relies on the fact that when a function
                 * is defined on a class, it becomes the current function for that
                 * callname, regardless of if it's a diplicate function or not.
                 */
                validate: function(v) {
                    this.klass = v.getCurrentClass();

                    // checks for duplicate before this get
                    if ( this.validateNameClash(v) ) {
                        v.defineFun( this );
                        v.pushFunScope( this );

                        this.validateInside( v );

                        v.popScope();

                        var _this = this;
                        v.onEndValidate( function(v) { _this.onEndValidate(v); } );
                    }
                },

                getNumParameters: function() {
                    return numParams;
                },

                onEndValidate: function(v) {
                    this.validateNameClash( v );
                },

                validateInside: function(v) {
                    // do nothing
                },

                validateNameClash: function( v ) {
                    var currentFun = this.klass.getFun( this.callName );

                    if ( currentFun !== null && currentFun !== this ) {
                        // Give an error message depending on if we are
                        // dealing with a colliding modifier or function.
                        var errMsg = ( currentFun.isGenerator ) ?
                                "'" + this.modifierName + "' modifier in class '" + this.klass.klass.name + "' clashes with modifier '" + currentFun.modifierName + '", for generating: "' + this.name + '" method' :
                                "'" + this.modifierName + "' modifier in class '" + this.klass.klass.name + "' clashes with defined method: '" + this.name + '"' ;

                        v.parseError( this.offset, errMsg );

                        return false;
                    } else {
                        return true;
                    }
                },
            }
    );

    qubyAst.FunctionAttrGenerator = util.klass(
            function (obj, methodName, numParams, fieldObj, proto) {
                var fieldName;
                if ( fieldObj instanceof qubyAst.Variable || fieldObj instanceof qubyAst.FieldVariable ) {
                    fieldName = fieldObj.identifier;
                } else if ( fieldObj instanceof qubyAst.Symbol ) {
                    fieldName = fieldObj.value;
                } else {
                    fieldName = null;
                }

                var fullName = fieldName ? ( methodName + util.string.capitalize(fieldName) ) : methodName ;

                // doesn't matter if fieldName is null for this, as it will be invalid laterz
                qubyAst.FunctionGenerator.call( this, obj, fullName, numParams );

                // the name of our field, null if invalid
                this.fieldName = fieldName;
                this.fieldObj = fieldObj;

                // this is our fake field
                this.field = null;
            },

            qubyAst.FunctionGenerator,
            {
                validate: function(v) {
                    if ( this.fieldName !== null ) {
                        qubyAst.FunctionGenerator.prototype.validate.call( this, v );
                    } else {
                        v.parseError( this.fieldObj.offset, " Invalid parameter for generating '" + this.name + "' method" );
                    }
                },

                validateInside: function(v) {
                    this.field = new proto( new quby.lexer.EmptyIdSym(this.offset, this.fieldName) );
                    this.field.validate( v );
                }
            }
    );

    var FunctionReadGeneratorFieldVariable = util.klass(
            function( id ) {
                qubyAst.FieldVariable.call( this, id );
            },

            qubyAst.FieldVariable,
            {
                validateField: function(v) { } // we do this check ourselves later
            }
    );

    qubyAst.FunctionReadGenerator = util.klass(
            function (obj, methodPrefix, field) {
                qubyAst.FunctionAttrGenerator.call( this, obj, methodPrefix, 0, field, FunctionReadGeneratorFieldVariable );
            },

            qubyAst.FunctionAttrGenerator,
            {
                onEndValidate: function(v) {
                    qubyAst.FunctionAttrGenerator.prototype.onEndValidate.call( this, v );

                    if ( this.field ) {
                        if ( ! this.klass.hasFieldCallName(this.field.callName) ) {
                            v.parseError( this.offset, "Field '" + this.field.identifier + "' never written to in class '" + this.klass.klass.name + "' for generating method " + this.name );
                        }
                    }
                },

                /*
                 * This will be a method.
                 */
                print: function(p) {
                    if ( this.field ) {
                        p.append(this.callName, '=function(){return ');
                        this.field.print( p );
                        p.append(';}');
                    }
                },
            }
    );

    qubyAst.FunctionWriteGenerator = util.klass(
            function (obj, methodPrefix, field) {
                qubyAst.FunctionAttrGenerator.call( this,
                        obj,
                        methodPrefix,
                        1,
                        field,
                        qubyAst.FieldVariable
                )

                this.setAssignment();
            },

            qubyAst.FieldVariable,
            {
                onEndValidate: function(v) {
                    qubyAst.FunctionAttrGenerator.prototype.onEndValidate.call( this, v );

                    if ( this.field ) {
                        if ( ! this.klass.hasFieldCallName(this.field.callName) ) {
                            v.parseError( this.offset, "Field '" + this.field.identifier + "' never written to in class '" + this.klass.klass.name + "' for generating method " + this.name );
                        }
                    }
                },

                /*
                 * This will be a method.
                 */
                print: function(p) {
                    if ( this.field ) {
                        p.append(this.callName, '=function(t){return ');
                            this.field.print( p );
                            p.append('=t;');
                        p.append('}');
                    }
                },
            }
    );

    qubyAst.FunctionReadWriteGenerator = util.klass(
            function( obj, getPre, setPre, fieldObj ) {
                this.getter = new qubyAst.FunctionReadGenerator( obj, getPre, fieldObj );
                this.setter = new qubyAst.FunctionWriteGenerator( obj, setPre, fieldObj );
            },

            {
                validate: function( v ) {
                    this.getter.validate( v );
                    this.setter.validate( v );
                },

                print: function( p ) {
                    this.getter.print( p );
                    this.setter.print( p );
                }
            }
    );


    /* Other */
    qubyAst.PreInline = util.klass(
            function(sym) {
                qubyAst.Syntax.call(this, sym.offset);

                this.sym = sym;
                this.isPrinted = false;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    if ( ! this.isPrinted ) {
                        p.append( this.sym.value );

                        this.isPrinted = true;
                    }
                },
                validate: function (v) {
                    v.ensureAdminMode(
                            this, "Inlining JavaScript is not allowed outside of admin mode."
                    );

                    v.addPreInline( this );
                }
            }
    );

    qubyAst.Inline = util.klass(
            function(sym) {
                qubyAst.Syntax.call(this, sym.offset);

                this.sym = sym;
            },

            qubyAst.Syntax,
            {
                print: function (p) {
                    p.append( this.sym.value );
                },
                printAsCondition: function(p) {
                    this.print(p);
                },
                validate: function (v) {
                    v.ensureAdminMode(this, "Inlining JavaScript is not allowed outside of admin mode.");
                }
            }
    );
})( quby, util );
"use strict";
var quby = window['quby'] || {};

(function( quby, util ) {
    /**
     * Compilation contains information and utility functions for the compilation of Quby.
     */
    quby.compilation = {
        /* hints refer to things we should take advantage of in specific browsers. */
        hints : {
            _methodMissing: undefined,

            /**
            * @return True if the 'noSuchMethod' method is supported, and false if not.
            */
            useMethodMissing: function () {
                if (quby.compilation._methodMissing == undefined) {
                    // we deliberately cause method missing to get called

                    var obj = {
                        __noSuchMethod__: function () {
                            // do nothing
                        }
                    };

                    var supported = true;
                    try {
                        obj.call_unknown_method();
                    } catch (err) {
                        supported = false;
                    }

                    quby.compilation._methodMissing = supported;
                }

                return quby.compilation._methodMissing;
            },

            useInlinedGetField: function() {
                return util.browser.isMozilla || util.browser.isSafari;
            },
            
            doubleBracketOps: function() {
                return util.browser.isIE;
            }
        }
    }
})( quby, util );"use strict";
var quby = window['quby'] || {};

(function( quby, util ) {
    /**
    * Lexer
    * 
    * Functions and objects related to the lexical analysis section
    * of the parser are defined here.
    */
    quby.lexer = {
        EmptyIdSym: function( offset, value ) {
            quby.lexer.EmptySym.call( this, offset, value );
            this.lower = value.toLowerCase();
            return this;
        },
        
        IdSym: function( offset, value ) {
            quby.lexer.Sym.call( this, offset, value );
            this.lower = value.toLowerCase();
            return this;
        },
        
        Sym: function (offset, value) {
            quby.lexer.EmptySym.call( this,
                    new quby.main.LineInfo(offset, quby.main.currentParser().source),
                    value
            );
            return this;
        },
        
        EmptySym: function (offset, value) {
            this.offset = offset;
            this.value = value;
            return this;
        }
    };
})( quby, util );"use strict";
var quby = window['quby'] || {};

(function( quby, util ) {
    /**
     * Main
     *
     * Entry point for running the parser. Also handles recording
     * which is the current parser (to allow them to run
     * recursively).
     *
     * Users should simply call the 'parse' entry point
     * function for starting the parser.
     */
    quby.main = {
        UNKNOWN_SYNTAX_PREFIX: "Incorrect syntax around",
        UNKNOWN_SYNTAX_ERROR : "Incorrect syntax encountered.",

        parserStack: [],

        /**
         * Main parser engine running code.
         */
        currentParser: function () {
            return quby.main.parserStack[quby.main.parserStack.length - 1];
        },

        /**
         * Looks for scripts tags with the type
         * 'text/quby'. They are then pulled out,
         * and parsed in order.
         *
         * The result is then passed into the
         * callback given.
         *
         * If no callback is given, then the result
         * is just run automatically, or throws an
         * error if the source is incorrect.
         */
        runScriptTags: function( onResult ) {
            if ( ! onResult ) {
                onResult = function( result ) {
                    if ( result.hasErrors() ) {
                        throw new Error( result.errors[0] );
                    } else {
                        result.run();
                    }
                };
            }

            var scripts = document.getElementsByTagName( 'script' );
            var scriptCount        = 0,
                loadedScripts      = [],
                loadedScriptsAdmin = [];

            var addParseScripts = function( index, text, isAdmin ) {
                loadedScripts[index]      = text;
                loadedScriptsAdmin[index] = isAdmin;
            };

            /*
             * This variables ensures it should only run once,
             * however I am pretty certain it is not needed,
             * due to the way it's structured.
             *
             * This is just kept as a fallback, in case I am wrong.
             */
            var isParsed = false;
            var runParseScripts = function() {
                if ( !isParsed && scriptCount === loadedScripts.length ) {
                    isParsed = true;

                    var parser = new quby.main.Parser();

                    for ( var i = 0; i < scriptCount; i++ ) {
                        parser.parse( loadedScripts[i], loadedScriptsAdmin[i] );
                    }

                    parser.finish( onResult );
                }
            }

            for ( var i = 0; i < scripts.length; i++ ) {
                var script = scripts[i],
                    type   = script.getAttribute('type');

                if ( type === 'text/quby' || type === 'quby' ) {
                    var isAdmin = ( script.getAttribute( 'data-admin' ) === 'true' ) ?
                            true  :
                            false ;

                    var contents = script.innerHTML;

                    var scriptIndex = scriptCount;
                    scriptCount++;

                    // inlined tags
                    if ( contents !== '' && contents !== undefined ) {
                        // remove the CDATA wrap, if present
                        contents = contents.
                              replace(/^\/\/<!\[CDATA\[/, "").
                              replace(/\/\/\]\]>$/, "");

                        addParseScripts( scriptIndex, contents, isAdmin );
                        contents = null;

                    // src tags
                    } else {
                        var src = script.getAttribute('src');

                        if ( src === undefined ) {
                            throw new Error('cannot read script tag');
                        } else {
                            (function( src, scriptIndex, isAdmin ) {
                                util.ajax.get( src,
                                        function(text, status) {
                                            if ( status >= 200 && status < 400 ) {
                                                addParseScripts( scriptIndex, text, isAdmin );
                                                runParseScripts();
                                            } else {
                                                throw new Error( "failed to load script: " + src );
                                            }
                                        }
                                );
                            })( src, scriptIndex, isAdmin );
                        }
                    }
                }
            }

            runParseScripts();
        },

        /**
         *
         */
        parse: function (source, adminMode, callback) {
            var factory = new quby.main.Parser();

            factory.parse(source, adminMode, function() {
                factory.finish(callback);
            });
        },

        /**
         * This is for using multiple parsers together, for parsing multiple files.
         *
         * You can imagine a program is built from multiple files.
         * This is how parsing is based; you call a method to provide
         * a file until they are all provided. Then you call 'finish'
         * to finish compilation and generate the actual JS application.
         *
         * Some of these files may have different permissions;
         * core files with admin rights, and user files without these rights.
         * The various methods allow you to state what can do what.
         */
        Parser: function () {
            this.validator = new quby.main.Validator();

            this.enableStrictMode = function() {
                this.validator.setStrictMode( true );
            };

            this.disableStrictMode = function() {
                this.validator.setStrictMode( false );
            };

            /**
             * Parse a single file, adding it to the program being built.
             *
             * If a debugCallback is provided, then it will be called during
             * the parsing process. This makes parsing a tad slower, but provides
             * you with information on how it wen't (like the symbols generated
             * and how long the different stages took).
             *
             * If no debugCallback is provided, then it is run normally.
             */
            this.parse = function( source, adminMode, callback, debugCallback ) {
                this.validator.isAdminMode = adminMode;
                var _this  = this,
                    parser = new quby.main.ParserInner( source );

                util.future.run(
                        function() {
                            quby.main.parserStack.push( parser );

                            parser.run(
                                    function() {
                                        parser.validate( _this.validator );
                                        quby.main.parserStack.pop();

                                        if ( callback !== undefined && callback !== null ) {
                                            util.future.runFun( callback );
                                        }
                                    },
                                    debugCallback
                            );
                        }
                );
            };

            this.parseSources = function (sources, adminMode, callback) {
                var _this = this;
                util.future.map( sources, function(source) {
                    _this.parse( source, adminMode );
                } );

                if ( callback != undefined ) {
                    util.future.runFun( callback );
                }
            };

            this.parseFiles = function (urls, adminMode, callback) {
                var _this = this;
                util.future.map( urls, function(url) {
                    _this.parseFile( url, adminMode );
                } );

                if ( callback != undefined ) {
                    util.future.runFun( callback );
                }
            };

            this.parseFile = function (url, adminMode) {
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open( "GET", url, false );
                xmlhttp.send();

                var source = xmlhttp.responseText;

                this.parse( source, adminMode );
            };

            this.finish = function ( callback ) {
                var _this = this;

                util.future.run(
                        function() {
                            var output = _this.validator.finaliseProgram();
                            var result = new quby.main.Result(
                                    output,
                                    _this.validator.getErrors()
                            );

                            util.future.runFun( function() {
                                callback( result );
                            } );
                        }
                );
            };
        },

        /**
         * Result
         *
         * Handles creation and the structures for the object you get back from the parser.
         *
         * Essentially anything which crosses from the parser to the caller is stored and
         * handled by the contents of this script.
         */
        Result: (function() {
            var Result = function( code, errors ) {
                this.program = code;
                this.errors  = errors;
            }

            Result.prototype = {
                // default error behaviour
                onError: function( ex ) {
                    var errorMessage = ex.name + ': ' + ex.message;

                    if ( ex.stack ) {
                        errorMessage += '\n\n' + ex.stack;
                    }

                    alert( errorMessage );
                },

                /**
                 * Sets the function to run when this fails to run.
                 * By default this is an alert message displaying the error that has
                 * occurred.
                 *
                 * The function needs one parameter for taking an Error object that was
                 * caught.
                 *
                 * @param fun The function to run when an error has occurred at runtime.
                 */
                setOnError: function( fun ) {
                    this.onError = fun;
                },

                /**
                 * @return Returns the Quby application in it's compiled JavaScript form.
                 */
                getCode: function() {
                    return this.program;
                },

                /**
                 * @return True if there were errors within the result, otherwise false if there are no errors.
                 */
                hasErrors: function() {
                    return this.errors.length > 0;
                },

                /**
                 * This is boiler plate to call quby.runtime.runCode for you using the
                 * code stored in this Result object and the onError function set.
                 */
                run: function() {
                    if (!this.hasErrors()) {
                        quby.runtime.runCode(this.getCode(), this.onError);
                    }
                }
            }

            return Result;
        })(),

        /**
         * For creating a new Parser object.
         *
         * @param source The source code to parse.
         */
        ParserInner: (function() {
            var ParserInner = function( source ) {
                this.errors   = null;
                this.program  = null;
                this.parseErr = null;
                this.source   = new quby.main.SourceLines( source );
            }

            ParserInner.prototype = {
                run: function( callback, debugCallback ) {
                    var _this = this;

                    quby.parser.parse(
                            _this.source.getSource(),
                            function(program, errors) {
                                if ( errors.length > 0 ) {
                                    _this.errors = _this.formatErrors( _this.source, errors );
                                }

                                _this.program = program;

                                callback();
                            },
                            debugCallback
                    );
                },

                /*
                 * TODO update this to use the new parser error format.
                 */
                /**
                 * Turns the given errors into the output string
                 * that should be displayed for the user.
                 *
                 * You can imagine that this is the checkpoint
                 * between whatever internal format we use, and
                 * what the outside world is going to see.
                 *
                 * @param src The source code object used for finding the lines.
                 * @param errors The errors to parse.
                 * @return An array containing the information for each error to display.
                 */
                formatErrors: function( src, errors ) {
                    var errs = [];

                    for (var i = 0; i < errors.length; i++) {
                        var error   = errors[i],
                            errLine = src.getLine( error.offset ),
                            strErr;

                        if ( error.isSymbol ) {
                            strErr = "error parsing '" + error.match + "'";
                        } else if ( error.isTerminal ) {
                            if ( error.isLiteral || util.string.trim(error.match) === '' ) {
                                strErr = "syntax error near '" + error.terminalName + "'";
                            } else {
                                strErr = "syntax error near " + error.terminalName + " '" + error.match + "'";
                            }
                        } else {
                            throw new Error("Unknown parse.js error given to format");
                        }

                        errs.push({
                                line: errLine,
                                msg : strErr
                        });
                    }

                    return errs;
                },

                validate: function (validator) {
                    var es = this.errors;

                    if ( es === null ) {
                        validator.addProgram( this.program );
                    } else {
                        for (var i = 0; i < es.length; i++) {
                            validator.parseErrorLine( es[i].line, es[i].msg );
                        }
                    }
                }
            }

            return ParserInner;
        })(),

        /**
        * SourceLines deals with translations made to an original source code file.
        * It also deals with managing the conversions from an offset given from the
        * parser, to a line number in the original source code.
        */
        /*
        * In practice this works through two steps:
        *
        *  1) The source code is 'prepped' where certain changes are made. This
        * happens as soon as this is created and the result should be used by the
        * parser.
        *
        *  2) The source code is scanned and indexed. This is for converting
        * character offsets to line locations. This only occurres if a line number
        * has been requested, which in turn should only happen when there is an
        * error. This is to ensure it's never done unless needed.
        */
        SourceLines: function (src) {
            this.index = function (src) {
                var len = src.length;
                var lastIndex = 0;
                var lines = [];
                var running = true;

                /*
                 * Look for 1 slash n, if it's found, we use it
                 * otherwise we use \r.
                 *
                 * This is so we can index any code, without having to alter it.
                 */
                var searchIndex = (src.indexOf("\n", lastIndex) !== -1) ?
                        "\n" :
                        "\r" ;

                while ( running ) {
                    var index = src.indexOf( searchIndex, lastIndex );

                    if (index != -1) {
                        lines.push(index);
                        lastIndex = index + 1;
                        // the last line
                    } else {
                        lines.push(len);
                        running = false;
                    }

                    this.numLines++;
                }

                return lines;
            };

            this.getLine = function (offset) {
                // index source code on the fly, only if needed
                if (this.lineOffsets == null) {
                    this.lineOffsets = this.index( this.source );
                }

                for (var line = 0; line < this.lineOffsets.length; line++) {
                    // lineOffset is from the end of the line.
                    // If it's greater then offset, then we return that line.
                    // It's +1 to start lines from 1 rather then 0.
                    if (this.lineOffsets[line] > offset) {
                        return line + 1;
                    }
                }

                return this.numLines;
            };

            this.getSource = function () {
                return this.source;
            };

            // altered when indexed ...
            this.numLines = 0;
            this.lineOffsets = null;

            // source code altered and should be used for indexing
            this.source = src;
        },

        /**
         * Here is some example code:
         * class Foo
         *     def bar()
         *         foobar()
         *     end
         * end
         *
         * How do we know if 'foobar' is a call to a method or a function?
         * We don't! But this, class works it out, during 'endValidate'.
         */
        LateFunctionBinder: function (validator) {
            this.validator = validator;
            // class validators
            this.classVals = [];

            this.classFuns = [];
            this.currentClassV = null;

            this.setClassVal = function (klass) {
                this.currentClassV = klass;
            };

            this.addFun = function (fun) {
                var callName = this.currentClassV.klass.callName;
                var funs = this.classFuns[callName];

                if (!funs) {
                    funs = [];
                    this.classFuns[callName] = funs;
                    this.classVals[callName] = this.currentClassV;
                }

                var innerFuns = funs[fun.callName];
                if (!innerFuns) {
                    innerFuns = [];
                    funs[fun.callName] = innerFuns;
                }

                innerFuns.push(fun);
            };

            this.endValidate = function (globalFuns) {
                for (var className in this.classVals) {
                    var klassV = this.classVals[className];
                    var funs = this.classFuns[className];

                    for (var funName in funs) {
                        var innerFuns = funs[funName];
                        var fun = innerFuns[0];

                        if (klassV.hasFunInHierarchy(fun)) {
                            for (var i = 0; i < innerFuns.length; i++) {
                                innerFuns[i].setIsMethod();
                            }
                        } else if (!globalFuns[funName]) {
                            for (var i = 0; i < innerFuns.length; i++) {
                                var f = innerFuns[i];
                                this.validator.parseError(f.offset, "Function '" + f.name + "' called with " + f.getNumParameters() + " parameters, but is not defined in this class or as a function.");
                            }
                        }
                    }
                }
            };
        },

        /**
        * Used to store callName to display name mappings for all functions
        * and methods.
        *
        * This is used at runtime to allow it to lookup functions that
        * have been called but don't exist on the object.
        */
        FunctionTable: function () {
            this.funs = {};
            this.size = 0;

            this.add = function (callName, displayName) {
                this.funs[callName] = displayName;
                this.size++;
            };

            this.getFuns = function() {
                return this.funs;
            };

            this.print = function (p) {
                var fs = this.funs;

                p.append(quby.runtime.FUNCTION_TABLE_NAME, '={');

                // We print a comma between each entry
                // and we achieve this by always printing it before the next item,
                // except on the first one!
                var printComma = false;
                for (var callName in fs) {
                    var name = fs[callName];

                    // from second iteration onwards, this if is called
                    if ( printComma ) {
                        p.append( ',', callName, ":'", name, "'");
                    // this else is run on first iteration
                    } else {
                        p.append(callName, ":'", name, "'");
                        printComma = true;
                    }
                }

                p.append('}');
                p.endStatement();
            };
        },

        /**
        * This table is used for the symbol mappings.
        * Symbols are the :symbol code you can use in Quby/Ruby.
        *
        * This is printed into the resulting code for use at runtime.
        */
        SymbolTable: function () {
            this.symbols = {};

            this.add = function (sym) {
                this.symbols[sym.callName] = sym.value;
            };

            this.print = function (p) {
                var symbolsLength = this.symbols.length;

                for (var callName in this.symbols) {
                    var sym = this.symbols[callName];

                    p.append('var ', callName, " = '", sym, "'");
                    p.endStatement();
                }
            };
        },

        Validator: function () {
            // the various program trees that have been parsed
            this.programs = [];

            this.strictMode = true;

            this.classes = {};
            this.currentClass = null;
            this.rootClass = new quby.main.RootClassProxy();

            this.calledMethods = {};

            this.vars = [];
            this.funVars = [];
            this.isBlock = [];

            this.globals = {};
            this.usedGlobals = {};

            this.funs = {};
            this.usedFunsStack = [];

            /**
             * This is a list of every method name in existance,
             * across all code.
             * 
             * This is for printing the empty method stubs,
             * for when no methods are present for a class.
             */
            this.methodNames = new quby.main.FunctionTable();

            this.lateUsedFuns = new quby.main.LateFunctionBinder(this);
            this.errors = [];

            this.isParameters = false;
            this.isFunParameters = false;

            this.isConstructor = false;

            this.endValidateCallbacks = [];

            this.preInlines = [];

            // When 0, we are outside of a function's scope.
            // The scope is added when we enter a function definition.
            // From then on every extra layer of scope increments it further,
            // and every time we move down it is decremented until we exit the function.

            // Why??? When 0, we can scan all layers of this.vars looking for local variables.
            // When greater then 0 we can scan all layers (decrementing on each) until funCount == 0.
            this.funCount = 0;
            this.currentFun = null;
            this.isAdminMode = false;

            this.symbols = new quby.main.SymbolTable();

            this.setStrictMode = function(mode) {
                this.strictMode = !! mode;
            };

            this.addPreInline = function(inline) {
                this.preInlines.push( inline );
            };

            this.addSymbol = function (sym) {
                this.symbols.add(sym);
            };

            this.setInConstructor = function (inC) {
                this.inConstructor = inC;
            };
            this.isInConstructor = function () {
                return this.inConstructor;
            };

            this.setClass = function (klass) {
                if (this.currentClass != null) {
                    this.parseError(klass.offset, "Class '" + klass.name + "' is defined inside '" + this.currentClass.klass.name + "', cannot define a class within a class.");
                }

                var klassName = klass.callName;
                var kVal = this.classes[klassName];

                if (!kVal) {
                    kVal = new quby.main.ClassValidator(this, klass);
                    this.classes[klassName] = kVal;
                } else {
                    var oldKlass = kVal.klass;
                    var oldKlassHead = oldKlass.header;
                    var klassHead = klass.header;

                    // if super relationship is set later in the app
                    if (!oldKlassHead.hasSuper() && klassHead.hasSuper()) {
                        oldKlass.header = klassHead;
                    } else if (oldKlassHead.hasSuper() && klassHead.hasSuper()) {
                        if (oldKlassHead.getSuperCallName() != klassHead.getSuperCallName()) {
                            this.parseError(klass.offset, "Super class cannot be redefined for class '" + klass.name + "'.");
                        }
                    }
                }

                if (klass.callName == quby.runtime.ROOT_CLASS_CALL_NAME) {
                    this.rootClass.setClass(kVal);
                }
                this.lateUsedFuns.setClassVal(kVal);

                return (this.currentClass = kVal);
            };
            this.getClass = function (callName) {
                return this.classes[callName];
            };
            this.getCurrentClass = function () {
                return this.currentClass;
            };
            this.getRootClass = function () {
                return this.rootClass;
            };
            this.unsetClass = function () {
                this.currentClass = null;
            };
            this.isInsideClass = function () {
                return this.currentClass != null;
            };
            this.isInsideExtensionClass = function () {
                return this.currentClass != null && this.currentClass.klass.isExtensionClass;
            };
            this.useField = function (field) {
                this.currentClass.useField(field);
            };
            this.assignField = function (field) {
                this.currentClass.assignField(field);
            };
            this.useThisClassFun = function (fun) {
                this.currentClass.useFun(fun);
            };

            this.setParameters = function (isParameters, isFun) {
                this.isParameters = isParameters;
                this.isFunParameters = !!isFun;
            };

            this.isInsideParameters = function () {
                return this.isParameters;
            };
            this.isInsideFunParameters = function () {
                return this.isParameters && this.isFunParameters;
            };
            this.isInsideBlockParameters = function () {
                return this.isParameters && !this.isFunParameters;
            };

            this.isInsideClassDefinition = function () {
                return this.isInsideClass() && !this.isInsideFun();
            };

            this.pushScope = function () {
                this.vars.push({});
                this.isBlock.push(false);

                if (this.isInsideFun()) {
                    this.funCount++;
                }
            };
            this.pushFunScope = function (fun) {
                if (this.currentFun != null) {
                    quby.runtime.error("Fun within Fun", "Defining a function whilst already inside another function.");
                }

                this.currentFun = fun;
                this.funCount++;
                this.vars.push({});
                this.isBlock.push(false);
            };
            this.pushBlockScope = function () {
                this.pushScope();
                this.isBlock[this.isBlock.length - 1] = true;
            };

            this.popScope = function () {
                this.isBlock.pop();

                if (this.isInsideFun()) {
                    this.funCount--;

                    if (this.funCount <= 0) {
                        var rootFVars = this.vars.pop();

                        for (var i = 0; i < this.funVars.length; i++) {
                            var fVars = this.funVars[i];

                            for (var key in fVars) {
                                if (rootFVars[key] == undefined) {
                                    this.currentFun.addPreVariable(fVars[key]);
                                }
                            }
                        }

                        this.currentFun = null;
                        this.funVars = [];
                    } else {
                        this.funVars.push(this.vars.pop());
                    }
                } else {
                    this.vars.pop();
                }
            };

            /**
            * Returns true or false stating if the validator is within a scope
            * somewhere within a function. This could be within the root scope of
            * the function, or within a scope within that.
            *
            * @return True if the validator is within a function, somewhere.
            */
            this.isInsideFun = function (stmt) {
                return this.currentFun != null;
            };

            /**
            * Returns true or false stating if the validator is currently inside of
            * a block function.
            *
            * @return True if the validator is inside a block, otherwise false.
            */
            this.isInsideBlock = function () {
                return this.isBlock[this.isBlock.length - 1];
            };

            this.getCurrentFun = function () {
                return this.currentFun;
            };
            this.isConstructor = function () {
                return this.currentFun != null && this.currentFun.isConstructor;
            };

            this.assignVar = function (variable) {
                this.vars[this.vars.length - 1][variable.callName] = variable;
            };
            this.containsVar = function (variable) {
                var id = variable.callName;

                var stop;
                if (this.isInsideFun()) {
                    stop = this.vars.length - this.funCount;
                } else {
                    stop = 0;
                }

                for (var i = this.vars.length - 1; i >= stop; i--) {
                    if ( this.vars[i][id] != undefined ) {
                        return true;
                    }
                }

                return false;
            };
            this.containsLocalVar = function (variable) {
                var id = variable.callName;
                var scope = this.vars[this.vars.length - 1];

                return util.array.contains(scope, id);
            };
            this.containsLocalBlock = function () {
                var localVars = this.vars[this.vars.length - 1];

                for (var key in localVars) {
                    var blockVar = localVars[key];
                    if (blockVar.isBlockVar) {
                        return true;
                    }
                }

                return false;
            };

            this.assignGlobal = function (global) {
                this.globals[global.callName] = true;
            };
            this.useGlobal = function (global) {
                this.usedGlobals[global.callName] = global;
            };

            /**
             * Declares a function.
             *
             * By 'function' I mean function, constructor, method or function-generator.
             *
             * @param func
             */
            this.defineFun = function (func) {
                var klass = this.currentClass;

                // Methods / Constructors
                if (klass !== null) {
                    // Constructors
                    if ( func.isConstructor ) {
                        klass.addNew( func );
                        // Methods
                    } else {
                        klass.addFun( func );
                        this.methodNames.add( func.callName, func.name );
                    }
                // Functions
                } else {
                    if (util.array.contains(this.funs, func.callName)) {
                        this.parseError(func.offset, "Function is already defined: '" + func.name + "', with " + func.getNumParameters() + " parameters.");
                    }

                    this.funs[func.callName] = func;
                }
            };

            /* Store any functions which have not yet been defined.
            * Note that this will include valid function calls which are defined after
            * the call, but this is sorted in the endValidate section. */
            this.useFun = function (fun) {
                if ( fun.isMethod ) {
                    this.calledMethods[fun.callName] = fun;
                } else if (this.isInsideClass()) {
                    if (this.currentClass.hasFun(fun)) {
                        fun.setIsMethod();
                    } else {
                        this.lateUsedFuns.addFun(fun);
                    }
                } else if (!this.funs[fun.callName]) {
                    this.usedFunsStack.push(fun);
                }
            };

            this.pushScope();

            /**
             * Strict Errors are errors which we can live with,
             * and will not impact on the resulting program,
             * but should really be fixed.
             *
             * This is mostly here to smooth over the cracks
             * when breaking changes are made.
             *
             * Old version can stay, and the new one can be
             * enforced as a strict error (presuming that
             * behaviour does not change).
             */
            this.strictError = function( lineInfo, msg ) {
                if ( this.strictMode ) {
                    this.parseError( lineInfo, msg );
                }
            };

            this.parseError = function( lineInfo, msg ) {
                if ( lineInfo ) {
                    this.parseErrorLine( lineInfo.source.getLine(lineInfo.offset), msg );
                } else {
                    this.parseErrorLine( null, msg );
                }
            };

            this.parseErrorLine = function( line, msg ) {
                if ( line !== null && line !== undefined ) {
                    msg = "line " + line + ", " + msg;
                } else {
                    line = 0;
                }

                this.errors.push({
                        line: line,
                        msg: msg
                });
            };

            this.getErrors = function () {
                var errors = this.errors;

                if ( errors.length > 0 ) {
                    errors.sort(function(a, b) {
                        return a.line - b.line;
                    });

                    var sortedErrors = new Array( errors.length );
                    for ( var i = 0; i < errors.length; i++ ) {
                        sortedErrors[i] = errors[i].msg;
                    }

                    return sortedErrors;
                } else {
                    return errors;
                }
            };

            this.hasErrors = function() {
                return this.errors.length > 0;
            };

            // adds a program to be validated by this Validator
            this.addProgram = function (program) {
                if ( ! program ) {
                    // avoid unneeded error messages
                    if (this.errors.length === 0) {
                        this.strictError( null, "No source code provided" );
                    }
                } else {
                    try {
                        program.validate(this);
                        this.programs.push(program);
                    } catch ( err ) {
                        this.parseError(null, 'Unknown issue with your code has caused the parser to crash!');

                        if ( window.console && window.console.log ) {
                            window.console.log( err );

                            if ( err.stack ) {
                                window.console.log( err.stack );
                            }
                        }
                    }
                }
            };

            /**
            * Pass in a function and it will be called by the validator at the
            * end of validation. Note that all other validation occurres before
            * these callbacks are called.
            *
            * These are called in a FIFO order, but bear in mind that potentially
            * anything could have been added before your callback.
            */
            this.onEndValidate = function (callback) {
                this.endValidateCallbacks.push(callback);
            };

            /**
            * Validator should no longer be used after this is called.
            * It performs all of the final steps needed on the program and then
            * returns the output code.
            *
            * Note that output code is only returned if the program is valid.
            *
            * If it is not valid, then an empty string is returned. This is
            * done because printing an invalid program will either lead to
            * random errors (validation items being missing during the print),
            * or at best, you will receive an incomplete program with random
            * bits missing (which shouldn't be used).
            */
            this.finaliseProgram = function () {
                this.endValidate();

                if ( this.hasErrors() ) {
                    return '';
                } else {
                    return this.generateCode();
                }
            };

            /**
            * Private.
            *
            * Runs all final validation checks.
            * After this step the program is fully validated.
            */
            this.endValidate = function () {
                try {
                    /* Go through all function calls we have stored, which have not been
                    * confirmed as being defined. Note this can include multiple calls
                    * to the same functions. */
                    for (var usedFunsI in this.usedFunsStack) {
                        var fun = this.usedFunsStack[usedFunsI];
                        var callName = fun.callName;

                        // check if the function is not defined
                        if (!util.array.contains(this.funs, callName)) {
                            this.searchMissingFunAndError(fun, this.funs, 'function');
                        }
                    }

                    /* Check all used globals were assigned to, at some point. */
                    for (var strGlobal in this.usedGlobals) {
                        if (!this.globals[strGlobal]) {
                            var global = this.usedGlobals[strGlobal];
                            this.parseError(global.offset, "Global used but never assigned to: '" + global.identifier + "'.");
                        }
                    }

                    /* finalise all classes */
                    for (var klassI in this.classes) {
                        var klass = this.classes[klassI];
                        klass.endValidate();
                    }

                    /* Ensure all called methods do exist (somewhere) */
                    for (var methodI in this.calledMethods) {
                        var methodFound = false;
                        var method = this.calledMethods[methodI];

                        for (var klassI in this.classes) {
                            if (this.classes[klassI].hasFun(method)) {
                                methodFound = true;
                                break;
                            }
                        }

                        if ( !methodFound ) {
                            var found = this.searchForMethodLike( method ),
                                name = method.name.toLowerCase(),
                                errMsg = null;

                            if ( found !== null ) {
                                if ( name === found.name.toLowerCase() ) {
                                    errMsg = "Method '" + method.name + "' called with incorrect number of parameters, " + method.getNumParameters() + " instead of " + found.getNumParameters() ;
                                } else {
                                    errMsg = "Method '" + method.name + "' called with " + method.getNumParameters() + " parameters, but is not defined in any class. Did you mean: '" + found.name + "'?" ;
                                }
                            } else {
                                // no alternative method found
                                errMsg = "Method '" + method.name + "' called with " + method.getNumParameters() + " parameters, but is not defined in any class." ;
                            }

                            this.parseError(method.offset, errMsg );
                        }
                    }

                    this.lateUsedFuns.endValidate(this.funs);

                    // finally, run the callbacks
                    while (this.endValidateCallbacks.length > 0) {
                        var callback = this.endValidateCallbacks.shift();
                        callback(this);
                    }
                } catch ( err ) {
                    this.parseError(null, 'Unknown issue with your code has caused the parser to crash!');

                    if ( window.console && window.console.log ) {
                        if ( err.stack ) {
                            window.console.log( err.stack );
                        } else {
                            window.console.log( err );
                        }
                    }
                }
            };

            /**
            * Turns all stored programs into
            */
            this.generateCode = function () {
                var printer = new quby.main.Printer(this);

                printer.setCodeMode(false);
                this.generatePreCode(printer);
                printer.setCodeMode(true);

                for (var i = 0; i < this.programs.length; i++) {
                    this.programs[i].print(printer);
                }

                return printer.toString();
            };

            this.generateNoSuchMethodStubs = function(p) {
                // generate the noSuchMethod function stubs
                if ( ! quby.compilation.hints.useMethodMissing() ) {
                    var rootKlass = this.getRootClass().getClass();
                    var callNames = [];
                    var extensionStr = [];
                    var ms = this.methodNames.getFuns();

                    p.append(quby.runtime.FUNCTION_DEFAULT_TABLE_NAME,'={');

                    var errFun = ":function(){quby_errFunStub(this,arguments);}";
                    var printComma = false;
                    for ( var callName in ms ) {
                        if (
                                rootKlass === null ||
                                !rootKlass.hasFunCallName(callName)
                        ) {
                            // from second iteration onwards, this if is called
                            if ( printComma ) {
                                p.append( ',', callName, ':function(){noSuchMethodError(this,"' + callName + '");}' );
                            // this else is run on first iteration
                            } else {
                                p.append( callName, ':function(){noSuchMethodError(this,"' + callName + '");}' );
                                printComma = true;
                            }

                            callNames[ callNames.length ] = callName;
                            extensionStr[ extensionStr.length ] = ['.prototype.', callName, '=', quby.runtime.FUNCTION_DEFAULT_TABLE_NAME, '.', callName].join('');
                        }
                    }

                    p.append('}');
                    p.endStatement();

                    // print empty funs for each Extension class
                    var classes = quby.runtime.CORE_CLASSES;
                    var numNames = callNames.length;
                    for (var i = 0; i < classes.length; i++) {
                        var name = classes[i];
                        var transName = quby.runtime.translateClassName( name );
                        var thisKlass = this.getClass( name );

                        for ( var j = 0; j < callNames.length; j++ ) {
                            var callName = callNames[j];

                            if ( thisKlass === undefined || !thisKlass.hasFunCallName(callName) ) {
                                p.append( transName, extensionStr[j] );
                                p.endStatement();
                            }
                        }
                    }

                    if ( rootKlass !== null ) {
                        rootKlass.setNoMethPrintFuns( callNames );
                    }
                }
            };

            this.generatePreCode = function (p) {
                this.methodNames.print(p);
                this.symbols.print(p);
                p.printArray( this.preInlines );

                this.generateNoSuchMethodStubs(p);

                // print the Object functions for each of the extension classes
                var classes = quby.runtime.CORE_CLASSES;
                var stmts = this.rootClass.getPrintStmts();
                for (var i = 0; i < classes.length; i++) {
                    var name = classes[i];
                    p.appendExtensionClassStmts(name, stmts);
                }
            };

            /* Validation Helper Methods */

            this.ensureInConstructor = function (syn, errorMsg) {
                return this.ensureTest(!this.isInsideFun() || !this.isInsideClass() || !this.isConstructor(), syn, errorMsg);
            };
            this.ensureInMethod = function (syn, errorMsg) {
                return this.ensureTest(!this.isInsideFun() || !this.isInsideClass(), syn, errorMsg);
            };
            this.ensureAdminMode = function (syn, errorMsg) {
                return this.ensureTest(!this.isAdminMode, syn, errorMsg);
            };
            this.ensureInFun = function (syn, errorMsg) {
                return this.ensureTest(!this.isInsideFun(), syn, errorMsg);
            };
            this.ensureOutFun = function (syn, errorMsg) {
                return this.ensureTest(this.isInsideFun(), syn, errorMsg);
            };
            this.ensureOutBlock = function (syn, errorMsg) {
                return this.ensureTest(this.isInsideBlock(), syn, errorMsg);
            };
            this.ensureInClass = function (syn, errorMsg) {
                return this.ensureTest(!this.isInsideClass(), syn, errorMsg);
            };
            this.ensureOutClass = function (syn, errorMsg) {
                return this.ensureTest(this.isInsideClass(), syn, errorMsg);
            };
            this.ensureOutParameters = function (syn, errorMsg) {
                return this.ensureTest(this.isInsideParameters(), syn, errorMsg);
            };
            this.ensureInFunParameters = function (syn, errorMsg) {
                return this.ensureTest(!this.isInsideFunParameters(), syn, errorMsg);
            };
            this.ensureTest = function (errCondition, syn, errorMsg) {
                if (errCondition) {
                    this.parseError(syn.offset, errorMsg);
                    return false;
                } else {
                    return true;
                }
            };

            /**
             * Searches through all classes,
             * for a method which is similar to the one given.
             *
             * @param method The method to search for one similar too.
             * @param klassVal An optional ClassValidator to restrict the search, otherwise searches through all classes.
             */
            this.searchForMethodLike = function( method, klassVal ) {
                if ( klassVal ) {
                    return this.searchMissingFun( method, klassVal.funs );
                } else {
                    var searchKlassVals = this.classes,
                        altMethod = null,
                        methodName = method.name.toLowerCase() ;
                    // check for same method, but different number of parameters

                    for ( var i in searchKlassVals ) {
                        var found = this.searchMissingFunWithName( methodName, searchKlassVals[i].funs );

                        if ( found !== null ) {
                            // wrong number of parameters
                            if ( found.name.toLowerCase() == methodName ) {
                                return found;
                            // alternative name
                            } else if ( altMethod === null ) {
                                altMethod = found;
                            }
                        }
                    }

                    return altMethod;
                }
            };

            /**
             * Note that this uses name, and not callName!
             *
             * 'incorrect parameters' comes first, and takes priority when it comes to being returned.
             * 'alternative name' is returned, only if 'incorrect parameters' does not come first.
             * Otherwise null is returned.
             */
            this.searchMissingFunWithName = function (name, searchFuns) {
                var altNames = [],
                    altFun = null;
                var nameLen = name.length;

                if (
                        nameLen > 3 &&
                        ( name.indexOf('get') === 0 || name.indexOf('set') === 0 )

                ) {
                    altNames.push( name.substr(3) );
                } else {
                    altNames.push( 'get' + name );
                    altNames.push( 'set' + name );
                }

                for (var funIndex in searchFuns) {
                    var searchFun = searchFuns[funIndex];
                    var searchName = searchFun.name.toLowerCase();

                    if (searchName === name) {
                        return searchFun;
                    } else if ( altFun === null ) {
                        for ( var i = 0; i < altNames.length; i++ ) {
                            var altName = altNames[i];

                            if ( searchName == altName ) {
                                altFun = searchFun;
                                break;
                            }
                        }
                    }
                }

                return altFun;
            };

            this.searchMissingFun = function( fun, searchFuns ) {
                return this.searchMissingFunWithName( fun.name.toLowerCase(), searchFuns );
            };

            /**
             *
             */
            this.searchMissingFunAndError = function (fun, searchFuns, strFunctionType) {
                var name = fun.name.toLowerCase();
                var found = this.searchMissingFunWithName( name, searchFuns ),
                    errMsg;

                if ( found !== null ) {
                    if ( name === found.name.toLowerCase() ) {
                        errMsg = "Called " + strFunctionType + " '" + fun.name + "' with wrong number of parameters.";
                    } else {
                        errMsg = "Called " + strFunctionType + " '" + fun.name + "', but it is not defined, did you mean: '" + found.name + "'." ;
                    }
                } else {
                    errMsg = "Undefined " + strFunctionType + " called: '" + fun.name + "'.";
                }

                this.parseError(fun.offset, errMsg);
            };
        },

        /**
        * Whilst validating sub-classes will want to grab the root class.
        * If it has not been hit yet then we can't return it.
        * So instead we use a proxy which always exists.
        *
        * This allows us to set the root class later.
        */
        RootClassProxy: function () {
            this.rootClass = null;

            this.setClass = function (klass) {
                if (this.rootClass == null) {
                    this.rootClass = klass;
                }
            };
            this.getClass = function () {
                return this.rootClass;
            };

            /**
            * Should only be called after validation (during printing).
            */
            this.getPrintStmts = function (p, className) {
                if (this.rootClass == null) {
                    return [];
                } else {
                    return this.rootClass.klass.statements.getStmts();
                }
            };
        },

        ClassValidator: function (validator, klass) {
            this.validator = validator;
            this.klass = klass;

            this.funs = {};
            this.usedFuns = {};
            this.news = [];

            this.isPrinted = false;

            this.usedFields = {};
            this.assignedFields = {};

            this.useField = function (field) {
                this.usedFields[field.callName] = field;
            };
            this.assignField = function (field) {
                this.assignedFields[field.callName] = field;
            };
            this.hasField = function (field) {
                var fieldCallName = quby.runtime.formatField(
                        this.klass.name,
                        field.identifier
                );

                return this.hasFieldCallName( fieldCallName );
            };
            this.hasFieldCallName = function(callName) {
                return this.assignedFields[ callName ] != undefined;
            };

            this.addFun = function (fun) {
                var index = fun.callName;

                if ( this.funs.hasOwnProperty(index) ) {
                    validator.parseError(fun.offset, "Duplicate method '" + fun.name + "' definition in class '" + this.klass.name + "'.");
                }

                this.funs[index] = fun;
            };
            this.hasFunInHierarchy = function (fun) {
                if ( this.hasFun(fun) ) {
                    return true;
                } else {
                    var parentName = klass.getSuperCallName();
                    var parentVal;

                    // if has a parent class, pass the call on to that
                    if (
                        parentName != null &&
                        (parentVal = this.validator.getClass(parentName)) != undefined
                    ) {
                        return parentVal.hasFunInHierarchy( fun );
                    } else {
                        return false;
                    }
                }
            };

            /**
             * States if this class has the given function or not.
             *
             * Ignores parent classes.
             */
            this.hasFun = function (fun) {
                return this.hasFunCallName( fun.callName );
            };

            /**
             * States if this class has a method with the given call name, or not.
             *
             * Ignores parent classes.
             */
            this.hasFunCallName = function(callName) {
                return this.funs.hasOwnProperty(callName);
            };
            this.useFun = function (fun) {
                if (!this.funs[fun.callName]) {
                    this.usedFuns[fun.callName] = fun;
                }
            };

            this.getFun = function( callName ) {
                var f = this.funs[ callName ];
                return ( f === undefined ) ? null : f ;
            };

            this.addNew = function (fun) {
                var index = fun.getNumParameters();

                if ( this.news[index] != undefined ) {
                    validator.parseError(fun.offset, "Duplicate constructor for class '" + this.klass.name + "' with " + index + " parameters.");
                }

                this.news[index] = fun;
            };

            /**
             * Returns an array containing all of the number of
             * parameters, that this expects.
             */
            this.getNewParameterList = function() {
                if ( this.news.length === 0 ) {
                    return [ 0 ];
                } else {
                    var numParams = [];

                    for ( var k in this.news ) {
                        numParams.push( k );
                    }

                    return numParams;
                }
            };

            this.hasNew = function (fun) {
                return this.news[fun.getNumParameters()] != undefined;
            };
            this.noNews = function () {
                return this.news.length == 0;
            };

            this.setNoMethPrintFuns = function( callNames ) {
                this.noMethPrintFuns = callNames;
            };

            this.printOnce = function (p) {
                if (!this.isPrinted) {
                    this.isPrinted = true;
                    this.print(p);
                }
            };
            /**
            * In practice, this is only ever called by non-extension classes.
            */
            this.print = function (p) {
                p.setCodeMode(false);

                var klassName = this.klass.callName;
                var superKlass = this.klass.getSuperCallName();

                // class definition itself
                p.append('function ', klassName, '() {');
                if (superKlass != null) {
                    p.append(superKlass, '.apply(this);');
                }
                // set 'this' to '_this'
                p.append('var ', quby.runtime.THIS_VARIABLE, ' = this;');

                if ( this.noMethPrintFuns ) {
                    for ( var i = 0; i < this.noMethPrintFuns.length; i++ ) {
                        var callName = this.noMethPrintFuns[i];

                        p.append( 'this.', callName, '=', quby.runtime.FUNCTION_DEFAULT_TABLE_NAME, '.', callName );
                        p.endStatement();
                    }
                }

                for (var strFun in this.funs) {
                    var fun = this.funs[strFun];

                    p.append('this.');
                    fun.print(p);
                    p.endStatement();
                }
                p.append('}');

                // class constructors
                for (var newIndex in this.news) {
                    var newFun = this.news[newIndex];

                    newFun.print(p);
                }

                p.setCodeMode(true);
            };

            this.endValidate = function () {
                var thisKlass = this.klass;

                // if no constructors, add a default no-args constructor
                // but only for non-core classes
                if (this.news.length == 0 && !this.klass.isExtensionClass) {
                    var constructor = new quby.ast.Constructor(
                            quby.lexer.EmptySym(thisKlass.offset, "new"),
                            null,
                            null
                    );
                    constructor.setClass(thisKlass);

                    this.addNew(constructor);
                }

                // Check for circular inheritance trees.
                // Travel up the inheritance tree marking all classes we've seen.
                // If we see one we've already seen, then we break with a parse error.
                var seenClasses = {};
                seenClasses[thisKlass.callName] = true;

                var head = thisKlass.header;
                var superClassVs = []; // cache the order of super classes

                while (head.hasSuper()) {
                    var superKlassV = this.validator.getClass(head.getSuperCallName());

                    if (!superKlassV) {
                        if (!quby.runtime.isCoreClass(head.getSuperName().toLowerCase())) {
                            this.validator.parseError(thisKlass.offset,
                                    "Super class not found: '" +
                                    head.getSuperName() +
                                    "', for class '" +
                                    thisKlass.name +
                                    "'."
                            );
                        }

                        break;
                    } else {
                        var superKlass = superKlassV.klass;

                        if (seenClasses[superKlass.callName]) {
                            this.validator.parseError(
                                    thisKlass.offset,
                                    "Circular inheritance tree is found for class '" + thisKlass.name + "'."
                            );

                            break;
                        } else {
                            superClassVs.push( superKlassV );
                            seenClasses[superKlass.callName] = true;
                            head = superKlass.header;
                        }
                    }
                }

                // validate fields
                for (var fieldI in this.usedFields) {
                    if (this.assignedFields[fieldI] == undefined) {
                        var field = this.usedFields[fieldI];
                        var fieldErrorHandled = false;

                        // search up the super class tree for a field of the same name
                        if ( thisKlass.header.hasSuper() ) {
                            for ( var i = 0; i < superClassVs.length; i++ ) {
                                var superClassV = superClassVs[ i ];

                                if ( superClassV.hasField(field) ) {
                                    this.validator.parseError( field.offset,
                                            "Field '@" +
                                            field.identifier +
                                            "' from class '" +
                                            superClassV.klass.name +
                                            "' is accessd in sub-class '" +
                                            thisKlass.name +
                                            "', however fields are private to each class."
                                    );

                                    fieldErrorHandled = true;
                                    break;
                                }
                            }
                        }

                        if ( ! fieldErrorHandled ) {
                            this.validator.parseError( field.offset,
                                    "Field '@" +
                                    field.identifier +
                                    "' is used in class '" +
                                    thisKlass.name +
                                    "' without ever being assigned to."
                            );
                        }
                    }
                }

                // Search for funs used on this class.
                // This is more strict then other method checks,
                // as it takes into account that the target is 'this'.
                for (var funName in this.usedFuns) {
                    if (!this.funs[funName]) {
                        var fun = this.usedFuns[funName];

                        if ( ! this.hasFunInHierarchy(fun) ) {
                            this.validator.searchMissingFunAndError(
                                    fun, this.funs, thisKlass.name + ' method'
                            );
                        }
                    }
                }
            };
        },

        Printer: (function() {
            var STATEMENT_END = ';\n';

            var Printer = function (validator) {
                this.validator = validator;

                this.tempVarCounter = 0;

                this.isCode = true;
                this.pre   = [];
                this.stmts = [];
                this.preOrStmts = this.stmts;

                this.currentPre  = new quby.main.PrinterStatement();
                this.currentStmt = new quby.main.PrinterStatement();
                this.current     = this.currentStmts;

                Object.preventExtensions( this );
            }

            Printer.prototype = {
                getTempVariable: function() {
                    return quby.runtime.TEMP_VARIABLE + (this.tempVarCounter++);
                },

                getValidator: function () {
                    return this.validator;
                },

                setCodeMode: function (isCode) {
                    if ( isCode ) {
                        this.current = this.currentStmt;
                        this.preOrStmts = this.stmts;
                    } else {
                        this.current = this.currentPre;
                        this.preOrStmts = this.pre;
                    }

                    this.isCode = isCode;
                },

                appendExtensionClassStmts: function (name, stmts) {
                    var stmtsStart = quby.runtime.translateClassName(name) + '.prototype.';

                    for (var key in stmts) {
                        var fun = stmts[key];

                        if ( fun.isConstructor ) {
                            fun.print( this );
                        } else {
                            this.append(stmtsStart);
                            fun.print( this );
                        }

                        this.endStatement();
                    }
                },

                printArray: function(arr) {
                    for (
                            var i = 0, len = arr.length;
                            i < len;
                            i++
                    ) {
                        arr[i].print( this );
                        this.endStatement();
                    }
                },

                addStatement: function() {
                    this.stmts.push( arguments.join('') );
                },

                flush: function() {
                    this.current.flush( this.preOrStmts );

                    return this;
                },

                endStatement: function () {
                    this.append( STATEMENT_END );

                    return this.flush();
                },

                toString: function () {
                    // concat everything into this.pre ...
                    this.currentPre.flush( this.pre );
                    util.array.addAll( this.pre, this.stmts );
                    this.currentStmt.flush( this.pre ); // yes, pass in pre!

                    return this.pre.join('');
                }
            }

            // Chrome is much faster at iterating over the arguments array,
            // maybe I'm hitting an optimization???
            // see: http://jsperf.com/skip-arguments-check
            if ( util.browser.isChrome ) {
                Printer.prototype.appendPre = function () {
                    for ( var i = 0; i < arguments.length; i++ ) {
                        this.current.appendPre(arguments[i]);
                    }

                    return this;
                };
                Printer.prototype.append = function () {
                    for ( var i = 0; i < arguments.length; i++ ) {
                        this.current.appendNow(arguments[i]);
                    }

                    return this;
                };
                Printer.prototype.appendPost = function () {
                    for ( var i = 0; i < arguments.length; i++ ) {
                        this.current.appendPost(arguments[i]);
                    }

                    return this;
                };
            } else {
                Printer.prototype.appendPre = function (a) {
                    if ( arguments.length === 1 ) {
                        this.current.appendPre( a );
                    } else {
                        for ( var i = 0; i < arguments.length; i++ ) {
                            this.current.appendPre(arguments[i]);
                        }
                    }

                    return this;
                };
                Printer.prototype.append = function (a) {
                    if ( arguments.length === 1 ) {
                        this.current.appendNow( a );
                    } else {
                        for ( var i = 0; i < arguments.length; i++ ) {
                            this.current.appendNow(arguments[i]);
                        }
                    }

                    return this;
                };
                Printer.prototype.appendPost = function (a) {
                    if ( arguments.length === 1 ) {
                        this.current.appendPost( a );
                    } else {
                        for ( var i = 0; i < arguments.length; i++ ) {
                            this.current.appendPost(arguments[i]);
                        }
                    }

                    return this;
                };
            }

            return Printer;
        })(),

        PrinterStatement: (function() {
            var PrinterStatement = function () {
                this.preStatement     = null;
                this.currentStatement = null;
                this.postStatement    = null;

                Object.preventExtensions( this );
            }

            PrinterStatement.prototype = {
                appendPre: function (e) {
                    if (this.preStatement === null) {
                        this.preStatement = [e];
                    } else {
                        this.preStatement.push( e );
                    }
                },
                appendNow: function (e) {
                    if (this.currentStatement === null) {
                        this.currentStatement = [e];
                    } else {
                        this.currentStatement.push( e );
                    }
                },
                appendPost: function (e) {
                    if (this.postStatement === null) {
                        this.postStatement = [e];
                    } else {
                        this.postStatement.push( e );
                    }
                },

                endAppend: function( dest, src ) {
                    for (
                            var i = 0, len = src.length;
                            i < len;
                            i++
                    ) {
                        dest[ dest.length ] = src[i];
                    }
                },

                flush: function ( stmts ) {
                    if (this.preStatement !== null) {
                        if (this.currentStatement !== null) {
                            if (this.postStatement !== null) {
                                this.endAppend( stmts, this.preStatement );
                                this.endAppend( stmts, this.currentStatement );
                                this.endAppend( stmts, this.postStatement );
                            } else {
                                this.endAppend( stmts, this.preStatement );
                                this.endAppend( stmts, this.currentStatement );
                            }
                        } else if (this.postStatement !== null) {
                            this.endAppend( stmts, this.preStatement );
                            this.endAppend( stmts, this.postStatement );
                        } else {
                            this.endAppend( stmts, this.preStatement );
                        }

                        this.clear();
                    } else if (this.currentStatement !== null) {
                        if (this.postStatement !== null) {
                            this.endAppend( stmts, this.currentStatement );
                            this.endAppend( stmts, this.postStatement );
                        } else {
                            this.endAppend( stmts, this.currentStatement );
                        }

                        this.clear();
                    } else if ( this.postStatement !== null ) {
                        this.endAppend( stmts, this.postStatement );

                        this.clear();
                    }
                },

                clear: function () {
                    this.preStatement     = null;
                    this.currentStatement = null;
                    this.postStatement    = null;
                }
            }

            return PrinterStatement;
        })(),

        LineInfo: (function() {
            var LineInfo = function (offset, source) {
                this.offset = offset;
                this.source = source;

                Object.preventExtensions( this );
            }

            LineInfo.prototype.getLine = function () {
                return this.source.getLine(this.offset);
            }

            return LineInfo;
        })()
    };
})( quby, util );
"use strict";

var quby = window['quby'] || {};

/**
 * quby.parse
 *
 * This is the parser interface for Quby. This parses given source code, and
 * then builds an abstract tree (or errors) describing it.
 *
 * In many ways this is glue code, as it uses:
 *  - parse.js for parsing
 *  - quby.ast for building the AST
 *  - quby.lexer for building the symbols
 *
 * It is also built to have it's work lined across multiple time intervals. That
 * way it won't freeze the CPU.
 *
 * All of this is provided through one function: quby.parse.parse
 */
(function( quby, util, window, undefined ) {
    var parse = window['parse'];

    var log = function() {
        if ( window['console'] && window['console']['log'] ) {
            window['console']['log'].apply( window['console'], arguments );
        }
    };

    /**
     * ASCII codes for characters.
     *
     * @type {number}
     * @const
     */
    var TAB     =  9, // \t
        SLASH_N = 10, // \n
        SLASH_R = 13, // \r

        SPACE = 32,
        EXCLAMATION = 33,
        DOUBLE_QUOTE = 34,
        HASH = 35,
        DOLLAR = 36,
        PERCENT = 37,
        AMPERSAND = 38,
        SINGLE_QUOTE = 39,
        LEFT_PAREN = 40,
        RIGHT_PAREN = 41,
        STAR = 42, // *
        PLUS = 43,
        COMMA = 44,
        MINUS = 45,
        FULL_STOP = 46,
        SLASH = 47,

        ZERO = 48,
        ONE = 49,
        TWO = 50,
        THREE = 51,
        FOUR = 52,
        FIVE = 53,
        SIX = 54,
        SEVEN = 55,
        EIGHT = 56,
        NINE = 57,

        COLON = 58,
        SEMI_COLON = 59,

        LESS_THAN = 60,
        EQUAL = 61,
        GREATER_THAN = 62,
        QUESTION_MARK = 63,
        AT = 64,

        LEFT_SQUARE = 91,
        BACKSLASH = 92,
        RIGHT_SQUARE = 93,
        CARET = 94,
        UNDERSCORE = 95,

        LOWER_A = 97,
        LOWER_B = 98,
        LOWER_C = 99,
        LOWER_D = 100,
        LOWER_E = 101,
        LOWER_F = 102,
        LOWER_G = 103,
        LOWER_H = 104,
        LOWER_I = 105,
        LOWER_J = 106,
        LOWER_K = 107,
        LOWER_L = 108,
        LOWER_M = 109,
        LOWER_N = 110,
        LOWER_O = 111,
        LOWER_P = 112,
        LOWER_Q = 113,
        LOWER_R = 114,
        LOWER_S = 115,
        LOWER_T = 116,
        LOWER_U = 117,
        LOWER_V = 118,
        LOWER_W = 119,
        LOWER_X = 120,
        LOWER_Y = 121,
        LOWER_Z = 122,

        LEFT_BRACE = 123,
        BAR = 124,
        RIGHT_BRACE = 125,
        TILDA = 126;

    /**
     * Returns true if the character code given
     * is an alphanumeric character.
     *
     * @nosideeffects
     * @const
     * @param {number} code
     * @return {boolean}
     */
    var isAlphaNumericCode = function(code) {
        return (
                (code >=  LOWER_A && code <= LOWER_Z) || // lower case letter
                (code === UNDERSCORE) ||
                (code >=  ZERO && code <= NINE)     // a number
        );
    };

    var isAlphaCode = function(code) {
        return (code >= LOWER_A && code <= LOWER_Z);
    }

    /**
     * Returns true if the character in src,
     * at i, is not a lower case letter, underscore or number.
     *
     * @nosideeffects
     * @const
     * @param {string} src
     * @param {number} i
     * @return {boolean}
     */
    var isAlphaNumeric = function( src, i ) {
        var code = src.charCodeAt(i+src.length);

        return isAlphaNumericCode( code );
    };

    /* Terminals */

    /**
     * Makes minor changes to the source code to get it ready for parsing.
     *
     * This is primarily a cheap fix to a number of parser bugs where it expects an
     * end of line character. This method is for wrapping all of these cheap fixes
     * into one place.
     *
     * It is intended that this method only makes minor changes which results in
     * source code which is still entirely valid. It should make any major changes.
     *
     * @param source The source code to prep.
     */
    var preParse = (function() {
        var pushWhitespace = function( newSrc, size ) {
            var diff5 = (size/5)|0;

            // push the whitespace on in clumps of 5 characters
            for ( var i = 0; i < diff5; i++ ) {
                newSrc.push( '     ' );
            }

            // then push on the remainder
            var remainder = size % 5;
            if ( remainder === 1 ) {
                newSrc.push( ' ' );
            } else if ( remainder === 2 ) {
                newSrc.push( '  ' );
            } else if ( remainder === 3 ) {
                newSrc.push( '   ' );
            } else if ( remainder === 4 ) {
                newSrc.push( '    ' );
            }
        };

        var getLeft = function (src, i) {
            if (i > 0) {
                return src.charCodeAt(i - 1);
            } else {
                return null;
            }
        };

        var getRight = function (src, i) {
            return getR(src, i + 1);
        };

        var getR = function (src, i) {
            if (i < src.length) {
                return src.charCodeAt(i);
            } else {
                return null;
            }
        };

        /**
         * alterations:
         *  : removes comments
         *      // single line comments
         *      / * * / multi-line comments
         */
        var stripComments = function (src) {
            var inAdmin         = false;
            var inPreAdmin      = false;
            var inSingleComment = false;
            var inDoubleString  = false;
            var inSingleString  = false;

            /**
             * This is a count so we can track nested comments.
             *
             * When it is 0, there is no comment. When it is greater than 0, we
             * are in a comment.
             */
            var multiCommentCount = 0,
                newSrc = [],
                startI = 0;

            // note that i is incremented within the code as well as within the for.
            for (
                    var i = 0, len = src.length;
                    i < len;
                    i++
            ) {
                var c = src.charCodeAt(i);

                // these are in order of precedence
                if ( inAdmin ) {
                    if (
                                        c === HASH         &&
                            getR(src,i+1) === GREATER_THAN &&
                            getR(src,i+2) === HASH
                    ) {
                        inAdmin = false;
                        i += 2;
                    }
                } else if ( inPreAdmin ) {
                    if (
                                        c === HASH         &&
                            getR(src,i+1) === GREATER_THAN &&
                            getR(src,i+2) === HASH
                    ) {
                        inPreAdmin = false;
                        i += 2;
                    }
                } else if ( inDoubleString ) {
                    if (
                                          c === DOUBLE_QUOTE &&
                            getLeft(src, i) !== BACKSLASH
                    ) {
                        inDoubleString = false;
                    }
                } else if ( inSingleString ) {
                    if (
                                          c === SINGLE_QUOTE &&
                            getLeft(src, i) !== BACKSLASH
                    ) {
                        inSingleString = false;
                    }
                } else if ( inSingleComment ) {
                    if ( c === SLASH_N ) {
                        inSingleComment = false;
                        pushWhitespace( newSrc, i-startI );
                        startI = i;
                    }
                } else if ( multiCommentCount > 0 ) {
                    if (
                                          c === SLASH &&
                            getRight(src,i) === STAR
                    ) {
                        multiCommentCount++;
                    } else if (
                                           c === STAR &&
                            getRight(src, i) === SLASH
                    ) {
                        multiCommentCount--;

                        // +1 so we include this character too

                        i++;

                        if ( multiCommentCount === 0 ) {
                            pushWhitespace( newSrc, (i-startI)+1 );
                            startI = i+1;
                        }
                    }
                } else {
                    /*
                     * Look to enter a new type of block,
                     * such as comments, strings, inlined-JS code.
                     */

                    // multi-line comment
                    if (
                            c === SLASH &&
                            getRight(src, i) === STAR
                    ) {
                        newSrc.push( src.substring(startI, i) );

                        startI = i;
                        i++;

                        multiCommentCount++;
                    } else if (
                            c === SLASH &&
                            getRight(src, i) === SLASH
                    ) {
                        newSrc.push( src.substring(startI, i) );

                        startI = i;
                        inSingleComment = true;

                        i++;
                    // look for strings
                    } else if (c === DOUBLE_QUOTE) {
                        inDoubleString = true;
                    } else if (c === SINGLE_QUOTE) {
                        inSingleString = true;
                    } else if (c === HASH) {
                        if (
                                getR(src,i+1) === LESS_THAN &&
                                getR(src,i+2) === HASH
                        ) {
                            inAdmin = true;

                            i += 2;
                        } else if (
                                getR(src,i+1) === LESS_THAN &&
                                getR(src,i+2) === LOWER_P   &&
                                getR(src,i+3) === LOWER_R   &&
                                getR(src,i+4) === LOWER_E   &&
                                getR(src,i+5) === HASH
                        ) {
                            inPreAdmin = true;

                            i += 5;
                        }
                    }
                }
            }

            if ( multiCommentCount > 0 || inSingleComment ) {
                pushWhitespace( newSrc, src.length-startI );
            } else {
                newSrc.push( src.substring(startI) );
            }

            // this should always be the case, but just incase it isn't ...
            if ( newSrc.length > 0 ) {
                return newSrc.join('');
            } else {
                return src;
            }
        };

        /**
         * Alterations:
         *  : makes the source code lower case
         *  : removes white space from the start of the source code
         *  : changes \t to ' '
         *  : replaces all '\r's with '\n's
         *  : ensures all '}' have an end of line before them
         *  : ensures all 'end' keywords have an end of line before them
         */
        var preScanParse = function ( source ) {
            source = source.
                    toLowerCase().
                    replace(/\t/g, ' ').
                    replace(/\r/g, '\n');

            return source;

            var i = 0;
            for ( var i = 0; i < source.length; i++ ) {
                var c = source.charCodeAt(i);

                if ( c !== SLASH_N && c !== SPACE ) {
                    break;
                }
            }

            if ( i > 0 ) {
                var newStr = [];
                pushWhitespace( newStr, i );
                newStr.push( source );

                return newStr.join( '' );
            } else {
                return source;
            }
        };

        return function( src ) {
            return stripComments(
                    preScanParse(src)
            );
        };
    })();

    parse['ignore']( parse['terminal']['WHITESPACE'] );

    /**
     * WARNING! The terminal names used here are also used for display purposes.
     *          So give them meaningful names!
     */
    var terminals = parse.terminals({
            /**
             * Matches an end of line,
             * and also chomps on whitespace.
             * 
             * If it contains a semi-colon however,
             * this will fail.
             */
            endOfLine: function( src, i, code, len ) {
                if ( code === SLASH_N ) {
                    do {
                        i++;
                        code = src.charCodeAt(i);
                    } while (
                            code === SLASH_N    ||
                            code === SPACE      ||
                            code === TAB
                    );

                    if ( src.charCodeAt(i) !== SEMI_COLON ) {
                        return i;
                    }
                }
            },

            /**
             * Matches the semi-colon, or end of line.
             * 
             * Due to the order of terminals, the end
             * of line always has precedence.
             * 
             * Also chomps on whitespace and end of lines,
             * both before and after the semi-colon.
             */
            endOfStatement: function( src, i, code, len ) {
                if (
                        code === SEMI_COLON ||
                        code === SLASH_N
                ) {
                    do {
                        i++;
                        code = src.charCodeAt(i);
                    } while (
                            code === SLASH_N    ||
                            code === SEMI_COLON ||
                            code === SPACE      ||
                            code === TAB
                    );

                    return i;
                }
            },

            keywords: {
                    DO          : 'do',
                    END         : 'end',

                    IF          : 'if',
                    ELSE        : 'else',

                    ELSIF       : 'elsif',
                    ELSEIF      : 'elseif',
                    ELSE_IF     : 'else if',

                    THEN        : 'then',

                    WHILE       : 'while',
                    UNTIL       : 'until',
                    LOOP        : 'loop',

                    DEF         : 'def',

                    NEW         : 'new',
                    CLASS       : 'class',
                    MODULE      : 'module',

                    RETURN      : 'return',

                    YIELD       : 'yield',

                    THIS        : 'this'
            },

            symbols: {
                    comma       : ',',
                    at          : '@',

                    leftBracket : '(',
                    rightBracket: ')',

                    leftBrace   : '{',
                    rightBrace  : '}',

                    leftSquare  : '[',
                    rightSquare : ']'
            },

            literals: {
                    TRUE        : 'true' ,
                    FALSE       : 'false',
                    NULL        : 'null',
                    NIL         : 'nil',

                    symbol      : function(src, i, code, len) {
                        if ( code === COLON ) {
                            code = src.charCodeAt( i+1 );

                            if (
                                    // is a lower case letter, or underscore
                                    (code >= 97 && code <= 122) ||
                                    (code === UNDERSCORE)
                            ) {
                                i += 2;

                                while ( isAlphaNumericCode(src.charCodeAt(i)) ) {
                                    i++;
                                }

                                return i;
                            }
                        }
                    },

                    number      : parse.terminal.NUMBER,
                    string      : parse.terminal.STRING
            },

            ops: {
                    power               : '**',

                    divide              : '/',
                    multiply            : '*',
                    plus                : '+',
                    subtract            : '-',
                    modulus             : '%',

                    colon               : function(src, i, code, len) {
                        if ( code === COLON ) {
                            code = src.charCodeAt( i+1 );

                            if (
                                    // is a lower case letter, or underscore
                                    (code < 97 || code > 122) &&
                                    (code !== UNDERSCORE)
                            ) {
                                return i+1;
                            }
                        }
                    },

                    mapArrow            : '=>',

                    equal               : '==',
                    notEqual            : '!=',

                    shiftLeft           : '<<',
                    shiftRight          : '>>',

                    lessThanEqual       : '<=',
                    greaterThanEqual    : '>=',
                    lessThan            : '<',
                    greaterThan         : '>',

                    assignment          : '=',

                    dot                 : '.',

                    logicalAnd          : ['&&', 'and'],
                    logicalOr           : ['||', 'or'],

                    not                 : ['!', 'not'],

                    bitwiseAnd          : '&',
                    bitwiseOr           : '|'
            },

            identifiers: {
                    variableName: function(src, i, code, len) {
                        if (
                                // is a lower case letter, or underscore
                                (code >= 97 && code <= 122) ||
                                (code === UNDERSCORE)
                        ) {
                            i++;

                            while ( isAlphaNumericCode(src.charCodeAt(i)) ) {
                                i++;
                            }

                            return i;
                        }
                    },
                    global: function(src, i, code, len) {
                        if ( code === DOLLAR ) {
                            i++;

                            while ( isAlphaNumericCode(src.charCodeAt(i)) ) {
                                i++;
                            }

                            return i;
                        }
                    },
                    objectField : function(src, i, code, len) {
                        if ( code === AT ) {
                            i++;

                            while ( isAlphaNumericCode(src.charCodeAt(i)) ) {
                                i++;
                            }

                            return i;
                        }
                    }
            },

            admin: {
                hashDef : '#def',

                inline: function(src, i, code, len) {
                    // #<# random( javascript.code ) #>#
                    if (
                                           code === HASH      &&
                            src.charCodeAt(i+1) === LESS_THAN &&
                            src.charCodeAt(i+2) === HASH
                    ) {
                        i += 2;

                        /*
                         * Jump in segments of 3, and then check if we hit the
                         * closing #># at the beginning, middle or end.
                         */
                        do {
                            i += 3;

                            code = src.charCodeAt(i);

                            if ( code === HASH ) {
                                // land at the end of the closing section
                                if (
                                        src.charCodeAt(i-1) === GREATER_THAN &&
                                        src.charCodeAt(i-2) === HASH
                                ) {
                                    return i+1;
                                // land at the beginning
                                } else if (
                                        src.charCodeAt(i+1) === GREATER_THAN &&
                                        src.charCodeAt(i+2) === HASH
                                ) {
                                    return i+3;
                                }
                            // land in the middle
                            } else if (
                                                   code === GREATER_THAN &&
                                    src.charCodeAt(i-1) === HASH         &&
                                    src.charCodeAt(i+1) === HASH
                            ) {
                                    return i+2;
                            }
                        } while ( i < len );

                        return len;
                    }
                },

                preInline: function(src, i, code, len) {
                    // if #<pre# javascript.code.here #>#
                    if (
                                           code === HASH        &&
                            src.charCodeAt(i+1) === LESS_THAN   &&
                            src.charCodeAt(i+2) === LOWER_P     &&
                            src.charCodeAt(i+3) === LOWER_R     &&
                            src.charCodeAt(i+4) === LOWER_E     &&
                            src.charCodeAt(i+5) === HASH
                    ) {
                        i += 5;

                        /*
                         * Jump in segments of 3, and then check if we hit the
                         * closing #># at the beginning, middle or end.
                         */
                        do {
                            i += 3;

                            code = src.charCodeAt(i);

                            if ( code === HASH ) {
                                // land at the end of the closing section
                                if (
                                        src.charCodeAt(i-1) === GREATER_THAN &&
                                        src.charCodeAt(i-2) === HASH
                                ) {
                                    return i+1;
                                // land at the beginning
                                } else if (
                                        src.charCodeAt(i+1) === GREATER_THAN &&
                                        src.charCodeAt(i+2) === HASH
                                ) {
                                    return i+3;
                                }
                            // land in the middle
                            } else if (
                                                   code === GREATER_THAN &&
                                    src.charCodeAt(i-1) === HASH         &&
                                    src.charCodeAt(i+1) === HASH
                            ) {
                                    return i+2;
                            }
                        } while ( i < len );

                        return len;
                    }
                }
            }
    });

    /*
     * Remove the end of lines after certain symbols.
     */

    var applySymbolMatch = function( syms, event ) {
        if ( syms.symbolMatch ) {
            syms.symbolMatch( event );
        } else {
            for ( var k in syms ) {
                applySymbolMatch( syms[k], event );
            }
        }
    };

    applySymbolMatch(
            [
                    terminals.ops,

                    terminals.keywords.DO,

                    terminals.keywords.IF,

                    terminals.keywords.ELSE,
                    terminals.keywords.ELSIF,
                    terminals.keywords.ELSEIF,
                    terminals.keywords.ELSE_IF,

                    terminals.keywords.WHILE,
                    terminals.keywords.UNTIL,
                    terminals.keywords.LOOP,

                    terminals.keywords.NEW,

                    terminals.symbols.comma,
                    terminals.symbols.leftBracket,
                    terminals.symbols.leftBrace,
                    terminals.symbols.leftSquare
            ],
            function( src, i, code, len ) {
                while (
                        code === SPACE      ||
                        code === SLASH_N    ||
                        code === TAB
                ) {
                    i++;
                    code = src.charCodeAt(i);
                }

                return i;
            }
    );

    /*
     * The values returned after it has been matched, when the symbol is
     * evaluated, and begins being turned into the AST.
     */

    terminals.endOfStatement.onMatch( function() {
        return null;
    });

    terminals.symbols.comma.onMatch( function() {
        return null;
    })

    /* The onMatch callbacks for altering the symbols when matched. */
    terminals.keywords.RETURN.onMatch( function(match, offset) {
        return new quby.lexer.Sym( offset, 'return' );
    });

    terminals.identifiers.variableName.onMatch( function(match, offset) {
        var sym = new quby.lexer.IdSym( offset, match );
        sym.terminal = terminals.identifiers.variableName;
        return sym;
    } );

    terminals.literals.TRUE.onMatch( function(match, offset) {
        return new quby.ast.Bool(
                new quby.lexer.Sym( offset, true )
        );
    });
    terminals.literals.FALSE.onMatch( function(match, offset) {
        return new quby.ast.Bool(
                new quby.lexer.Sym( offset, false )
        );
    });
    terminals.literals.NULL.onMatch( function(match, offset) {
        return new quby.ast.Null(
                new quby.lexer.Sym( offset, null )
        );
    });
    terminals.literals.NIL.onMatch( function(match, offset) {
        return new quby.ast.Null(
                new quby.lexer.Sym( offset, null )
        );
    });
    terminals.literals.symbol.onMatch( function(match, offset) {
        return new quby.ast.Symbol( 
                new quby.lexer.Sym( offset, match )
        );
    });
    terminals.literals.string.onMatch( function(match, offset) {
        return new quby.ast.String(
                new quby.lexer.Sym( offset, match )
        );
    });
    terminals.literals.number.onMatch( function(match, offset) {
        return new quby.ast.Number(
                new quby.lexer.Sym( offset, match )
        );
    });

    terminals.admin.inline.onMatch( function(match, offset) {
        return new quby.ast.Inline(
                new quby.lexer.Sym(
                        offset,
                        match.substring( 3, match.length-3 )
                )
        );
    });
    terminals.admin.preInline.onMatch( function(match, offset) {
        return new quby.ast.PreInline(
                new quby.lexer.Sym(
                        offset,
                        match.substring( 6, match.length-3 )
                )
        );
    });

    var ops = terminals.ops;

    /* Parser Rules */

    var statementSeperator = parse.
            either(
                    terminals.endOfLine,
                    terminals.endOfStatement
            );

    var statement = parse(),
        expr = parse();

    var repeatStatement = parse.repeatSeperator(
            statement,
            statementSeperator
    );

    var statements = parse.
            optional( statementSeperator ).
            optional( repeatStatement    ).
            optional( statementSeperator ).
            onMatch( function(onStart, stmts, endEnd) {
                if ( stmts === null ) {
                    return new quby.ast.Statements();
                } else {
                    return new quby.ast.Statements( stmts );
                }
            });

    var exprs = parse.
            repeatSeperator( expr, terminals.symbols.comma ).
            onMatch( function(exprs) {
                return new quby.ast.Parameters().
                        set( exprs );
            });

    var variable = parse.
            a( terminals.identifiers.variableName ).
            onMatch( function(name) {
                return new quby.ast.Variable( name );
            } );

    var variables = parse.either( terminals.identifiers, terminals.keywords.THIS ).
            onMatch( function(identifier) {
                switch ( identifier.terminal ) {
                    case terminals.identifiers.variableName:
                        return new quby.ast.Variable( identifier );
                    case terminals.identifiers.global:
                        return new quby.ast.GlobalVariable(
                                new quby.lexer.IdSym(
                                        identifier.offset,
                                        identifier.match
                                )
                        );
                    case terminals.identifiers.objectField:
                        return new quby.ast.FieldVariable(
                                new quby.lexer.IdSym(
                                        identifier.offset,
                                        identifier.match.substring(1)
                                )
                        );
                    case terminals.keywords.THIS:
                        return new quby.ast.ThisVariable( identifier.offset, null );
                    default:
                        log(identifier);
                        throw new Error("Unknown terminal met for variables: " + identifier);
                }
            });

    var arrayAccessExtension = parse.
            a(
                    terminals.symbols.leftSquare,
                    expr
            ).
            optional( terminals.endOfLine ).
            then( terminals.symbols.rightSquare ).
            onMatch( function( leftSquare, keyExpr, endOfLine, rightSquare) {
                return new quby.ast.ArrayAccess( null, keyExpr );
            });

    var singleOpExpr = parse.
            either(
                    terminals.ops.plus,
                    terminals.ops.subtract,
                    terminals.ops.not
            ).
            then( expr ).
            onMatch( function( op, expr ) {
                switch ( op.terminal ) {
                    case ops.not:
                        return new quby.ast.Not( expr );
                    case terminals.ops.subtract:
                        return new quby.ast.SingleSub(expr);
                    case ops.plus:
                        return expr;
                    default:
                        log( op );
                        throw new Error("Unknown singleOpExpr match");
                }
            } );

    var arrayDefinition = parse.
            a( terminals.symbols.leftSquare ).
            optional( exprs ).
            optional( terminals.endOfLine ).
            then( terminals.symbols.rightSquare ).
            onMatch( function(lSquare, exprs, endOfLine, rSquare) {
                if ( exprs !== null ) {
                    return new quby.ast.ArrayDefinition( exprs );
                } else {
                    return new quby.ast.ArrayDefinition();
                }
            } );

    var hashMapping = parse.
            a( expr ).
            either( terminals.ops.colon, terminals.ops.mapArrow ).
            then( expr ).
            onMatch( function(left, mapAssign, right) {
                return new quby.ast.Mapping( left, right );
            });

    var hashDefinition = parse.
            a( terminals.symbols.leftBrace ).
            optionalSeperator( hashMapping, terminals.symbols.comma ).
            optional( terminals.endOfLine ).
            then( terminals.symbols.rightBrace ).
            onMatch( function(lBrace, mappings, endOfLine, rBrace) {
                if ( mappings !== null ) {
                    return new quby.ast.HashDefinition(
                            new quby.ast.Mappings( mappings )
                    );
                } else {
                    return new quby.ast.HashDefinition();
                }
            } );

    var yieldExpr = parse.
            a( terminals.keywords.YIELD ).
            optional( exprs ).
            onMatch( function(yld, exprs) {
                if ( exprs !== null ) {
                    return new quby.ast.YieldStmt( exprs, exprs );
                } else {
                    return new quby.ast.YieldStmt(
                            new quby.lexer.Sym( yld.offset, 'yield' )
                    );
                }
            } );

    var returnStatement = parse.
            a( terminals.keywords.RETURN ).
            optional( expr ).
            onMatch( function(rtn, expr) {
                if ( expr !== null ) {
                    return new quby.ast.ReturnStmt( expr );
                } else {
                    return new quby.ast.ReturnStmt(
                            new quby.ast.Null(rtn)
                    );
                }
            } );

    /*
     * ### Expressions ###
     */

    var parameterFields = parse.
            repeatSeperator(
                    parse.either(
                            variables,
                            parse.a( terminals.ops.bitwiseAnd, terminals.identifiers.variableName ).
                                    onMatch( function(bitAnd, name) {
                                        return new quby.ast.ParameterBlockVariable( name );
                                    } )
                    ),
                    terminals.symbols.comma
            ).
            onMatch( function( params ) {
                return new quby.ast.Parameters().
                        set( params );
            });

    /**
     * These are the definitions for parameters for a function, method or lamda.
     * It includes the brackets!!
     *
     * Syntax Examples:
     *  ()              - no parameters
     *  ( a, b, c )     - 3 parameters
     *  ( &block )      - 1 block parameter
     *  ( a, b, &c )    - 2 parameters, 1 block
     *  ( &a, &b, &c )  - 3 block parameters, although incorrect, this is allowed here
     */
    var parameterDefinition = parse.
            a( terminals.symbols.leftBracket ).
            optional( parameterFields ).
            optional( terminals.endOfLine ). // needed to allow an end of line before the closing bracket
            then( terminals.symbols.rightBracket ).
            onMatch( function(lParen, params, end, rParen) {
                if ( params === null ) {
                    return new quby.ast.Parameters();
                } else {
                    return params;
                }
            } );

    /**
     * Theser are the expressions used as parameters, such as for a function call.
     * It is essentially a list of optional expressions, surrounded by brackets.
     *
     * Syntax Examples:
     *  ()                      - no parameters
     *  ( a, b, c )             - 3 parameters, all variables
     *  ( x, 2, 5*4 )           - 3 parameters, two numbers, 1 a variable
     *  ( "john", lastName() )  - a string and a function call
     */
    var parameterExprs = parse.
            a( terminals.symbols.leftBracket ).
            optional( exprs ).
            optional( terminals.endOfLine ).
            then( terminals.symbols.rightBracket ).
            onMatch( function(lParen, exprs, end, rParen) {
                if ( exprs !== null ) {
                    return exprs;
                } else {
                    return null;
                }
            } );

    var blockParamVariables = parse.repeatSeperator(
            variable,
            terminals.symbols.comma
    );

    var blockParams = parse.
            a( terminals.ops.bitwiseOr ).
            optional( blockParamVariables ).
            optional( terminals.endOfLine ).
            then( terminals.ops.bitwiseOr ).
            onMatch( function(lOr, params, end, rOr) {
                if ( params !== null ) {
                    return new quby.ast.Parameters().set( params );
                } else {
                    return null;
                }
            } );

    var block = parse.
            either(
                    terminals.symbols.leftBrace,
                    terminals.keywords.DO
            ).
            optional( blockParams ).
            optional( statements  ).
            thenEither(
                    terminals.symbols.rightBrace,
                    terminals.keywords.END
            ).
            onMatch( function( lBrace, params, stmts, rBrace ) {
                var block = new quby.ast.FunctionBlock( params, stmts );

                /*
                 * If the opening and closing braces do not match,
                 * give a warning.
                 *
                 * Things that will warn are:
                 *     do }
                 *     { end
                 *
                 * This is a relic from the old parser,
                 * and supported only to avoid breaking
                 * working games.
                 */
                if (
                        (lBrace.terminal === terminals.symbols.leftBrace ) !==
                        (rBrace.terminal === terminals.symbols.rightBrace)
                ) {
                    block.setMismatchedBraceWarning();
                }

                return block;
            } );

    var lambda = parse.
            a( terminals.keywords.DEF, parameterDefinition ).
            optional( statements ).
            then( terminals.keywords.END ).
            onMatch( function(def, params, stmts, end) {
                return new quby.ast.Lambda( params, stmts );
            });

    var functionCall = parse.
            a( terminals.identifiers.variableName ).
            then( parameterExprs ).
            optional( block ).
            onMatch( function(name, exprs, block) {
                if ( name.lower === quby.runtime.SUPER_KEYWORD ) {
                    return new quby.ast.SuperCall( name, exprs, block );
                } else {
                    return new quby.ast.FunctionCall( name, exprs, block );
                }
            } );

    var methodCallExtension = parse.
            a( terminals.ops.dot ).
            then( terminals.identifiers.variableName ).
            then( parameterExprs ).
            optional( block ).
            onMatch( function(dot, name, exprs, block) {
                return new quby.ast.MethodCall( null, name, exprs, block );
            } );

    var newInstance = parse.
            a( terminals.keywords.NEW ).
            then( terminals.identifiers.variableName ).
            then( parameterExprs ).
            optional( block ).
            onMatch( function(nw, klass, exprs, block) {
                return new quby.ast.NewInstance( klass, exprs, block );
            } );

    var exprInParenthesis = parse.
            a( terminals.symbols.leftBracket ).
            then( expr ).
            optional( terminals.endOfLine ).
            then( terminals.symbols.rightBracket ).
            onMatch( function(left, expr, endOfLine, right) {
                return new quby.ast.ExprParenthesis( expr );
            } );

    /**
     * These add operations on to the end of an expr.
     *
     * For example take the code: '3 + 5'. This would
     * make up the rules for the '+ 5' bit, which is
     * tacked on after '3'.
     *
     * That is then rebalanced later in the AST.
     */
    var exprExtension = parse();
    exprExtension.either(
                    parse.
                            either(
                                    methodCallExtension,
                                    arrayAccessExtension
                            ).
                            optional( exprExtension ).
                            onMatch( function(left, ext) {
                                if ( ext === null ) {
                                    return left;
                                } else {
                                    ext.appendLeft( left );
                                    return ext;
                                }
                            } ),

                    parse.
                            either(
                                    ops.plus,
                                    ops.subtract,
                                    ops.divide,
                                    ops.multiply,

                                    ops.logicalAnd,
                                    ops.logicalOr,

                                    ops.equal,
                                    ops.notEqual,

                                    ops.modulus,

                                    ops.lessThan,
                                    ops.greaterThan,
                                    ops.lessThanEqual,
                                    ops.greaterThanEqual,

                                    ops.shiftLeft,
                                    ops.shiftRight,

                                    ops.bitwiseAnd,
                                    ops.bitwiseOr,

                                    ops.power,

                                    ops.assignment
                            ).
                            then( expr ).
                            onMatch( function(op, right) {
                                switch( op.terminal ) {
                                    case ops.assignment:
                                        return new quby.ast.Assignment( null, right );
                                    case ops.plus:
                                        return new quby.ast.Add( null, right );
                                    case ops.subtract:
                                        return new quby.ast.Sub( null, right );
                                    case ops.divide:
                                        return new quby.ast.Divide( null, right );
                                    case ops.multiply:
                                        return new quby.ast.Mult( null, right );

                                    case ops.logicalAnd:
                                        return new quby.ast.BoolAnd( null, right );
                                    case ops.logicalOr:
                                        return new quby.ast.BoolOr( null, right );

                                    case ops.equal:
                                        return new quby.ast.Equality( null, right );
                                    case ops.notEqual:
                                        return new quby.ast.NotEquality( null, right );

                                    case ops.modulus:
                                        return new quby.ast.Mod( null, right );

                                    case ops.lessThan:
                                        return new quby.ast.LessThan( null, right );
                                    case ops.greaterThan:
                                        return new quby.ast.GreaterThan( null, right );
                                    case ops.lessThanEqual:
                                        return new quby.ast.LessThanEqual( null, right );
                                    case ops.greaterThanEqual:
                                        return new quby.ast.GreaterThanEqual( null, right );

                                    case ops.shiftLeft:
                                        return new quby.ast.ShiftLeft( null, right );
                                    case ops.shiftRight:
                                        return new quby.ast.ShiftRight( null, right );

                                    case ops.bitwiseAnd:
                                        return new quby.ast.BitAnd( null, right );
                                    case ops.bitwiseOr:
                                        return new quby.ast.BitOr( null, right );

                                    case ops.power:
                                        return new quby.ast.Power( null, right );

                                    default:
                                        throw Error("Unknown op given: " + op);
                                }
                            })
            );

    expr.
            either(
                    singleOpExpr,
                    arrayDefinition,
                    hashDefinition,
                    yieldExpr,
                    exprInParenthesis,
                    newInstance,
                    functionCall,

                    variables,

                    lambda,

                    // literals
                    terminals.literals,

                    // admin bits
                    terminals.admin.inline,
                    terminals.admin.preInline
            ).
            optional( exprExtension ).
            onMatch( function(expr, rest) {
                if ( rest !== null ) {
                    rest.appendLeft( expr );

                    return rest;
                } else {
                    return expr;
                }
            } );

    /*
     * Definitions
     */

    var classHeader = parse.
                a( terminals.identifiers.variableName ).
                optional(
                        parse.
                                a( terminals.ops.lessThan, terminals.identifiers.variableName ).
                                onMatch( function(lessThan, superClass) {
                                    return superClass;
                                } )
                ).
                onMatch( function( name, superClass ) {
                    return new quby.ast.ClassHeader( name, superClass );
                } );

    var moduleDefinition = parse.
                a( terminals.keywords.MODULE ).
                then( terminals.identifiers.variableName ).
                optional( statements ).
                then( terminals.keywords.END ).
                onMatch( function(keyModule, name, stmts, end) {
                    return new quby.ast.ModuleDefinition(name, stmts);
                } );

    var classDefinition = parse.
                a( terminals.keywords.CLASS ).
                then( classHeader ).
                optional( statements ).
                then( terminals.keywords.END ).
                onMatch( function(klass, header, stmts, end) {
                    return new quby.ast.ClassDefinition( header, stmts );
                } );

    var functionDefinition = parse.
                either( terminals.keywords.DEF, terminals.admin.hashDef ).
                thenEither( terminals.keywords.NEW, terminals.identifiers.variableName ).
                then( parameterDefinition ).
                optional( statements ).
                then( terminals.keywords.END ).
                onMatch( function(def, name, params, stmts, end) {
                    if ( def.terminal === terminals.keywords.DEF ) {
                        // 'new' method, class constructor
                        if ( name.terminal === terminals.keywords.NEW ) {
                            return new quby.ast.Constructor(
                                    new quby.lexer.Sym( name.offset, 'new' ),
                                    params,
                                    stmts
                            );
                        // normal function
                        } else {
                            return new quby.ast.Function( name, params, stmts );
                        }
                    // admin method
                    } else {
                        return new quby.ast.AdminMethod( name, params, stmts );
                    }
                } );

    /*
     * Statements
     */

    var ifStart = parse.
                a( terminals.keywords.IF ).
                then( expr ).
                optional( terminals.keywords.THEN ).
                then( statements ).
                onMatch( function( IF, condition, THEN, stmts ) {
                    return new quby.ast.IfBlock( condition, stmts );
                } );

    var isElseIf = parse.
                either(
                        terminals.keywords.ELSE_IF,
                        terminals.keywords.ELSEIF,
                        terminals.keywords.ELSIF
                ).
                a( expr ).
                optional( terminals.keywords.THEN ).
                a( statements ).
                onMatch( function(elseIf, condition, then, stmts) {
                    return new quby.ast.IfBlock( condition, stmts );
                } );

    var ifElseIfs = parse.
                a( isElseIf ).
                maybeThis().
                onMatch( function(elseIf, elseIfs) {
                    if ( elseIfs === null ) {
                        elseIfs = new quby.ast.IfElseIfs();
                    }

                    return elseIfs.unshift( elseIf );
                });

    var ifElse = parse.
                a( terminals.keywords.ELSE, statements ).
                onMatch( 1 );

    var ifStatement = parse.
                a( ifStart ).
                optional( ifElseIfs ).
                optional( ifElse ).
                then( terminals.keywords.END ).
                onMatch( function(start, otherIfs, elses, end) {
                    return new quby.ast.IfStmt( start, otherIfs, elses );
                } );

    var whileUntilStatement = parse.
                either( terminals.keywords.WHILE, terminals.keywords.UNTIL ).
                then( expr, statements ).
                then( terminals.keywords.END ).
                onMatch( function( whileUntil, expr, stmts, end ) {
                    if ( whileUntil.terminal === terminals.keywords.WHILE ) {
                        return new quby.ast.WhileLoop( expr, stmts );
                    } else {
                        return new quby.ast.UntilLoop( expr, stmts );
                    }
                } );

    var loopStatement = parse.
                a( terminals.keywords.LOOP ).
                then( statements ).
                then( terminals.keywords.END ).
                either( terminals.keywords.WHILE, terminals.keywords.UNTIL ).
                then( expr ).
                onMatch( function(loop, stmts, end, whileUntil, expr) {
                    if ( whileUntil.terminal === terminals.keywords.WHILE ) {
                        return new quby.ast.LoopWhile( expr, stmts );
                    } else {
                        return new quby.ast.LoopUntil( expr, stmts );
                    }
                } );

    statement.either(
                    functionDefinition,
                    classDefinition,
                    moduleDefinition,

                    ifStatement,
                    whileUntilStatement,
                    loopStatement,

                    returnStatement,

/*
                    moduleDef,
*/
                    expr,

                    terminals.admin.inline,
                    terminals.admin.preInline
            );
    
    quby.parser = {
            /**
             * The entry point for the parser, and the only way to interact.
             *
             * Call this, pass in the code, and a callback so your informed
             * about when it's done.
             *
             * @param src The source code to parse.
             * @param onFinish The function to call when parsing has finished.
             * @param onDebug An optional callback, for sending debug information into.
             */
            parse : function( src, onFinish, onDebug ) {
                statements.parse(
                        src,
                        preParse( src ),
                        onFinish,
                        onDebug || null
                );
            }
    };
})( quby, util, window )
"use strict";
var quby = window['quby'] || {};

/* These functions are called so often that they exist outside of the quby.runtime
 * namespace so they can be as cheap as possible.
 */

/*
 * This is called when a method is not found.
 */
function noSuchMethodError(_this, callName) {
    var args = Array.prototype.slice.call( arguments, 2 );
    var block = args.pop();
    
    quby.runtime.methodMissingError( _this, callName, args, block );
};

/**
 * This is the yield function. If a block is given then it is called using the
 * arguments given. If a negative object is given instead (such as false,
 * undefined or null) then a 'missingBlockError' will be thrown.
 * 
 * The intention is that inlined JavaScript can just pass their blocks along
 * to this function, and it'll call it the same as it would in normal
 * translated Quby code.
 * 
 * Any arguments for the block can be passed in after the first parameter.
 * 
 * @param block The block function to call with this function.
 * @return The result from calling the given block.
 */
function quby_callBlock(block, args) {
    if (!block) {
        quby.runtime.missingBlockError();
    } else {
        if (args.length < block.length) {
            quby.runtime.notEnoughBlockParametersError(block.length, args.length, 'block');
        }

        return block.apply( null, args );
    }
}

/**
 * Checks if the block given is a block (a function),
 * and that it has at _most_ the number of args given.
 * 
 * If either of these conditions fail then an error is thrown.
 * Otherwise nothing happens.
 */
function quby_ensureBlock(block, numArgs) {
    if ( ! (block instanceof Function) ) {
        quby.runtime.missingBlockError();
    } else if ( numArgs < block.length ) {
        quby.runtime.notEnoughBlockParametersError(block.length, numArgs, 'block');
    }
}

/**
 * Checks if the value given exists, and if it does then it is returned.
 * If it doesn't then an exception is thrown. This is primarily for use with globals.
 * 
 * The given name is for debugging, the name of the variable to show in the error if it doesn't exist.
 * 
 * @param global The global variable to check for existance.
 * @param name The name of the global variable given, for debugging purposes.
 * @return The global given.
 */
function quby_checkGlobal(global, name) {
    if (global === undefined) {
        quby.runtime.runtimeError("Global variable accessed before being assigned to: '" + name + "'.");
    } else {
        return global;
    }
}

/**
 * Checks if the field given exists. It exists if it is not undefined. The field should be a name of
 * a field to access and the name is the fields name when shown in a thrown error.
 * 
 * An error will be thrown if a field of the given field name (the field parameter)
 * does not exist within the object given.
 * 
 * If the field does exist then it's value is returned.
 * 
 * @param fieldVal The value of the field to check if it exists or not.
 * @param obj The object you are retrieving the field from.
 * @param name The name to show in an error for the name of the field (if an error is thrown).
 * @return The value stored under the field named in the object given.
 */
function quby_getField(fieldVal, obj, name) {
    if (fieldVal === undefined) {
        quby.runtime.fieldNotFoundError(obj, name);
    }

    return fieldVal;
}

/**
 * Sets a value to an array given using the given key and value.
 * If the array given is not a QubyArray then an exception is thrown.
 * If the collection given has a 'set' method, then it is considered
 * to be a collection.
 * 
 * This is the standard function used by compiled Quby code for
 * setting values to an collection.
 * 
 * @param collection An collection to test for being a collection.
 * @param key The key for where to store the value given.
 * @param value The value to store under the given key.
 * @return The result of setting the value.
 */
function quby_setCollection(collection, key, value) {
    if ( collection === null ) {
        quby.runtime.runtimeError( "Collection is null when setting a value" );
    } else if ( collection.set ) {
        return collection.set(key, value);
    } else {
        quby.runtime.runtimeError(
                "Trying to set value on a non-collection, it's actually a: " + quby.runtime.identifyObject(collection)
        );
    }
}

/**
 * Gets a value from the given collection using the key given.
 * If the collection given has a 'get' method, then it is considered
 * to be a collection.
 * 
 * This is the standard function used in compiled Quby code for
 * accessing an array.
 * 
 * @param collection An collection to test for being a collection.
 * @param key The key for the element to fetch.
 * @return The value stored under the given key in the given collection.
 */
function quby_getCollection(collection, key) {
    if ( collection === null ) {
        quby.runtime.runtimeError( "Collection is null when getting a value" );
    } else if ( collection.get ) {
        return collection.get(key);
    } else {
        quby.runtime.runtimeError(
                "Trying to get a value from a non-collection, it's actually a: " + quby.runtime.identifyObject(collection)
        );
    }
}

(function( quby, util ) {
    /**
     * Runtime
     * 
     * Functions and objects which may be used at runtime (i.e.
     * inside inlined JavaScript) are defined here. This includes
     * functions for uniquely formatting variables and functions.
     * 
     * All compiled Quby code should run perfectly with only this
     * class. Everything outside of this class is not needed for
     * compiled code to be run.
     */
    /*
     * Note there are constants defined at the end of this file,
     * this is due to limitations in using JSON objects for
     * namespaces.
     */
    quby.runtime = {
        FUNCTION_DEFAULT_TABLE_NAME: '_q_no_funs',
        
        FUNCTION_TABLE_NAME: '_q_funs',

        SYMBOL_TABLE_NAME: '_q_syms',

        // needs to be kept lower case for comparisons
        SUPER_KEYWORD: "super",

        // standard exception names
        EXCEPTION_NAME_RUNTIME: "Runtime Error",

        // These are for translating from one class name to another.
        // This is so externally it can have one name but internally it has another.
        TRANSLATE_CLASSES: {
                'array'  : 'QubyArray' ,
                'hash'   : 'QubyHash'  ,
                'object' : 'QubyObject'
        },
        
        // the name for block variables
        BLOCK_VARIABLE: '_q_block',

        TEMP_VARIABLE: '_t',
        
        // Prefix names appended to variables/functions/classes/etc to avoid name clahes.
        // Avoids clashes with each other, and with in-built JavaScript stuff.
        VARIABLE_PREFIX : '_var_'   ,
        FIELD_PREFIX    : '_field_' ,
        GLOBAL_PREFIX   : '_global_',
        FUNCTION_PREFIX : '_fun_'   ,
        CLASS_PREFIX    : '_class_' ,
        NEW_PREFIX      : '_new_'   ,
        SYMBOL_PREFIX   : '_sym_'   ,
        
        // Name of the root class that all classes extend.
        ROOT_CLASS_NAME : 'object',
        ROOT_CLASS_CALL_NAME : null, // see 'initialize'
        
        FIELD_NAME_SEPERATOR : '@',
        
        initialize: function() {
            quby.runtime.ROOT_CLASS_CALL_NAME = quby.runtime.formatClass(quby.runtime.ROOT_CLASS_NAME);
        },
        
        /**
         * Translates the public class name, to it's internal one.
         * 
         * For example it translates 'Array' into 'QubyArray',
         * and 'Object' to 'QubyObject'.
         * 
         * If a mapping is not found, then the given name is returned.
         * 
         * @param name The name to translate.
         * @return The same given name if no translation was found, otherwise the internal Quby name for the class used.
         */
        translateClassName: function (name) {
            var newName = quby.runtime.TRANSLATE_CLASSES[name.toLowerCase()];

            if (newName) {
                return newName;
            } else {
                return name;
            }
        },
        
        /**
         * Similar to translateClassName, but works in the opposite direction.
         * It goes from internal name, to external display name.
         * 
         * @param name The class name to reverse lookup.
         */
        untranslateClassName: function(name) {
            var searchName = name.toLowerCase();
            
            // Look to see if it's got a reverse translate name
            // Like QubyArray should just be Array
            for (var klass in quby.runtime.TRANSLATE_CLASSES) {
                var klassName = quby.runtime.TRANSLATE_CLASSES[klass];
                
                if ( searchName.toLowerCase() == klassName.toLowerCase() ) {
                    return util.string.capitalize( klass );
                }
            }
            
            // no reverse-lookup found : (
            return name;
        },

        /**
         * These are the core JavaScript prototypes that can be extended.
         *
         * If a JavaScript prototype is not mentioned here (like Image) then
         * Quby will make a new class instead of using it.
         *
         * If it is mentioned here then Quby will add to that classes Prototype.
         * (note that Object/QubyObject isn't here because it's not prototype extended).
         */
        CORE_CLASSES: [
                'Number',
                'Boolean',
                'Function',
                'String',
                'Array',
                'Hash'
        ],

        isCoreClass: function (name) {
            var coreClasses = quby.runtime.CORE_CLASSES;

            for (var i = 0; i < coreClasses.length; i++) {
                if (name == coreClasses[i].toLowerCase()) {
                    return true;
                }
            }

            return false;
        },

        // 'this varaible' is a special variable for holding references to yourself.
        // This is so two functions can both refer to the same object.
        THIS_VARIABLE: "_this",

        getThisVariable: function (isInExtension) {
            if (isInExtension) {
                return 'this';
            } else {
                return quby.runtime.THIS_VARIABLE;
            }
        },

        /* ### RUNTIME ### */
        
        onError: null,
        
        logCallback: null,
        
        /**
         * Sets the callback function for logging information from Quby.
         * 
         * Passing in 'null' or 'false' sets this to nothing.
         * Otherwise this must be given a function object;
         * any other value will raise an error.
         * 
         * The function is passed all of the values sent to log, unaltered.
         * Bear in mind that log can be given any number of arguments (including 0).
         * 
         * Note that passing in undefined is also treated as an error.
         * We are presuming you meant to pass something in,
         * but got it wrong somehow.
         * 
         * @param callback A function to callback when 'quby.runtime.log' is called.
         */
        setLog: function( callback ) {
            if ( callback === undefined ) {
                quby.runtime.error( "Undefined given as function callback" );
            } else if ( ! callback ) {
                quby.runtime.logCallback = null;
            } else if ( typeof(callback) != 'function' ) {
                quby.runtime.error( "Callback set for logging is not function, null or false." );
            }
        },
        
        /**
         * For handling logging calls from Quby.
         * 
         * If a function has been set using setLog,
         * then all arguments given to this are passed on to that function.
         * 
         * Otherwise this will try to manually give the output,
         * attempting each of the below in order:
         *  = FireBug/Chrome console.log
         *  = Outputting to the FireFox error console
         *  = display using an alert message
         */
        log: function() {
            // custom
            if ( quby.runtime.logCallback ) {
                quby.runtime.logCallback.apply( null, arguments );
            } else {
                var strOut = Array.prototype.join.call( arguments, ',' );
                
                // FireBug & Chrome
                if ( window.console && window.console.log ) {
                    window.console.log( strOut );
                } else {
                    var sent = false;
                    
                    // Mozilla error console fallback
                    try {
                        window.Components.classes[ "@mozilla.org/consoleservice;1" ].
                                getService( window.Components.interfaces.nsIConsoleService ).
                                logStringMessage( strOut );
                        
                        sent = true;
                    } catch ( ex ) {} // do nothing
                    
                    // generic default
                    if ( ! sent ) {
                        alert( strOut );
                    }
                }
            }
        },

        /** 
         * Runs the code given in the browser, within the current document. If an
         * onError function is provided then this will be called if an error occurres.
         * The error object will be passed into the onError function given.
         * 
         * If one is not provided then the error will not be caught and nothing will
         * happen.
         * 
         * @param code The JavaScript code to run.
         * @param onError the function to be called if an error occurres.
         */
        runCode: function (code, onError) {
            if (onError) {
                if (typeof (onError) != 'function') {
                    quby.runtime.error("onError", "onError must be a function.");
                }

                quby.runtime.onError = onError;
                code = 'try { ' + code + ' } catch ( err ) { quby.runtime.handleError(err); }';
            } else {
                quby.runtime.onError = null;
            }

            ( new Function( code ) ).call( null );
        },
        
        /**
         * If there is an onError error handler then the error is passed to this.
         * If there isn't then it is thrown upwards.
         * 
         * The onError must return true to stop the error from being thrown up!
         */
        handleError: function (err) {
            if ( ! err.isQuby ) {
                err.quby_message = quby.runtime.unformatString( err.message );
            } else {
                err.quby_message = err.message ;
            }
            
            if (quby.runtime.onError != null) {
                if (!quby.runtime.onError(err)) {
                    throw err;
                }
            } else {
                throw err;
            }
        },

        /**
         * Given a Quby object, this will try to find it's display name.
         * This will first check if it has a prefix, and if so remove this
         * and generate a prettier version of the name.
         * 
         * Otherwise it can also perform lookups to check if it's a core class,
         * such as a Number or Array. This includes reverse lookups for internal
         * structures such as the QubyArray (so just Array is displayed instead).
         * 
         * @param obj The object to identify.
         * @return A display name for the type of the object given.
         */
        identifyObject: function (obj) {
            if (obj === null) {
                return "null";
            } else {
                var strConstructor = obj.constructor.toString();
                var funcNameRegex = /function ([a-zA-Z0-9_]{1,})\(/;
                var results = funcNameRegex.exec( strConstructor );
                
                if ( results && results.length > 1 ) {
                    var name = results[1];
                    
                    // if it's a Quby object, get it's name
                    if ( name.indexOf(quby.runtime.CLASS_PREFIX) === 0 ) {
                        name = name.substring(quby.runtime.CLASS_PREFIX.length);
                    } else {
                        name = quby.runtime.untranslateClassName( name );
                    }
                    
                    name = util.string.capitalize( name );
                    
                    return name;
                } else {
                    return "<unknown object>";
                }
            }
        },

        /**
         * Checks if the given object is one of the Quby inbuilt collections (such as QubyArray and QubyHash), and if not then an exception is thrown.
         * 
         * @param collection An collection to test for being a collection.
         * @return The collection given.
         */
        checkArray: function (collection, op) {
            if (collection instanceof QubyArray || collection instanceof QubyHash) {
                return collection;
            } else {
                this.runtimeError("Trying to " + op + " value on Array or Hash, but it's actually a " + quby.runtime.identifyObject(collection));
            }
        },

        /**
         * Creates a new Error object with the given name and message.
         * It is then thrown straight away. This method will not
         * return (since an exception is thrown within it).
         * 
         * @param name The name for the Error object to throw.
         * @param msg The message contained within the Error object thrown.
         * @return This should never return.
         */
        error: function (name, msg) {
            var errObj = new Error(msg);
            
            errObj.isQuby = true;
            errObj.name = name;
            
            throw errObj;
        },

        /**
         * Throws a standard Quby runtime error from within this function.
         * This method will not return as it will thrown an exception.
         * 
         * @param msg The message contained within the error thrown.
         * @return This should never return.
         */
        runtimeError: function (msg) {
            quby.runtime.error(quby.runtime.EXCEPTION_NAME_RUNTIME, msg);
        },

        /**
         * Throws the standard eror for when a stated field is not found.
         * 
         * @param name The name of the field that was not found.
         */
        fieldNotFoundError: function (obj, name) {
            var msg;
            var thisClass = quby.runtime.identifyObject( obj );
            
            if ( name.indexOf('@') > -1 ) {
                var parts = name.split( '@' );
                var field = parts[0];
                var fieldClass = parts[1];
                
                if ( fieldClass.toLowerCase() != thisClass.toLowerCase() ) {
                    msg =
                            "Field '" + field +
                            "' from class '" + fieldClass +
                            "' is illegally accessed from sub or super class '" + thisClass +
                            "'.";
                } else {
                    msg =
                            "Field '" + field +
                            "' is being accessed before being assigned to in class '" + thisClass +
                            "'.";
                }
            } else {
                msg =
                        "Field '" + name +
                        "' is being accessed before being assigned to in class '" + thisClass +
                        "'.";
            }
            
            quby.runtime.runtimeError( msg );
        },

        /**
         * Throws an error designed specifically for when a block is expected,
         * but was not present. It is defined here so that it can be called
         * manually by users from within their inlined JavaScript code.
         * 
         * This method will not return since it throws an exception.
         * 
         * @return This should never return.
         */
        missingBlockError: function () {
            this.runtimeError("Yield with no block present");
        },

        lookupMethodName: function(callName) {
            var methodName = window[quby.runtime.FUNCTION_TABLE_NAME][callName];
            
            // should never happen, but just in case...
            if ( methodName === undefined ) {
                methodName = callName;
            }
            
            return methodName;
        },
        
        /**
         * Throws an error stating that there are not enough parameters for yielding
         * to something. The something is stated by the 'type' parameter (i.e. "block",
         * "function" or "method"). It is stated by the user.
         * 
         * The 'expected' and 'got' refer to the number of parameters the type expects
         * and actually got when it was called.
         * 
         * @param expected The number of parameters expected by the caller.
         * @param got The number of parameters actually received when the call was attempted.
         * @param type A name for whatever was being called.
         */
        notEnoughBlockParametersError: function (expected, got, type) {
            quby.runtime.runtimeError("Not enough parameters given for a " + type + ", was given: " + got + " but expected: " + expected);
        },

        methodMissingError: function (obj, callName, args, block) {
            var methodName = quby.runtime.lookupMethodName(callName);

            // check for methods with same name, but different parameters
            var callNameAlt = callName.replace(/_[0-9]+$/, "");
            for (var key in obj) {
                var keyCallName = key.toString();
                var mName = keyCallName.replace(/_[0-9]+$/, "");

                if (callNameAlt == mName) {
                    // take into account the noMethodStubs when searching for alternatives
                    // (skip the noMethod's)
                    var funs = window[quby.runtime.FUNCTION_DEFAULT_TABLE_NAME];
                    if ( !funs || (callName != keyCallName && funs[keyCallName] != obj[keyCallName]) ) {
                        quby.runtime.runtimeError("Method: '" + methodName + "' called with incorrect number of arguments (" + args.length + ") on object of type '" + quby.runtime.identifyObject(obj) + "'");
                    }
                }
            }
            
            quby.runtime.runtimeError("Unknown method '" + methodName + "' called with " + args.length + " arguments on object of type '" + quby.runtime.identifyObject(obj) + "'");
        },

        /**
         * This is a callback called when an unknown method is called at runtime.
         * 
         * @param methodName The name of hte method being called.
         * @param args The arguments for the method being called.
         */
        onMethodMissing: function (methodName, args) {
            quby.runtime.methodMissingError(this, methodName, args);
        },
        
        /**
         * This attempts to decode the given string,
         * removing all of the special quby formatting names from it.
         * 
         * It searches through it for items that match internal Quby names,
         * and removes them.
         * 
         * Note that it cannot guarantee to do this correctly.
         * 
         * For example variables start with '_var_',
         * but it's entirely possible that the string passed holds
         * text that starts with '_var_', but is unrelated.
         * 
         * So this is for display purposes only!
         * 
         * @public
         * @param str The string to remove formatting from.
         * @return The string with all internal formatting removed.
         */
        unformatString: function( str ) {
            str = str.replace(/\b[a-zA-Z0-9_]+\b/g, function(match) {
                // Functions
                // turn function from: '_fun_foo_1' => 'foo'
                if ( match.indexOf(quby.runtime.FUNCTION_PREFIX) === 0 ) {
                    match = match.substring( quby.runtime.FUNCTION_PREFIX.length );
                    return match.replace( /_[0-9]+$/, '' );
                // Fields
                // there are two 'field prefixes' in a field
                } else if ( match.indexOf(quby.runtime.FIELD_PREFIX === 0) && match.indexOf(quby.runtime.FIELD_PREFIX, 1) > -1 ) {
                    var secondFieldPrefixI = match.indexOf(quby.runtime.FIELD_PREFIX, 1);
                    var classBit = match.substring( 0, secondFieldPrefixI+quby.runtime.FIELD_PREFIX.length ),
                        fieldBit = match.substring( secondFieldPrefixI + quby.runtime.FIELD_PREFIX.length );
                    
                    // get out the class name
                    // remove the outer 'field_prefix' wrappings, at start and end
                    var wrappingFieldPrefixes = new RegExp( '(^' + quby.runtime.FIELD_PREFIX + quby.runtime.CLASS_PREFIX + ')|(' + quby.runtime.FIELD_PREFIX + '$)', 'g' );
                    classBit = classBit.replace( wrappingFieldPrefixes, '' );
                    classBit = util.string.capitalize( classBit );
                    
                    return classBit + '@' + fieldBit;
                // Classes & Constructors
                // must be _after_ fields
                } else if ( match.indexOf(quby.runtime.CLASS_PREFIX) === 0 ) {
                    match = match.replace( new RegExp('^' + quby.runtime.CLASS_PREFIX), '' );
                    
                    // Constructor
                    if ( match.indexOf(quby.runtime.NEW_PREFIX) > -1 ) {
                        var regExp = new RegExp( quby.runtime.NEW_PREFIX + '[0-9]+$' );
                        match = match.replace( regExp, '' );
                    }
                    
                    return quby.runtime.untranslateClassName( match );
                // Globals
                // re-add the $, to make it look like a global again!
                } else if ( match.indexOf(quby.runtime.GLOBAL_PREFIX) === 0 ) {
                    return '$' + match.substring(quby.runtime.GLOBAL_PREFIX.length);
                // Symbols
                // same as globals, but using ':' instead of '$'
                } else if ( match.indexOf(quby.runtime.SYMBOL_PREFIX) === 0 ) {
                    return ':' + match.substring(quby.runtime.SYMBOL_PREFIX.length);
                // Variables
                // generic matches, variables like '_var_bar'
                } else if ( match.indexOf(quby.runtime.VARIABLE_PREFIX) === 0 ) {
                    return match.substring(quby.runtime.VARIABLE_PREFIX.length);
                // just return it, but untranslate incase it's a 'QubyArray',
                // 'QubyObject', or similar internal class name
                } else {
                    return quby.runtime.untranslateClassName( match );
                }
            });
            
            /**
             * Warning! It is presumed that prefixPattern _ends_ with an opening bracket.
             *  i.e. quby_setCollection(
             *       quby_getCollection(
             * 
             * @param {string} The string to search through for arrays
             * @param {string} The prefix pattern for the start of the array translation.
             * @param {function({string}, {array<string>}, {string})} A function to put it all together.
             */
            var qubyArrTranslation = function(str, prefixPattern, onFind) {
                /**
                 * Searches for the closing bracket in the given string.
                 * It presumes the bracket is already open, when it starts to search.
                 * 
                 * It does bracket counting inside, to prevent it getting confused.
                 * It presumes the string is correctly-formed, but returns null if something goes wrong.
                 */
                var getClosingBracketIndex = function(str, startI) {
                    var openBrackets = 1;
                    
                    for ( var j = startI; j < str.length; j++ ) {
                        var c = str.charAt(j);
                        
                        if ( c === '(' ) {
                            openBrackets++;
                        } else if ( c === ')' ) {
                            openBrackets--;
                            
                            // we've found the closing bracket, so quit!
                            if ( openBrackets === 0 ) {
                                return j;
                            }
                        }
                    }
                    
                    return null;
                };
                
                /**
                 * Splits by the ',' character.
                 * 
                 * This differs from '.split(',')' because this ignores commas that might appear
                 * inside of parameters, through using bracket counting.
                 * 
                 * So if a parameter contains a function call, then it's parameter commas are ignored.
                 * 
                 * The found items are returned in an array.
                 */
                var splitByRootCommas = function(str) {
                    var found = [],
                        startI = 0;
                    
                    var openBrackets = 0;
                    for ( var i = 0; i < str.length; i++ ) {
                        var c = str.charAt(i);
                        
                        if ( c === ',' && openBrackets === 0 ) {
                            found.push( str.substring(startI, i) );
                            // +1 to skip this comma
                            startI = i+1;
                        } else if ( c === '(' ) {
                            openBrackets++;
                        } else if ( c === ')' ) {
                            openBrackets--;
                        }
                    }
                    
                    // add everything left, after the last comma
                    found.push( str.substring(startI) );
                    
                    return found;
                };
                
                // Search through and try to do array translation as much, or often, as possible.
                var i = -1;
                while ( (i = str.indexOf(prefixPattern)) > -1 ) {
                    var openingI = i + prefixPattern.length;
                    var closingI = getClosingBracketIndex( str, openingI );
 
                    // something's gone wrong, just quit!
                    if ( closingI === null ) {
                        break;
                    }
                    
                    var pre = str.substring( 0, i ),
                        mid = str.substring( openingI, closingI ),
                        // +1 to skip the closing bracket of the 'quby_getCollection'
                        post = str.substring( closingI+1 );
                    
                    var parts = splitByRootCommas( mid );
                    
                    str = onFind( pre, parts, post );
                }
                
                return str;
            };
            
            // Translating: quby_getCollection( arr, i ) => arr[i]
            str = qubyArrTranslation( str, 'quby_getCollection(', function(pre, parts, post) {
                return pre + parts[0] + '[' + parts[1] + ']' + post;
            } );
            
            // Translating: quby_setCollection( arr, i, val ) => arr[i] = val
            str = qubyArrTranslation( str, 'quby_setCollection(', function(pre, parts, post) {
                return pre + parts[0] + '[' + parts[1] + '] = ' + parts[2] + post ;
            } );
            
            // This is to remove the 'null' blocks, passed into every function/constructor/method
            // need to remove the 'a( null )' first, and then 'a( i, j, k, null )' in a second sweep.
            str = str.replace( /\( *null *\)/g, '()' );
            str = str.replace( /, *null *\)/g, ')' );
            
            return str;
        },

        /**
         * Helper functions to be called from within inlined JavaScript and the parser
         * for getting access to stuff inside the scriptin language.
         * 
         * Variables should be accessed in the format: '_var_<name>' where <name> is the
         * name of the variable. All names are in lowercase.
         * 
         * For example: _var_foo, _var_bar, _var_foo_bar
         */
        formatVar: function (strVar) {
            return quby.runtime.VARIABLE_PREFIX + strVar.toLowerCase();
        },

        /**
         * @param strVar The variable name to format into the internal global callname.
         * @return The callname to use for the given variable in the outputted javascript.
         */
        formatGlobal: function (strVar) {
            return quby.runtime.GLOBAL_PREFIX + strVar.replace(/\$/g, '').toLowerCase();
        },

        /**
         * @param strClass The class name to format into the internal class callname.
         * @return The callname to use for the given class in the outputted javascript.
         */
        formatClass: function (strClass) {
            strClass = strClass.toLowerCase();
            var newName = quby.runtime.TRANSLATE_CLASSES[strClass];

            if (newName) {
                return newName;
            } else {
                return quby.runtime.CLASS_PREFIX + strClass;
            }
        },

        /**
         * @param strClass The class name for the field to format.
         * @param strVar The name of the field that is being formatted.
         * @return The callname to use for the given field.
         */
        formatField: function (strClass, strVar) {
            return quby.runtime.FIELD_PREFIX + quby.runtime.formatClass(strClass) + quby.runtime.FIELD_PREFIX + strVar.toLowerCase();
        },

        /**
         * A function for correctly formatting function names.
         * 
         * All function names are in lowercase. The correct format for a function name is:
         * '_fun_<name>_<numParameters>' where <name> is the name of the function and
         * <numParameters> is the number of parameters the function has.
         * 
         * For example: _fun_for_1, _fun_print_1, _fun_hasblock_0
         */
        formatFun: function (strFun, numParameters) {
            return quby.runtime.FUNCTION_PREFIX + strFun.toLowerCase() + '_' + numParameters;
        },

        /**
         * Formats a constructor name using the class name given and the stated
         * number of parameters. The class name should be the proper (pretty) class
         * name, not a formatted class name.
         * 
         * @param strKlass The class name of the constructor being formatted.
         * @param numParameters The number of parameters in the constructor.
         * @return The name for a constructor of the given class with the given number of parameters.
         */
        formatNew: function (strKlass, numParameters) {
            return quby.runtime.formatClass(strKlass) + quby.runtime.NEW_PREFIX + numParameters;
        },

        formatSymbol: function (sym) {
            return quby.runtime.SYMBOL_PREFIX + sym.toLowerCase();
        }
    };
})( quby, util );

quby.runtime.initialize();

/**
 * Standard core object that everything extends.
 */
function QubyObject() {
    // map JS toString to the Quby toString
};

/**
 * Arrays are not used in Quby, instead it uses it's own Array object.
 * 
 * These wrap a JavaScript array to avoid the issues with extending the
 * Array prototype.
 * 
 * Note that the values given are used internally. So do not
 * mutate it externally to this function!
 * 
 * If you are copying, copy the values first, then create a new
 * QubyArray with the values passed in.
 * 
 * @constructor
 * @param values Optionally takes an array of values, set as the default values for this array.
 */
function QubyArray( values ) {
    if ( values === undefined ) {
        this.values = [];
    } else {
        this.values = values;
    }
}
QubyArray.prototype.set = function (key, value) {
    var index = key >> 0; // convert to int
    
    if ( index < 0 ) {
        quby.runtime.runtimeError( "Negative value given as array index: " + key );
    }

    var values = this.values,
        len = values.length;
    
    /* 
     * We first insert the new value, into the array,
     * at it's location. It's important to *not* pad
     * before we do this, as JS will automatically
     * allocate all the memory needed for that padding.
     */
    values[ index ] = value;

    /*
     * Then we convert the padded 'undefines' to 'null',
     * by just iterating over them.
     * 
     * As we added the index already, these locations
     * exist, so there are no allocation surprises for
     * the runtime.
     */
    while ( index > len ) {
        values[ --index ] = null;
    }

    return value;
};
QubyArray.prototype.get = function (key) {
    var index = key >> 0; // convert to int
    var len = this.values.length;
    
    if ( index < 0 ) {
        if ( -index > len ) {
            return null;
        } else {
            index = len+index;
        }
    } else if ( index >= len ) {
        return null;
    }
    
    return this.values[ index ];
};

/**
 * 
 * 
 * @constructor
 */
function QubyHash() {
    this.values = [];
    
    for ( var i = 0, argsLen = arguments.length; i < argsLen; i += 2 ) {
        var key   = arguments[ i   ];
        var value = arguments[ i+1 ];
        
        this.set( key, value );
    }
	
    return this;
}
QubyHash.prototype.hash = function(val) {
    if ( val == null ) {
        return 0;
    } else if ( typeof(val) == 'string' ) {
        return val.length;
    } else {
        return val.toSource ? val.toSource().length : val.constructor.toString().length ;
    }
};
QubyHash.prototype.set = function (key, value) {
    var keyHash = this.hash( key );
    var vals = this.values[ keyHash ];
    
    if ( vals === undefined ) {
        this.values[ keyHash ] = [
                { key: key, value: value }
        ];
    } else {
        for ( var i = 0, valsLen = vals.length; i < valsLen; i++ ) {
            var node = vals[ i ];
            
            if ( node.key == key ) {
                node.value = value;
                return;
            }
        }
        
        vals.push(
                { key: key, value: value }
        );
    }
};
QubyHash.prototype.get = function (key) {
    var keyHash = this.hash( key );
    var vals = this.values[ keyHash ];
    
    if ( vals === undefined ) {
        return null;
    } else {
        for ( var i = 0, valsLen = vals.length; i < valsLen; i++ ) {
            var node = vals[ i ];
            
            if ( node.key == key ) {
                return node.value;
            }
        }
        
        return null;
    }
};
QubyHash.prototype.clone = function() {
    var copy = new QubyHash();

    for (var hash in this.values) {
        var keys = this.values[ hash ];

        copy.values[ hash ] = this.cloneKeys( keys );
    }
    
    return copy;
};
QubyHash.prototype.cloneKeys = function( keys ) {
    var newKeys = [];
    var keysLen = keys.length;
    
    for ( var i = 0; i < keysLen; i++ ) {
        var node = keys[i];

        newKeys.push( {
                key   : node.key,
                value : node.value
        } );
    }
    
    return newKeys;
};
QubyHash.prototype.each = function( fun ) {
    for (var hash in this.values) {
        var keys = this.values[ hash ];
        
        for ( var i = 0, len = keys.length; i < len; i++ ) {
            var node = keys[i];
            fun( node.key, node.value );
        }
    }
};
QubyHash.prototype.contains = function( key ) {
    var keyHash = this.hash( key );
    var vals = this.values[ keyHash ];
    
    if ( vals != undefined ) {
        for ( var i = 0, len = vals.length; i < len; i++ ) {
            if ( key == vals[ i ].key ) {
                return true;
            }
        }
    }
    
    return false;
};
QubyHash.prototype.remove = function( key ) {
    var keyHash = this.hash( key );
    var vals = this.values[ keyHash ];
    
    if ( vals != undefined ) {
        for ( var i = 0, len = vals.length; i < len; i++ ) {
            var node = vals[ i ];
            
            if ( key == node.key ) {
                vals.splice( i, 1 );
                
                // remove the empty hash array too
                if ( vals.length === 0 ) {
                    this.values.splice( keyHash, 1 );
                }
                
                return node.value;
            }
        }
    }
    
    return null;
};

