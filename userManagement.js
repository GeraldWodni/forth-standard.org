// generic user management with email registration
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var md5 = require("md5");

module.exports = {
    setup: function( k ) {

        var kData = k.getData();
        var vals = k.setupOpts.vals;

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


        k.router.use( "/~:link", function( req, res, next ) {
            k.requestman( req );
            var userLink = req.requestman.id( "link" );

            k.setupOpts.renderUser( userLink, req, res, next );
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
            k.setupOpts.renderUser( req.session.loggedInUsername, req, res, next );
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
    }
}

