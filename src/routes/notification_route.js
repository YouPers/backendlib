var mongoose = require('mongoose'),
    routes = require('./routes');

module.exports = function (swagger, config) {
    routes.addGenericRoutes(swagger, mongoose.model('Notification'), '/notifications', {accessLevel: 'al_user'});
};