var gcm = require('node-gcm');
var _ = require('lodash');


module.exports = function(config) {
    var TIME_TO_LIVE = config.push.timeToLive || (60*60*24*4);
    var NR_OF_RETRIES = config.push.nrOfRetries || 4;
    var androidSender;
    if (config.push && config.push.googlePushApiKey) {
        androidSender = new gcm.Sender(config.push.googlePushApiKey);
    } else {
        throw new Error('cannot instantiate Push, google API Key not found in config');
    }

    function sendPush(user, data, collapseKey, cb) {
        var message = new gcm.Message({
            timeToLive: TIME_TO_LIVE,
            delayWhileIdle: true,
            collapseKey: collapseKey || 'messages',
            data: data
        });

        var androidRegistrationIds =
            _.chain(user.profile.devices)
                .filter(function(dev) {return dev.deviceType === 'android'})
                .pluck('token')
                .value();

        if (androidRegistrationIds && androidRegistrationIds.length > 0) {
            return androidSender.send(message, androidRegistrationIds, NR_OF_RETRIES, cb);
        } else {
            return cb(null, {result: "no android devices found for this user"});
        }
    }

    return {
        sendPush: sendPush
    }
}