var cronJob = require('cron').CronJob,
    _ = require('lodash');

var scheduleJobs = function scheduleJobs(jobs, logger) {
    _.forEach(jobs, function scheduleJob(job) {
        job.context.name = job.name;
        job.context.description = job.description;
        job.context.cronTime = job.cronTime;
        logger.info('scheduling Job: "' + job.name + '" with schedule: "' + job.cronTime + '"');
        new cronJob(job).start();
    });
};

module.exports = {
    scheduleJobs: scheduleJobs
};
