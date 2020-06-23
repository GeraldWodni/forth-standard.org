// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs      = require("fs");
var path    = require("path");
var _       = require("underscore");
var marked  = require('marked');
var md5     = require("md5");
var moment  = require("moment");

module.exports = {
    setup: function( k ) {

        var standard = { wordSets: {} };
        var systems = [];
        var searchIndex = {};
        var uniqueWordNames = [];

        /* read standard */
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
                    if( uniqueWordNames.indexOf( index ) < 0 )
                        uniqueWordNames.push( index );
                });
            });
        });

        /* read systems */
        k.readHierarchyFile( "forth-standard.org", "systems.json", function( err, content ) {
            systems = JSON.parse( content );
        });

        /* add common values for rendering */
        function vals( req, values ) {
            if( !values )
                values = {};

            _.extend( values, {
                loggedIn: "session" in req,
                uniqueWordNames: uniqueWordNames,
                contributionTypeName: {
                    "example": "Example",
                    "testcase":"Suggested Testcase",
                    "requestClarification":"Request for clarification",
                    "referenceImplementation":"Suggested reference implementation",
                    "proposal":"Proposal",
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
            var values = vals( req, { standard: standard } );
            k.jade.render( req, res, "words", values );
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
                var matches = searchWords( search );
                if( matches.length == 1 && matches[0].length == 1 ) {
                    let word = matches[0][0];
                    res.statusCode = 302;
                    res.header("Location", `${req.protocol}://${req.kern.website}/standard/${word.list}/${word.basename}`);
                }
                k.jade.render( req, res, "search", vals( req, { matches: matches } ) );
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
            item[userTable].emailMd5 = md5( item[userTable].email.toLowerCase() );
            if( item.contributions && item.contributions.url )
                item[dataTable].title = urlToTitle( item.contributions.url );
            return item;
        }

        /* get all contributions to a specific url */
        function urlContributions( urlPath, next, callback ) {
            kData.query( "urlContributions", { url: urlPath }, function( err, items ) {
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
            else if( document in standard.wordSets )
                k.jade.render( req, res, "wordSet", vals( req, { standard: standard, wordSet: standard.wordSets[ document ] } ) );
            else
                res.json( { "NOT": "FOUND" } );
        });

        k.router.get("/systems", function( req, res, next ) {
            k.jade.render( req, res, "systems", vals( req, { systems: systems } ) );
        });

        k.router.get("/meta-discussion", function( req, res, next ) {
            urlContributions( req.path, next, function( contributions ) {
                k.jade.render( req, res, "meta-discussion", vals( req, {
                    urlPath: req.path,
                    contributions: contributions
                }));
            });
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
            checkIsModerator: checkIsModerator,
            renderUser: function _renderUser( userLink, req, res, next ) {
                /* user */
                kData.users.readWhere( "name", [ userLink ], function( err, users ) {
                    if( err ) return next( err );
                    if( users.length == 0 ) return httpStatus( req, res, 404 );

                    /* user's packages */
                    var user = users[0];
                    kData.contributions.readWhere( "user", [ user.id ], function( err, contributions ) {
                        if( err ) return next( err );

                        user.emailMd5 = md5( user.email.toLowerCase() );

                        kData.query( "userContributionsReplies", { user: user.id }, function( err, replyContributions ) {
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
                    kData.query( opts.name, function( err, items ) {
                        formatUserContents( opts.table, "users", items );

                        k.jade.render( req, res, opts.name, vals( req, {
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
            name: "reviewContributions"
        });

        routeReview({
            table: "replies",
            successText: "Replies reviewed",
            name: "reviewReplies"
        });

        /* gravatar proxy */
        k.proxyCache.gravatar( k.website, k.router );

        /** proposals **/
        k.router.get("/proposals/*", function( req, res, next ) {
            urlContributions( req.path, next, function( contributions ) {
                if( contributions.length == 0 )
                    return httpStatus( req, res, 404 );

                k.jade.render( req, res, "proposalWrapper", vals( req, {
                    urlPath: req.path,
                    contributions: contributions
                }));
            });
        });

        k.router.get("/proposals", function( req, res, next ) {
            db.query( { sql: "SELECT contributions.*, users.*,"
                + " COUNT(answers.id) AS answerCount,"
                + " GROUP_CONCAT( DISTINCT newVersions.id ORDER BY newVersions.id ) AS newVersionsId,"
                + " GROUP_CONCAT( DISTINCT newVersions.created ORDER BY newVersions.id ) AS newVersionsCreated,"
                + " GROUP_CONCAT( DISTINCT newStates.id ORDER BY newStates.id ) AS newStatesId,"
                + " GROUP_CONCAT( DISTINCT newStates.newState ORDER BY newStates.id ) AS newStates,"
                + " GROUP_CONCAT( DISTINCT newStates.created ORDER BY newStates.id ) AS newStatesCreated"
                + " FROM contributions INNER JOIN users ON contributions.user=users.id"
                + " LEFT JOIN replies AS answers"
                + " ON answers.contribution=contributions.id AND NOT answers.newVersion"
                + " LEFT JOIN replies AS newVersions"
                + " ON newVersions.contribution=contributions.id AND newVersions.newVersion"
                + " LEFT JOIN replies AS newStates"
                + " ON newStates.contribution=contributions.id AND newStates.newState IS NOT NULL"
                + " WHERE contributions.state='visible' AND `contributions`.`type`='proposal'"
                + " GROUP BY contributions.id"
                + " ORDER BY contributions.created DESC",
                nestTables: true }, [], function( err, contributions ) {
                if( err ) return next( err );
                contributions.forEach( c => console.log( "C:", c.id, c[""] ) );
                //console.log( "CONTR:", contributions );
                contributions   = formatUserContents( "contributions",  "users", contributions );
                k.jade.render( req, res, "proposals", vals( req, { contributions: contributions } ) );
            });
        });


        /** atom feed **/
        k.router.get("/feeds/contributions", function( req, res ) {
            db.query( { sql: "SELECT contributions.*, users.*, feed.*, replies.text"
                + " FROM ("
                + "     SELECT contributions.id AS `contributionId`, IFNULL( MAX( replies.id ), 0 ) AS `replyId`,"
                + "     GREATEST( contributions.created, IFNULL( MAX(replies.created), '0000' ) ) AS `updated`"
                + "     FROM contributions"
                + "     LEFT JOIN replies ON replies.contribution=contributions.id"
                + "     AND replies.state='visible'"
                + "     WHERE contributions.state='visible'"
                + "     GROUP BY contributions.id"
                + "     ORDER BY GREATEST( contributions.created, IFNULL( MAX(replies.created), '0000' ) ) DESC LIMIT 10"
                + " ) AS `feed`"
                + " INNER JOIN contributions ON feed.contributionId=contributions.id"
                + " INNER JOIN users ON contributions.user=users.id"
                + " LEFT JOIN replies ON feed.replyId=replies.id",
                nestTables: true }, [], function( err, items ) {
                contributions   = formatUserContents( "contributions",  "users", items );
                res.header( "Content-Type", "application/atom+xml" );
                k.jade.render( req, res, "feed", vals( req, { contributions: contributions } ) );
            });
        });


        /** home **/
        function renderContributions( req, res, next, limit, template ) {
            limit = limit > 0 ? " LIMIT " + limit : "";
            db.query( { sql: "SELECT * FROM contributions INNER JOIN users ON contributions.user=users.id"
                + " WHERE contributions.state='visible' ORDER BY contributions.created DESC" + limit + ";"
                + " SELECT * FROM replies INNER JOIN contributions ON replies.contribution = contributions.id"
                + " INNER JOIN users ON replies.user=users.id"
                + " WHERE replies.state='visible' ORDER BY replies.created DESC" + limit,
                nestTables: true }, [], function( err, items ) {
                if( err ) return next( err );
                contributions   = formatUserContents( "contributions",  "users", items[0] );
                replies         = formatUserContents( "replies",        "users", items[1] );
                k.jade.render( req, res, template, vals( req, { contributions: contributions, replies: replies } ) );
            });
        }

        k.router.get("/contributions", function( req, res, next ) {
            renderContributions( req, res, next, 0, "listContributions" );
        });

        k.router.get("/", function( req, res, next ) {
            renderContributions( req, res, next, 4, "home" );
        });

        /* digest daemon */
        k.useSiteModule( null, "forth-standard.org", "digest.js" );

        /* catch all */
        k.router.all("*", function( req, res ) {
            httpStatus( req, res, 404 );
        });
    }
};
