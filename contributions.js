// user contributions
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>
"use strict";

var _       = require('underscore');
var marked  = require('marked');
var md5     = require('md5');
var moment  = require('moment');

module.exports = {
    setup: function( k ) {

        var db = k.getDb();
        var kData = k.getData();
        var vals = k.setupOpts.vals;
        var urlMatch = "/contribute/*";
        function getUrl( req ) { return req.path.substr( "/contribute".length ); }

        k.router.post( urlMatch, function( req, res, next ) {
            var url = getUrl( req );
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                if( err ) return next( err );
                user = user[0];

                k.postman( req, res, function() {

                    var type    = req.postman.id("type");
                    var subject = req.postman.text("subject");
                    var text    = req.postman.text("text");
                    var state   = user.state == "moderated" ? "new" : "visible";

                    if( req.postman.exists("preview" ) ) {
                        k.jade.render( req, res, "addContribution", vals( req, {
                            url: getUrl( req ),
                            type: type,
                            subject: subject,
                            text: text,
                            user: _.extend( { emailMd5: md5( user.email.toLowerCase() ) }, user ),
                            preview: marked( text )
                        } ));
                    }
                    else if( req.postman.exists("create" ) ) {
                        kData.contributions.create({
                            user: user.id,
                            url: url,
                            type: type,
                            state: state,
                            created: kData.sql.nowUtc(),
                            subject: subject,
                            text: text
                        }, function( err ) {
                            if( err ) return next( err );

                            k.jade.render( req, res, "addContribution", vals( req, {
                                url: getUrl( req ),
                                hideForm: true,
                                messages: [{type: "success", title: "Success", text: "Thank you, your contribution is now " + ( state == "visible" ? "online" : "being processed")}]
                            } ));
                        });
                    }
                    else
                        k.setupOpts.httpStatus( req, res, 422 );
                });
            });
        });

        /* add contribution */
        k.router.get( urlMatch, function( req, res, next ) {
            k.jade.render( req, res, "addContribution", vals( req, { url: getUrl( req ) } ));
        });
    }
}
