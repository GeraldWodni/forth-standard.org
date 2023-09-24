// digest daemon
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

var async           = require("async");
var moment          = require("moment");
var _               = require("underscore");
var nodemailer      = require("nodemailer");
var smtpTransport   = require("nodemailer-smtp-transport");

module.exports = {
    setup: function( k ) {

        var kData = k.getData();
        var kDb = k.getDb();
        const vals = k.setupOpts.vals;
        const saneMarked = k.setupOpts.saneMarked;
        var config = k.getWebsiteConfig( "dailyDigests", {} );

        if( config.disabled )
            return;

        /** create digests **/
        function formatDate( date, format ) {
            return moment( date ).format( format || config.dateTimeFormat );
        }

        function createDigest() {
            return new Promise( (fulfill, reject) => {
                /* get all undigested contributions and replies and the new item counts */
                kData.query( "dailyDigestItems", function( err, data ) {
                    if( err ) return  err;

                    /* prepare text */
                    const contributions    = data[0];
                    const replies          = data[1];

                    const text = renderDigestText( contributions, replies );

                    /* create new digest */
                    if( contributions.length > 0 || replies.counts > 0 ) {
                        kData.transaction.begin( function( err, conn ) {
                            if( err ) return reject( err );

                            kData.transaction.query( conn, "insertDailyDigest", { text: text }, function( err, result ) {
                                if( err ) return kData.transaction.rollback( conn, () => reject( err ) );

                                /* update contribution's dailyDigest */
                                kData.transaction.mapQuery( conn, "updateContributionDailyDigest", contributions, function( args, done ) {
                                    done( null, { id: args.id, dailyDigest: result.insertId });

                                }, function( err ) {
                                    if( err ) return kData.transaction.rollback( conn, () => reject( err ) );

                                    /* update reply's dailyDigest */
                                    kData.transaction.mapQuery( conn, "updateReplyDailyDigest", replies, function( args, done ) {
                                        done( null, { id: args.id, dailyDigest: result.insertId });
                                    }, function( err ) {
                                        if( err ) return kData.transaction.rollback( conn, () => reject( err ) );

                                        kData.transaction.commitOrRollback( conn, function( err ) {
                                            if( err )
                                                return reject( err );

                                            fulfill( "created" );
                                        });
                                    });
                                });
                            });
                        });
                    }
                    else
                        fulfill( "skipped" );
                });
            });
        }

        async function getDigestData( id ) {
            return new Promise( ( fulfill, reject ) => {
                kData.query( "dailyDigestItemsOfId", { id }, function (err, data) {
                    if( err )
                        return reject( err );
                    fulfill( {
                        contributions: data[0],
                        replies: data[1],
                    });
                });
            });
        }
        function renderDigestText( contributions, replies ) {
            let text = "";

            /* contributions */
            if( contributions.length > 0 ) {
                text += "\n,---------------.";
                text += "\n| Contributions |";
                text += "\n`---------------´";
            }

            contributions.forEach( function( contribution ) {
                text += "\n\n\n,------------------------------------------";
                text += "\n| ";
                text += formatDate( contribution.created ) + "  " + contribution.name + "  wrote:\n| " + contribution.type + " - " + contribution.subject;
                text += `\n| see: https://forth-standard.org${contribution.url}#contribution-${contribution.id}`;
                text += "\n`------------------------------------------\n";
                text += contribution.text;
            });

            /* replies */
            if( replies.length > 0 ) {
                text += "\n\n\n,---------.";
                text += "\n| Replies |";
                text += "\n`---------´";
            }

            replies.forEach( function( reply ) {
                text += "\n\n\n,------------------------------------------";
                text += "\n| ";
                text += formatDate( reply.created ) + "  " + reply.name + "  replies:\n| " + reply.type + " - " + reply.subject;
                text += `\n| see: https://forth-standard.org${reply.url}#reply-${reply.id}`;
                text += "\n`------------------------------------------\n";
                text += reply.text;
            });

            return text;
        }
        function renderDigestHTML( contributions, replies ) {
            let text = "";

            /* contributions */
            if( contributions.length > 0 ) {
                text += "<h1>Contributions</h1>";
            }

            let separator = "";
            contributions.forEach( function( contribution ) {
                text += separator;
                text += '<div style="color:#333;background-color:#E0E0E0;padding:5px;border-radius:3px">';
                text += `<a href="https://forth-standard.org${contribution.url}#contribution-${contribution.id}">[${contribution.id}]</a> `;
                text += formatDate( contribution.created ) + "  " + contribution.name + "  wrote:<br/>";
                text += '<h2 style="margin: 0;font-size:1rem;">'
                text += contribution.type + " - " + contribution.subject + '</h2>';
                text += "</div>\n";
                text += "<div>\n";
                text += saneMarked( contribution.text );
                text += "</div>\n";

                separator = "<hr/>\n";
            });

            /* replies */
            if( replies.length > 0 ) {
                text += "<h1>Replies</h1>";
            }

            separator = "";
            replies.forEach( function( reply ) {
                text += separator;
                text += '<div style="color:#333;background-color:#E0E0E0;padding:5px;border-radius:3px">';
                text += `<a href="https://forth-standard.org${reply.url}#reply-${reply.id}">[r${reply.id}]</a> `;
                text += formatDate( reply.created ) + "  " + reply.name + "  replies:<br/>";
                text += '<h2 style="margin: 0;font-size:1rem;">'
                text += reply.type + " - " + reply.subject + '</h2>';
                text += "</div>\n";
                text += "<div>\n";
                text += saneMarked( reply.text );
                text += "</div>\n";

                separator = "<hr/>\n";
            });

            return text;
        }

        /* web interface */
        k.router.get("/text/:id", async (req, res, next) => {
            try {
                const id = req.requestman.id();
                const { contributions, replies } = await getDigestData( id );
                res.header( "Content-Type", "text/plain" );
                res.end( renderDigestText( contributions, replies ) );
            } catch( err ) {
                next( err );
            }
        });
        k.router.get("/html/:id", async (req, res, next) => {
            try {
                const id = req.requestman.id();
                const { contributions, replies } = await getDigestData( id );
                res.header( "Content-Type", "text/html" );
                res.end( renderDigestHTML( contributions, replies ) );
            } catch( err ) {
                next( err );
            }
        });
        k.router.get("/:id", async (req, res, next) => {
            try {
                const id = req.requestman.id();
                const date = (await req.kern.db.pQuery(`SELECT CONCAT(DATE(created),'') AS date FROM dailyDigests WHERE id={id}`, {id}) )[0].date;
                const { contributions, replies } = await getDigestData( id );
                const digestHTML = renderDigestHTML( contributions, replies );
                k.jade.render( req, res, "digest", vals( req, { id, date, digestHTML } ) );
            } catch( err ) {
                next( err );
            }
        });
        k.router.get("/", async (req, res, next) => {
            try {
                const digests = await req.kern.db.pQuery(`SELECT id, CONCAT(DATE(created), '') AS date FROM dailyDigests ORDER BY id DESC`);
                k.jade.render( req, res, "digests", vals( req, { digests } ) );
            } catch( err ) {
                next( err );
            }
        });

        /* first fire */
        var nextTime = moment.utc();
        nextTime.set("hour",   config.sendHourUTC);
        nextTime.set("minute",  5);
        nextTime.set("seconds", 0);

        /* server started late, add a day */
        if( nextTime < moment.utc() ) {
            nextTime.add( 1, "days" );
        }

        /* perform tick and setup next tick */
        async function tick() {
            try {
                const message = await createDigest();
                console.log( "createDigest".bold.green, message );
                startSendDigests();
            } catch( err ) {
                console.log( "createDigest".bold.red, err );
            }

            nextTime.add( 1, "days" );
            arm( nextTime, tick );
        }
        function arm( targetTime, callback ) {
            setTimeout( callback, targetTime - moment.utc() );
        }
        /* arm for first tick */
        arm( nextTime, tick );



        /** sending digests **/
        var emailTransport = nodemailer.createTransport( smtpTransport({
            host: config.smtp.host,
            port: config.smtp.port || 25,
            tls: {
                rejectUnauthorized: false
            },
            auth: {
                user: config.smtp.user,
                pass: config.smtp.password
            }
        }));

        function sendEmail( email, subject, text, callback ) {
            /* send email */
            emailTransport.sendMail({
                from: config.smtp.email,
                to: email,
                subject: subject,
                text: text
            }, callback );
        }

        function sendDigest( row, callback ) {
            var subject = config.subject
                .replace( /{id}/g, row.id )
                .replace( /{created}/g, formatDate( row.created, config.dateFormat ) );
            var text = config.text
                .replace( /{text}/g, row.text );

            /* send email */
            console.log( "Sending dailyDigest", subject, " to", row.email );
            sendEmail( row.email, subject, text, function( err ){
                if( err ) return callback( err );
                kData.query( "updateUserLastDailyDigest", { lastDailyDigest: row.id, userId: row.userId }, callback );
            });
        }

        function sendDigests( callback ) {
            kData.query( "unsentDailyDigests", function( err, data ) {
                if( err ) return callback( err );

                async.mapSeries( data, function( row, done ) {
                    sendDigest( row, function( err ) {
                        if( err ) return done( err );

                        setTimeout( done, config.sendDelay * 1000 );
                    });
                }, callback);
            });
        }

        function sendPendingReminders( callback ) {
            kData.query( "pendingContributionsReplies", function( err, data ) {
                if( err ) return callback( err );

                var newContributions = data[0][0].count;
                var newReplies       = data[1][0].count;
                var moderatorEmails  = data[2];

                var subject = config.moderationReminder.subject
                    .replace( /{newContributions}/g, newContributions )
                    .replace( /{newReplies}/g, newReplies );
                var text = config.moderationReminder.text;

                /* send out all reminders */
                if( newContributions > 0 || newReplies > 0 )
                    async.mapSeries( moderatorEmails, function( row, done ) {

                        /* send email */
                        console.log( "Sending moderationReminder", subject, " to", row.email );
                        sendEmail( row.email, subject, text, function( err ){
                            if( err ) return done( err );
                            kData.query( "updateUserLastModerationReminder", { userId: row.id }, function( err ) {
                                if( err ) return done( err );
                                setTimeout( done, config.sendDelay * 1000 );
                            });
                        });
                    }, callback);
                else
                    callback( null, "skipped" );
            });
        }


        function startSendDigests() {
            setTimeout( function() {
                sendDigests( function( err, success ) {
                    if( err )
                        console.log( "sendDigests".bold.red, err );
                    else {
                        console.log( "sendDigests".bold.green, success );
                        sendPendingReminders( function( err, success ) {
                            if( err )
                                console.log( "sendPendingReminders".bold.red, err );
                            else
                                console.log( "sendPendingReminders".bold.green, success );
                        });
                    }
                });
            }, config.initalDelay * 1000 );
        }

        /* start sending any unfinished digests if it won't collide with next digest */
        var gapSeconds = (nextTime - moment.utc()) / 1000;
        if( gapSeconds > config.sendGap )
            startSendDigests();
    }
}

