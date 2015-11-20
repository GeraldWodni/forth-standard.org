// forth-standard.org main include file
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var fs  = require("fs");
var md5 = require("md5");
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

        k.router.get("/confirm/:hash", function( req, res, next ) {
            k.requestman( req );

            var hash = req.requestman.alnum( "hash" );
            k.users.confirmCreate( req.kern.website, hash, function( err, user ) {
                if( err )
                    if( err.message && err.message.indexOf( "Unknown hash" ) == 0 )
                        return k.jade.render( req, res, "confirm", vals( req, { error: { title: "Unknown hash", text:"Please use your link provided your email (visiting this page twice will also trigger this message)." } } ) );
                    else
                        return next( err );

                /* create sql user */
                console.log( "CREATE USER:", user );
                kData.users.create({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    created: new Date()
                });

                k.jade.render( req, res, "confirm" );
            });
        });

        k.router.get("/logout", function( req, res ) {
            req.sessionInterface.destroy( req, res, function() {
                k.jade.render( req, res, "logout" );
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

        /* user management */
        function renderUser( userLink, req, res, next ) {
            /* user */
            console.log( "RENDER", userLink );
            kData.users.readWhere( "name", [ userLink ], function( err, users ) {
                if( err ) return next( err );
                if( users.length == 0 ) return httpStatus( req, res, 404 );
            console.log( "RENDER2", userLink );

                /* user's packages */
                var user = users[0];
                kData.contributions.readWhere( "user", [ user.id ], function( err, contributions ) {
                    if( err ) return next( err );
            console.log( "RENDER3", userLink );

                    user.emailMd5 = md5( user.email );
                    k.jade.render( req, res, "user", vals( req, { user: user, contributions: contributions, manage: req.session && user.name==req.session.loggedInUsername, title: user.name } ) );
                });
            });
        }

        k.router.use( "/~:link", function( req, res, next ) {
            k.requestman( req );
            var userLink = req.requestman.id( "link" );

            renderUser( userLink, req, res, next );
        });

        k.router.use( k.users.loginRequired( "login", { path: "/profile" } ) );

        //k.useSiteModule( "/profile", "theforth.net", "upload.js", { setup: { vals: vals } } );
        /* upload package */
        //k.router.post("/profile/add-package", function( req, res ) {
        //    k.postman( req, res, function() {
        //        console.log( "UPLOAD:", req.postman.raw("set") );
        //        k.jade.render( req, res, "addPackage", vals( req, { title: "Upload package" } ) );
        //    });
        //});
        //k.router.get("/profile/add-package", function( req, res ) {
        //    k.jade.render( req, res, "addPackage", vals( req, { title: "Upload package" } ) );
        //});

        /* change password */
        k.router.post("/profile/change-password", function( req, res, next ) {
            k.users.changePassword( req, res, function( err ) {
                if( err )
                    k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password", error: err.message } ) );
                else
                    k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password", success: "Password changed" } ) );
            });
        });
        k.router.get("/profile/change-password", function( req, res ) {
            k.jade.render( req, res, "changePassword", vals( req, { title: "Change Password" } ) );
        });

        k.router.get("/profile", function( req, res, next ) {
            renderUser( req.session.loggedInUsername, req, res, next );
        });

        k.router.use( "/users", function( req, res, next ) {
            kData.users.readAll( function( err, users ) {
                if( err )
                    return next( err );

                users.forEach( function( user ) {
                    user.emailMd5 = md5( user.email );
                });

                k.jade.render( req, res, "users", vals( req, { users: users, title: "Users" }) );
            });
        });

        k.router.get("/", function( req, res ) {
            k.jade.render( req, res, "home" );
        });
    }
};
