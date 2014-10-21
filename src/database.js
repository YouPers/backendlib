var mongoose = require('mongoose'),
    _ = require('lodash'),
    swagger = require("swagger-node-restify");


var initialize = function initialize(config, customModels, customModelPath, extension) {

    var ext = extension || '_model';

    if (mongoose.connection.readyState === 0) {
        // Setup Database Connection
        var connectStr = config.db_prefix + '://';
        if (config.db_user && config.db_password && config.db_user !== 'None' && config.db_password !== 'None') {
            connectStr += config.db_user + ':' + config.db_password + '@';
        }
        connectStr += config.db_host + ':' + config.db_port + '/' + config.db_database;

        console.log(connectStr);
        mongoose.connect(connectStr, {server: {auto_reconnect: true}});

        // load custom models
        function _loadModels(modelPath, modelNames) {
            _.forEach(modelNames, function (modelName) {
                console.log("Loading model: "+modelName + " from: " + modelPath + '/' + modelName + ext);
                var model = require(modelPath + '/' + modelName + ext);
                if (model.getSwaggerModel) {
                    swagger.addModels(model.getSwaggerModel());
                }
            });
        }

        // load common models
        var commonPath = __dirname + '/models/';
        var commonModelNames = ['profile', 'user'];

        _loadModels(commonPath, commonModelNames);
        _loadModels(customModelPath, customModels)
    }

    return mongoose;
};

module.exports = {
    initialize: initialize
};