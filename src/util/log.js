var bunyan = require('bunyan');
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

    if (logConf.logstash) {

        var stream = bLogstashTcp.createStream({
            host: logConf.logstash.host || 'localhost',
            port: logConf.logstash.port || 5001,
            max_connect_retries: -1,
            retry_interval: 2000,
            cbuffer_size: 100,
            type: "bunyan"
        });

        stream.on('error', function(err) {
            var date = new Date();
            console.log(date.toISOString() + ' - caught logstash stream error event, reconnection troubles, ENV: ' + process.env.NODE_ENV + ' err: ' + JSON.stringify(err));
        });

        var myLogstashStream = {
                level: logConf.logstash.level || 'debug',
                type: "raw",
                stream: stream
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
