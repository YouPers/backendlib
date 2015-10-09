var gcm = require('node-gcm');
var apn = require('apn');
var _ = require('lodash');
var mongoose = require('mongoose');
var moment = require('moment-timezone');
var async = require('async');

module.exports = function (config) {
    var i18n = require('../util/ypi18n')(config).initialize();

    var TIME_TO_LIVE = config.push.timeToLive || (60 * 60 * 24 * 4);
    var NR_OF_RETRIES = config.push.nrOfRetries || 2;
    var androidSender, apnConnection;
    var log = require('./log').getLogger(config);

    if (config.push && config.push.googlePushApiKey) {
        androidSender = new gcm.Sender(config.push.googlePushApiKey);
        log.info("PushMessaging: android GCM ENABLED");
    } else {
        throw new Error('cannot instantiate Push, google API Key not found in config');
    }

    if (config.push.appleApnCert && config.push.appleApnKey) {
        var options = {
            cert: config.push.appleApnCert,
            key: config.push.appleApnKey,
            production: config.push.appleApnIsProduction === 'true'
        };
        log.debug(options, "node-apn options");
        apnConnection = new apn.Connection(options);
        apnConnection.on('transmissionError', function(err, msg, token, info) {
            console.log(err);
            console.log(parseFloat(err));
            console.log(apn.Errors);
            console.log(_.findKey(apn.Errors, parseFloat(err)));

            log.error({err: _.findKey(apn.Errors, function(v,k) {return v===parseFloat(err);}) || err, tokenBuffer: token, msg: msg, info: info}, "error upon ios apn push transmission");
        });

        log.info("PushMessaging: ios apple apn ENABLED");
    } else {
        log.info("PushMessaging: ios apple apn messaging NOT enabled in config");
    }


    function _personalizeData(data, user, translationData, cb) {
        var locale = _.get(user, 'profile.language') || _.get(config, 'i18n.fallbackLng', 'en');
        log.trace({user: user, locale: locale}, "using this locale");

        translationData = translationData || {};
        translationData.user = user.toJSON();

        i18n.setLng(locale, function(err, t) {
            if (err) {
                return cb(err);
            }
            var myData = _.clone(data);

            _.forEach(myData, function(value, key) {
                if (key.indexOf('i18n') === 0) {
                    delete myData[key];
                    myData[_.camelCase(key.substring(4))] = i18n.t(value, translationData);
                }
            });
            cb(null, myData);
        });
    }

    function sendPush(user, data, collapseKey, translationData, cb) {
        // this function takes one of those options as the first parameter
        // an object or an array of objects of the following types:

        // a) an object Id of a user
        // b) a partial user object without a profile attribute
        // c) a full user object with an unpopulated profile
        // d) a full user object with populated profile

        // we need the full user object and the populated profile

        // we determine the type by looking at the first


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
            mongoose.model('Profile').populate(user, {path: 'profile'}, function(err, populatedUser) {
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


        function _sendPushWithPopulatedProfile(user, data, collapseKey, translationData, cb) {

            user = _.isArray(user) ? user : [user];

            var devices = {
                android: {},
                ios: {}
            };

            var notificationsToSave = [];


            async.forEach(user, function(oneuser, done){
                _.forEach(oneuser.profile.devices,function(device) {
                    if (device.deviceType === 'ios') {
                        devices.ios[device.token] = oneuser;
                    } else if (device.deviceType === 'android') {
                        devices.android[device.token] = oneuser;
                    } else {
                        return done(new Error('unkown deviceType: ' + device.deviceType));
                    }
                });

                _personalizeData(data, oneuser, translationData, function(err, myData) {
                    if (err) {
                        return done(err);
                    }
                    oneuser.myData = myData;
                    log.trace({user: oneuser.username, locale: oneuser.profile.language, myData: myData}, "personalized Data for this user");

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
                    return done();
                });
            }, function(err) {
                if (err) {
                    return cb(err);
                }
                _sendAndroidMessages(devices.android, _finalCb);

            });

            function _sendAndroidMessages(androidDevices, done) {
                if (_.keys(androidDevices).length === 0) {
                    return done(null, {result: "no android devices found for this user"});
                }

                _.forEach(androidDevices, function(user, token) {
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
                            return cb(err);
                        }
                        log.trace({result: result, user: user.username || user.email || user.id}, "android gcm push message(s) sent");
                        return done(null, result);
                    });
                });

            }

            function _sendIosMessages(iosDevices, done) {
                if (_.keys(iosDevices).length === 0) {
                    return done(null, {result: "no ios devices found for this user"});
                }
                var result = {
                    sent: 0,
                    errored: 0
                };
                _.forEach(iosDevices, function(user, token) {
                    var note = new apn.Notification();
                    var myData = user.myData;
                    myData.notificationId = user.notificationId;

                    note.expiry = (data.expires && Math.floor(data.expires/1000)) || (Math.floor(Date.now() / 1000) + TIME_TO_LIVE);
                    note.badge = data.badge || 1;
                    note.alert = data.message;
                    note.payload = myData;
                    try {
                        var myDevice =  new apn.Device(token);
                        apnConnection.pushNotification(note, myDevice);
                        result.sent++;
                    } catch (err) {
                        log.info({err: err, token: token, user: user.username || user.email || user.id}, "PushNotification: Error while sending ios Push");
                        result.errored++;
                    }

                });
                log.trace({result: result, user: user.username || user.email || user.id}, "ios apple push message(s) sent");
                return done(null, result);
            }

            function _finalCb(err, androidResult) {
                if (err) {
                    return cb(err);
                }
                if (apnConnection) {
                    _sendIosMessages(devices.ios, function(err, iosResult) {
                        if (err) {
                            return cb(err);
                        }
                        log.debug({notsToSave: notificationsToSave}, "saving notifications");
                        mongoose.model('Notification').create(notificationsToSave, function(err) {
                            if (err) {
                                return cb(err);
                            }
                            return cb(null, {android: androidResult, ios: iosResult});
                        });
                    });
                } else {
                    log.debug({notsToSave: notificationsToSave}, "saving notifications");
                    mongoose.model('Notification').create(notificationsToSave, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        return cb(null, {android: androidResult, ios: 'not enabled on server'});
                    });

                }
            }
        }

    }

    return {
        sendPush: sendPush
    };
};