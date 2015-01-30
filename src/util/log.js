var bunyan = require('bunyan');
var bsyslog = require('bunyan-syslog');
var bLogstashTcp = require('bunyan-logstash-tcp');
var _ = require('lodash');

var getLogger = function (config) {

    var logConf = _.clone(config.log);

    var loggerOptions = {
        name: "Main",
        streams: _.clone(logConf.streams) || [],
        serializers: bunyan.stdSerializers,
        hostname:  config.NODE_ENV
    };

    if (logConf.stdout) {
        loggerOptions.streams.push({
            stream: process.stdout,
            level: logConf.stdout
        });
    }

    if (logConf.syslog) {
        var mySyslogStream = {
            level: logConf.syslog.level || 'debug',
            type: 'raw',
            stream: bsyslog.createBunyanStream({
                type: 'sys',
                facility: logConf.syslog.facility || bsyslog.local0,
                host: logConf.syslog.host,
                port: logConf.syslog.port
            })
        };
        loggerOptions.streams.push(mySyslogStream);
    }

    if (logConf.logstash) {
        var myLogstashStream = {
                level: logConf.logstash.level || 'debug',
                type: "raw",
                stream: bLogstashTcp.createStream({
                    host: logConf.logstash.host || 'localhost',
                    port: logConf.logstash.port || 5001
                })
            };
        loggerOptions.streams.push(myLogstashStream);
    }


    if (logConf.stream) {
        loggerOptions.streams.push(logConf.stream);
    }

    return bunyan.createLogger(loggerOptions);
};

module.exports = {
    getLogger: getLogger
};
