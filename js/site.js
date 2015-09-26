$(function(){
    var $sideNav = $(".col-sidenav");
    var $sideHide = $sideNav.find(".toggle");
    var $sideShow = $(".show-sidenav");
    var $bootstrapSize = $("#bootstrapSize");

    function bootstrapSize( size ) {
        return $bootstrapSize.find(".visible-" + size).is(":visible");
    }

    /* toggle animation */
    $sideHide.add($sideShow).click( function() {
        if( $sideNav.is(":visible") )
            $sideNav.animate( {width: 'toggle', height: 'toggle'}, 400, function() {
                $sideShow.fadeToggle();
            });
        else {
            $sideShow.hide();
            $sideNav.animate( {width: 'toggle', height: 'toggle'}, 400 );
        }
    });


    /* resize handler */
    var lastSmall = null;
    function handleResize() {

        /* only take action on size Change */
        var small = bootstrapSize( "xs" )|| bootstrapSize( "sm" );
        if( small === lastSmall )
            return;
        lastSmall = small;

        /* auto-hide sideNav on xs or sm */
        if( small ) {
            $sideNav.hide();
            $sideHide.show();
            $sideShow.show();
        }
        else {
            $sideNav.show();
            $sideHide.hide();
            $sideShow.hide();
        }
    }

    /* bind resizer and fire once */
    $(window).resize(function() {
        handleResize();
    });
    handleResize();
});
