// committee section
// (c)copyright 2020 by Gerald Wodni <gerald.wodni@gmail.com>
"use strict";

const _       = require('underscore');
const md5     = require('md5');
const moment  = require('moment');

module.exports = {
    setup: function( k ) {

        var db = k.getDb();
        var kData = k.getData();
        const vals = k.setupOpts.vals;

        k.router.get( "/committee/votes/add", ( req, res, next ) => {
            k.jade.render( req, res, "addVote", vals( req ) );
        });

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
