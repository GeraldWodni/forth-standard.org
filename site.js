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
                loggedIn: "session" in req,
                contributionTypeName: {
                    "example": "Example",
                    "testcase":"Suggested Testcase",
                    "requestClarification":"Request for clarification",
                    "referenceImplementation":"Suggested reference implementation",
                    "comment":"Comment"
                }
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

        function urlToTitle( url ) {
            var urlParts = url.split("/");
            urlParts.shift();
            urlParts.shift();
            return urlParts.join(", ");
        }

        function formatUserContents( dataTable, userTable, items ) {
            _.each( items, function( item ) {
                formatUserContent( dataTable, userTable, item );
            });
            return items;
        }

        function formatUserContent( dataTable, userTable, item ) {
            item[dataTable].markdownText = marked( item[dataTable].text );
            item[dataTable].createdFormated = moment( item[dataTable].created ).format( kData.sql.dateTimeFormat );
            item[userTable].emailMd5 = md5( item[userTable].email );
            item[dataTable].title = urlToTitle( item.contributions.url.split("/") );
            return item;
        }

        /* get all contributions to a specific url */
        function urlContributions( urlPath, next, callback ) {
            db.query( { sql: "SELECT * FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " LEFT JOIN replies ON replies.contribution=contributions.id AND replies.state='visible'"
                + " LEFT JOIN users AS replyUsers ON replyUsers.id=replies.user"
                + " WHERE contributions.url=? AND contributions.state='visible'",
                nestTables: true }, [ urlPath ], function( err, items ) {

                if( err ) return next( err );

                var groupedContributions = [];
                var lastContribution = { contributions: { id: 0 } };
                items.forEach( function ( item ) {
                    /* new contribution */
                    if( item.contributions.id != lastContribution.contributions.id ) {
                        lastContribution = formatUserContent( "contributions", "users", {
                            contributions: item.contributions,
                            users: item.users,
                            replies: []
                        });
                        groupedContributions.push( lastContribution );
                    }

                    if( item.replies.id && item.replyUsers.id )
                        lastContribution.replies.push( formatUserContent( "replies", "replyUsers", {
                            replies: item.replies,
                            replyUsers: item.replyUsers
                        }));
                });

                callback( groupedContributions );
            });
        }

        k.router.get("/standard/:wordSet/:wordBasename", function( req, res, next ) {
            urlContributions( req.path, next, function( contributions ) {
                k.requestman( req );

                var wordSetName  = req.requestman.id( "wordSet" );
                var wordBasename = req.requestman.id( "wordBasename" );

                if( wordSetName in standard.wordSets && wordBasename in standard.wordSets[ wordSetName ].words )
                    k.jade.render( req, res, "word", vals( req, {
                        standard: standard,
                        wordSet: standard.wordSets[ wordSetName ],
                        word: standard.wordSets[ wordSetName ].words[ wordBasename ],
                        urlPath: req.path,
                        contributions: contributions
                    } ) );
                else
                    res.json( { "NOT": "FOUND" } );
            });
        });

        //k.router.get("/standard/:wordSet", function( req, res ) {
        //    k.requestman( req );

        //    var wordSetName = req.requestman.id( "wordSet" );
        //    if( wordSetName in standard.wordSets )
        //        k.jade.render( req, res, "wordSet", { wordSet: standard.wordSets[ wordSetName ] } );
        //    else
        //        res.json( { "NOT": "FOUND" } );
        //});

        k.router.get("/standard/:document", function( req, res, next ) {
            k.requestman( req );
            var document = req.requestman.id( "document" );

            if( document in standard.documents )
                urlContributions( req.path, next, function( contributions ) {
                    k.jade.render( req, res, "document", vals( req, {
                        standard: standard,
                        document: standard.documents[ document ],
                        urlPath: req.path,
                        contributions: contributions
                    }));
                });
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

                        db.query( "SELECT contributions.* FROM contributions"
                            + " INNER JOIN replies ON contributions.id=replies.contribution WHERE replies.user=? GROUP BY contributions.id",
                            [ user.id ], function( err, replyContributions ) {
                            if( err ) return next( err );

                            contributions.forEach( function( contribution ) {
                                contribution.title = urlToTitle( contribution.url );
                            });
                            replyContributions.forEach( function( reply ) {
                                reply.title = urlToTitle( reply.url );
                            });

                            k.jade.render( req, res, "user", vals( req, {
                                user: user,
                                contributions: contributions,
                                replyContributions: replyContributions,
                                manage: req.session && user.name==req.session.loggedInUsername,
                                title: user.name
                            } ) );

                        });
                    });
                });
            }
        }} );

        /* user management */
        k.useSiteModule( "/profile", "forth-standard.org", "contributions.js", { setup: {
            vals: vals,
            httpStatus: httpStatus
        } } );
        k.useSiteModule( "/profile", "forth-standard.org", "replies.js", { setup: {
            vals: vals,
            httpStatus: httpStatus
        } } );


        /** reviews **/
        /* load user and check for moderator */
        function checkIsModerator( req, res, next, callback ) {
            if( !req.session || ! req.session.loggedInUsername )
                return httpStatus( req, res, 403 );

            kData.users.readWhere( "name", [ req.session.loggedInUsername ], function( err, users ) {
                if( err ) return next( err );
                if( users.length == 0 ) return httpStatus( req, res, 404 );
                if( users[0].state != 'moderator' ) return httpStatus( req, res, 403 );
                callback();
            });
        }

        function routeReview( opts ) {
            /* accept / delete */
            k.router.post( "/profile/review-" + opts.table, function( req, res, next ) {
                checkIsModerator( req, res, next, function() {
                    k.postman( req, res, function() {
                        var id = req.postman.id();
                        var accept = req.postman.exists( "accept" );
                        var remove = req.postman.exists( "delete" );

                        var newState = accept ? "visible" : remove ? "deleted" : false;
                        if( !newState )
                            return httpStatus( req, res, 422 );

                        kData[ opts.table ].update( id, { state: newState }, function( err ) {
                            if( err ) return next( err );
                            req.method = "GET";
                            req.messages = [{ type: "success", title: "Success", text: opts.successText }];
                            next();
                        });
                    });
                });
            });

            /* list open items */
            k.router.get("/profile/review-" + opts.table, function( req, res, next ) {
                checkIsModerator( req, res, next, function() {
                    db.query({ sql: opts.query, nestTables: true }, [], function( err, items ) {

                        formatUserContents( opts.table, "users", items );

                        k.jade.render( req, res, opts.jadeFile, vals( req, {
                            messages: req.messages,
                            items: items
                        }));
                    });
                });
            });
        }

        routeReview({
            table: "contributions",
            successText: "Contribution reviewed",
            query: "SELECT * FROM contributions INNER JOIN users ON contributions.user=users.id"
                + " WHERE contributions.state='new'",
            jadeFile: "reviewContributions"
        });

        routeReview({
            table: "replies",
            successText: "Replies reviewed",
            query: "SELECT * FROM replies INNER JOIN users ON replies.user=users.id"
                + " INNER JOIN contributions ON replies.contribution=contributions.id WHERE replies.state='new'",
            jadeFile: "reviewReplies"
        });



        /** home **/
        k.router.get("/", function( req, res ) {
            db.query( { sql: "SELECT * FROM contributions INNER JOIN users ON contributions.user=users.id"
                + " WHERE contributions.state='visible' ORDER BY contributions.created DESC LIMIT 4;"
                + " SELECT * FROM replies INNER JOIN contributions ON replies.contribution = contributions.id"
                + " INNER JOIN users ON replies.user=users.id"
                + " WHERE replies.state='visible' ORDER BY replies.created DESC LIMIT 4",
                nestTables: true }, [], function( err, items ) {
                contributions   = formatUserContents( "contributions",  "users", items[0] );
                replies         = formatUserContents( "replies",        "users", items[1] );
                k.jade.render( req, res, "home", vals( req, { contributions: contributions, replies: replies } ) );
            });
        });
    }
};
