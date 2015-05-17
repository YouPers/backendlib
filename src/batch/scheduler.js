var cronJob = require('cron').CronJob,
    _ = require('lodash');

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
