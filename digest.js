// digest daemon
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var moment  = require("moment");
var _       = require("underscore");

module.exports = {
    setup: function( k ) {

        var kData = k.getData();
        var kDb = k.getDb();

        var maxLineLength = 78 - 2;
        var dateTimeFormat = 'YYYY-MM-DD HH:mm:ss';
        function formatDate( date ) {
            return moment( date ).format( dateTimeFormat );
        }

        function wordwrap( text, width, separator ) {
            var regex = '.{1,' + width + '}(\s|$)|\S+?(\s|$)';
            return text.match( RegExp( regex, 'g' ) ).join( separator );
        }

        function sendDigests() {
            /* get all undigested contributions and replies and the new item counts */
            kDb.query(
                  " SELECT users.name, contributions.created, contributions.url, contributions.type, contributions.subject, contributions.text"
                + " FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " WHERE contributions.dailyDigest=0 AND contributions.state='visible';"

                + " SELECT users.name, replies.created, contributions.url, contributions.type, contributions.subject, replies.text"
                + " FROM replies"
                + " INNER JOIN contributions ON contributions.id=replies.contribution"
                + " INNER JOIN users ON users.id=contributions.user"
                + " WHERE replies.dailyDigest=0 AND replies.state='visible';"

                + " SELECT COUNT(1) FROM contributions WHERE state='new';"
                + " SELECT COUNT(1) FROM replies WHERE state='new'", [], function( err, data ) {

                if( err )
                    return console.log( "DIGEST FAILED!".bold.red, err );

                /* prepare text */
                var text = "";
                var contributions    = data[0];
                var replies          = data[1];
                var newContributions = data[2][0][0];
                var newReplies       = data[3][0][0];

                /* contributions */
                if( contributions.length > 0 ) {
                    text += "\n\n\n,---------------.";
                    text += "\n| Contributions |";
                    text += "\n`---------------´";
                }

                contributions.forEach( function( contribution ) {
                    text += "\n\n\n| ";
                    text += formatDate( contribution.created ) + "  " + contribution.name + "  wrote:\n| " + contribution.type + " - " + contribution.subject;
                    text += "\n`------------------------------------------\n";
                    text += contribution.text;
                    text += "\n,------------------------------------------";
                    text += "\n| see: https://forth-standard.org" + contribution.url;
                });

                /* replies */
                if( replies.length > 0 ) {
                    text += "\n\n\n,---------.";
                    text += "\n| Replies |";
                    text += "\n`---------´";
                }

                replies.forEach( function( reply ) {
                    text += "\n\n\n| ";
                    text += formatDate( reply.created ) + "  " + reply.name + "  replies:\n| " + reply.type + " - " + reply.subject;
                    text += "\n`------------------------------------------\n";
                    text += reply.text;
                    text += "\n,------------------------------------------";
                    text += "\n| see: https://forth-standard.org" + reply.url;
                });


                /* TODO: get moderator text */
                /* TODO: create table dailyDigests */
                /* TODO: insert into dailyDigests */
                /* TODO: email digest once every 5 minutes if pending on startup / after creation */

                console.log( "DIGEST DATA:".bold.green, text );
            });

            console.log( "DIGEST".bold.red );
        }

        /* first fire */
        var nextTime = moment.utc();
        nextTime.set("hour",   10);
        nextTime.set("minute",  0);
        nextTime.set("seconds", 0);

        /* server started late, add a day */
        if( nextTime < moment.utc() ) {
            console.log( "FiAdd".bold.red );
            nextTime.add( 1, "days" );
        }

        /* perform tick and setup next tick */
        function tick() {
            sendDigests();
            nextTime.add( 1, "days" );
            arm( nextTime, tick );
        }
        function arm( targetTime, callback ) {
            setTimeout( callback, targetTime - moment.utc() );
        }

        arm( nextTime, tick );


        //console.log( "FiFi".bold.red, nextTime.toDate() );
        sendDigests();
    }
}

