var i18n = require('i18next');
var _ = require('lodash');


module.exports = function (config) {

    function _localeToUse(reqLocale, specConfig) {

        // not all usages of yp18n are currently initializing it with a config - those usages (mainly generic.js)
        // need to pass it specifically in this call
        var myConfig = specConfig || config;

        if (!myConfig) {
            throw new Error("need a config for this method 'localeToUse', fix the calling code");
        }

        var supportedLocales = (myConfig && myConfig.i18n && myConfig.i18n.supportedLngs) || ['en', 'de', 'fr', 'it'];
        var fallbackLanguage = (myConfig && myConfig.i18n && myConfig.i18n.fallbackLng) || 'en';
        if (!reqLocale || reqLocale.length < 2) {
            return fallbackLanguage;
        }

        if (_.contains(supportedLocales, reqLocale)) {
            return reqLocale;
        }

        var reqLocaleShort = reqLocale.substring(0, 2);
        if (_.contains(supportedLocales, reqLocaleShort)) {
            return reqLocaleShort;
        }

        return fallbackLanguage;
    }

    return {
        /**
         * translates the way we use to transport the language a user has chosen to the way i18next understands.
         * If no header 'yp-language' is in the request, i18next uses its algorithm to choose the language which is
         * based on the browsers preferences (the 'accept-languages' HTTP header.
         *
         * @param req
         * @param res
         * @param next
         * @returns {*}
         */
        angularTranslateI18nextAdapterPre: function (req, res, next) {
            req.headers['yp-language'] = _localeToUse(req.headers['yp-language']);
            if (req.headers['yp-language']) {
                req.headers['cookie'] = 'i18next=' + req.headers['yp-language'];
            }
            return next();
        },
        angularTranslateI18nextAdapterPost: function (req, res, next) {
            res.setHeader('yp-language', req.locale);
            return next();
        },
        initialize: function initialize(opts) {

            var options = _.defaults(opts, {
                fallbackLng: 'de',
                supportedLngs: ['de', 'en', 'fr', 'it'],
                ns: {
                    namespaces: ['email', 'ical', 'general']
                },
                resGetPath: 'translations/__ns__.__lng__.json',
                saveMissing: false,
                debug: false
            });
            i18n.init(options);
            return i18n;
        },
        localeToUse: _localeToUse
    };
};