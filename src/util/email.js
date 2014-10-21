module.exports = function (config) {

    var linkTokenSeparator = config.linkTokenEncryption.separator;

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
            title: i18n.t('email:emailVerification.title'),
            salutation: i18n.t('email:emailVerification.salutation', {user: user.toJSON()}),
            text: i18n.t('email:emailVerification.text', {user: user.toJSON()}),
            header: i18n.t('email:emailVerification.header'),
            footer: i18n.t('email:emailVerification.footer'),
            imgServer: config.webclientUrl,
            link: _emailVerificationUrl(encryptedEmailAddress)
        };

        emailSender.sendEmail(from, to, subject, 'genericYouPersMail', locals);

    };

    var sendPasswordResetMail = function (user, i18n) {
        var from = config.email.fromString;
        var to = user.email;
        var subject = i18n.t("email:passwordReset.subject");

        var tokenToEncrypt = user.id + linkTokenSeparator + new Date().getMilliseconds();
        var encryptedToken = emailSender.encryptLinkToken(tokenToEncrypt);

        var locals = {
            title: i18n.t('email:passwordReset.title'),
            salutation: i18n.t('email:passwordReset.salutation', {user: user.toJSON()}),
            text: i18n.t('email:passwordReset.text', {user: user.toJSON()}),
            header: i18n.t('email:passwordReset.header'),
            footer: i18n.t('email:passwordReset.footer'),
            imgServer: config.webclientUrl,
            link: _passwordResetUrl(encryptedToken, user.firstname, user.lastname)
        };

        emailSender.sendEmail(from, to, subject, 'genericYouPersMail', locals);

    };


    return {
        sendEmailVerification: sendEmailVerification,
        sendPasswordResetMail: sendPasswordResetMail,
        encryptLinkToken: emailSender.encryptLinkToken,
        decryptLinkToken: emailSender.decryptLinkToken
    };

};