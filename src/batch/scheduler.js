var cronJob = require('cron').CronJob,
    _ = require('lodash');

/**
 * simple job scheduler that takes a an array of job definitions to execute at a specific cron-time, e.g.:
 *
 * var jobs = [
 * {
 *    name: 'CompleteOpenTeamChallenges',
 *    description: 'completes all open TeamChallenges',
 *    cronTime: '00 00 12 * * 0,5,6',
 *    onTick: require('./batches/completeOpenTeamChallenges').run,
 *    environments: ['insp-ci'],  // only schedule this job on environment with NODE_ENV = 'insp-ci'
 *    start: true,
 *    context: {
 *        concurrency: 1
 *    }
 * },
 * {
 *    name: 'tellMood',
 *    description: 'ask the user for a mood',
 *    cronTime: '00 00  7,10,13 * * 1,2,3,4,5',
 *    onTick: require('./batches/askForMoodEntry').run,
 *    start: true,
 *    context: {
 *        concurrency: 1
 *    }
 * },
 *
 * uses this lib to schedule the jobs: https://github.com/ncb000gt/node-cron
 *
 * @param jobs
 * @param log
 * @param config
 */
var scheduleJobs = function scheduleJobs(jobs, log, config) {

    _.forEach(jobs, function scheduleJob(job) {
        var env = process.env.NODE_ENV || 'development';
        // check if the job is restricted to a subset of environments it should be executed on
        if(job.environments && !_.contains(job.environments, env)) {
            log.info('skipping Job: "' + job.name + '" - env "' + env + '" is not in the list of specified environments:' + job.environments);
            return;
        }
        job.context.name = job.name;
        job.context.description = job.description;
        job.context.cronTime = job.cronTime;
        if (config) {
            job.context.config = config;
        }
        log.info('scheduling Job: "' + job.name + '" with schedule: "' + job.cronTime + '"');
        new cronJob(job).start();
    });
};

module.exports = {
    scheduleJobs: scheduleJobs
};
