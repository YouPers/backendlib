var _ = require('lodash');

module.exports = function (config) {

    var linkTokenSeparator = config.linkTokenEncryption.separator;

    var defaultLocals = function (i18n) {
        return {
            header: i18n.t('email:default.header'),
            notDisplayedCorrectly: i18n.t('email:default.notDisplayedCorrectly'),
            notDisplayedCorrectlyLink: i18n.t('email:default.notDisplayedCorrectlyLink'),
            imgServer: config.webclientUrl,
            logo: config.webclientUrl + '/assets/img/logo.png'
        };
    };

    function _emailVerificationUrl(encryptedEmailAddress) {
        return config.webclientUrl + config.user.emailVerificationUrl + encryptedEmailAddress;
    }

    function _passwordResetUrl(encryptedToken, firstname, lastname) {
        return config.webclientUrl + config.user.passwordResetUrl + encryptedToken + "?firstname=" + firstname + "&lastname=" + lastname;
    }

    var emailSender = require('./emailSender')(config, process.cwd() + '/' + config.email.templatesDir);

    var sendEmailVerification = function (user, i18n) {

        var from = config.email.fromString;
        var to = user.email;
        var subject = i18n.t("email:emailVerification.subject");

        var encryptedEmailAddress = emailSender.encryptLinkToken(to);

        var locals = {
            salutation: i18n.t('email:emailVerification.salutation', {user: user.toJSON()}),
            text: i18n.t('email:emailVerification.text', {user: user.toJSON()}),
            link: _emailVerificationUrl(encryptedEmailAddress),
            linkText: i18n.t('email:emailVerification.linkText')

        };
        _.extend(locals, defaultLocals(i18n));
        emailSender.sendEmail(from, to, subject, 'genericYouPersMail', locals);

    };

    var sendPasswordResetMail = function (user, i18n) {
        var from = config.email.fromString;
        var to = user.email;
        var subject = i18n.t("email:passwordReset.subject");

        var tokenToEncrypt = user.id + linkTokenSeparator + new Date().getMilliseconds();
        var encryptedToken = emailSender.encryptLinkToken(tokenToEncrypt);

        var locals = {
            salutation: i18n.t('email:passwordReset.salutation', {user: user.toJSON()}),
            text: i18n.t('email:passwordReset.text', {user: user.toJSON()}),
            imgServer: config.webclientUrl,
            link: _passwordResetUrl(encryptedToken, user.firstname, user.lastname),
            linkText: i18n.t('email:passwordReset.linkText')
        };
        _.extend(locals, defaultLocals(i18n));
        emailSender.sendEmail(from, to, subject, 'genericYouPersMail', locals);

    };


    return {
        sendEmailVerification: sendEmailVerification,
        sendPasswordResetMail: sendPasswordResetMail,
        encryptLinkToken: emailSender.encryptLinkToken,
        decryptLinkToken: emailSender.decryptLinkToken
    };

};