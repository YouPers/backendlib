var gcm = require('node-gcm');
var apn = require('apn');
var _ = require('lodash');
var mongoose = require('mongoose');
var moment = require('moment-timezone');
var async = require('async');

module.exports = function (config) {


    ///////////////////////////////////////////////
    // setup
    var i18n = require('../util/ypi18n')(config).initialize();

    var TIME_TO_LIVE = config.push.timeToLive || (60 * 60 * 24 * 4);
    var NR_OF_RETRIES = config.push.nrOfRetries || 2;
    var androidSender, apnConnection;
    var log = require('./log').getLogger(config);

    if (config.push && config.push.unitTestOnly) {
        androidSender = {
            send: function mockSender(message, token, NR_OF_RETRIES, cb) {
                process.nextTick(function() {
                    return cb(null, {
                        result: 'UNIT TEST Mock Sender, nothing has been sent'
                    });
                });
            }
        };
        log.warn("PushMessaging: android UNIT TEST MODE");
    } else if (config.push && config.push.googlePushApiKey) {
        androidSender = new gcm.Sender(config.push.googlePushApiKey);
        log.info("PushMessaging: android GCM ENABLED");
    } else {
        log.info("PushMessaging: android GCM Push NOT enabled in config for this instance");
    }

    if (config.push && config.push.unitTestOnly) {
        apnConnection = {
            on: _.noop,
            pushNotification: _.noop
        };
        log.warn("PushMessaging: ios UNIT TEST MODE");
    } else if (config.push.appleApnCert && config.push.appleApnKey) {
        var options = {
            cert: config.push.appleApnCert,
            key: config.push.appleApnKey,
            production: config.push.appleApnIsProduction === 'true'
        };
        log.debug(options, "node-apn options");
        apnConnection = new apn.Connection(options);

        apnConnection.on('transmissionError', function (errorCode, notification, device) {
            if (errorCode === 8) {
                // this is an invalid token, we remove the device from the users profile
                log.info({
                    device: device.toString(),
                    notification: notification
                }, "invalid token found, removing from user");
                return _removeInvalidIosDevice(device, function (err, result) {
                    if (err) {
                        log.error({
                            err: err,
                            device: device.toString(),
                            notification: notification
                        }, "error trying to remove invalid iOS token device");
                    }
                    log.debug({result: result, device: device.toString()}, "remove device done");
                });
            } else {
                log.error({
                    err: _.findKey(apn.Errors, function (v, k) {
                        return v === parseFloat(errorCode);
                    }), errorCode: errorCode, device: device.toString(), notification: notification
                }, "error upon ios apn push transmission");
            }
        });

        apnConnection.on('transmitted', function (notification, device) {
            log.debug({
                notification: notification,
                device: device.toString()
            }, "ios notification sucessfully transmitted");
        });

        apnConnection.on('error', function (err) {
            log.error({err: err}, "error thrown on node-apn connection object");
        });

        log.info("PushMessaging: ios apple apn ENABLED");
        log.info("PushMessaging: ios apple apn ENABLED");
    } else {
        log.info("PushMessaging: ios apple apn messaging NOT enabled in config for this intance");
    }

    /////////////////////////////////////////////////////////////////////
    // internal helper functions

    function _translateData(translationData, i18n) {
        var myData = {};
        _.each(translationData, function (value, key) {
            if (key.indexOf('i18n' === 0)) {
                var strippedKey = _.camelCase(key.substring(4));
                myData[strippedKey] = i18n.t('general:' + strippedKey + '.' + value);
            } else {
                myData[key] = value;
            }
        });
        return myData;
    }

    /**
     * returns a personalized copy of the data for the intended recipient. Main purpose is to translate all i18n texts
     * of the message into the language of the user.
     *
     * Determines a user's preferred language and translates the message texts using the supplied dynamic
     * translation data. Any key of 'data' that s tarts with 'i18n...' is replaced with its translated value while
     * stripping the 'i18n'-Prefix from the key.
     *
     * While translating variables in the text-segments are replaced by values from translationData. The
     * recipient himself with his populated profile is added automatically to translationData to easily allow
     * targeted messages like 'Hello __user.firstname__' -> 'Hello John'.
     *
     * If a key in translationData starts with 'i18n' the dynamic value itself is passed through translation first.
     * This allows translated code/enum variables in segements, e.g.
     *
     * segment: 'Neuer Kommentar in Kategorie:  __category__'
     *
     * translationData: {i18nCategory: 'shopping'}
     *
     * translationSources.de: {
     * category: {
     *      shopping: 'Einkaufen',
     *      driving: 'Autofahren'
     * }}
     *
     * result:   'Neuer Kommenar in Kategorie: Einkaufen'
     *
     * @param data
     * @param user
     * @param translationData
     * @param cb
     * @private
     */
    function _personalizeData(data, user, translationData, cb) {
        var locale = _.get(user, 'profile.language') || _.get(config, 'i18n.fallbackLng', 'en');
        log.trace({user: user, locale: locale}, "using this locale");

        translationData = translationData || {};
        translationData.user = user.toJSON();

        i18n.setLng(locale, function (err, t) {
            if (err) {
                return cb(err);
            }
            var myData = _.clone(data);

            _.forEach(myData, function (value, key) {
                if (key.indexOf('i18n') === 0) {
                    delete myData[key];
                    myData[_.camelCase(key.substring(4))] = i18n.t(value, _translateData(translationData, i18n));
                }
            });
            cb(null, myData);
        });
    }

    function _removeInvalidIosDevice(iosDevice, cb) {
        var token = iosDevice.toString();
        mongoose.model('Profile').find({devices: {$elemMatch: {token: token}}}).exec(function (err, profiles) {
            if (err) {
                return cb(err);
            }
            async.forEach(profiles, function (profile, done) {
                return _removeDeviceFromUserProfile(profile, token, done);
            }, cb);
        });
    }

    function _removeDeviceFromUserProfile(profile, token, cb) {
        log.trace({token: token, profile: profile.toObject()}, "trying to remove device");
        _.forEach(profile.devices, function (device) {
            if (device && (device.token === token)) {
                log.trace({device: device.toObject()}, "found device to remove");
                device.remove();
            }
        });
        profile.save(function (err) {
            if (err) {
                return cb(err);
            }
            return cb(null, "invalidDevice, 'NotRegistered (Android)' or 'InvalidToken (iOS)', removed it from Db");
        });
    }

    ////////////////////////////////////////
    // Main entry point
    function sendPush(user, data, collapseKey, translationData, cb) {
        // this function takes one of those options as the first parameter
        // - an object or an array of objects of the following types:

        // a) an object Id of a user
        // b) a partial user object without a profile attribute
        // c) a full user object with an unpopulated profile
        // d) a full user object with populated profile

        // we need the full user object and the populated profile

        // we determine the type by looking at the first element


        if (_.isUndefined(cb)) {
            cb = translationData;
            translationData = undefined;
        }

        var firstUser = _.isArray(user) ? user[0] : user;

        if (!firstUser) {
            return cb(new Error('User is required'));
        } else if (!firstUser._id) {
            log.debug("sending push for user id only");

            // this is case a)
            var userIdArray = _.isArray(user) ? user : [user];
            mongoose.model('User')
                .find({_id: {$in: userIdArray}})
                .select('+profile')
                .populate('profile')
                .exec(function (err, populatedUsers) {
                    if (err) {
                        return cb(err);
                    }
                    return _sendPushWithPopulatedProfile(populatedUsers, data, collapseKey, translationData, cb);

                });
        } else if (!firstUser.profile) {
            log.debug("sending push for user without profile attr");
            // this is case b)
            var userArray = _.isArray(user) ? user : [user];
            var userIds = _.pluck(userArray, '_id');
            mongoose.model('User')
                .find({_id: {$in: userIds}})
                .select('+profile')
                .populate('profile')
                .exec(function (err, populatedUsers) {
                    if (err) {
                        return cb(err);
                    }
                    return _sendPushWithPopulatedProfile(populatedUsers, data, collapseKey, translationData, cb);
                });

        } else if (!firstUser.profile._id) {
            log.debug("sending push for user with populated profile");
            // this is case c)
            mongoose.model('Profile').populate(user, {path: 'profile'}, function (err, populatedUser) {
                if (err) {
                    return cb(err);
                }
                return _sendPushWithPopulatedProfile(populatedUser, data, collapseKey, translationData, cb);
            });

        } else {
            // this must be case d)
            log.debug("sending push for user with populated profile");
            return _sendPushWithPopulatedProfile(user, data, collapseKey, translationData, cb);
        }


        function _sendPushWithPopulatedProfile(userArray, data, collapseKey, translationData, cb) {

            userArray = _.isArray(userArray) ? userArray : [userArray];

            var devicesToPushTo = {
                android: {},
                ios: {}
            };

            var notificationsToSave = [];

            async.forEach(userArray, function (oneuser, asyncDone) {

                _.forEach(oneuser.profile.devices, function (device) {
                    if (device.deviceType === 'ios') {
                        devicesToPushTo.ios[device.token] = oneuser;
                    } else if (device.deviceType === 'android') {
                        devicesToPushTo.android[device.token] = oneuser;
                    } else {
                        return asyncDone(new Error('unkown deviceType: ' + device.deviceType));
                    }
                });

                mongoose.model('Notification').count({
                    owner: oneuser._id,
                    status: 'unread'
                }).exec(function (err, unreadCount) {
                    if (err) {
                        return asyncDone(err);
                    }
                    log.debug({unreadCount: unreadCount, user: oneuser.username}, 'Got unread notifications count');
                    _personalizeData(data, oneuser, translationData, function (err, myData) {
                        if (err) {
                            return asyncDone(err);
                        }
                        myData.unreadCount = unreadCount + 1;
                        oneuser.myData = myData;
                        log.trace({
                            user: oneuser.username,
                            locale: oneuser.profile.language,
                            myData: myData
                        }, "personalized Data for this user");

                        var myNotification = {
                            _id: mongoose.Types.ObjectId(),
                            gcmtype: myData.type,
                            title: myData.title,
                            description: myData.description || myData.message,
                            triggeringUser: myData.triggeringUser,
                            owner: oneuser._id,
                            data: myData,
                            expires: myData.expires
                        };
                        notificationsToSave.push(myNotification);
                        oneuser.notificationId = myNotification._id;
                        return asyncDone();
                    });
                });


            }, function (err) {
                if (err) {
                    return cb(err);
                }

                async.parallel([
                    _sendAndroidMessages.bind(null, devicesToPushTo.android),
                    _sendIosMessages.bind(null, devicesToPushTo.ios)
                ], function (err, results) {
                        if (err) {
                            return cb(err);
                        }
                        log.debug({notsToSave: notificationsToSave}, "saving notifications");
                        mongoose.model('Notification').create(notificationsToSave, function (err) {
                            if (err) {
                                return cb(err);
                            }
                            return cb(null, {android: results[0], ios: results[1]});
                        });
                });
            });
        }

        function _sendAndroidMessages(androidDevices, done) {
            if (!androidSender) {
                return done(null, {result: "android GCM  push not enabled on this server instance"});
            }

            if (_.keys(androidDevices).length === 0) {
                return done(null, {result: "no android devices found for this user"});
            }

            var androidResult = {
                sent: [],
                errored: 0
            };

            async.forEachOf(androidDevices, function (user, token, asyncCb) {
                var myData = user.myData;
                myData.notificationId = user.notificationId;

                var ttl = data.expires ? moment(data.expires).diff(moment(), 'seconds') : TIME_TO_LIVE;
                var message = new gcm.Message({
                    timeToLive: ttl,
                    delayWhileIdle: true,
                    collapseKey: collapseKey || 'messages',
                    data: myData
                });
                log.trace({data: myData, user: user.username || user.email || user.id}, "sending push message");
                return androidSender.send(message, token, NR_OF_RETRIES, function (err, result) {
                    if (err) {
                        return asyncCb(err);
                    }

                    if (result.failure > 0 && result.results[0].error === 'NotRegistered') {
                        log.trace(result, "android signaled a NotRegistred Error for this device, we remove it from the DB");
                        androidResult.errored++;
                        return _removeDeviceFromUserProfile(user.profile, token, asyncCb);
                    }
                    androidResult.sent.push(message);

                    log.trace({
                        result: result,
                        user: user.username || user.email || user.id
                    }, "android gcm push message(s) sent");
                    return asyncCb(null);
                });
            }, function (err) {
                return done(err, androidResult);
            });
        }


        function _sendIosMessages(iosDevices, done) {
            if (!apnConnection) {
                return done(null, {result: "ios push not enabled on this server instance"});
            }
            if (_.keys(iosDevices).length === 0) {
                return done(null, {result: "no ios devices found for this user"});
            }
            var result = {
                sent: 0,
                errored: 0
            };
            _.forEach(iosDevices, function (user, token) {
                var note = new apn.Notification();
                var myData = user.myData;
                myData.notificationId = user.notificationId;

                note.expiry = (myData.expires && Math.floor(data.expires / 1000)) || (Math.floor(Date.now() / 1000) + TIME_TO_LIVE);
                note.badge = myData.unreadCount || 1;
                note.alert = myData.message || myData.description;
                note.payload = myData;
                try {
                    var myDevice = new apn.Device(token);
                    apnConnection.pushNotification(note, myDevice);
                    result.sent++;
                } catch (err) {
                    log.info({
                        err: err,
                        token: token,
                        user: user.username || user.email || user.id
                    }, "PushNotification: Error while sending ios Push");
                    result.errored++;
                }

            });
            log.trace({
                result: result,
                user: userArray.username || userArray.email || userArray.id
            }, "ios apple push message(s) sent");
            return done(null, result);
        }


    }

    return {
        sendPush: sendPush
    };
};