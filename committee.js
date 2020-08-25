// committee section
// (c)copyright 2020 by Gerald Wodni <gerald.wodni@gmail.com>
"use strict";

const _       = require('underscore');
const md5     = require('md5');
const marked  = require('marked');
const moment  = require('moment');

module.exports = {
    setup: function( k ) {

        const db = k.getDb();
        const kData = k.getData();
        const vals = k.setupOpts.vals;

        function renderAddVote( req, res, next, values ) {
            req.kern.db.pQuery( `
                SELECT id, type, subject, contributionState(id) AS contributionState
                FROM contributions
                WHERE type='proposal'
                ORDER BY contributionState(id), type, subject`
            )
            .then( contributions => k.jade.render( req, res, "addVote", vals( req, Object.assign({ contributions }, values) ) ) )
            .catch( next );
        }

        k.router.postman( "/committee/votes/add", ( req, res, next ) => {
            const contribution  = req.postman.id("contribution");
            const subject       = req.postman.text("subject").trim();
            const text          = req.postman.text("text");

            const messages = [];

            if( subject.length == 0 )
                messages.push({type:"danger", title:"Error", text: "Subject cannot be empty"});

            if( req.postman.exists("preview" ) || messages.length )
                renderAddVote( req, res, next, { contribution, subject, text, preview: marked( text ), messages });
            else if( req.postman.exists("create") )
                kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                    if( err ) return next( err );
                    if( user.length != 1 ) return next( new Error( "User not found" ) );
                    user = user[0];

                    kData.votes.create({
                        contribution,
                        started: kData.sql.nowUtc(),
                        startedBy: user.id,
                        subject: subject,
                        text: text
                    }, function( err ) {
                        if( err ) return next( err );

                        renderAddVote( req, res, next, {
                            contribution,
                            subject,
                            text,
                            messages: [{type: "success", title: "Success", text: "Thank you, your votes is now online"}],
                            hideForm: true
                        });
                    });
                });
        });

        k.router.get( "/committee/votes/add", ( req, res, next ) => renderAddVote( req, res, next ) );

        k.router.get( "/committee", ( req, res, next ) => {
            Promise.all([
                req.kern.db.pQuery( "SELECT name, MD5(LOWER(email)) AS emailMd5 FROM users WHERE committeeMember ORDER BY name ASC" ),
                k.session.getActive( k.website )
                .then( activeSessions => activeSessions.map( activeSession => activeSession.loggedInUsername ) )
            ])
            .then( ([ users, activeSessions ]) => k.jade.render( req, res, "committee", vals( req, {
                users,
                activeSessions,
                onlineCount: activeSessions.length,
                offlineCount: users.length - activeSessions.length
            } )) )
            .catch( next );
        });
    }
}
