var mongoose = require('mongoose'),
    async = require('async'),
    i18n = require('../util/ypi18n').initialize(),
    _ = require('lodash'),
    shortid = require('shortid');

/**
 * Generic Batch skeleton that should be used to implement any scheduled batch task that can be expressed with
 * the feeder/worker pattern.
 *
 * Implememtation notes:
 * This implementation uses node.async.forEachLimit to process all workItems the feeder returns. The maximal concurrency
 * can be controlled by the 'concurrency' attribute to be configured in the batch scheduler.
 *
 * It can be used
 * in cases:
 * - where the feeder runs reasonably fast so we can wait until it returns all workItems before starting
 * to process the workitems,
 * - where we have no need to use multiple node processes (this means, jobs that do IO (e.g. some DB-calls and than sending an
 * email are perfectly fine, BUT jobs with heavy CPU processing will need another solution.
 *
 * @param feeder(callback(err, workItems), args...) the feeder function that finds all work items to be processed. Gets a callback it
 * needs to call at the end. Feeder is run in the Batch-Context, e.g. it can get 'this.log', 'this.i18n', 'this.name' or 'this.batchId'
 * @param worker(workItem, callback(err)) the worker function that processes one specific work item. Gets a callback it
 * needs to call at the end. Worker is run in the Batch-Context, e.g. it can get 'this.log', 'this.i18n', 'this.name' or 'this.batchId'
 * @param context The context where the feeder and worker are supposed to run in, usually passed from the scheduler job context.
 * @param additional optional arguments: are passed on to the feeder and the worker function after their respective
 * required arguments.
 */
var genericBatch = function genericBatch(feeder, worker, context) {
    context = context || this;
    context.batchId = shortid.generate();
    var log = context.log = context.log.child({batchId: context.name + ':' + context.batchId});

    context.i18n = i18n;

    log.info('Batch Job: ' + context.name + ":" + context.batchId + ": STARTING");
    var concurrency = context.concurrency || 5;

    var processFn = function (err, work) {
        if (err) {
            log.error({err: err}, "Error in Batch-Feeder, ABORTING");
            return mongoose.connection.close();
        }

        log.info("Found " + work.length + " work items. Starting parallel processing with concurrency: " + concurrency);

        var batchResult =  {
            batchName: context.name,
            batchId: context.batchId,
            instance: process.env.NODE_ENV,
            started: new Date(),
            foundWorkItems: work.length,
            successCount: 0,
            errorCount: 0,
            success: [],
            errored: []
        };

        async.forEachLimit(work, concurrency, function (workItem, done) {
            workItem.workItemId =  workItem.workItemId || workItem.email || workItem.username || workItem._id || workItem.toString();

            log.info({item: workItem.workItemId}, 'Processing WorkItem');
            var myArgs = _.clone(args);

            function  workerCb (err, result) {
                if (err && !err.isRecoverable) {
                    batchResult.errored.push({id: workItem.workItemId, err: err});
                    return done(err);
                } else if (err && err.isRecoverable) {
                    batchResult.errored.push({id: workItem.workItemId, err: err});
                    return done();
                }
                batchResult.success.push({id: workItem.workItemId, result: result});
                return done();
            }

            myArgs.unshift(workItem, workerCb);

            // wrapping the "unknown, potentially throwing worker function" with try/catch
            // and forwarding a potential uncaught error to the async caller
            try {
                return worker.apply(context, myArgs);
            } catch (err) {
                var myErr = new Error('WorkItemProcessingError: ' + err.message);
                myErr.cause = err;
                myErr.workItem = workItem.workItemId || workItem._id;
                log.error({err: err}, "Uncaught Error in Batch Run: " + err.message);
                batchResult.errored.push({id: workItem.workItemId, message: err.message, code: err.code});
                return done(myErr);
            }
        }, function (err) {
            batchResult.ended = new Date();
            batchResult.successCount = batchResult.success.length;
            batchResult.errorCount = batchResult.errored.length;
            batchResult.runTimeTotal = (batchResult.ended - batchResult.started) / 1000;
            if (batchResult.foundWorkItems && batchResult.foundWorkItems !== 0) {
                batchResult.avgItemTime = batchResult.runTimeTotal / batchResult.foundWorkItems;
            }

            if (err) {
                log.error({err: err, batchResult: batchResult}, 'Batch Job: ' + context.name + ":" + context.batchId + " : Error while completing the workItems");
            } else {
                log.info({batchResult: batchResult}, 'Batch Job: ' + context.name + ":" + context.batchId + ": FINISHED");
            }

            if (context.config &&
                context.config.batch &&
                context.config.batch.resultRecipients &&
                _.isArray(context.config.batch.resultRecipients) &&
                context.config.batch.resultRecipients.length >0) {

                var email = require('../util/email')(context.config);
                _.forEach(context.config.batch.resultRecipients, function(emailAdress) {
                    email.sendBatchResultMail(emailAdress, batchResult, context.i18n);
                });
            }
            mongoose.connection.close();
        });

    };

    // passing on the additional arguments we were called with to the feeder function, we remove the first three
    // and add the rest

    var args = [processFn];
    for (var i = 3; i > arguments.length; i++) {
        args.push(arguments[i]);
    }

    feeder.apply(context, args);
};

module.exports = {
    genericBatch: genericBatch
};