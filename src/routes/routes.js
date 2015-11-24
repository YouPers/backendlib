var _ = require('lodash');
var generic = require('../handlers/generic');

function addGenericRoutes(swagger, model, baseUrl, options, config) {
    options = options ? options : {};
    _.defaults(options, {
        GET: true,
        GETall: true,
        PUT: true,
        POST: true,
        DELETE: true,
        DELETEall: true,
        modelName: model.modelName,
        accessLevel: 'al_user',
        fromAllOwners: false
    });

    var defaultGetParams = [
        generic.params.sort,
        generic.params.limit,
        generic.params.skip,
        generic.params.filter,
        generic.params.populate,
        generic.params.populatedeep
    ];


    var template = {
        spec: {
            description: 'Operations about ' + options.modelName + 's',
            accessLevel: options.accessLevel
        },
        action: undefined
    };
    var op;
    // adding GET all
    if (options.GETall) {
        op = _.clone(template);
        op.spec.method = 'GET';
        op.spec.path = baseUrl;
        op.spec.notes = 'returns all ' + options.modelName + 's';
        op.spec.summary = 'returns all ' + options.modelName + 's';
        op.spec.responseClass = 'Array[' + options.modelName + ']';
        op.spec.params = defaultGetParams;
        op.spec.nickname = 'getAll' + _.capitalize(options.modelName);
        op.action = generic.getAllFn(baseUrl, model, options.fromAllOwners, config);
        swagger.addOperation(op);
    }

    // adding GET all
    if (options.GET) {
        op = _.clone(template);
        op.spec.method = 'GET';
        op.spec.path = baseUrl + '/{id}';
        op.spec.notes = 'returns one ' + options.modelName + ' by id';
        op.spec.summary = 'returns one ' + options.modelName + ' by id';
        op.spec.responseClass = _.capitalize(options.modelName);
        op.spec.params = defaultGetParams;
        op.spec.nickname = 'getOne' + _.capitalize(options.modelName);
        op.action = generic.getByIdFn(baseUrl, model, options.fromAllOwners, config);
        swagger.addOperation(op);
    }

    // adding PUT
    if (options.PUT) {
        op = _.clone(template);

        op.spec.method = 'PUT';
        op.spec.path = baseUrl + '/{id}';
        op.spec.notes = 'updates the existing ' + options.modelName + ' with the passed attributes in the body';
        op.spec.summary = 'update a ' + options.modelName + ' by id';
        op.params = [
            swagger.pathParam('id', 'ID of the ' + options.modelName + ' to be updated', 'string'),
            swagger.bodyParam(options.modelName, "updated object", _.capitalize(options.modelName))];
        op.spec.responseClass = _.capitalize(options.modelName);
        op.spec.nickname = 'put' + _.capitalize(options.modelName);
        op.action = generic.putFn(baseUrl, model);
        swagger.addOperation(op);
    }

    // adding POST all
    if (options.POST) {
        op = _.clone(template);

        op.spec.method = 'POST';
        op.spec.path = baseUrl;
        op.spec.notes = 'creates a new ' + options.modelName + ' with the passed attributes in the body';
        op.spec.summary = 'creates a new ' + options.modelName;
        op.params = [
            swagger.bodyParam(options.modelName, "updated object", _.capitalize(options.modelName))];
        op.spec.responseClass = _.capitalize(options.modelName);
        op.spec.nickname = 'post' + _.capitalize(options.modelName);
        op.action = generic.postFn(baseUrl, model);
        swagger.addOperation(op);
    }


    // adding DELETE
    if (options.DELETE) {
        op = _.clone(template);

        op.spec.method = 'DELETE';
        op.spec.path = baseUrl + '/{id}';
        op.spec.notes = 'deletes the existing ' + options.modelName + ' by id';
        op.spec.summary = 'delete a ' + options.modelName + ' by id';
        op.params = [
            swagger.pathParam('id', 'ID of the ' + options.modelName + ' to be updated', 'string')];
        op.spec.nickname = 'delete' + _.capitalize(options.modelName);

        // only allow al_admin to delete objects, if not explicitly specified differenty
        op.spec.accessLevel = options.accessLevelDelete || 'al_admin';
        op.action = generic.deleteByIdFn(baseUrl, model);
        swagger.addOperation(op);
    }

    // adding DELETE
    if (options.DELETEall) {
        op = _.clone(template);

        op.spec.method = 'DELETE';
        op.spec.path = baseUrl;
        op.spec.notes = 'deletes all ' + options.modelName + 's owned by this user. If user has sysadm role: deletes all';
        op.spec.summary = 'delete all owned' + options.modelName + 's';
        op.spec.nickname = 'deleteAll' + _.capitalize(options.modelName);
        // only allow al_admin to delete objects, if not explicitly specified differenty
        op.spec.accessLevel = options.accessLevelDelete || 'al_admin';
        op.action = generic.deleteAllFn(baseUrl, model);
        swagger.addOperation(op);
    }
}


module.exports = {
    addGenericRoutes: addGenericRoutes
};