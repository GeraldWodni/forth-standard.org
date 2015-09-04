// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs  = require("fs");
var _   = require("underscore");

module.exports = {
    setup: function( k ) {

        var wordSets = {};
        k.readHierarchyFile( "forth-standard.org", "2012.json", function( err, content ) {
            wordSets = JSON.parse( content );
        });

        k.router.get("/words/:wordSet/:wordBasename", function( req, res ) {
            k.requestman( req );

            var wordSetName  = req.requestman.id( "wordSet" );
            var wordBasename = req.requestman.id( "wordBasename" );

            if( wordSetName in wordSets && wordBasename in wordSets[ wordSetName ].words )
                k.jade.render( req, res, "word", { word: wordSets[ wordSetName ].words[ wordBasename ] } );
            else
                res.json( { "NOT": "FOUND" } );
        });

        k.router.get("/words/:wordSet", function( req, res ) {
            k.requestman( req );

            var wordSetName = req.requestman.id( "wordSet" );
            if( wordSetName in wordSets )
                k.jade.render( req, res, "wordSet", { wordSet: wordSets[ wordSetName ] } );
            else
                res.json( { "NOT": "FOUND" } );
        });

        k.router.get("/words", function( req, res ) {
            k.jade.render( req, res, "words", { wordSets: wordSets } );
        });

        k.router.get("/todo", function( req, res ) {
            k.jade.render( req, res, "todo" );
        });

        k.router.get("/", function( req, res ) {
            k.jade.render( req, res, "home" );
        });
    }
};
