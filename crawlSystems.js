// Crawl github-wiki into json
// (c)copyright 2016 by Gerald Wodni <gerald.wodni@gmail.com>

require("colors");
var fs = require("fs");
var jsdom = require("jsdom");
var jquery = require("jquery");
var https = require("https");

function parseGithubHtml( html, callback ) {
    jsdom.env( html.toString(), function( err, window ) {
        if( err ) return callback( err );

        /* parse document */
        var $ = jquery(window);
        var systems = [];

        $("#wiki-body .markdown-body table tbody tr").each( function( index, tr )  {
            var $tr = $(tr);
            var $a = $tr.find("td:eq(1) a");
            systems.push({
                stars       : parseInt( $tr.find("td:eq(0)").html() ),
                name        : $a.html(),
                link        : $a.attr("href"),
                lang        : $tr.find("td:eq(2)").html(),
                cpu         : $tr.find("td:eq(3)").html(),
                description : $tr.find("td:eq(4)").html()
            });
        });

        callback( null, systems );
    });
}

/* perform http-GET request and consume stream */
function httpsGet( url, callback ) {
    https.get( url, function( res ) {
        var chunks = [];
        res.on("data", function(chunk) {
            chunks.push( chunk );
        });
        res.on("end", function() {
            callback( null, res, Buffer.concat( chunks ) );
        });
        res.on("error", callback );

    }).on("error", callback );
}

/* get github wiki content and parse into json */
function crawlGithub( opts, callback ) {
    httpsGet( "https://github.com/ForthHub/wiki/wiki/Forth-Systems", function( err, res, body ) {
        if( err ) return callback( err );

        parseGithubHtml( body, function( err, systems ) {
            if( err ) return callback( err );
            
            fs.writeFile( opts.filename, JSON.stringify( systems, 0, 4 ), callback );
        });
    });
}

module.exports = crawlGithub;

if( require.main === module )
    crawlGithub( { filename: "systems.json" }, function( err, success ) {
        if( err )
            console.log( "crawlGithub".bold.red, err );
        else
            console.log( "crawlGithub".bold.green, success );
    });
