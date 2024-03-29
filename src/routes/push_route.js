var error = require('../util/error');

module.exports = function (swagger, config) {

    var pushSender = require('../util/push')(config);
    var baseUrl = '/push';


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
                    req.log.error({err: err}, 'error sending push message');
                    return error.handleError(err, next);
                }
                res.send(result);
                return next();
            });
        }

    });
};