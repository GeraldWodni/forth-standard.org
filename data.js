var async   = require("async");
var _       = require("underscore");

module.exports = {
    setup: function _setup( k ) {
        var db = k.getDb();

        var users =  k.crud.sql( db, { table: "users",     key: "id", foreignName: "name",
            wheres: {
                "name": { where: "`name`=?" }
            }
        } );

        var contributions =  k.crud.sql( db, { table: "contributions",     key: "id", foreignName: "subject",
            orderBy: "created",
            wheres: {
                "url": { where: "`url`=?" },
                "user": { where: "`user`=? AND `state`='visible'" }
            }
        } );

        const votes = k.crud.sql( db, { table: "votes", key: "id", foreignName: "subject",
            orderBy: "created",
        } );
        const castProgrammerVotes = k.crud.sql( db, { table: "castProgrammerVotes", key: "reply", foreignName: "answer",
            orderBy: "reply",
        } );
        const castSystemVotes = k.crud.sql( db, { table: "castSystemVotes", key: "reply", foreignName: "answer",
            orderBy: "reply",
        } );

        const programmerAnswers = k.crud.sql( db, { table: "programmerAnswers", key: ["contribution", "number"], foreignName: "text",
            orderBy: "number",
        } );
        const systemAnswers = k.crud.sql( db, { table: "systemAnswers", key: ["contribution", "number"], foreignName: "text",
            orderBy: "number",
        } );

        var replies = k.crud.sql( db, { table: "replies", key: "id", foreignName: "text",
            orderBy: "created"
        } );

        var proposals = k.crud.sql( db, { table: "proposals", key: "contribution", foreignName: "contribution",
            orderBy: "contribution"
        } );

        /* keep all sql queries in this file for easy maintenance */
        var queries = {

            /** contributions & replies  **/
            /* review contributions, all new contributions */
            reviewContributions: { nestTables: true, sql:
                  " SELECT * FROM contributions INNER JOIN users ON contributions.user=users.id"
                + " WHERE contributions.state='new'"
            },
            /* review replies, all new replies */
            reviewReplies: { nestTables: true, sql:
                  " SELECT * FROM replies INNER JOIN users ON replies.user=users.id"
                + " INNER JOIN contributions ON replies.contribution=contributions.id WHERE replies.state='new'"
            },
            /* user's contributions & replies */
            userContributionsReplies: { args: [ "user" ], sql:
                  " SELECT contributions.* FROM contributions"
                + " INNER JOIN replies ON contributions.id=replies.contribution"
                + " WHERE replies.user=? GROUP BY contributions.id"
            },
            /* get all contributions to a specific url */
            urlContributions: { args: [ "url", "url", "url" ], nestTables: true, sql:
                  " SELECT *, contributions.formerUrl=? AS `moved`"
                + " FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " LEFT JOIN replies ON replies.contribution=contributions.id AND replies.state='visible'"
                + " LEFT JOIN users AS replyUsers ON replyUsers.id=replies.user"
                + " LEFT JOIN castProgrammerVotes ON replies.id=castProgrammerVotes.reply"
                + " LEFT JOIN castSystemVotes ON replies.id=castSystemVotes.reply"
                + " WHERE (contributions.url=? OR contributions.formerUrl=?) AND contributions.state='visible'"
                + " ORDER BY contributions.id, replies.id"
            },

            /** digests **/
            /* get all undigested contributions and replies and the new item counts */
            dailyDigestItems: { sql:
                  " SELECT users.name, contributions.id, contributions.created, contributions.url, contributions.type, contributions.subject, contributions.text"
                + " FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " WHERE contributions.dailyDigest=0 AND contributions.state='visible';"

                + " SELECT users.name, replies.id, replies.created, contributions.url, contributions.type, contributions.subject, replies.text"
                + " FROM replies"
                + " INNER JOIN contributions ON contributions.id=replies.contribution"
                + " INNER JOIN users ON users.id=replies.user"
                + " WHERE replies.dailyDigest=0 AND replies.state='visible'"
            },
            dailyDigestItemsOfId: { args: [ "id", "id" ], sql:
                  " SELECT users.name, contributions.id, contributions.created, contributions.url, contributions.type, contributions.subject, contributions.text"
                + " FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " WHERE contributions.dailyDigest=? AND contributions.state='visible';"

                + " SELECT users.name, replies.id, replies.created, contributions.url, contributions.type, contributions.subject, replies.text"
                + " FROM replies"
                + " INNER JOIN contributions ON contributions.id=replies.contribution"
                + " INNER JOIN users ON users.id=replies.user"
                + " WHERE replies.dailyDigest=? AND replies.state='visible'"
            },
            pendingContributionsReplies: { sql:
                  " SELECT COUNT(1) AS `count` FROM contributions WHERE state='new';"
                + " SELECT COUNT(1) AS `count` FROM replies WHERE state='new';"
                + " SELECT id, email FROM users"
                + " WHERE state='moderator' AND dailyDigest"
                + " AND DATE_ADD( lastModerationReminder, INTERVAL 23 HOUR ) < NOW()"
            },
            unsentDailyDigests: { sql:
                  " SELECT users.id AS userId, users.email, dailyDigests.id, dailyDigests.created, dailyDigests.text, dailyDigests.html"
                + " FROM users"
                + " INNER JOIN dailyDigests"
                + " ON dailyDigests.id = (SELECT MAX(id) FROM dailyDigests)"
                + " AND users.lastDailyDigest <> dailyDigests.id"
                + " WHERE users.dailyDigest"
            },
            updateUserSettings: { args: [ "dailyDigest", "userName" ], sql:
                "UPDATE users SET dailyDigest=? WHERE name=?"
            },
            updateUserLastDailyDigest: { args: [ "lastDailyDigest", "userId" ], sql:
                "UPDATE users SET lastDailyDigest=? WHERE id=?"
            },
            updateUserLastModerationReminder: { args: [ "userId" ], sql:
                "UPDATE users SET lastModerationReminder=NOW() WHERE id=?"
            },
            updateContributionDailyDigest: { args: [ "dailyDigest", "id" ], sql:
                "UPDATE contributions SET dailyDigest=? WHERE id=?"
            },
            updateReplyDailyDigest: { args: [ "dailyDigest", "id" ], sql:
                "UPDATE replies SET dailyDigest=? WHERE id=?"
            },
            insertDailyDigest: { args: [ "text", "html" ], sql:
                "INSERT INTO dailyDigests (created, text, html) VALUES(NOW(), ?, ?)"
            }
        }

        function query( connection, name, args, callback ) {
            if( ! _.has( queries, name ) )
                return callback( new Error( "Unknown query >" + name + "<" ) );

            /* assemble arguments, ignore args argument if none are requested */
            var query = queries[ name ];
            var values = [];
            if( query.args )
                for( var i = 0; i < query.args.length; i++ )
                    if( !_.has( args, query.args[i] ) )
                        return callback( new Error( "Missing argument >" + query.args[i] + "< for query >" + name + "<" ) );
                    else
                        values.push( args[ query.args[i] ] );
            else
                callback = args;

            /* perform query (without args) */
            connection.query( _.omit( query, "args" ), values, callback );
        }

        function pQuery( connection, name, args ) {
            return new Promise( (fulfill, reject) => {
                query( connection, name, args, ( err, data ) => {
                    if( err ) return reject( err );
                    fulfill( data );
                });
            });
        }

        function mapQuery( connection, name, args, mapFunction, callback ) {
            /* map all arguments */
            async.mapSeries( args, function( arg, done ) {
                /* callback */
                mapFunction( arg, function( err, values ) {
                    if( err ) return done( err );
                    query( connection, name, values, done );
                });
            }, callback );

            //async.mapSeries( args, _.bind( query, name ), callback );
        }

        /* get connection and begin transaction */
        function beginTransaction( callback ) {
            db.getConnection( function( err, connection ) {
                if( err ) return callback( err );

                connection.beginTransaction( function( err ) {
                    callback( err, connection );
                });
            });
        }

        /* rollback and release connection */
        function rollback( connection, callback ) {
            connection.rollback( function() {
                connection.release();
                callback();
            });
        }

        /* attempt to commit, rollback on error */
        function commitOrRollback( connection, callback ) {
            connection.commit( function( err ) {
                if( err ) return rollback( connection, function() { callback( err ); });
                connection.release();
                callback();
            });
        }

        const defaultProgrammerAnswers = [
            "I have used (parts of) this proposal in my programs.",
            "I would use (parts of) this proposal in my programs if the systems I am interested in implemented it.",
            "I would use (parts of) this proposal in my programs if this proposal was in the Forth standard.",
            "I would not use (parts of) this proposal in my programs.",
        ].join("\n");

        const defaultSystemAnswers = [
            "already implements the proposal in full since release [ ].",
            "implements the proposal in full in a development version.",
            "will implement the proposal in full in release [ ].",
            "will implement the proposal in full in some future release.",
            "There are no plans to implement the proposal in full in [ ].",
            "will never implement the proposal in full.",
        ].join("\n");

        return {
            users:          users,
            contributions:  contributions,
            votes,
            castProgrammerVotes,
            castSystemVotes,
            programmerAnswers,
            systemAnswers,
            defaultProgrammerAnswers,
            defaultSystemAnswers,
            proposals:      proposals,
            replies:        replies,
            query:          _.partial( query, db ),    /* bind to pool */
            pQuery:         _.partial( pQuery, db ),   /* bind to pool */
            mapQuery:       _.partial( mapQuery, db ), /* bind to pool */
            transaction:   {
                begin:              beginTransaction,
                commitOrRollback:   commitOrRollback,
                rollback:           rollback,
                query:              query,
                mapQuery:           mapQuery
            }
        };
    }
}
