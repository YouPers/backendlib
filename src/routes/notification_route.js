var mongoose = require('mongoose'),
    routes = require('./routes'),
    generic = require('../handlers/generic'),
    error = require('../util/error');

module.exports = function (swagger, config) {

    var baseUrl = '/notifications';

    var model = mongoose.model('Notification');

    swagger.addOperation({
        spec: {
            description: "mark notifications as read",
            path: baseUrl + '/markAsRead',
            summary: "marks all notifications belonging to the passed in gcmTypes as read",
            notes: "pass in the gcmTypes to mark as read as comma separated list",
            method: "PUT",
            params: [
                swagger.queryParam("gcmtype", "the typ of notification to mark as read, use comma separation for multiple", "{}"),
            ],
            "nickname": "markNotfications as read",
            accessLevel: 'al_user'
        },
        action: function(req, res, next) {
            if (!req.params.gcmtype) {
                return next(new error.MissingParamterError("query parameter gcmtype is required"));
            }
            model.update({gcmtype: {$in: req.params.gcmtype.split(',')}}, {status: 'read'}, {multi: true }, generic.writeObjCb(req, res, next));
        }

    });

    routes.addGenericRoutes(swagger, model, baseUrl, {accessLevel: 'al_user'});
};