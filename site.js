// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs  = require("fs");
var _   = require("underscore");
var md5 = require("md5");

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

        /* add common values for rendering */
        function vals( req, values ) {
            if( !values )
                values = {};

            _.extend( values, {
                loggedIn: "session" in req
            });

            return values;
        }

        function httpStatus( req, res, code ) {
            k.httpStatus( req, res, code, { values: vals( req ) } );
        }

        var kData = k.getData();

        k.router.get("/favicon.ico", k.serveStaticFile( "images/favicon.ico" ) );

        k.router.get("/standard/words", function( req, res ) {
            k.jade.render( req, res, "words", vals( req, { standard: standard } ) );
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
                k.jade.render( req, res, "search", vals( req, { matches: searchWords( search ) } ) );
            });
        });

        k.router.get("/search", function( req, res ) {
            k.jade.render( req, res, "search", vals( req ) );
        });

        function contributions( callback ) {
            return function( req, res, next ) {
                kData.contributions.readWhere("url", [ req.path ], function( err, contributions ) {
                    if( err ) return next( err );
                    callback( req, res, next, { path: req.path, items: contributions } );
                });
            };
        }

        k.router.get("/standard/:wordSet/:wordBasename", contributions( function( req, res, next, contributions ) {
            k.requestman( req );

            var wordSetName  = req.requestman.id( "wordSet" );
            var wordBasename = req.requestman.id( "wordBasename" );

            if( wordSetName in standard.wordSets && wordBasename in standard.wordSets[ wordSetName ].words )
                k.jade.render( req, res, "word", vals( req, {
                    standard: standard,
                    wordSet: standard.wordSets[ wordSetName ],
                    word: standard.wordSets[ wordSetName ].words[ wordBasename ],
                    contributions: contributions
                } ) );
            else
                res.json( { "NOT": "FOUND" } );
        }));

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
                k.jade.render( req, res, "document", vals( req, { standard: standard, document: standard.documents[ document ] } ) );
            else if( wordSetName in standard.wordSets )
                k.jade.render( req, res, "wordSet", vals( req, { standard: standard, wordSet: standard.wordSets[ wordSetName ] } ) );
            else
                res.json( { "NOT": "FOUND" } );
        });

        k.router.get("/todo", function( req, res ) {
            k.jade.render( req, res, "todo", vals( req ) );
        });

        k.router.get("/contact", function( req, res ) {
            k.jade.render( req, res, "contact", vals( req ) );
        });

        /* user management */
        k.useSiteModule( "/", "forth-standard.org", "userManagement.js", { setup: {
            vals: vals,
            httpStatus: httpStatus,
            renderUser: function _renderUser( userLink, req, res, next ) {
                /* user */
                kData.users.readWhere( "name", [ userLink ], function( err, users ) {
                    if( err ) return next( err );
                    if( users.length == 0 ) return httpStatus( req, res, 404 );

                    /* user's packages */
                    var user = users[0];
                    kData.contributions.readWhere( "user", [ user.id ], function( err, contributions ) {
                        if( err ) return next( err );

                        user.emailMd5 = md5( user.email );
                        k.jade.render( req, res, "user", vals( req, { user: user, contributions: contributions, manage: req.session && user.name==req.session.loggedInUsername, title: user.name } ) );
                    });
                });
            }
        }} );

        /* user management */
        k.useSiteModule( "/profile", "forth-standard.org", "contributions.js", { setup: {
            vals: vals,
            httpStatus: httpStatus
        } } );

        /* home */
        k.router.get("/", function( req, res ) {
            console.log( "HVALS:", vals( req ) );
            k.jade.render( req, res, "home", vals(req) );
        });
    }
};
