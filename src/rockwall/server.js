"use static";

/**
 * Rockwall Server
 *
 * The core server handling section of Rockwall.
 */

exports.Server = (function() {
    var http = require('http'),
        fs   = require('fs');

    var rockwall = function() {
        this.fileMimeTypes = {};

        this.notFoundFun = null;

        this.publicFolder = '';
        this.realPublicFolder = '';

        this.routing = {};
    };

    var ensureSlash = function( str ) {
        if ( str === '' ) {
            return './';
        } else if ( str.charAt(str.length-1) !== '/' ) {
            return str + '/';
        } else {
            return str;
        }
    }

    var parseExtension = function( str ) {
        var lastDot = str.lastIndexOf( '.' );

        if ( lastDot !== -1 ) {
            return str.substring( lastDot+1 );
        } else {
            return '';
        }
    }

    var trimSlashes = function( str ) {
        if ( str === '' || str === '/' || str === '//' ) {
            return '';
        } else {
            /*
             * Remove leading, and trailing, slashes.
             */
            if ( str.charAt(0) === '/' ) {
                if ( str.charAt(str.length-1) === '/' ) {
                    return str.substring( 1, str.length-1 );
                } else {
                    return str.substring( 1, str.length-1 );
                }
            } else if ( str.charAt(str.length-1) === '/' ) {
                return str.substring( 0, str.length-1 );
            }
        }
    }

    var parseUrl = function( str ) {
        var query = {},
            parts = []
            partsStr = '';

        str = trimSlashes( str );

        if ( str !== '' ) {
            var queryStr = null;

            /*
             * Handle the query section.
             */
            var queryParam = str.indexOf( '?' );
            if ( queryParam !== -1 ) {
                partsStr = str.substring( 0, queryParam );
                queryStr = str.substring( queryParam );

                queryParts = queryStr.split( '&' );
                for ( var i = 0; i < queryParts.length; i++ ) {
                    var queryPart = queryParts[i];
                    var equal = queryPart.indexOf('=');

                    if ( equal !== -1 ) {
                        query[ queryPart.substring(0, equal) ] = queryPart.substring(equal+1);
                    } else {
                        query[ queryPart ] = true;
                    }
                }
            } else {
                partsStr = str;
            }

            parts = partsStr.split('/');
        } else {
            partsStr = str;
        }

        return {
                fileUrl: partsStr,
                url  : str,
                parts: parts,
                query: query
        }
    }

    rockwall.prototype = {
        mime: function( ext, mime ) {
            if ( arguments.length === 2 ) {
                if ( ext.charAt(0) === '.' ) {
                    ext = ext.substring( 1 );
                }

                this.fileMimeTypes[ ext ] = mime;
            } else {
                if ( typeof ext === 'object' ) {
                    for ( var k in ext ) {
                        if ( ext.hasOwnProperty(k) ) {
                            this.mime( k, ext[k] );
                        }
                    }
                }
            }

            return this;
        },

        handleFileRequest: function(url, req, res) {
            if ( url.fileUrl !== '' ) {
                try {
                    var path = fs.realpathSync( this.realPublicFolder + url.fileUrl ).replace( /\\/g, "/" );

                    if ( path.indexOf(this.realPublicFolder) === 0 ) {
                        var self = this;

                        fs.exists( path, function(exists) {
                            if ( exists ) {
                                fs.readFile( path, function( err, data ) {
                                    if ( err ) {
                                        self.handleRequest( url, req, res );
                                    } else {
                                        var ext = parseExtension( url.fileUrl );

                                        var mime = self.fileMimeTypes[ ext ] || 'text/plain';
                                        res.writeHead( 200, {'Content-Type': mime} );
                                        res.end( data );
                                    }
                                } );
                            } else {
                                self.handleRequest( url, req, res );
                            }
                        } );

                        return;
                    }
                } catch ( err ) { }
            }

            this.handleRequest( url, req, res );
        },

        handleRequest: function(url, req, res) {
            res.writeHead( 200, {'Content-Type': 'text/html'} );

            if ( this.routing[url.fileUrl] !== undefined ) {
                this.routing[url.fileUrl](url, req, res);
            } else {
                var urlParts = url.parts;

                if ( urlParts.length === 0 ) {
                    this.notFoundFun( url, req, res );
                } else {
                    var i = 0,
                        str = urlParts[0];
                        
                    do {
                        var fun = this.routing[ str ];
                        if ( fun !== undefined ) {
                            fun(url, req, res);
                            return;
                        }

                        str += '/' + url.parts[i++];
                    } while ( i < urlParts.length );

                    this.notFoundFun( url, req, res );
                }
            }
        },

        pageNotFound: function( notFoundFun ) {
            this.notFoundFun = notFoundFun;
        },

        route: function( url, action ) {
            if ( arguments.length === 1 ) {
                if ( typeof url === 'object' ) {
                    for ( var k in url ) {
                        if ( url.hasOwnProperty(k) ) {
                            this.route( k, url[k] );
                        }
                    }
                } else {
                    throw new Error( 'Invalid argument given' );
                }
            } else {
                this.routing[ trimSlashes(url) ] = action;
            }
        },

        start: function( publicFolder, port ) {
            if ( port === undefined ) {
                port = 80;
            }

            this.publicFolder     = ensureSlash( publicFolder );
            this.realPublicFolder = ensureSlash( fs.realpathSync(this.publicFolder) ).replace( /\\/g, '/' );

            if ( ! this.notFoundFun ) {
                throw new Error( 'no page not found function provided' );
            }

            var self = this;
            http.createServer(function(req, res) {
                console.log( 'request ' + req.url );

                var url = parseUrl( req.url );
                self.handleFileRequest(url, req, res);
            }).listen( port );

            console.log( 'server listening on port ' + port );
        }
    }

    return rockwall;
})();

