/* test different diffs */

const fs     = require("fs");
const diff   = require("diff");
const marked = require("marked");
require("colors");

const v0 = fs.readFileSync("v0.txt").toString();
const v1 = fs.readFileSync("v1.txt").toString();
const v2 = fs.readFileSync("v2.txt").toString();

const d = diff.diffLines( v1, v2 );
//const d = diff.diffWords( v1, v2 );

const style = `
<html>
    <head>
        <style>
            ins{
                color: #080;
                background: #AFA;
            }
            del, del *
            del{
                color: #800;
                background: #FAA;
            }
        </style>
    </head>
    <body>`;
var diffHTML = style+"";

function printDiff( ds ) {
    console.log( typeof ds );
    ds.forEach( d => {
        if( d.added ) {
            console.log( d.value.green ) 
            diffHTML += `<ins>${marked(d.value)}</ins>`;
        }
        else if( d.removed ) {
            console.log( d.value.red ) 
            diffHTML += `<del>${marked(d.value)}</del>`;
        }
        else {
            console.log( d.value ) 
            diffHTML += marked(d.value);
        }
    });
}

printDiff( d );
diffHTML += "</body></html>";

const v1Markdown = marked( v1 );
const v2Markdown = marked( v2 );
var diffPost = style;
diff.diffLines( v1Markdown, v2Markdown ).forEach( d => {
    if( d.added )
        diffPost += `<ins>${d.value}</ins>`;
    else if( d.removed )
        diffPost += `<del>${d.value}</del>`;
    else
        diffPost += d.value;
});
fs.writeFileSync( "diffPost.html", diffPost );

fs.writeFileSync( "v1.html", marked( v1 ) );
fs.writeFileSync( "v2.html", marked( v2 ) );
fs.writeFileSync( "diff.html", marked( diffHTML ) );
