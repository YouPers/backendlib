var restify = require("restify"),
    preflightEnabler = require('./corspreflight'),
    longjohn = require("longjohn"),
    fs = require("fs"),
    passport = require('passport'),
    swagger = require("swagger-node-restify"),
    ypi18n = require('./util/ypi18n'),
    error = require('./util/error'),
    _ = require('lodash');


module.exports = {
    createSwaggeredServer: function createSwaggerdServer(name, config) {
        var auth = require('./util/auth').handlers(config);
        var logger = require('./util/log').getLogger(config);

        var server = restify.createServer({
            name: name,
            version: config.version,
            log: logger,
            formatters: {'text/calendar; q=0.1': function(req, res, body) {

                // it seems, that in some error cases restify chooses this formatter to format errors, which does
                // clearly not make any sense. need to reproduce and trace through the restify code, that chooses the
                // formatter as soon as we can reliable reproduce.
                if (!_.isString(body)) {
                    console.log("WENT THROUGH THE IMPOSSIBLE PATH in app.js, please FIX ME");
                    body = body.toString();
                }
                res.setHeader('Content-Length', Buffer.byteLength(body));
                return body;
            }}
        });

        // setting logging of request and response
        // setup better error stacktraces

        server.pre(function (request, response, next) {
            request.log.debug({req_id: request.getId(), req: request}, 'start processing request');

//            response.charSet('utf-8');
            return next();
        });


//        process.on('uncaughtException', function (err) {
//            console.error('Caught uncaught process Exception: ' + err);
//            process.exit(8);
//        });

        server.on('uncaughtException', function (req, res, route, err) {
            req.log.error(err);
            console.error('Caught uncaught server Exception: ' + err);
            res.send(new error.InternalError(err, err.message || 'unexpected error'));
            return (true);
        });

        server.on('after', function (req, res, route, err) {
            req.log.debug({res: res}, "finished processing request");
            if (err && !err.doNotLog) {
                req.log.info({req: req}, 'ERROR: triggering request');
                if (req.body) {
                    req.log.info({requestbody: req.body}, 'ERROR: triggering request body');
                }
                req.log.info({err: err}, 'ERROR: stack trace');
            } else if (req.method === 'POST' || req.method === 'PUT') {
                req.log.debug({requestbody: req.body}, 'POST/PUT: body');
            }
        });

        // setup better error stacktraces
        longjohn.async_trace_limit = 10;  // defaults to 10
        longjohn.empty_frame = 'ASYNC CALLBACK';

        // initialize i18n
        var i18n = ypi18n.initialize();

        // setup middlewares to be used by server
        server.use(restify.requestLogger());
        server.use(restify.acceptParser(server.acceptable));
        server.use(restify.authorizationParser());
        server.use(restify.dateParser());
        server.use(restify.queryParser());
        server.use(restify.gzipResponse());
        server.use(restify.bodyParser({ mapParams: false }));
        server.use(ypi18n.angularTranslateI18nextAdapterPre);
        server.use(i18n.handle);
        server.use(ypi18n.angularTranslateI18nextAdapterPost);
        server.use(passport.initialize());
        server.use(restify.fullResponse());

        // prevents browsers from caching our responses. Without this header IE caches
        // XHR-responses and signals 304 to our app without forwarding the request to the backend.
        server.use(function (req, res, next) {
            res.header('Expires', '-1');
            return next();
        });

        // allows authenticated cross domain requests
        preflightEnabler(server);

        // setup swagger documentation
        swagger.setRestifyServer(server);
        swagger.setAuthorizationMiddleWare(auth.roleBasedAuth);
        swagger.configureSwaggerPaths("", "/api-docs", "");

        swagger.setErrorHandler(function (req, res, err) {
            req.log.error(err);
            console.error('Caught uncaught Exception in Swagger: ' + err + ' message: ' + err.message);
            res.send(new error.InternalError(err, err.message || 'unexpected error'));
            return (true);
        });

        auth.setupPassport(passport);


        function _addRoutes(routesDir, fileExtension) {
            console.log('Losding Routes from: ' + routesDir);
            fs.readdirSync(routesDir).forEach(function (file) {

                if (file.indexOf(fileExtension) !== -1) {
                    console.log("Initializing route: " + file);
                    require(routesDir + '/' + file)(swagger, config);
                }
            });
        }


        swagger.addRoutes = function addRoutesFromDirectory(dir, extension) {

            // add custom routes
            var ext = extension || '_route.js';
            _addRoutes(dir, ext);

            // add common routes
            _addRoutes(__dirname + '/routes', '_route.js');



            // need to call swagger configure after adding all routes, so swagger adds the documentation endpoints.
            swagger.configure(config.backendUrl, "0.1");
        };

        return swagger;

    }

};