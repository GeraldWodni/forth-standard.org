#!/usr/bin/env node
// Assimilate latex-html into generic database format
// (c)copyright 2015, 2026 by Gerald Wodni <gerald.wodni@gmail.com>

require("colors");
var fs = require("fs");
var path = require("path");
const { JSDOM } = require("jsdom");
var jquery = require("jquery");
var async = require("async");
var util = require("util");
var mkdirp = require("mkdirp");
var _ = require("underscore");

function readFile( filename, callback ) {

    fs.readFile( filename, function( err, data ) {
        if( err ) {
            console.log( "ERROR reading latex-html core".bold.red );
            callback( err );
        }

        const document = (new JSDOM( data.toString() )).window.document;

        /* parse document */
        var wordHead = document.querySelector(".wordHead");
        var wordBody = document.querySelector(".wordBody");

        /* parse header */
        var word = {
            id:         renameWordset( wordHead.getAttribute("id") ),
            number:     wordHead.querySelector(".wordNumber").textContent,
            name:       wordHead.querySelector(".wordName").textContent,
            english:    wordHead.querySelector(".wordEnglish").textContent,
            list:       wordHead.querySelector(".wordList").textContent,
            basename:   path.basename( filename, ".html" )
        };

        /* parse sections */
        var sections = {};
        for( const secdef of wordBody.querySelectorAll(".secdef") ) {
            var secName = secdef.querySelector(".secname");
            let section = secName.nextSibling;
            while( section.nodeName == "#text" )
                section = section.nextSibling;
            var name = secName.textContent;
            sections[ name ] = {
                name: name,
                html: adoptSection( section ).innerHTML,
            };
        }
        word.stackEffect = getStackEffect( sections );
        word.sections = sections;

        console.log( "WORD".bold.green, word.list.red, word.basename.yellow, word.name );
        callback( null, word );
    });
}

function renameWordset( name ) {
    return name.replace( /floating/, "float" ).replace( /local/, "locals" );
}

function rewriteLink( href ) {
    return href.replace( /\.html/g, '' ).replace(/local\//g, "locals/").replace(/floating\//g, "float/" )
        .replace(/rat:floating/, 'rat:float').replace(/rat:local/, 'rat:locals');
}

function rewriteSrc( opts, src ) {
    return path.join( opts.mediaHttpPrefix, src );
}

function adoptSection( section ) {
    /* replace links */
    for( const a of section.querySelectorAll("a") ) {
        let href = a.getAttribute( "href" );
        if( href && href.indexOf( "http" ) != 0 )
            a.setAttribute( "href", rewriteLink( href ) );
    }

    return section;
}

function readDir( dirname, reader, callback ) {
    fs.readdir( dirname, function( err, files ) {
        if( err ) {
            console.log( "ERROR reading directory '" + dirname + "' contents".bold.red );
            callback( err );
        }

        async.map( files, function( file, done ) {

            /* skip hidden files */
            if( file.indexOf( "." ) === 0 )
                return done( null, null );

            var filename = path.join( dirname, file );
            fs.stat( filename, function( err, stat ) {
                if( err )
                    return callback( err );

                if( stat.isFile() ) {
                    /* parse file */
                    reader( filename, done );
                }
                else
                    done( null, null );

            });

        }, callback );
    });
        
}

function readWordsets( prefix, callback ) {
    fs.readdir( prefix, function( err, dirs ) {
        if( err )
            return callback( err );

        dirs= _.without( dirs, "selected" ); /* selected is used for debugging only */

        async.map( dirs, function( dir, done ) {

            var dirname = path.join( prefix, dir );
            fs.stat( dirname, function( err, stat ) {
                if( err )
                    return done( err );

                if( stat.isDirectory() ) {
                    readDir( dirname, readFile, function( err, wordArray ) {
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

function readDocument( opts, filename, callback ) {
    fs.readFile( filename, function( err, data ) {
        if( err ) {
            console.log( "ERROR reading latex-html document".bold.red );
            callback( err );
        }

        /* skip non-html files */
        if( filename.indexOf(".html") < 0 )
            return callback( null, null );

        const document = (new JSDOM( data.toString() )).window.document;

        /* parse document */
        var body = document.body;
        for( const a of body.querySelectorAll("a") ) {
            let href = a.getAttribute( "href" );
            if( href && href.indexOf( "http" ) != 0 )
                a.setAttribute( "href", rewriteLink( href ) );

            let name = a.getAttribute( "name" );
            if( name && name.indexOf( "rat:" ) >= 0 )
                a.setAttribute("name", rewriteLink( name ) );
        }

        for( const img of body.querySelectorAll("img") ) {
            let src = img.getAttribute("src");
            console.log( "ADD IMAGE:", src );
            if( opts.mediaFiles.indexOf( src ) < 0 )
                opts.mediaFiles.push( src );

            img.setAttribute("src", rewriteSrc( opts, src ) );
        }

        /* rename wordsets */
        for( const wordset of body.querySelectorAll("[id]") ) {
            var id = wordset.getAttribute("id");
            if( id && id.indexOf( "rat:" ) >= 0 )
                wordset.setAttribute( "id", rewriteLink( id ) );
        }

        /* parse header */
        const doc = {
            basename: path.basename( filename, ".html" ),
            name: body.querySelector("h1")?.textContent || "",
            html: body.innerHTML,
        };

        console.log( "DOCUMENT".bold.green, filename.yellow );
        callback( null, doc );
    });
}

function readDocuments( opts, callback ) {
    readDir( opts.prefix, _.partial( readDocument, opts ), function( err, data ) {
        if( err )
            return callback( err );
    
        var documents = {}; 
        for( var i = 0; i < data.length; i++ ) {
            if( data[i] != null ) {
                var doc = data[i];
                //console.log( "ADD DOC!".bold.red, doc.basename );
                documents[ doc.basename ] = doc;
            }
        }

        callback( null, documents );
    });
}


function assimilateAll( filename, prefix ) {
    if( typeof filename  == "unknown" )
        throw new Error( "specify filename" );

    /* read all wordsets */
    readWordsets( prefix, function( err, wordSetArray ) {
        if( err )
            throw err;

        /* create dictionary */
        var wordSets = {};
        wordSetArray.forEach( function( wordSet ) {
            if( wordSet !== null ) {
                /* rename wordsets */
                var name = renameWordset( wordSet.name );
                wordSet.name = name;
                wordSets[ name ] = wordSet;
            }
        });

        /* add document */
        var docOpts = {
            mediaHttpPrefix: path.join( "/images/standards/", filename ),
            mediaFilePrefix: path.join(  "images/standards/", filename ),
            mediaFiles: [],
            prefix,
        };
        readDocuments( docOpts, function( err, documents ) {
            if( err )
                throw err;

            var standard = {
                wordSets: wordSets,
                documents: documents
            };

            /* add extensions */
            var extensions = JSON.parse( fs.readFileSync( "standards/" + filename + ".ext.json" ) );
            _.extend( standard, extensions );

            fs.writeFileSync( "standards/" + filename + ".json", JSON.stringify( standard, null, 4 ) );

            /* copy media files */
            /* TODO_2026: fix media path */
            if( docOpts.mediaFiles.length > 0 ) {
                mkdirp( docOpts.mediaFilePrefix, function( err ) {
                    if( err )
                        throw err;

                    async.map( docOpts.mediaFiles, function( mediaFile, done ) {
                        var src  = path.join( prefix, mediaFile );
                        var dest = path.join( docOpts.mediaFilePrefix, mediaFile );
                        console.log( "MEDIA".bold.green, src, '-> ', dest );
                        fs.createReadStream( src )
                            .pipe( fs.createWriteStream( dest ) )
                            .on( "close", done );
                    });
                });
            }
            
            //console.log( "WordSets".bold.magenta, util.inspect( wordSets, { depth: null, colors: true } ) );
        });
    });
}

function assimilateDocuments() {
    readDocuments( { prefix: "latex-html" }, function( err, documents ) {
        if( err )
            return console.log( err );

        console.log( documents );
    });
}

function assimilateSelection() {
    readDir( "latex-html/selected", readFile, function( err, wordArray ) {
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
//assimilateDocuments();
//
function main() {
    if( process.argv.length != 4 ) {
        console.log( "usage: ./assimilate.js <name> <latex-html-dir>" );
        console.log( "    name: name of standard i.e. '2021' or '2021.1'" );
        console.log( "    latex-html-dir: location of the output of Forth2HTML" );
        process.exit(1);
    }

    assimilateAll( process.argv[2], process.argv[3] );
}

main();
