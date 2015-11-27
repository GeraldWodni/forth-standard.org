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

        return {
            users:          users,
            contributions:  contributions,
            replies:        replies
        };
    }
}
