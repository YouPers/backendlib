
var crypto = require('crypto');

module.exports = function (config, templatesDir) {

    var log = require('./log').getLogger(config),
        _ = require('lodash'),
        nodeMailer = require('nodemailer'),
        smtpTransport = nodeMailer.createTransport(config.nodemailer),
        emailTemplates = require('email-templates'),
        fromDefault = config.email.fromString;

    return {
        encryptLinkToken: function (linkToken) {

            var cipher = crypto.createCipher(config.linkTokenEncryption.algorithm, config.linkTokenEncryption.key);
            return cipher.update(linkToken, 'utf8', 'hex') + cipher.final('hex');
        },

        decryptLinkToken: function (token) {
            var decipher = crypto.createDecipher(config.linkTokenEncryption.algorithm, config.linkTokenEncryption.key);
            return decipher.update(token, 'hex', 'utf8') + decipher.final('utf8');
        },

        close: function () {
            smtpTransport.close();
        },

        renderEmailTemplate: function(templateName, locals, cb) {
            emailTemplates(templatesDir, function (err, template) {
                if (err) {
                    return cb(err);
                }
                template(templateName, locals, function (err, html, text) {
                    if (err) {
                        return cb(err);
                    }
                    cb(err, html);
                });
            });

        },

        sendEmail: function (from, to, subject, templateName, locals, mailExtensions) {

            log.debug({emailTo: to}, 'loading templates for sending: ' + templateName);

            // add an instance
            if (config.email.subjectSuffix) {
                subject = subject + config.email.subjectSuffix;
            }

            emailTemplates(templatesDir, function (err, template) {
                if (err) {
                    log.error({err: err}, 'error during parsing of all email-templates');
                    throw err;
                } else {

                    _.extend(locals, {
                        from: from,
                        to: to,
                        subject: subject
                    });

                    log.debug({emailTo: to}, 'templating email: ' + templateName);
                    // Send a single email
                    template(templateName, locals, function (err, html, text) {
                            if (err) {
                                log.error({err: err, locals: locals}, "error during email rendering for :" + to + " template: " + templateName);
                                throw err;
                            } else {
                                var mail = {
                                    from: from || fromDefault, // sender address
                                    to: to, // list of receivers
                                    subject: subject, // Subject line
                                    text: text, // plaintext body
                                    html: html // html body
                                };
                                if (config.email.tracking && config.email.tracking.enabled === "enabled") {
                                    mail.headers = {
                                        "X-Mailjet-TrackOpen": "1",
                                        "X-Mailjet-TrackClick": "1"
                                    };
                                }
                                if (mailExtensions) {
                                    _.extend(mail, mailExtensions);
                                }
                                log.debug({emailTo: to}, 'trying to send email: ' + templateName);

                                if (config.email.enabled !== "disabled") {
                                    smtpTransport.sendMail(mail, function (err, responseStatus) {
                                        if (err) {
                                            log.error({err: err, data: err.data}, "error while sending email for: " + to + " template: " + templateName);
                                        } else {
                                            log.info({responseStatus: responseStatus}, "email sent: " + to + " template: " + templateName);
                                        }
                                    });
                                } else {
                                    log.info({from: mail.from, to: mail.to, subject: mail.subject, text: mail.text}, "email sending disabled in config: this email was NOT sen (HTML only shown on debug log level");
                                    log.debug({from: mail.from, to: mail.to, subject: mail.subject, html: mail.html}, "html email content");
                                }
                            }

                        }
                    );


                }
            });
        }
    };
};