var gcm = require('node-gcm');
var apn = require('apn');
var _ = require('lodash');
var mongoose = require('mongoose');

module.exports = function (config) {
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
            key: config.push.appleApnKey
        };
        apnConnection = new apn.Connection(options);
        apnConnection.on('transmissionError', function(err, msg, token, info) {
            console.log(err);
            console.log(parseFloat(err));
            console.log(apn.Errors);
            console.log(_.findKey(apn.Errors, parseFloat(err)));

            log.error({err: _.findKey(apn.Errors, function(v,k) {return v===parseFloat(err);}) || err, token: token, msg: msg, info: info}, "error upon ios apn push transmission");
        });

        log.info("PushMessaging: ios apple apn ENABLED");
    } else {
        log.info("PushMessaging: ios apple apn messaging NOT enabled in config");
    }

    function sendPush(user, data, collapseKey, cb) {
        // this function takes one of those options as the first parameter
        // an object or an array of objects of the following types:

        // a) an object Id of a user
        // b) a partial user object without a profile attribute
        // c) a full user object with an unpopulated profile
        // d) a full user object with populated profile

        // we need the full user object and the populated profile

        // we determine the type by looking at the first

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
                    return _sendPushWithPopulatedProfile(populatedUsers, data, collapseKey, cb);

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
                    return _sendPushWithPopulatedProfile(populatedUsers, data, collapseKey, cb);
                });

        } else if (!firstUser.profile._id) {
            log.debug("sending push for user with populated profile");
            // this is case c)
            mongoose.model('Profile').populate(user, {path: 'profile'}, function(err, populatedUser) {
                if (err) {
                    return cb(err);
                }
                return _sendPushWithPopulatedProfile(populatedUser, data, collapseKey, cb);
            });

        } else {
            // this must be case d)
            log.debug("sending push for user with populated profile");
            return _sendPushWithPopulatedProfile(user, data, collapseKey, cb);
        }


        function _sendPushWithPopulatedProfile(user, data, collapseKey, cb) {

            user = _.isArray(user) ? user : [user];

            // handle the android devices
            var androidRegistrationIds =
                _.chain(user)
                    .pluck('profile')
                    .pluck('devices')
                    .flatten()
                    .filter(function (dev) {
                        return dev.deviceType === 'android';
                    })
                    .pluck('token')
                    .value();

            var iosDeviceTokens =
                _.chain(user)
                    .pluck('profile')
                    .pluck('devices')
                    .flatten()
                    .filter(function (dev) {
                        return dev.deviceType === 'ios';
                    })
                    .pluck('token')
                    .value();

            function _sendAndroidMessages(androidRegistrationIds, done) {
                if (androidRegistrationIds && androidRegistrationIds.length > 0) {
                    var message = new gcm.Message({
                        timeToLive: TIME_TO_LIVE,
                        delayWhileIdle: true,
                        collapseKey: collapseKey || 'messages',
                        data: data
                    });
                    log.trace({data: data, user: user.username || user.email || user.id}, "sending push message");
                    return androidSender.send(message, androidRegistrationIds, NR_OF_RETRIES, function (err, result) {
                        if (err) {
                            return cb(err);
                        }
                        log.trace({result: result, user: user.username || user.email || user.id}, "android gcm push message(s) sent");
                        return done(null, result);
                    });
                } else {
                    return done(null, {result: "no android devices found for this user"});
                }
            }

            function _sendIosMessages(iosDeviceTokens, done) {
                if (iosDeviceTokens && iosDeviceTokens.length > 0) {
                    var note = new apn.Notification();

                    note.expiry = Math.floor(Date.now() / 1000) + TIME_TO_LIVE;
                    note.badge = data.badge || 1;
                    note.alert = data.message;
                    note.payload = data;
                    var result = {
                        sent: 0,
                        errored: 0
                    };

                    _.forEach(iosDeviceTokens, function(token) {

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
                } else {
                    return done(null, {result: 'no ios devices found for this user'});
                }
            }


            _sendAndroidMessages(androidRegistrationIds, function(err, androidResult) {
                if (err) {
                    return cb(err);
                }
                if (apnConnection) {
                    _sendIosMessages(iosDeviceTokens, function(err, iosResult) {
                        if (err) {
                            return cb(err);
                        }
                        return cb(null, {android: androidResult, ios: iosResult});
                    });
                } else {
                    return cb(null, {android: androidResult, ios: 'not enabled on server'});
                }
            });
        }

    }

    return {
        sendPush: sendPush
    };
};