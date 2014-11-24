var bunyan = require('bunyan');
var bsyslog = require('bunyan-syslog');
var bLogstashTcp = require('bunyan-logstash-tcp');

var getLogger = function (config) {

    var logConf = config.log;

    var loggerOptions = {
        name: "Main",
        streams: logConf.streams || [],
        serializers: bunyan.stdSerializers
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

    var logger = bunyan.createLogger(loggerOptions);
    return logger;
};

module.exports = {
    getLogger: getLogger
};
