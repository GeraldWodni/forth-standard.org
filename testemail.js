var fs = require("fs");
var nodemailer      = require("nodemailer");
var smtpTransport   = require("nodemailer-smtp-transport");

var config = JSON.parse( fs.readFileSync( "config.json" ) );

var userRegistration = config[".*"].userRegistration;


var emailTransport = nodemailer.createTransport( smtpTransport({
host: userRegistration.smtp.host,
port: userRegistration.smtp.port || 25,
tls: {
    rejectUnauthorized: false
},
auth: {
    user: userRegistration.smtp.user,
    pass: userRegistration.smtp.password
}
}));

var results = {
    hash: "TEST-HASH",
    username: "TEST-USER",
    email: "gerald.wodni@gmail.com"
};

var link = userRegistration.link.replace( /{hash}/g, results.hash );
var text = userRegistration.email.text
.replace( /{link}/g, link )
.replace( /{username}/g, results.username );

console.log( "Sending Email...");

var emailOpts = {
from: userRegistration.smtp.email,
to: results.email,
subject: userRegistration.email.subject,
text: text
};

console.log( "Sending Email...", emailOpts);

emailTransport.sendMail( emailOpts, function( err ) {
    if( err ) {
        console.log( "ERR Sending EMAIL");
        throw err;
    }
    else
        console.log( "EMAIL SENT!");
});
