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

        k.router.all( "*", ( req, res, next ) => {
            req.kern.db.pQuery("SELECT id FROM users WHERE name=?", [req.session.loggedInUsername])
            .then( users => {
                if( users.length != 1 )
                    throw new Error("User not found");
                req.kern.loggedInUserId = users[0].id;
                next();
            })
            .catch( next );
        });

        /* add vote */
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
                renderAddVote( req, res, next, { contribution, subject, text, preview: true, messages });
            else if( req.postman.exists("create") )
                kData.votes.create({
                    contribution,
                    started: kData.sql.nowUtc(),
                    startedBy: req.kern.loggedInUserId,
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

        k.router.get( "/committee/votes/add", ( req, res, next ) => renderAddVote( req, res, next ) );

        /* cast and manage vote */
        function renderCastVote( req, res, next, values ) {
            req.kern.db.pQuery( "SELECT subject, text, ended IS NOT NULL AS closed FROM votes WHERE id=?", [values.id])
            .then( votes => k.jade.render( req, res, "castVote", vals( req, Object.assign({ vote: votes[0], hideForm: votes[0].closed || values.hideForm }, values) ) ) )
            .catch( next );
        }

        k.router.postman( "/committee/votes/cast/:id", ( req, res, next ) => {
            const id = req.requestman.id();
            const state = req.postman.id("castVote");

            req.kern.db.pQuery( "SELECT COUNT(1) AS count FROM votes WHERE id={id} AND ended IS NULL", {id} )
            .then( votes => {
                if( votes.length != 1 || votes[0].count != 1 )
                    return renderCastVote( req, res, next, { id: req.requestman.id(), messages: [{type: "danger", title: "Error", text: "This vote is not open"}] } );

                return req.kern.db.pQuery("REPLACE INTO castVotes( vote, user, modified, state ) VALUES ({id}, {user}, NOW(), {state})", { id, user: req.kern.loggedInUserId, state: state })
                .then( () => renderCastVote( req, res, next, { id: req.requestman.id(), hideForm: true, messages: [{type: "success", title: "Success", text: `You casted ${state} on vote #${id}` }] } ) );
            })
            .catch( next );
        });

        k.router.get( "/committee/votes/cast/:id", ( req, res, next ) => renderCastVote( req, res, next, { id: req.requestman.id() } ) );

        /* observe voting */
        k.router.get( "/committee/votes/observe/:id", ( req, res, next ) => {
            const id = req.requestman.id();
            const autoRefresh = req.getman.exists("autoRefresh");
            Promise.all([
                req.kern.db.pQuery(`
                    SELECT votes.id, votes.subject, votes.text, votes.ended IS NOT NULL AS closed
                    FROM votes
                    WHERE votes.id={id};
                    SELECT users.name, MD5(LOWER(users.email)) AS emailMd5, castVotes.state
                    FROM users
                    LEFT JOIN castVotes
                    ON castVotes.user=users.id
                    AND castVotes.vote={id}
                    WHERE users.committeeMember
                `, {id}),
                k.session.getActive( k.website )
                .then( activeSessions => activeSessions.map( activeSession => activeSession.loggedInUsername ) )
            ])
            .then( ([ [votes, users], activeSessions ]) => k.jade.render( req, res, "observeVote", vals( req, {
                vote: votes[0],
                users,
                activeSessions,
                onlineCount: activeSessions.length,
                offlineCount: users.length - activeSessions.length,
                yesCount:       users.filter( castVote => castVote.state == "yes"       ).length,
                noCount:        users.filter( castVote => castVote.state == "no"        ).length,
                abstainCount:   users.filter( castVote => castVote.state == "abstain"   ).length,
                anyCount:       users.filter( castVote => castVote.state != null        ).length,
                autoRefresh,
                loggedInUsername: req.session.loggedInUsername
            } ) ) )
            .catch( next );
        });

        /* close vote */
        k.router.postman( "/committee/votes/close/:id", ( req, res, next ) => {
            const id = req.requestman.id();
            const closed = req.postman.exists("close");

            req.kern.db.pQuery( "SELECT *, ended IS NOT NULL AS closed FROM votes WHERE {id}", {id} )
            .then( votes => {
                if( votes[0].closed )
                    return k.jade.render( req, res, "closeVote", vals( req, { vote: votes[0], messages: [{type: "danger", title: "Error", text:"Vote already closed"}] } ) );

                return req.kern.db.pQuery( "SELECT SUM(state='yes') AS yesCount, SUM(state='no') AS noCount, SUM(state='abstain') AS abstainCount FROM castVotes WHERE vote={id} GROUP BY vote", {id} )
                .then( results => {
                    const result = results[0]
                    const resultText = `${result.yesCount}/${result.noCount}/${result.abstainCount} (Yes/No/Abstain)`;

                    return req.kern.db.pQuery( "UPDATE votes SET ended=NOW(), endedBy={user}, result={resultText} WHERE id={id}; SELECT * FROM votes WHERE id={id}", { id, user: req.kern.loggedInUserId, resultText } )
                    .then( ([update, votes]) => k.jade.render( req, res, "closeVote", vals( req, { vote: votes[0], messages: [{type: "success", title:"Success", text: "Vote closed"}] } ) ) )
                });
            })
            .catch( next );
        });

        /* main committee page */
        k.router.get( "/committee", ( req, res, next ) => {
            Promise.all([
                req.kern.db.pQuery( "SELECT name, MD5(LOWER(email)) AS emailMd5 FROM users WHERE committeeMember ORDER BY name ASC" ),
                req.kern.db.pQuery( { nestTables: true, sql:`
                    SELECT votes.id, votes.subject, votes.text, votes.started, votes.ended, votes.result,
                    starters.id, starters.name, MD5(LOWER(starters.email)) AS starterEmail,
                    enders.id, enders.name, MD5(LOWER(enders.email)) AS enderEmail,
                    castVotes.vote IS NOT NULL AS userHasCastVote
                    FROM votes
                    LEFT JOIN users AS starters
                    ON starters.id = votes.startedBy
                    LEFT JOIN users AS enders
                    ON enders.id = votes.endedBy
                    LEFT JOIN castVotes
                    ON votes.id=castVotes.vote AND castVotes.user={user}
                    ORDER BY votes.started DESC
                `}, { user: req.kern.loggedInUserId } ),
                k.session.getActive( k.website )
                .then( activeSessions => activeSessions.map( activeSession => activeSession.loggedInUsername ) )
            ])
            .then( ([ users, votes, activeSessions ]) => k.jade.render( req, res, "committeeHome", vals( req, {
                users, activeSessions, votes,
                onlineCount: activeSessions.length,
                offlineCount: users.length - activeSessions.length
            } )) )
            .catch( next );
        });
    }
}
