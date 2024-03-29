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
            if (schemaExtensions && schemaExtensions[schemaName]) {

                if (schemaExtensions[schemaName].properties) {
                    schema.add(schemaExtensions[schemaName].properties);
                }

                if (schemaExtensions[schemaName].statics) {
                    _.forEach(schemaExtensions[schemaName].statics, function (value, key) {
                        schema.statics[key] = value;
                    });
                }
                if (schemaExtensions[schemaName].hooks) {
                    _.forEach(schemaExtensions[schemaName].hooks, function (value, hookType) {
                        _.forEach(value, function (methods, hookName) {
                            if (!_.isArray(methods)) {
                                methods = [methods];
                            }
                            _.forEach(methods, function (method) {
                                if (hookType === 'pre') {
                                    schema.pre(hookName, method);
                                } else if (hookType === 'post') {
                                    schema.post(hookName, method);
                                } else {
                                    throw new Error('unsupported hook type: ' + hookType);
                                }
                            });
                        });
                    });
                }
            }
            var modelName = schemaName.charAt(0).toUpperCase() + schemaName.slice(1);
            console.log("Loading model: " + modelName + " from: " + path + '/' + modelName);
            var model = mongoose.model(modelName, schema);
            if (model.getSwaggerModel) {
                swagger.addModels(model.getSwaggerModel());
            }
        });
    }

    // load models
    function _loadModels(modelPath, modelNames) {
        _.forEach(modelNames, function (modelName) {
            console.log("Loading model: " + modelName + " from: " + modelPath + '/' + modelName + modelFileExt);
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
        var commonModelNames = ['profile', 'user', 'deletejournal', 'batchReport', 'notification'];

        _createAndLoadModels(commonPath, commonModelNames);
        _loadModels(customModelPath, customModels);
    }

    return mongoose;
};

module.exports = {
    initialize: initialize
};