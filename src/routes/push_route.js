var mongoose = require('mongoose'),
    User = mongoose.model('User'),
    generic = require('../handlers/generic'),
    error = require('../util/error');

module.exports = function (swagger, config) {

    var pushSender = require('../util/push')(config);
    baseUrl = '/push',


    swagger.addOperation({
        spec: {
            description: "send an example push notification",
            path: baseUrl,
            summary: "initiates push notifications to all devices registered for this user",
            method: "POST",
            params: [
                swagger.bodyParam("data", "data to be pushed", "{}")
            ],
            "nickname": "push",
            accessLevel: 'al_user'
        },
        action: function(req, res, next) {
            pushSender.sendPush(req.user, req.body, req.params.collapseKey || 'defaultCollapseKey', function(err, result) {
                if (err) {
                    return error.handleError(err, next);
                }
                res.send(result);
                return next();
            })
        }

    });
}