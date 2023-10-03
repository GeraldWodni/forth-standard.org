// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs      = require("fs");
var path    = require("path");
var _       = require("underscore");
const { marked } = require('marked');
const createDOMPurify = require('dompurify');
const { JSDOM } = require("jsdom");
var diff    = require('diff');
var md5     = require("md5");
var moment  = require("moment");
const crawlSystems = require("./crawlSystems");

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
        function diffMarkdown( v1, v2 ) {
            const d = diff.diffLines( v1, v2 );
            var diffHTML = "";
            d.forEach( d => {
                if( d.added )
                    diffHTML += `<ins>${saneMarked(d.value)}</ins>`;
                else if( d.removed )
                    diffHTML += `<del>${saneMarked(d.value)}</del>`;
                else
                    diffHTML += saneMarked(d.value);
            });

            return diffHTML;
        }

        function cleanHTML( html ) {
            const DOMPurify = createDOMPurify( new JSDOM('').window );
            return DOMPurify.sanitize( html, {
                FORBID_TAGS: ['style']
            });
        }

        function saneMarked( text ) {
            const allowedTags = ['ins', 'del'];
            const allowedGroup = '(' + allowedTags.join('|') + ')';
            const prefix = "9"+(Math.random() * 1000).toString();

            /* replace common tags by markdown equivalents */
            text = text.replace( /<br\/?>/g, '  \n' );
            /* prefix and escape allowed tags */
            text = text.replace( new RegExp(`<(\/?)${allowedGroup}>`, 'g'), `\\<${prefix}$1$2\\>` );
            /* escape all remainig tags */
            text = text.replace( /<([A-Za-z]+[-a-zA-Z0-9 ]*)>/g, '\\<$1\\>' );
            text = marked( text );
            /* unprefix allowed tags */
            text = text.replace( new RegExp(`&lt;${prefix}(\/?)${allowedGroup}&gt;`, 'g'), '<$1$2>' );
            return cleanHTML( text );
        }

        function vals( req, values ) {
            if( !values )
                values = {};

            _.extend( values, {
                loggedIn: "session" in req,
                uniqueWordNames: uniqueWordNames,
                diffMarkdown: diffMarkdown,
                saneMarked,
                allowDiff: !req.getman.exists("hideDiff"),
                contributionTypeName: {
                    "example": "Example",
                    "testcase":"Suggested Testcase",
                    "requestClarification":"Request for clarification",
                    "referenceImplementation":"Suggested reference implementation",
                    "proposal":"Proposal",
                    "comment":"Comment"
                },
                contributionStateText: {
                    "informal":  "Informal",
                    "considered":"Considered",
                    "formal":    "Formal",
                    "accepted":  "Accepted",
                    "voting":    "CfV - Call for votes",
                    "retracted": "Retracted",
                    "retired":   "Retired",
                    "open":      "Open",
                    "closed":    "Closed"
                }
            });

            return values;
        }

        function httpStatus( req, res, code ) {
            k.httpStatus( req, res, code, { values: vals( req ) } );
        }

        var kData = k.getData();
        var db = k.getDb();

        k.prefixServeStatic("/files");
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

        function redirectPage( req, res, target ) {
            res.statusCode = 302;
            res.header("Location", target);
            res.header("Content-Type", "text/html");
            res.send( `You are being redirected to <a href="${target}">${target}</a>` );
        }

        k.router.get("/jump-to/reply/:id", async (req, res, next ) => {
            try {
                const id = req.requestman.uint("id");
                const rows = await req.kern.db.pQuery(`
                    SELECT contributions.url
                    FROM contributions
                    INNER JOIN replies
                    ON replies.contribution=contributions.id
                    WHERE replies.id={id}`, { id });
                const link = `${rows[0].url}#reply-${id}`;
                redirectPage( req, res, `${req.protocol}://${req.kern.website}${link}` );
            } catch( err ) {
                console.log( "ERR:", err );
                next( err );
            }
        });
        k.router.get("/jump-to/:id", async (req, res, next ) => {
            try {
                const id = req.requestman.id();
                const rows = await req.kern.db.pQuery(`SELECT url FROM contributions WHERE id={id}`, { id });
                const link = `${rows[0].url}#contribution-${id}`;
                redirectPage( req, res, `${req.protocol}://${req.kern.website}${link}` );
            } catch( err ) {
                next( err );
            }
        });

        /* TODO: rest API for AJAX search */
        k.router.get("/search/*", function( req, res ) {
            var search = decodeURI(req.path).substr(8).toLowerCase();
            res.json( searchWords( search ) );
        });

        k.router.postman("/search", function( req, res ) {
            if( req.postman.exists("contribution") ) {
                const contribution = req.postman.uint("contribution")
                return redirectPage( req, res, `${req.protocol}://${req.kern.website}/jump-to/${contribution}` );
            }
            if( req.postman.exists("reply") ) {
                const reply = req.postman.uint("reply")
                return redirectPage( req, res, `${req.protocol}://${req.kern.website}/jump-to/reply/${reply}` );
            }

            var search = req.postman.raw("search").toLowerCase();
            const contributionMatch = /^\s*\[([0-9]+)\]\s*/g.exec( search );
            if( contributionMatch )
                return redirectPage( req, res, `${req.protocol}://${req.kern.website}/jump-to/${contributionMatch[1]}` );

            var matches = searchWords( search );
            if( matches.length == 1 && matches[0].length == 1 ) {
                let word = matches[0][0];
                res.statusCode = 302;
                res.header("Location", `${req.protocol}://${req.kern.website}/standard/${word.list}/${word.basename}`);
            }
            k.jade.render( req, res, "search", vals( req, { matches: matches } ) );
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
            item[dataTable].markdownText = saneMarked( item[dataTable].text );
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
                    /* moved */
                    if( item[""] && item[""].moved )
                        item.contributions.moved = true;

                    /* new contribution */
                    if( item.contributions.id != lastContribution.contributions.id ) {
                        lastContribution = formatUserContent( "contributions", "users", {
                            contributions: item.contributions,
                            users: item.users,
                            replies: []
                        });
                        lastContribution.contributions.subject = `[${lastContribution.contributions.id}] ${lastContribution.contributions.subject}`;
                        groupedContributions.push( lastContribution );
                    }

                    if( item.replies.id && item.replyUsers.id )
                        lastContribution.replies.push( formatUserContent( "replies", "replyUsers", {
                            replies: item.replies,
                            replyUsers: item.replyUsers,
                            castProgrammerVotes: item.castProgrammerVotes,
                            castSystemVotes: item.castSystemVotes,
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
                if( wordSetName != req.requestman.raw("wordSet") || wordBasename != req.requestman.raw("wordBasename") )
                    return res.redirect(`/standard/${wordSetName}/${wordBasename}`);

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
            if( document != req.requestman.raw( "document" ) )
                return res.redirect(`/standard/${document}`);

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

        /* crawl systems on github and update local file */
        k.router.get(`/crawl-github/${process.env.CRAWL_GITHUB_SECRET}`, ( req, res, next ) => {
            const filename = req.kern.lookupFile("systems.json");
            crawlSystems( { filename }, err => {
                if( err )
                    return res.json( { error: err.toString() } );
                k.readHierarchyFile( "forth-standard.org", "systems.json", function( err, content ) {
                    systems = JSON.parse( content );
                    res.json( { success: true } );
                });
            });
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
            saneMarked,
            httpStatus: httpStatus
        } } );
        k.useSiteModule( "/profile", "forth-standard.org", "replies.js", { setup: {
            vals: vals,
            saneMarked,
            httpStatus: httpStatus
        } } );
        k.useSiteModule( "/profile", "forth-standard.org", "committee.js", { setup: {
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
                        var acceptAndUnmoderate = req.postman.exists( "acceptAndUnmoderate" );
                        var accept = req.postman.exists( "accept" ) || acceptAndUnmoderate;
                        var remove = req.postman.exists( "delete" );

                        var newState = accept ? "visible" : remove ? "deleted" : false;
                        if( !newState )
                            return httpStatus( req, res, 422 );

                        kData[ opts.table ].update( id, { state: newState }, function( err ) {
                            if( err ) return next( err );
                            req.method = "GET";
                            req.messages = [{ type: "success", title: "Success", text: opts.successText }];

                            if( !acceptAndUnmoderate )
                                return next();

                            kData.users.update( req.postman.uint("user"), { state: "unmoderated" }, function( err ) {
                                if( err )
                                    req.messages.push({ type: "danger", text: err });
                                else
                                    req.messages.push({ type: "success", title: "success", text: "User state changed" });

                                next();
                            });
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
            urlContributions( req.path, next, async function( contributions ) {
                if( contributions.length == 0 )
                    return httpStatus( req, res, 404 );

                let programmerVotes = null, systemVotes = null;
                try {
                    [ programmerVotes, systemVotes ] = await req.kern.db.pQuery("CALL votingResults(?)", [contributions[0].contributions.id]);
                } catch( err ) {
                    return next(err);
                }

                k.jade.render( req, res, "proposalWrapper", vals( req, {
                    urlPath: req.path,
                    contributions: contributions,
                    programmerVotes,
                    systemVotes,
                }));
            });
        });

        k.router.get("/proposals", function( req, res, next ) {
            const useState = req.getman.exists("state");
            let state = null;
            if( useState )
                state = req.getman.id("state");
            db.query( { sql: `
                SELECT contributions.*, users.*,
                COUNT(answers.id) AS answerCount,
                contributionState(contributions.id) AS contributionState,
                GROUP_CONCAT( DISTINCT newVersions.id ORDER BY newVersions.id ) AS newVersionsId,
                GROUP_CONCAT( DISTINCT newVersions.created ORDER BY newVersions.id ) AS newVersionsCreated,
                GROUP_CONCAT( DISTINCT newStates.id ORDER BY newStates.id ) AS newStatesId,
                GROUP_CONCAT( DISTINCT newStates.newState ORDER BY newStates.id ) AS newStates,
                GROUP_CONCAT( DISTINCT newStates.created ORDER BY newStates.id ) AS newStatesCreated
                FROM contributions INNER JOIN users ON contributions.user=users.id
                LEFT JOIN replies AS answers
                ON answers.contribution=contributions.id AND NOT answers.newVersion
                LEFT JOIN replies AS newVersions
                ON newVersions.contribution=contributions.id AND newVersions.newVersion
                LEFT JOIN replies AS newStates
                ON newStates.contribution=contributions.id AND newStates.newState IS NOT NULL
                WHERE contributions.state='visible' AND contributions.type='proposal'
                AND ( NOT {useState} OR contributionState(contributions.id)={state} )
                GROUP BY contributions.id
                ORDER BY contributionStateOrder( contributionState( contributions.id ) ) ASC,
                    contributions.created DESC;
                SELECT
	            COUNT(contributions.id) AS count,
	            contributionState( contributions.id ) AS state
                FROM contributions
                WHERE  contributions.type='proposal'
                GROUP BY contributionState( contributions.id )
                ORDER BY contributionStateOrder( contributionState( contributions.id ) )
                `, nestTables: true }, {
                    useState,
                    state,
                }, function( err, data ) {
                if( err ) return next( err );
                let contributions = data[0];
                let proposalCounts = data[1];
                let totalProposalCount = data[1].reduce( (s, r) => { return s + r[""].count }, 0 );
                    console.log( data[1] );
                contributions   = formatUserContents( "contributions",  "users", contributions );
                k.jade.render( req, res, "proposals", vals( req, {
                    contributions,
                    proposalCounts,
                    totalProposalCount,
                    useState,
                    state,
                } ) );
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
                + ` LEFT JOIN replies ON feed.replyId=replies.id
                    INNER JOIN users
                    ON replies.id IS NULL AND contributions.user=users.id
                       OR replies.user=users.id
                    ORDER BY COALESCE( replies.created, contributions.created ) DESC`,
                nestTables: true }, [], function( err, items ) {
                contributions   = formatUserContents( "contributions",  "users", items );
                res.header( "Content-Type", "application/atom+xml" );
                k.jade.render( req, res, "feed", vals( req, { contributions: contributions } ) );
            });
        });


        /** home **/
        function renderContributions( req, res, next, { limit, template, countOpenContributions, type, state } ) {
            limit = limit > 0 ? " LIMIT " + limit : "";
            const sqlType  = type  ? ` AND contributions.type='${type}'` : "";
            const sqlState = state ? ` AND contributionState(contributions.id)='${state}'` : "";
            db.query( { sql: `
                SELECT * FROM contributions INNER JOIN users ON contributions.user=users.id
                WHERE contributions.state='visible'${sqlType}${sqlState} ORDER BY contributions.created DESC${limit};

                SELECT * FROM replies INNER JOIN contributions ON replies.contribution = contributions.id
                INNER JOIN users ON replies.user=users.id
                WHERE replies.state='visible'${sqlType}${sqlState} ORDER BY replies.created DESC${limit};

                SELECT COUNT(1) AS count, type
                FROM contributions
                WHERE 1=${countOpenContributions?1:0}
                AND type<>'proposal'
                AND contributionState(id)='open'
                GROUP BY type`,
                nestTables: true }, [], function( err, items ) {
                if( err ) return next( err );
                const contributions     = formatUserContents( "contributions",  "users", items[0] );
                for( const { contributions: c } of contributions )
                    c.subject = `[${c.id}] ${c.subject}`;
                const replies           = formatUserContents( "replies",        "users", items[1] );
                const openContributions = items[2];
                k.jade.render( req, res, template, vals( req, { contributions, replies, openContributions, type, state } ) );
            });
        }

        k.router.get("/contributions/markdown/:type/:state", ( req, res, next ) => {
            const type  = req.requestman.id("type");
            const state = req.requestman.id("state");
            res.header("Content-Type", "text/plain");
            renderContributions( req, res, next, { limit: 0, template: "listContributionsMarkdown", type, state } );
        });

        k.router.get("/contributions/:type/:state", ( req, res, next ) => {
            const type  = req.requestman.id("type");
            const state = req.requestman.id("state");
            renderContributions( req, res, next, { limit: 0, template: "listContributions", type, state } );
        });

        k.router.get("/contributions/markdown", function( req, res, next ) {
            res.header("Content-Type", "text/plain");
            renderContributions( req, res, next, { limit: 0, template: "listContributionsMarkdown" } );
        });
        k.router.get("/contributions", function( req, res, next ) {
            renderContributions( req, res, next, { limit: 0, template: "listContributions" } );
        });

        k.router.get("/", function( req, res, next ) {
            renderContributions( req, res, next, { limit: 4, template: "home", countOpenContributions: true } );
        });

        /* digest daemon */
        k.useSiteModule( "/digests", "forth-standard.org", "digest.js", { setup: {
            saneMarked,
            vals,
        } } );

        /* catch all */
        k.router.all("*", function( req, res ) {
            httpStatus( req, res, 404 );
        });
    }
};
