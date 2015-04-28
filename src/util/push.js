var gcm = require('node-gcm');
var apn = require('apn');
var _ = require('lodash');
var error = require('./error');

module.exports = function (config) {
    var TIME_TO_LIVE = config.push.timeToLive || (60 * 60 * 24 * 4);
    var NR_OF_RETRIES = config.push.nrOfRetries || 4;
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

            log.error({err: _.findKey(apn.Errors, function(v,k) {return v===parseFloat(err);}) || err, token: token, msg: msg, info: info}, "error on ios apn push transmission");
        });

        log.info("PushMessaging: ios apple apn ENABLED");
    } else {
        log.info("PushMessaging: ios apple apn messaging NOT enabled in config");
    }

    function sendPush(user, data, collapseKey, cb) {

        if (!user || !user.profile || !user.profile._id) {
            return cb(new error.MissingParameterError('need user with populated profile to call push'));
        }

        // handle the android devices
        var androidRegistrationIds = user.profile && user.profile.devices ?
            _.chain(user.profile.devices)
                .filter(function (dev) {
                    return dev.deviceType === 'android';
                })
                .pluck('token')
                .value() : undefined;

        var iosDeviceTokens = user.profile && user.profile.devices ?
            _.chain(user.profile.devices)
                .filter(function (dev) {
                    return dev.deviceType === 'ios';
                })
                .pluck('token')
                .value() : undefined;


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
                note.badge = 3;
                note.alert = "\uD83D\uDCE7 \u2709 You have a new message";
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

    return {
        sendPush: sendPush
    };
};