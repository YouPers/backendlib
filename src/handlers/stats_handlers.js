var error = require('../util/error'),
    async = require('async'),
    moment = require('moment'),
    mongoose = require('mongoose'),
    ObjectId = mongoose.Types.ObjectId,
    _ = require('lodash');

var statsQueries;

function registerQueries(queryDefs) {
    statsQueries = queryDefs;
}


function constructQuery(queryDef, options) {
    // put the modelName into options, so the transformers can access it
    options.queryModelName = queryDef.modelName;
    var model = mongoose.model(queryDef.modelName);
    var pipe = model.aggregate();

    if (options.scopeType === 'all') {
        // do nothing, consider all rows
    } else if (options.scopeType) {

        var path = model.schema.paths[options.scopeType];

        if (!path) {
            throw new error.InvalidArgumentError("Illegal Arguments, when ScopeType not valid for this query");
        }
        if (!options.scopeId) {
            throw new error.MissingParameterError("Illegal Arguments, when ScopeType is set, scopeId has to be passed as well");
        }
        var queryVal = (path.instance === 'String') ? options.scopeId : new ObjectId(options.scopeId);
        var scopePipelineEntry = {$match: {}};

        var allPropName = 'all' + _.capitalize(options.scopeType);
        if (model.schema.paths[allPropName]) {
            var orClauseNormalProp = {};
            orClauseNormalProp[options.scopeType] = queryVal;
            var orClauseAllProp = {};
            orClauseAllProp[allPropName] = queryVal;
            scopePipelineEntry.$match['$or'] = [orClauseNormalProp, orClauseAllProp];
        } else {
            scopePipelineEntry.$match[options.scopeType] = queryVal;
        }

        if (!queryDef.ignoreScope) {
            pipe.append(scopePipelineEntry);
        }
    } else {
        // we assume 'all' if nothing is passed
    }

    if (options.timeRange && (options.timeRange !== 'all')) {
        var timeRangeAttr = queryDef.timeRangeAttr || 'start';

        var timeOperator = {
            $match: {}
        };
        timeOperator['$match'][timeRangeAttr] = {
            $gt: moment().startOf(options.timeRange).toDate(),
            $lt: moment().endOf(options.timeRange).toDate()
        };
        pipe.append(timeOperator);
    }

    var stages = queryDef.stages;

    // stages can be an array of Aggregation Pipeline Operators,
    // or a function returning such an array in case the options/params are needed to generate the array
    if (_.isFunction(stages)) {
        stages = stages(options);
    }

    // despite the documentation, aggregate.append() does not like arrays.. so we do it piece per piece
    _.forEach(stages, function (stage) {
        try {
            pipe.append(stage);
        } catch (err) {
            throw new Error('Error adding stage: ' + JSON.stringify(stage) + ' from query: ' + JSON.stringify(queryDef));
        }
    });

    return pipe;
}

var getStats = function () {
    return function (req, res, next) {

        if (!statsQueries) {
            throw new Error('statsQueries not initialized, register your queries with the stats_handler before calling the /stats route');
        }

        var type = req.params.type;
        if (!type) {
            return next(new error.MissingParameterError({required: 'type'}));
        }

        var queryDefs = {};
        try {
            if (type === 'all') {
                queryDefs = statsQueries;
            } else {
                queryDefs[type] = statsQueries[type];
                if (!queryDefs[type]) {
                    return next(new error.InvalidArgumentError('Unknown Query Type: ' + type));
                }
            }
        } catch (err) {
            req.log.info(err);
            return next(new error.InvalidArgumentError(err.message));
        }

        var locals = {};

        var options = req.params;
        options.locale = req.locale;

        async.each(_.keys(queryDefs), function (queryName, done) {

            var myWaterFall = [
                function (cb) {

                    try {
                        var q = constructQuery(queryDefs[queryName], options);

                        q.exec(function (err, result) {
                            if (err) {
                                return error.handleError(err, cb);
                            }
                            return cb(null, result, options);
                        });
                    } catch (err) {
                        req.log.error(new Error('Error constructing query for type: ' + queryName, err));
                        return next(err);
                    }
                }
            ];

            if (queryDefs[queryName].transformers) {
                var transformers = _.isArray(queryDefs[queryName].transformers) ?
                    queryDefs[queryName].transformers :
                    [queryDefs[queryName].transformers];

                myWaterFall = myWaterFall.concat(transformers);
            }

            async.waterfall(myWaterFall, function (err, result) {
                if (err) {
                    return done(err);
                }
                locals[queryName] = result;
                return done();
            });

        }, function (err) {
            if (err) {
                return error.handleError(err, next);
            }
            res.send([locals]);
            return next();
        });
    };
};

module.exports = {
    getStats: getStats,
    registerQueries: registerQueries
};