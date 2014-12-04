var mongoose = require('mongoose'),
    _ = require('lodash'),
    swagger = require("swagger-node-restify");


var initialize = function initialize(config, customModels, customModelPath, modelFileExtension, schemaFileExtension, schemaExtensions) {

    var modelFileExt = modelFileExtension || '_model';
    var schemaFileExt = schemaFileExtension || '_schema';

    // create models from schema
    function _createAndLoadModels(path, schemaNames) {
        _.forEach(schemaNames, function (schemaName) {
            var schema = require(path + '/' + schemaName + schemaFileExt);
            if(schemaExtensions && schemaExtensions[schemaName]) {
                _.merge(schema, schemaExtensions[schemaName]);
            }
            var modelName = schemaName.charAt(0).toUpperCase() + schemaName.slice(1);
            var model = mongoose.model(modelName, schema);
            if (model.getSwaggerModel) {
                swagger.addModels(model.getSwaggerModel());
            }
        });
    }

    // load models
    function _loadModels(modelPath, modelNames) {
        _.forEach(modelNames, function (modelName) {
            console.log("Loading model: "+modelName + " from: " + modelPath + '/' + modelName + modelFileExt);
            var model = require(modelPath + '/' + modelName + modelFileExt);
            if (model.getSwaggerModel) {
                swagger.addModels(model.getSwaggerModel());
            }
        });
    }


    if (mongoose.connection.readyState === 0) {
        // Setup Database Connection
        var connectStr = config.db_prefix + '://';
        if (config.db_user && config.db_password && config.db_user !== 'None' && config.db_password !== 'None') {
            connectStr += config.db_user + ':' + config.db_password + '@';
        }
        connectStr += config.db_host + ':' + config.db_port + '/' + config.db_database;

        console.log(connectStr);
        mongoose.connect(connectStr, {server: {auto_reconnect: true}});


        // load common models
        var commonPath = __dirname + '/models/';
        var commonModelNames = ['profile', 'user'];

        _createAndLoadModels(commonPath, commonModelNames);
        _loadModels(customModelPath, customModels);
    }

    return mongoose;
};

module.exports = {
    initialize: initialize
};