var error = require('../util/error'),
    _ = require('lodash'),
    mongoose = require('mongoose'),
    ObjectId = mongoose.Schema.ObjectId,
    handlerUtils = require('./handlerUtils'),
    auth = require('../util/auth');

////////////////////////////////////
// helper functions

function _localeToUse(reqLocale, config) {
    var supportedLocales = (config && config.i18n && config.i18n.supportedLngs) || ['en', 'de', 'fr', 'it'];
    var fallbackLanguage = (config && config.i18n && config.i18n.fallbackLng) || 'en';
    if (!reqLocale || reqLocale.length < 2) {
        return fallbackLanguage;
    }

    if (_.contains(supportedLocales, reqLocale)) {
        return reqLocale;
    }

    var reqLocaleShort = reqLocale.substring(0, 2);
    if (_.contains(supportedLocales, reqLocaleShort)) {
        return reqLocaleShort;
    }

    return fallbackLanguage;
}


var isF = function (o) {
    for (var i = 1, l = arguments.length; i < l; i++) {
        var v = arguments[i];
        if (!(_.isFunction(v) || _.isFunction(o[v]))) {
            return false;
        }
    }
    return true;
};

var hasProp = function (o) {
    var has = [];
    for (var i = 1, l = arguments.length; i < l; i++) {
        var v = arguments[i];
        if (!_.isUndefined(o[v])) {
            has.push(v);
        }
    }
    return has.length && has;
};

var flatten = function (target, optsArg) {
    var output = {},
        opts = optsArg || {},
        delimiter = opts.delimiter || '.';

    function getkey(key, prev) {
        return prev ? prev + delimiter + key : key;
    }

    function step(object, prev) {
        Object.keys(object).forEach(function (key) {
            var isarray = opts.safe && Array.isArray(object[key]),
                type = Object.prototype.toString.call(object[key]),
                isobject = (type === "[object Object]" || type === "[object Array]");

            if (!isarray && isobject) {
                return step(object[key], getkey(key, prev));
            }

            output[getkey(key, prev)] = object[key];
        });
    }

    step(target);

    return output;
};

function split(val, delim, ret) {
    ret = ret || [];
    delim = delim || ',';
    if (!val) {
        return ret;
    }
    if (Array.isArray(val)) {
        val.forEach(function (v) {
            split(v, delim, ret);
        });
    } else {
        val.split(delim).forEach(function (v) {
            ret.push(v);
        });
    }
    return ret;
}


// query options

var _addPopulation = function (queryparams, dbquery, locale) {
    // check whether our dbquery supports population
    if (!(dbquery && dbquery.populate && isF(dbquery, 'populate'))) {
        return dbquery;
    }

    var schema = dbquery && dbquery.model && dbquery.model.schema;

    //handle array style populate.
    if (Array.isArray(queryparams.populate) || typeof queryparams.populate === 'string') {
        _populate(schema, dbquery, split(queryparams.populate), locale);
    } else {
        //handle object style populate.
        _.each(queryparams.populate, function (v, k) {
            _populate(schema, dbquery, flatJoin(v), locale);
        });
    }
    delete queryparams.populate;
    return dbquery;
};

//mongoose throws an exception if you try and populate an non ObjectID
// this is suppose to guard against that. See if we can fix it.
function _populate(schema, dbquery, paths, locale) {
    paths = Array.isArray(paths) ? paths : [paths];
    var modelName;
    var selector;
    for (var i = paths.length; i--;) {
        var p = paths[i];

        var pparts = p.split(' ');
        for (var j = pparts.length; j--;) {
            p = pparts[j];

            if (schema && schema.path) {
                // TODO: (RBLU) Don't know why this check is here. Disable this check because it breaks population of deep porperties like 'events.comments', Fix later
                // if (ref && (ref.instance && ref.instance === 'ObjectID' || ref.caster && ref.caster.instance === 'ObjectID')) {

                // reset the variables, otherwise they keep the values from the previous iteration
                modelName = undefined;
                selector = undefined;

                var ref = schema.path(p);
                var isObjectRef = ref && ref.options && ref.options.type && !_.isArray(ref.options.type);
                if (isObjectRef) {
                    modelName = ref.options.ref;
                }
                var isArrayRef = _.isArray(ref && ref.options && ref.options.type);
                if (isArrayRef) {
                    modelName = ref.options.type[0].ref;
                }
                if (modelName) {
                    selector = mongoose.model(modelName).getI18nPropertySelector && mongoose.model(modelName).getI18nPropertySelector(locale);
                }
                if (selector) {
                    dbquery.populate(p, selector);
                } else {
                    dbquery.populate(p);
                }
                //}
            } else {
                dbquery.populate(p);
            }
        }
    }
}

function flatJoin(v) {
    var splits = split(v), ret = [];
    for (var i = splits.length; i--;) {
        ret.push(v + '.' + splits[i]);
    }
    return ret;
}

function addOp(str, isString, type) {
    var op, val;
    if (str[0] === '<') {
        if (str[1] === '<') {
            op = '$lt';
            val = str.substring(2);
        } else {
            op = '$lte';
            val = str.substring(1);
        }
    } else if (str[0] === '>') {
        if (str[1] === '>') {
            op = '$gt';
            val = str.substring(2);
        } else {
            op = '$gte';
            val = str.substring(1);
        }
    } else if (str[0] === '*') {
        if (str[1] === '!') {
            op = '$exists';
            val = false;
        } else {
            op = '$exists';
            val = true;
        }
    } else if (str[0] === '!') {
        if (isString) {
            op = '$not';
            val = new RegExp(str.substring(1), 'i');
        } else {
            op = '$ne';
            val = str.substring(1);

        }
    } else if (type === ObjectId) {
        op = '$eq';
        if (!mongoose.Types.ObjectId.isValid(str)) {
            throw new error.InvalidArgumentError('the value "' + str + '" is not a valid ObjectId. Use a valid ObjectId to filter for this porperty');
        }
        val = new ObjectId(str);
    } else if (isString) {
        op = '$regex';
        val = new RegExp(str, 'i');
    } else {
        op = '$eq';
        val = str;
    }

    var query = {};
    query[op] = val;
    return query;
}

var _addPagination = function (queryparams, dbquery) {
    // pagination

    if (!queryparams) {
        return dbquery;
    }
    // check wheter our dbquery object supports skip and limit functions
    if (!isF(dbquery, 'skip', 'limit')) {
        return dbquery;
    }
    // max limit = 1000, default for limit (when called without value = 100)
    var limit = Math.min(queryparams && queryparams.limit && 0 + queryparams.limit || 100, 1000);
    var skip = queryparams && queryparams.skip || 0;
    if (queryparams) {
        // remove limit and skip because we have handled them
        delete queryparams.limit;
        delete queryparams.skip;
    }
    return dbquery.skip(skip).limit(limit);
};


var _addSort = function (queryparams, dbquery) {
    if (!(queryparams && queryparams.sort && isF(dbquery, 'sort'))) {
        return dbquery;
    }
    split(queryparams.sort).forEach(function (v, k) {
        var parts = v.split(':', 2);
        if (parts.length === 1) {
            parts.push(1);
        }
        var _s = {};
        _s[parts[0]] = parts[1];
        dbquery.sort(_s);
    });

    delete queryparams.sort;
    return dbquery;
};


var _addFilter = function (queryParams, dbquery, Model) {

    if (!(hasProp(queryParams, 'filter', '-filter', '+filter')) && isF(dbquery, 'or', 'nor', 'and')) {
        return dbquery;
    }

    _.each(flatten(queryParams.filter), function (queryValue, queryProperty) {
        var ret = /^([+,-])?(.*)/.exec(queryProperty);

        // our flatten function is using keys like "propname.0" and "propname.1" if there are multiple
        // filter clauses for the same property name. With this we get rid of the .x part
        ret[2] = ret[2].split('.')[0];

        // translate the 'id' we use clientSide into the '_id' we use serverSide
        if (ret[2] === 'id') {
            ret[2] = '_id';
        }
        var p = Model.schema.path(ret[2]);
        var type = p && p.options && p.options.type;
        var method;
        switch (ret[1]) {
            case '+':
                method = 'and';
                break;
            case '-':
                method = 'nor';
                break;
            default:
                method = 'where';
        }

        if (type === ObjectId && queryValue[0] !== '*') {
            var qp = {};
            var multipleValues = queryValue.split(',');

            if (multipleValues.length > 1) {
                qp[ret[2]] = {
                    $in: _.map(multipleValues, function (val) {
                        if (!mongoose.Types.ObjectId.isValid(val)) {
                            throw new error.InvalidArgumentError('the value "' + val + '" is not a valid ObjectId. Use a valid ObjectId to filter for this porperty');
                        }
                        return mongoose.Types.ObjectId(val);
                    })
                };
            } else {
                if (queryValue[0] === '!') {
                    var oidString = queryValue.substring(1);
                    if (!mongoose.Types.ObjectId.isValid(oidString)) {
                        throw new error.InvalidArgumentError('the value "' + oidString + '" is not a valid ObjectId. Use a valid ObjectId to filter for this porperty');
                    }
                    qp[ret[2]] = {$ne: oidString};
                } else {
                    if (!mongoose.Types.ObjectId.isValid(queryValue)) {
                        throw new error.InvalidArgumentError('the value "' + queryValue + '" is not a valid ObjectId. Use a valid ObjectId to filter for this porperty');
                    }
                    qp[ret[2]] = queryValue;
                }

            }
            dbquery = dbquery[method](qp);
        } else {
            var myOp = addOp(queryValue, String === type || 'String' === type, type);
            var clause = {};
            clause[ret[2]] = myOp;
            dbquery = dbquery[method](clause);
        }
        // console.log(' v',v,' k',k,' ',obj);

    });
    return dbquery;
};

var processDbQueryOptions = function (queryOptions, dbquery, Model, locale) {
    dbquery = _addPagination(queryOptions, dbquery);
    dbquery = _addPopulation(queryOptions, dbquery, locale);
    dbquery = _addSort(queryOptions, dbquery);
    dbquery = _addFilter(queryOptions, dbquery, Model);
    return dbquery;
};

var processStandardQueryOptions = function (req, dbquery, Model, config) {
    if (req.user && auth.isAdminForModel(req.user, Model) && Model.adminAttrsSelector) {
        dbquery.select(Model.adminAttrsSelector);
    }

    if (Model.getI18nPropertySelector) {
        dbquery.select(Model.getI18nPropertySelector(_localeToUse(req.locale, config)));
    }

    if (req.params.updatesSince) {
        // this is a synchingRequest, so we
        // - only need updates from the timestamp they were requested
        // - need to include the deletes
        var updatedClause = {updated: {$gte: req.params.updatesSince}};
        dbquery.where(updatedClause);

        // set the modelName on the request so we can use it in the post processing:
        // see generic.sendListCb()
        req.modelName = Model.modelName;
    }

    return processDbQueryOptions(req.query, dbquery, Model, req.locale);
};

/**
 * does population of properties for deep paths ("deep" meaning 3 or more Schemas involved)
 * inspired from here: https://gist.github.com/joeytwiddle/6129676
 *
 * @param doc
 * @param pathListString
 * @param options
 * @param callback
 */
function deepPopulate(doc, pathListString, options, callback) {
    var listOfPathsToPopulate = _.isArray(pathListString) ? pathListString : pathListString.split(/[\s,]+/);

    function doNext() {
        if (listOfPathsToPopulate.length === 0) {
// Now all the things underneath the original doc should be populated. Thanks mongoose!
            callback(null, doc);
        } else {
            var nextPath = listOfPathsToPopulate.shift();
            var pathBits = nextPath.split(".");

            // iterate over all documents and get Subdocuments to Populate, in case we get only a doc instead of array
            // create a fake array
            var listOfDocsToPopulate = [];
            _.forEach(Array.isArray(doc) ? doc : [doc], function (docEntry) {
                var items = resolveDocumentzAtPath(docEntry, pathBits.slice(0, -1));
                listOfDocsToPopulate = listOfDocsToPopulate.concat(items);
            });
            if (listOfDocsToPopulate.length > 0) {
                var lastPathBit = pathBits[pathBits.length - 1];
                // There is an assumption here, that desendent documents which share the same path will all have the same model!
                // If not, we must make a separate populate request for each doc, which could be slow.
                var model = listOfDocsToPopulate[0].constructor;
                var pathRequest = [
                    {
                        path: lastPathBit,
                        options: options
                    }
                ];
                model.populate(listOfDocsToPopulate, pathRequest, function (err, results) {
                    if (err) {
                        return callback(err);
                    }
                    // set the $locale on the populated docs, so they are displayed in the correct locale
                    _.each(results, function (obj) {
                        if (_.isArray(obj[lastPathBit])) {
                            _.each(obj[lastPathBit], function (o) {
                                o.$locale = options.locale;
                            });
                        } else {
                            obj[lastPathBit].$locale = options.locale;
                        }
                    });
                    doNext();
                });
            } else {
                // There are no docs to populate at this level.
                doNext();
            }
        }
    }

    doNext();
}

function resolveDocumentzAtPath(doc, pathBits) {
    if (pathBits.length === 0) {
        return [doc];
    }

    var resolvedSoFar = [];
    var firstPathBit = pathBits[0];
    var resolvedField = doc[firstPathBit];
    if (resolvedField === undefined || resolvedField === null) {
// There is no document at this location at present
    } else {
        if (Array.isArray(resolvedField)) {
            resolvedSoFar = resolvedSoFar.concat(resolvedField);
        } else {
            resolvedSoFar.push(resolvedField);
        }
    }

    var remainingPathBits = pathBits.slice(1);
    if (remainingPathBits.length === 0) {
        return resolvedSoFar; // A redundant check given the check at the top, but more efficient.
    } else {
        var furtherResolved = [];
        resolvedSoFar.forEach(function (subDoc) {
            var deeperResults = resolveDocumentzAtPath(subDoc, remainingPathBits);
            furtherResolved = furtherResolved.concat(deeperResults);
        });
        return furtherResolved;
    }
}


var sendListCb = function (req, res, next) {
    return function (err, objList) {
        if (err) {
            return error.handleError(err, next);
        }
        if (!objList || objList.length === 0) {
            res.send([]);
            return next();
        }
        if (req.query && req.query.populatedeep) {
            deepPopulate(objList, req.query.populatedeep, {locale: req.locale}, function (err, result) {
                if (err) {
                    return error.handleError(err, next);
                }
                res.send(result);
                return next();
            });
        } else if (req.params.updatesSince) {
            // this is a sync request, so we include the deletes
            var updatedClause = {deleted: {$gte: req.params.updatesSince}};

            // req.modelName is set in the generic.processStandardQueryOptions() method
            mongoose.model('Deletejournal')
                .find({model: req.modelName})
                .where(updatedClause)
                .exec(function (err, deletes) {
                    res.send(objList.concat(deletes));
                    return next();
                });
        } else {
            res.send(objList);
            return next();
        }
    };
};

var writeObjCb = function (req, res, next) {
    return function (err, savedObject) {
        if (err) {
            return error.handleError(err, next);
        }
        var responseCode = 200;
        if (req.method === 'POST') {
            res.header('Location', req.url + '/' + savedObject._id);
            responseCode = 201;
        }
        res.send(responseCode, savedObject);
        return next();
    };
};


function getByIdFn(baseUrl, Model, allowNonOwner, config) {
    return function getByIdFn(req, res, next) {
        var objId;
        try {
            objId = new mongoose.Types.ObjectId(req.params.id);
        } catch (err) {
            return next(new error.InvalidArgumentError({id: req.params.id}));
        }

        var dbQuery = Model.findById(objId);

        processStandardQueryOptions(req, dbQuery, Model, config)
            .exec(function getByIdFnCallback(err, obj) {
                if (err) {
                    return error.handleError(err, next);
                }
                if (!obj) {
                    return next(new error.ResourceNotFoundError());
                }
                var isOwnedObj = Model.schema.paths['owner'];

                var isOwner = false;
                //check if the object has an owner and whether the current user owns the object
                if (obj.owner) {
                    var ownerId = obj.owner._id || obj.owner;
                    if (ownerId.equals(req.user._id)) {
                        isOwner = true;
                    }
                }

                var isJoiner = false;
                // check if this is a obj that can be joined and whether the current user is joiner
                if (obj.joiningUsers) {
                    isJoiner = _.find(obj.joiningUsers, function (joiningUser) {
                        return (joiningUser._id || joiningUser).equals(req.user._id);
                    });
                }

                if (isOwnedObj && !isOwner && !isJoiner && !allowNonOwner) {
                    return next(new error.NotAuthorizedError('Authenticated User does not own this object'));
                }

                if (req.query && req.query.populatedeep) {
                    deepPopulate(obj, req.query.populatedeep, {locale: req.locale}, function (err, result) {
                        if (err) {
                            return error.handleError(err, next);
                        }
                        res.send(result);
                        return next();
                    });
                } else {
                    res.send(obj);
                    return next();
                }
            });
    };
}

function getAllFn(baseUrl, Model, fromAllOwners, config) {
    return function getAll(req, res, next) {

        // check if this is a "personal" object (i.e. has an "owner" property),
        // if yes only send the objects of the currently logged in user
        var finder = {};
        if (!fromAllOwners && Model.schema.paths['owner'] && !auth.isAdminForModel(req.user, mongoose.model('Profile'))) {
            if (!req.user || !req.user.id) {
                return next(new error.NotAuthorizedError('Authentication required for this object'));
            } else {
                finder = {owner: req.user.id};
            }
        }
        var dbQuery = Model.find(finder);

        processStandardQueryOptions(req, dbQuery, Model, config)
            .exec(sendListCb(req, res, next));
    };
}


function postFn(baseUrl, Model, postSaveCb) {
    return function post(req, res, next) {

        var err = handlerUtils.checkWritingPreCond(req.body, req.user, Model);

        if (err) {
            return error.handleError(err, next);
        }

        // if this Model has a campaign Attribute and the user is currently part of a campaign,
        // we set the campaign on this object --> by default new objects are part of a campaign
        if (req.user && req.user.campaign && Model.schema.paths['campaign']) {
            req.body.campaign = req.user.campaign.id || req.user.campaign; // handle populated and unpopulated case
        }

        // split the initializing of the model from the setting of the values, so we can set the locale
        // inbetween.
        var newObj = new Model();
        // setting the locale on the Document, so we can get to it in virtuals (for i18n)
        newObj.$locale = req.locale;
        newObj.set(req.body);

        var cb = writeObjCb(req, res, next);
        newObj.save(postSaveCb ? postSaveCb(cb, req.user) : cb);
    };
}


function deleteAllFn(baseUrl, Model) {
    return function deleteAll(req, res, next) {
        // instead of using Model.remove directly, findOne in combination with obj.remove
        // is used in order to trigger
        // - schema.pre('remove', ... or
        // - schema.pre('remove', ...
        // see user_model.js for an example


        // check if this is a "personal" object (i.e. has an "owner" property),
        // if yes only delete the objects of the currently logged in user
        var finder = '';
        if (Model.schema.paths['owner']) {
            if (!req.user || !req.user.id) {
                return next(new error.NotAuthorizedError('Authentication required for this object'));
            } else if (!auth.checkAccess(req.user, 'al_systemadmin')) {
                finder = {owner: req.user.id};
            } else {
                // user is systemadmin, he may delete all
            }
        }
        var dbQuery = Model.find(finder);

        dbQuery.exec(function (err, objects) {
            if (err) {
                return error.handleError(err, next);
            }
            _.forEach(objects, function (obj) {
                obj.remove();
            });
            res.send(200);
            next();
        });
    };
}

function deleteByIdFn(baseUrl, Model) {
    return function deleteById(req, res, next) {
        var objId;
        try {
            objId = new mongoose.Types.ObjectId(req.params.id);
        } catch (err) {
            return next(new error.InvalidArgumentError({id: req.params.id}));
        }
        if (!objId) {
            return next(new error.InvalidArgumentError("no id to delete found", {id: req.params.id}));
        }
        // instead of using Model.remove directly, findOne in combination with obj.remove
        // is used in order to trigger
        // - schema.pre('remove', ... or
        // - schema.pre('remove', ...
        // see user_model.js for an example

        // check if this is a "personal" object (i.e. has an "owner" property),
        // if yes only delete the objects of the currently logged in user
        var finder = {_id: objId};

        if (Model.schema.paths['owner']) {
            if (!req.user || !req.user.id) {
                return next(new error.NotAuthorizedError('Authentication required for this object'));
            } else if (!auth.checkAccess(req.user, 'al_systemadmin')) {
                finder.owner = req.user.id;
            } else {
                // user is systemadmin, he may delete all
            }
        }

        Model.findOne(finder).exec(function (err, obj) {
            if (err) {
                return error.handleError(err, next);
            }
            if (!obj) {
                req.log.error(finder);
                return next(new error.ResourceNotFoundError());
            }
            obj.remove(function (err, result) {
                if (err) {
                    return error.handleError(err, next);
                }
                res.send(200);
                return next();
            });

        });
    };
}


function putFn(baseUrl, Model) {
    return function put(req, res, next) {
        var err = handlerUtils.checkWritingPreCond(req.body, req.user, Model);
        if (err) {
            return error.handleError(err, next);
        }
        var objId;
        try {
            objId = new mongoose.Types.ObjectId(req.params.id);
        } catch (err) {
            return next(new error.InvalidArgumentError({id: req.params.id}));
        }
        var sentObj = req.body;

        // check whether this is an update for roles and check required privileges
        if (sentObj.roles) {
            if (!auth.canAssign(req.user, sentObj.roles)) {
                return next(new error.NotAuthorizedError('authenticated user has not enough privileges to assign the specified roles', {
                    roles: sentObj.roles
                }));
            }
        }

        var q = Model.findById(objId);

        // if this Model has privateProperties, include them in the select, so we get the whole object
        // because we need to save it later!
        if (Model.privatePropertiesSelector) {
            q.select(Model.privatePropertiesSelector);
        }
        if (Model.adminAttrsSelector) {
            q.select(Model.adminAttrsSelector);
        }
        q.exec(function (err, objFromDb) {
            if (err) {
                return error.handleError(err, next);
            }
            if (!objFromDb) {
                return next(new error.ResourceNotFoundError('no object found with the specified id', {
                    id: req.params.id
                }));
            }


            if (Model.modelName === 'User' && req.user && req.user.id !== objFromDb.id) {
                if (!auth.checkAccess(req.user, 'al_productadmin')) {
                    return next(new error.NotAuthorizedError('Not authorized to change this user'));
                } else if (sentObj.password) {
                    objFromDb.hashed_password = undefined;
                }
            }

            // if this is an "owned" object
            if (objFromDb.owner) {

                // only the authenticated same owner is allowed to edit
                if (!objFromDb.owner.equals(req.user.id)) {
                    return next(new error.NotAuthorizedError('authenticated user is not authorized ' +
                        'to update this ressource because he is not owner of the stored ressource', {
                        user: req.user.id,
                        owner: objFromDb.owner
                    }));
                }

                // he is not allowed to change the owner of the object
                if (sentObj.owner) {
                    if (!objFromDb.owner.equals(sentObj.owner)) {
                        return next(new error.NotAuthorizedError('authenticated user is not authorized ' +
                            'to change the owner of this object', {
                            currentOwner: objFromDb.owner,
                            requestedOwner: sentObj.owner
                        }));
                    }
                }
            }

            // setting the locale on the Document, so we can get to it in virtuals (for i18n)
            objFromDb.$locale = req.locale;

            objFromDb.set(sentObj);
            objFromDb.save(writeObjCb(req, res, next));
        });

    };
}

/////////////////////////////////////
// the generic route handlers

module.exports = {

    params: {
        filter: {
            "name": "filter",
            "description": "Filters the results by adding a where clause, use the following format: filter[property]=value. You can prepend property with +,- to change the query: + leads to an AND condition, - leads to a OR condition, no prefix leads to a WHERE condition. You may prefix the value with <, <<, >, >>, !, *, *! to change how to query for the value: < is 'lower or equal', << is strictly lower, > is 'larger or equal, >> is strictly larger, ! is NOT equal ($not for strings, $ne for any other type), default is 'equals' (interpreted as mongo-regular expression ($regex) for type String, $eq for all other types), * tests returns docs where property exists (value after * is ignored), *! returns docs where the property does not exists (value after *! is ignored). Example: filter[+created]==>>2015-04-14T08:55:25.202Z",
            "dataType": 'string',
            "required": false,
            "allowMultiple": true,
            "paramType": "query"
        },
        sort: {
            "name": "sort",
            "description": 'sorts the results by the specified properties, add ":-1" to reverse sort: e.g. sort="created:-1"',
            "dataType": 'string',
            "required": false,
            "allowMultiple": true,
            "paramType": "query"
        },
        populate: {
            "name": "populate",
            "description": 'populates specified reference properties of the retrieved ressource with the full object,' +
            ' e.g. comments.author is of type ObjectId ref User, if you want the full user object instead of the ObjectId' +
            'add this queryParam: "populate="author". Supports multiple space separated values, also allows to populate' +
            'embedded subobject properties by using .-notation. Limitation: Only allows to populate over one DB-Collection, meaning' +
            'you can populate the comments.author, but you cannot populate ActivityEvent.Comment.Author, use ' +
            '"populatedeep" if you need this. \n' +
            'Use with caution, it may impact performance! ',
            "dataType": 'string',
            "required": false,
            "allowMultiple": true,
            "paramType": "query"
        },
        populatedeep: {
            "name": "populatedeep",
            "description": 'populates specified reference deep properties of the retrieved ressource with the full object,' +
            'use this if you need to go over more than 1 collection, see documentation of "populate" \n' +
            'Use with caution, it may impact performance! ',
            "dataType": 'string',
            "required": false,
            "allowMultiple": true,
            "paramType": "query"
        },
        limit: {
            "name": "limit",
            "description": 'limit the amount of returned objects, default is 100, max is 1000',
            "dataType": 'integer',
            "required": false,
            "default": 100,
            "allowMultiple": false,
            "paramType": "query"
        },
        skip: {
            "name": "skip",
            "description": 'skip the first n results of a query, use together with "limit" for server side pageination',
            "dataType": 'integer',
            "required": false,
            "default": 0,
            "allowMultiple": false,
            "paramType": "query"
        }
    },

    addStandardQueryOptions: processStandardQueryOptions,
    processDbQueryOptions: processDbQueryOptions,

    getByIdFn: getByIdFn,
    getAllFn: getAllFn,
    postFn: postFn,
    putFn: putFn,
    deleteAllFn: deleteAllFn,
    deleteByIdFn: deleteByIdFn,


    sendListCb: sendListCb,
    writeObjCb: writeObjCb
};