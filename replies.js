// user contributions
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>
"use strict";

var _       = require('underscore');
var md5     = require('md5');
var moment  = require('moment');

module.exports = {
    setup: function( k ) {

        var db = k.getDb();
        var kData = k.getData();
        var vals = k.setupOpts.vals;
        const saneMarked = k.setupOpts.saneMarked;

        function getContribution( callback, opts ){
            return function( req, res, next ) {
                k.requestman( req );
                var id = req.requestman.id();
                kData.contributions.read( id, function( err, contribution ) {
                    if( err ) return next( err );
                    if( contribution === [] ) return k.setupOpts.httpStatus( req, res, 404 );

                    db.query( `
                        SELECT contributionState({id}) AS contributionState;
                        SELECT text FROM programmerAnswers WHERE contribution={id} ORDER BY number;
                        SELECT text FROM systemAnswers WHERE contribution={id} ORDER BY number
                        `, { id: contribution.id },
                    ( err, data ) => {
                        if( err ) return next( err );

                        let [ contributionStates, programmerAnswers, systemAnswers ] = data;
                        programmerAnswers = programmerAnswers.map( row => row.text );
                        systemAnswers = systemAnswers.map( row => row.text );

                        kData.users.readWhere("name", [req.session.loggedInUsername], function( err, users ) {
                            if( err ) return next( err );

                            const isOriginalAuthor  = contribution.user == users[0].id;
                            const isCommitteeMember = users[0].committeeMember;
                            const contributionState = contributionStates.length == 1 ? contributionStates[0].contributionState : "unknown";

                            callback( req, res, next, {
                                contribution,
                                isOriginalAuthor,
                                isCommitteeMember,
                                contributionState,
                                programmerAnswers: programmerAnswers.length ? programmerAnswers : kData.defaultProgrammerAnswers,
                                systemAnswers: systemAnswers.length ? systemAnswers : kData.defaultSystemAnswers,
                             }, opts );
                        });
                    });
                });
            };
        }

        function postReply( req, res, next, { contribution, isOriginalAuthor, isCommitteeMember, contributionState }, opts ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, user ) {
                if( err ) return next( err );
                user = user[0];
                const messages = [];

                k.postman( req, res, function() {

                    var newState= req.postman.id("newState") || null;
                    var text    = req.postman.text("text");
                    var state   = user.state == "moderated" ? "new" : "visible";

                    const programmerVote   = req.postman.text("programmerVote");
                    const systemName       = req.postman.singleLine("systemName");
                    const systemConformity = req.postman.singleLine("systemConformity");
                    const systemVote       = req.postman.text("systemVote");

                    const programmerAnswers = req.postman.text("programmerAnswers");
                    const systemAnswers = req.postman.text("systemAnswers");

                    if( contribution.user != user.id && !user.committeeMember && opts.newVersion )
                        messages.push({ type: "danger", title: "Error", text: "Currently only the original author can submit a new version" });

                    if( req.postman.exists("preview" ) || messages.length ) {
                        k.jade.render( req, res, opts.jadeFile, vals( req, {
                            /* TODO: fix URL for back button */
                            //(url: getUrl( req ),
                            text: text,
                            contribution: contribution,
                            user: _.extend( { emailMd5: md5( user.email.toLowerCase() ) }, user ),
                            preview: saneMarked( text ),
                            isOriginalAuthor,
                            isCommitteeMember,
                            contributionState,
                            newState: newState,
                            programmerVote,
                            systemName,
                            systemConformity,
                            systemVote,
                            programmerAnswers,
                            systemAnswers,
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
                            newState: newState,
                            text: text
                        }, async function( err, result ) {
                            if( err ) return next( err );

                            if( req.postman.exists("createAnswers") && req.postman.uint("createAnswers") == 1 ) {
                                let programmerAnswers = req.postman.text("programmerAnswers").trim().split("\n");
                                let number = 0;
                                for( let line of programmerAnswers )
                                    if( line.trim() != "" )
                                        await new Promise( (fulfill, reject) => kData.programmerAnswers.create({
                                            contribution: contribution.id,
                                            number: number++,
                                            text: line.trim(),
                                        }, err => {
                                            if( err ) return reject(err);
                                            fulfill();
                                        }));

                                let systemAnswers = req.postman.text("systemAnswers").trim().split("\n");
                                number = 0;
                                for( let line of systemAnswers )
                                    if( line.trim() != "" )
                                        await new Promise( (fulfill, reject) => kData.systemAnswers.create({
                                            contribution: contribution.id,
                                            number: number++,
                                            text: line.trim(),
                                        }, err => {
                                            if( err ) return reject(err);
                                            fulfill();
                                        }));
                            }

                            try {
                                if( programmerVote != "" )
                                    await new Promise( (fulfill, reject) => kData.castProgrammerVotes.create({
                                        reply: result.insertId,
                                        answer: programmerVote,
                                    }, err => {
                                        if( err ) return reject(err);
                                        fulfill();
                                    }));

                                if( systemVote != "" )
                                    await new Promise( (fulfill, reject) => kData.castSystemVotes.create({
                                        reply: result.insertId,
                                        name: systemName,
                                        conformity: systemConformity,
                                        answer: systemVote,
                                    }, err => {
                                        if( err ) return reject(err);
                                        fulfill();
                                    }));
                            } catch( err ) {
                                return next( err );
                            }

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

        k.router.get( "/reply-new-version/:id", getContribution( function( req, res, next, { contribution, isOriginalAuthor, isCommitteeMember, contributionState } ) {
            kData.users.readWhere("name", [req.session.loggedInUsername], function( err, users ) {
                const messages = [];
                if( contribution.user != users[0].id )
                    messages.push({ type: "warning", title: "Warning", text: "Currently only the original author can submit a new version" });

                db.query( "SELECT text FROM replies WHERE contribution=? AND newVersion ORDER BY created DESC LIMIT 1", [ contribution.id ], ( err, replies ) => {
                    if( err ) return next( err );

                    var text = contribution.text;
                    if( replies.length == 1 )
                        text = replies[0].text;

                    k.jade.render( req, res, "addNewVersion", vals( req, { contribution, isOriginalAuthor, isCommitteeMember, contributionState, url: "xxx", messages: messages, text: text } ) );
                });
            });
        }));


        /* add reply */
        k.router.post( "/reply/:id", getContribution( postReply, {
            jadeFile: "addReply"
        }) );

        k.router.get( "/reply/:id", getContribution( function( req, res, next, values ) {
            values.url = "xxx";
            k.jade.render( req, res, "addReply", vals( req,values ));
        }));
    }
}
