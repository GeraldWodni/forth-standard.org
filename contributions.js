// user contributions
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

module.exports = {
    setup: function( k ) {

        var kData = k.getData();
        var vals = k.setupOpts.vals;

        /* add contribution */
        k.router.get("/contribute/*", function( req, res, next ) {
            var url = req.path.substr( "/contribute".length );
            k.jade.render( req, res, "addContribution", vals( req, { url: url } ));
        });
    }
}
