"use strict";

var PUBLIC_FOLDER = './www';

var rockwall = require( './rockwall/rockwall.js' );

var rockServer = new rockwall.Server();

rockServer.mime({
        gif     : 'image/gif',
        jpg     : 'image/jpg',
        jpeg    : 'image/jpg',
        qb      : 'text/qb',
        js      : 'application/javascript',
        css     : 'text/css'
});

rockServer.pageNotFound( function(url, req, res) {
    res.end( '<h1>page not found</h1>' );
} );
rockServer.route( '', function(url, req, res) {
    var out = new rockwall.TimeStamper( PUBLIC_FOLDER );
    
    res.end([
            '<!DOCTYPE html>',

            '<meta charset="utf-8">',
            '<meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">',

            '<title>Rockwell</title>',

            out.css( '/css/site.css' ),

            '<body>',
                out.js( '/js/boot.js' ),
                out.js( '/js/quby.js' ),

                out.qb( '/qb/main.qb' )

    ].join("\n"));
} );

rockServer.start( PUBLIC_FOLDER, 80 );
