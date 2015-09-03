// Assimilate latex-html into generic database format
// (c)copyright 2015 by Gerald Wodni <gerald.wodni@gmail.com>

require("colors");
var fs = require("fs");
var path = require("path");
var jsdom = require("jsdom");
var jquery = require("jquery");
var async = require("async");
var util = require("util");
var _ = require("underscore");

function readFile( filename, callback ) {

    fs.readFile( filename, function( err, data ) {
        if( err ) {
            console.log( "ERROR reading latex-html input".bold.red );
            callback( err );
        }

        jsdom.env( data.toString(), function( errs, window ) {
            if( err ) {
                console.log( "ERROR creating jsenv".bold.red );
                callback( err );
            }

            /* parse document */
            var $ = jquery(window);
            var $wordHead = $(".wordHead");
            var $wordBody = $(".wordBody");

            /* parse header */
            var word = {
                id:         $wordHead.attr("id"),
                number:     $wordHead.find(".wordNumber").text(),
                name:       $wordHead.find(".wordName").text(),
                english:    $wordHead.find(".wordEnglish").text(),
                list:       $wordHead.find(".wordList").text(),
                basename:   path.basename( filename, ".html" )
            };

            /* parse sections */
            var sections = {};
            $wordBody.children(".secdef").each( function() {
                var $this = $(this);
                var $secName = $this.children(".secname");
                var name = $secName.text();
                sections[ name ] = {
                    name: name,
                    html: $secName.next().html()
                };
            });
            word.stackEffect = getStackEffect( sections );
            word.sections = sections;

            console.log( "WORD".bold.green, word.list.red, word.basename.yellow, word.name );
            callback( null, word );
        });
    });
}

function readDir( dirname, callback ) {
    fs.readdir( dirname, function( err, files ) {
        if( err ) {
            console.log( "ERROR reading directory '" + dirname + "' contents".bold.red );
            callback( err );
        }

        async.map( files, function( file, done ) {

            /* skip hidden files */
            if( file.indexOf( "." ) === 0 )
                return done( null, null );

            /* parse file */
            var filename = path.join( dirname, file );
            readFile( filename, done );

        }, callback );
    });
        
}

function readWordsets( prefix, callback ) {
    fs.readdir( prefix, function( err, dirs ) {
        if( err )
            return callback( err );

        async.map( dirs, function( dir, done ) {

            var dirname = path.join( prefix, dir );
            fs.stat( dirname, function( err, stat ) {
                if( err )
                    return done( err );

                if( stat.isDirectory() ) {
                    readDir( dirname, function( err, wordArray ) {
                        if( err )
                            return done( err );

                        var words = {}
                        wordArray.forEach( function( word ) {
                            if( word !== null )
                                words[ word.basename ] = word;
                        });
                        

                        done( null, {
                            name: dir,
                            words: words
                        });
                    });
                }
                else
                    done( null, null );
            });

        }, callback);

    });
}

function getStackEffect( sections ) {
    var stackEffects = {
        html: {},
        plain: {}
    }

    /* section names containing stack effects */
    var sectionPattern = /initialization|interpretation|compilation|run-time|execution|\s+/i;
    _.each( sections, function( section ) {
        if( !sectionPattern.test( section.name ) )
            return;

        /* get first paragraph */
        var stackEffect = section.html.split(/<p\s*\/?>/)[0].trim();

        /* check if real stack effect or comment */
        if( /.*\(.*\).*/g.test( stackEffect ) ) {

            /* strip html */
            var plainStackEffect = stackEffect.replace( /<\/?[a-z]+>/gi, "" );
            plainStackEffect = plainStackEffect.replace( /&gt;/g, ">" );
            plainStackEffect = plainStackEffect.replace( /&lt;/g, "<" );
            plainStackEffect = plainStackEffect.replace( /&quot;/g, '"' );
            plainStackEffect = plainStackEffect.replace( /\n\s+/g, "\n" );

            stackEffects.html[ section.name ] = stackEffect;
            stackEffects.plain[ section.name ] = plainStackEffect;
        }
    });

    return stackEffects;
}


function assimilateAll( filename ) {
    if( typeof filename  == "unknown" )
        throw new Error( "specify filename" );

    readWordsets( "latex-html", function( err, wordSetArray ) {
        if( err )
            throw err;

        var wordSets = {};
        wordSetArray.forEach( function( wordSet ) {
            if( wordSet !== null )
                wordSets[ wordSet.name ] = wordSet;
        });

        fs.writeFile( filename, JSON.stringify( wordSets, null, 4 ) );
        
        //console.log( "WordSets".bold.magenta, util.inspect( wordSets, { depth: null, colors: true } ) );
    });
}

function assimilateSelection() {
    readDir( "latex-html/selected", function( err, wordArray ) {
        console.log( "DONE".bold.yellow );
        if( err )
            throw err;
    
        var words = {}
        wordArray.forEach( function( word ) {
            words[ word.basename ] = word;
        });
    
        console.log( "WORDS".bold.magenta, words );
    });
}

function assimilateSingleWord() {
    readFile( "latex-html/core/PARSE.html", function( err, word ) {
        if( err )
            throw err;

        console.log( "Word".bold.green, word );
    });
};


function parseHtml( filename ) {
    var wordSets = JSON.parse( fs.readFileSync( filename ) );

    var i = 0;
    var sectionNames = [];

    _.each( wordSets, function( wordSet ) {
        //if( wordSet.name != "core" ) return;

        _.each( wordSet.words, function( word, name ) {

            var stackEffect = getStackEffect( word.sections );

            console.log( wordSet.name, word.name, stackEffect );

            _.each( word.sections, function( section, sectionName ) {
                sectionNames.push( sectionName );
            });
        });
    });

    console.log( "Sections:", _.uniq( sectionNames ) );
}

//parseHtml( process.argv[2] );

//assimilateSingleWord();
//assimilateSelection();
assimilateAll( process.argv[2] );
