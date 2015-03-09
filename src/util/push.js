var gcm = require('node-gcm');
var _ = require('lodash');
var error = require('./error');

module.exports = function(config) {
    var TIME_TO_LIVE = config.push.timeToLive || (60*60*24*4);
    var NR_OF_RETRIES = config.push.nrOfRetries || 4;
    var androidSender;
    var log = require('./log').getLogger(config);

    if (config.push && config.push.googlePushApiKey) {
        androidSender = new gcm.Sender(config.push.googlePushApiKey);
    } else {
        throw new Error('cannot instantiate Push, google API Key not found in config');
    }

    function sendPush(user, data, collapseKey, cb) {

        if (!user || !user.profile) {
            return cb(error.MissingParameterError('need user with populated profile to call push'));
        }
        var message = new gcm.Message({
            timeToLive: TIME_TO_LIVE,
            delayWhileIdle: true,
            collapseKey: collapseKey || 'messages',
            data: data
        });

        var androidRegistrationIds = user.profile && user.profile.devices ?
            _.chain(user.profile.devices)
                .filter(function(dev) {return dev.deviceType === 'android';})
                .pluck('token')
                .value() : undefined;

        if (androidRegistrationIds && androidRegistrationIds.length > 0) {
            log.trace({data: data, user: user.username || user.email || user.id},"sending push message");
            return androidSender.send(message, androidRegistrationIds, NR_OF_RETRIES, function (err, result) {
                if (err) {
                    return cb(err);
                }
                log.trace({result: result},"push message sent");
                return cb(null, result);
            });
        } else {
            return cb(null, {result: "no android devices found for this user"});
        }
    }

    return {
        sendPush: sendPush
    };
};