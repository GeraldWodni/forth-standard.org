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

        function getContribution( callback, opts ){
            return function( req, res, next ) {
                k.requestman( req );
                var id = req.requestman.id();
                kData.contributions.read( id, function( err, contribution ) {
                    if( err ) return next( err );
                    if( contribution === [] ) return k.setupOpts.httpStatus( req, res, 404 );

                    callback( req, res, next, contribution, opts );
                });
            };
        }

        function postReply( req, res, next, contribution, opts ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                if( err ) return next( err );
                user = user[0];
                const messages = [];

                k.postman( req, res, function() {

                    var text    = req.postman.text("text");
                    var state   = user.state == "moderated" ? "new" : "visible";

                    if( contribution.user != user.id && opts.newVersion )
                        messages.push({ type: "danger", title: "Error", text: "Currently only the original author can submit a new version" });

                    if( req.postman.exists("preview" ) || messages.length ) {
                        k.jade.render( req, res, opts.jadeFile, vals( req, {
                            /* TODO: fix URL for back button */
                            //(url: getUrl( req ),
                            text: text,
                            contribution: contribution,
                            user: _.extend( { emailMd5: md5( user.email.toLowerCase() ) }, user ),
                            preview: marked( text ),
                            messages: messages
                        } ));
                    }
                    else if( req.postman.exists("create" ) ) {
                        kData.replies.create({
                            user: user.id,
                            contribution: contribution.id,
                            state: state,
                            created: kData.sql.nowUtc(),
                            newVersion: opts.newVersion ? 1 : 0,
                            text: text
                        }, function( err ) {
                            if( err ) return next( err );

                            k.jade.render( req, res, opts.jadeFile, vals( req, {
                                //url: getUrl( req ),
                                hideForm: true,
                                contribution: contribution,
                                messages: [{type: "success", title: "Success", text: "Thank you, your reply is now " + ( state == "visible" ? "online" : "being processed")}]
                            } ));
                        });
                    }
                    else
                        k.setupOpts.httpStatus( req, res, 422 );
                });
            });
        }

        /* add new version */
        k.router.post( "/reply-new-version/:id", getContribution( postReply, {
            jadeFile: "addNewVersion",
            newVersion: true
        }) );

        k.router.get( "/reply-new-version/:id", getContribution( function( req, res, next, contribution ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, users ) {
                const messages = [];
                if( contribution.user != users[0].id )
                    messages.push({ type: "warning", title: "Warning", text: "Currently only the original author can submit a new version" });

                db.query( "SELECT text FROM replies WHERE contribution=? AND newVersion ORDER BY created DESC LIMIT 1", [ contribution.id ], ( err, replies ) => {
                    if( err ) return next( err );

                    var text = contribution.text;
                    if( replies.length == 1 )
                        text = replies[0].text;

                    k.jade.render( req, res, "addNewVersion", vals( req, { contribution: contribution, url: "xxx", messages: messages, text: text } ) );
                });
            });
        }));


        /* add reply */
        k.router.post( "/reply/:id", getContribution( postReply, {
            jadeFile: "addReply"
        }) );

        k.router.get( "/reply/:id", getContribution( function( req, res, next, contribution ) {
            k.jade.render( req, res, "addReply", vals( req, { contribution: contribution, url: "xxx" } ));
        }));
    }
}
