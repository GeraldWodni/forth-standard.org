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

        function postContribution( req, res, next, opts ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                if( err ) return next( err );
                user = user[0];
                const messages = [];

                k.postman( req, res, function() {

                    var type    = opts.type ? opts.type : req.postman.id("type");
                    var subject = req.postman.text("subject");
                    var text    = req.postman.text("text");
                    var state   = user.state == "moderated" ? "new" : "visible";

                    if( opts.url == "proposal-derived-from-subject" ) {
                        const urlSubject = subject.toLowerCase().replace( /[^-_a-z0-9]/g, "-" ).replace( /-+/g, '-' );
                        opts.url = "/proposals/" + urlSubject
                        if( urlSubject.length == 0 )
                            messages.push({type:"danger", title:"Error", text: "Subject cannot be empty"});
                    }

                    if( req.postman.exists("preview" ) || messages.length ) {
                        k.jade.render( req, res, opts.jadeFile, vals( req, {
                            url: opts.url,
                            type: type,
                            subject: subject,
                            text: text,
                            user: _.extend( { emailMd5: md5( user.email.toLowerCase() ) }, user ),
                            preview: marked( text ),
                            messages: messages
                        } ));
                    }
                    else if( req.postman.exists("create" ) ) {
                        kData.contributions.create({
                            user: user.id,
                            url: opts.url,
                            type: type,
                            state: state,
                            created: kData.sql.nowUtc(),
                            subject: subject,
                            text: text
                        }, function( err ) {
                            if( err ) return next( err );

                            k.jade.render( req, res, opts.jadeFile, vals( req, {
                                url: opts.url,
                                hideForm: true,
                                messages: [{type: "success", title: "Success", text: "Thank you, your contribution is now " + ( state == "visible" ? "online" : "being processed")}]
                            } ));
                        });
                    }
                    else
                        k.setupOpts.httpStatus( req, res, 422 );
                });
            });
        }

        /* proposal */
        k.router.post( "/proposals/add", ( req, res, next ) => {
            postContribution( req, res, next, {
                jadeFile: "addProposal",
                type: "proposal",
                url: "proposal-derived-from-subject"
            });
        });

        k.router.get("/proposals/add", ( req, res ) =>
            k.readHierarchyFile( k.website, "views/proposalTemplate.md", ( err, files ) =>
                k.jade.render( req, res, "addProposal", vals( req, { text: files[0].toString() } ) )
            )
        );


        k.router.post( urlMatch, function( req, res, next ) {
            postContribution( req, res, next, {
                jadeFile: "addContribution",
                url: getUrl( req )
            });
        });

        /* add contribution */
        k.router.get( urlMatch, function( req, res, next ) {
            k.jade.render( req, res, "addContribution", vals( req, { url: getUrl( req ) } ));
        });
    }
}
