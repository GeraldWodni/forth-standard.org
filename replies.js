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

        var urlMatch = "/reply/:id";
        function getContribution( callback ){
            return function( req, res, next ) {
                k.requestman( req );
                var id = req.requestman.id();
                kData.contributions.read( id, function( err, contribution ) {
                    if( err ) return next( err );
                    if( contribution === [] ) return k.setupOpts.httpStatus( req, res, 404 );

                    callback( req, res, next, contribution );
                });
            };
        }

        k.router.post( urlMatch, getContribution( function( req, res, next, contribution ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                if( err ) return next( err );
                user = user[0];

                k.postman( req, res, function() {

                    var text    = req.postman.text("text");
                    if( req.postman.exists("preview" ) ) {
                        k.jade.render( req, res, "addReply", vals( req, {
                            /* TODO: fix URL for back button */
                            //(url: getUrl( req ),
                            text: text,
                            contribution: contribution,
                            user: _.extend( { emailMd5: md5( user.email ) }, user ),
                            preview: marked( text )
                        } ));
                    }
                    else if( req.postman.exists("create" ) ) {
                        kData.replies.create({
                            user: user.id,
                            contribution: contribution.id,
                            state: 'new',
                            created: kData.sql.nowUtc(),
                            text: text
                        }, function( err ) {
                            if( err ) return next( err );

                            k.jade.render( req, res, "addReply", vals( req, {
                                //url: getUrl( req ),
                                hideForm: true,
                                contribution: contribution,
                                messages: [{type: "success", title: "Success", text: "Thank you, your reply is now being processed"}]
                            } ));
                        });
                    }
                    else
                        k.setupOpts.httpStatus( req, res, 422 );
                });
            });
        }));

        /* add contribution */
        k.router.get( urlMatch, getContribution( function( req, res, next, contribution ) {
            k.jade.render( req, res, "addReply", vals( req, { contribution: contribution, url: "xxx" } ));
        }));
    }
}
