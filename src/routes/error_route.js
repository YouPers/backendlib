/**
 * Error Routes module
 *    log errors posted by the client
 */

var error = require('../util/error');


module.exports = function (swagger, config) {
    var baseUrl = '/error';

    swagger.addModels({
        ErrorObject: {
            id: "ErrorObject",
            required: [],
            properties: {
                message: {type: "string"},
                code: {type: "string"},
                stacktrace: {type: "string"}
            }
        }
    });

    swagger.addOperation({
        spec: {
            description: "Post errors",
            path: baseUrl,
            notes: "log errors posted by the client",
            summary: "Post errors experienced on a client to be logged on the server. Allows passing an Error Object in the body in JSON format.",
            method: "POST",
            params: [swagger.bodyParam("error", "error object", "ErrorObject")],
            errorResponses: [],
            nickname: "postError",
            accessLevel: "al_all"
        },
        action: function (req, res, next) {

            if(!req.body) {
                next(new error.MissingParameterError({ required: 'error object'}));
            }

            var errorObj = req.body;

            var options = {
                type: 'client',
                user: req.user.id,
                username: req.user.username
            };
            req.log.child(options).error(errorObj, 'CLIENT error posted to /errors');

            res.send(200);
            return next();
        }
    });

};