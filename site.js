// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs  = require("fs");
var _   = require("underscore");

module.exports = {
    setup: function( k ) {

        var standard = { wordSets: {} };
        var searchIndex = {};

        k.readHierarchyFile( "forth-standard.org", "standards/2012.json", function( err, content ) {
            standard = JSON.parse( content );
            _.each( standard.wordSets, function( wordSet ) {
                _.each( wordSet.words, function( word ) {
                    var index = word.name.toLowerCase();
                    var matches = searchIndex[index] || [];
                    matches.push({
                        list: wordSet.name,
                        basename: word.basename,
                        name: word.name,
                        english: word.english
                    });
                    searchIndex[index] = matches;
                });
            });
        });

        k.router.get("/standard/words", function( req, res ) {
            k.jade.render( req, res, "words", { standard: standard } );
        });

        /* search index for matching words */
        function searchWords( search ) {
            var matches = [];
            var keys = _.keys( searchIndex );
            for( var i = 0; i < keys.length; i++ ) {
                var key = keys[i];
                if( key.indexOf( search ) >= 0 )
                    matches.push( searchIndex[key] );
            }
            return matches;
        }

        /* TODO: rest API for AJAX search */
        k.router.get("/search/*", function( req, res ) {
            var search = decodeURI(req.path).substr(8).toLowerCase();
            res.json( searchWords( search ) );
        });

        k.router.post("/search", function( req, res ) {
            k.postman( req, res, function() {
                var search = req.postman.raw("search").toLowerCase();
                k.jade.render( req, res, "search", { matches: searchWords( search ) } );
            });
        });

        k.router.get("/search", function( req, res ) {
            k.jade.render( req, res, "search" );
        });

        k.router.get("/standard/:wordSet/:wordBasename", function( req, res ) {
            k.requestman( req );

            var wordSetName  = req.requestman.id( "wordSet" );
            var wordBasename = req.requestman.id( "wordBasename" );

            if( wordSetName in standard.wordSets && wordBasename in standard.wordSets[ wordSetName ].words )
                k.jade.render( req, res, "word", { standard: standard, wordSet: standard.wordSets[ wordSetName ], word: standard.wordSets[ wordSetName ].words[ wordBasename ] } );
            else
                res.json( { "NOT": "FOUND" } );
        });

        //k.router.get("/standard/:wordSet", function( req, res ) {
        //    k.requestman( req );

        //    var wordSetName = req.requestman.id( "wordSet" );
        //    if( wordSetName in standard.wordSets )
        //        k.jade.render( req, res, "wordSet", { wordSet: standard.wordSets[ wordSetName ] } );
        //    else
        //        res.json( { "NOT": "FOUND" } );
        //});

        k.router.get("/standard/:document", function( req, res ) {
            k.requestman( req );
            var document = req.requestman.id( "document" );

            if( document in standard.documents )
                k.jade.render( req, res, "document", { standard: standard, document: standard.documents[ document ] } );
            else if( wordSetName in standard.wordSets )
                k.jade.render( req, res, "wordSet", { standard: standard, wordSet: standard.wordSets[ wordSetName ] } );
            else
                res.json( { "NOT": "FOUND" } );
        });

        k.router.get("/todo", function( req, res ) {
            k.jade.render( req, res, "todo" );
        });

        k.router.get("/contact", function( req, res ) {
            k.jade.render( req, res, "contact" );
        });

        k.router.get("/", function( req, res ) {
            k.jade.render( req, res, "home" );
        });
    }
};
