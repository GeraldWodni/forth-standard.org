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

        var replies = k.crud.sql( db, { table: "replies", key: "id", foreignName: "text",
            orderBy: "created"
        } );

        /* keep all sql queries in this file for easy maintenance */
        var queries = {
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
            urlContributions: { args: [ "url" ], nestTables: true, sql:
                  " SELECT * FROM contributions"
                + " INNER JOIN users ON users.id=contributions.user"
                + " LEFT JOIN replies ON replies.contribution=contributions.id AND replies.state='visible'"
                + " LEFT JOIN users AS replyUsers ON replyUsers.id=replies.user"
                + " WHERE contributions.url=? AND contributions.state='visible'"
            },
            /* get all undigested contributions and replies and the new item counts */
            dailyDigestItems: { sql:
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
                + " SELECT COUNT(1) FROM replies WHERE state='new'"
            },
            updateUserSettings: { args: [ "dailyDigest", "userName" ], sql:
                "UPDATE users SET dailyDigest=? WHERE name=?"
            },
            insertDailyDigest: { args: [ "text" ], sql: 
                ""
            }
        }

        function query( name, args, callback ) {
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
            db.query( _.omit( query, "args" ), values, callback );
        }

        return {
            users:          users,
            contributions:  contributions,
            replies:        replies,
            query:          query
        };
    }
}
