// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs      = require("fs");
var _       = require("underscore");
var marked  = require('marked');
var md5     = require("md5");
var moment  = require("moment");

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
        var db = k.getDb();

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

        function contributions( where, callback ) {
            return function( req, res, next ) {
                db.query({ sql: "SELECT * FROM contributions"
                    + " INNER JOIN users ON users.id=contributions.user"
                    + " " + where, nestTables: true
                    }, [ req.path ], function( err, contributions ) {
                    if( err ) return next( err );

                    _.each( contributions, function( contribution ) {
                        contribution.contributions.markdownText = marked( contribution.contributions.text );
                        contribution.contributions.createdFormated = moment( contribution.contributions.created ).format( kData.sql.dateTimeFormat );
                        contribution.users.emailMd5 = md5( contribution.users.email );
                    });

                    callback( req, res, next, { path: req.path, items: contributions } );
                });
            };
        }

        k.router.get("/standard/:wordSet/:wordBasename",
            contributions( "WHERE contributions.url=? AND contributions.state='visible'", function( req, res, next, contributions ) {
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

        k.router.post("/profile/review-contributions", function( req, res, next ) {
            k.postman( req, res, function() {
                var id = req.postman.id();
                var accept = req.postman.exists( "accept" );
                var remove = req.postman.exists( "delete" );
                
                var newState = accept ? "visible" : remove ? "deleted" : false;
                if( !newState )
                    return httpStatus( req, res, 422 );

                kData.contributions.update( id, { state: newState }, function( err ) {
                    if( err ) return next( err );
                    req.method = "GET";
                    req.messages = [{ type: "success", title: "Success", text: "Contribution reviewed" }];
                    console.log( "NEW STATE:", newState );
                    next();
                });
            });
        });

        k.router.get("/profile/review-contributions",
            contributions( "WHERE contributions.state='new'", function( req, res, next, contributions ) {
    
            if( !req.session || ! req.session.loggedInUsername )
                return httpStatus( req, res, 403 );

            kData.users.readWhere( "name", [ req.session.loggedInUsername ], function( err, users ) {
                if( err ) return next( err );
                if( users.length == 0 ) return httpStatus( req, res, 404 );
                if( users[0].state != 'moderator' ) return httpStatus( req, res, 403 );

                k.jade.render( req, res, "reviewContributions", vals( req, {
                    messages: req.messages,
                    contributions: contributions
                }));
            });
        }));

        /* home */
        k.router.get("/", function( req, res ) {
            console.log( "HVALS:", vals( req ) );
            k.jade.render( req, res, "home", vals(req) );
        });
    }
};
