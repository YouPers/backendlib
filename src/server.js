var restify = require("restify"),
    fs = require("fs"),
    passport = require('passport'),
    swagger = require("swagger-node-restify"),
    error = require('./util/error'),
    _ = require('lodash');
// setup better error stacktraces


module.exports = {
    createSwaggeredServer: function createSwaggerdServer(name, config) {
        var auth = require('./util/auth').handlers(config);
        var logger = require('./util/log').getLogger(config);

        // setup better error stacktraces
        if (config.longjohn === 'enabled') {
            console.log("LONGJOHN: enabling longjohn stacktraces: make sure this does not run in production");
            var longjohn = require('longjohn');
            longjohn.async_trace_limit = 5;  // defaults to 10
            longjohn.empty_frame = 'ASYNC CALLBACK';
        }

        var server = restify.createServer({
            name: name,
            version: config.version,
            log: logger,
            formatters: {
                'text/calendar; q=0.1': function (req, res, body) {

                    // it seems, that in some error cases restify chooses this formatter to format errors, which does
                    // clearly not make any sense. need to reproduce and trace through the restify code, that chooses the
                    // formatter as soon as we can reliable reproduce.
                    if (!_.isString(body)) {
                        console.log("WENT THROUGH THE IMPOSSIBLE PATH in app.js, please FIX ME");
                        body = body.toString();
                    }
                    res.setHeader('Content-Length', Buffer.byteLength(body));
                    return body;
                }
            }
        });

        // setting logging of request and response, uncaught errors
        server.pre(function (req, response, next) {
            req.log.debug({
                req_id: req.getId(),
                req: req,
                path: (req.route && req.router.path) || req.url,
                method: req.method
            }, 'start processing request');
            return next();
        });


        server.on('uncaughtException', function (req, res, route, err) {
            req.log.error({
                err: err,
                method: req.method,
                url: req.url,
                path: (req.route && req.route.path) || req.url,
                message: err.message
            }, "uncaught server exception in restify server");
            console.error('Caught uncaught server Exception: ' + err);
            if (!res.headersSent) {
                res.send(new error.InternalError(err, err.message || 'unexpected error'));
            }
            return (true);
        });

        process.on('uncaughtException', function (err) {
            logger.error({err: err, message: err.message}, "UNCAUGHT PROCESS ERROR: logging to error: " + err.message);
            console.error(new Date().toString() + ": Exiting process because of Uncaught Error: " + err.message + ", err: " + err);
            process.exit(1);
        });

        server.on('after', function (req, res, route, err) {
            req.log.info({
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                'x-real-ip': req.headers['x-real-ip'],
                username: req.user && req.user.email,
                responsetime: res.getHeader('Response-Time'),
                path: (req.route && req.route.path) || req.url   // for req.method == OPTIONS the req.route is not available, so we log the url
            }, "finished processing request");

            if (err && !err.doNotLog) {
                // treat some well known errors differently, no stack trace, no body
                if (res.statusCode === 401 || res.statusCode === 403) {
                    req.log.info({
                        method: req.method,
                        url: req.url,
                        path: (req.route && req.route.path) || req.url,
                        statusCode: res.statusCode,
                        'x-real-ip': req.headers['x-real-ip'],
                        username: req.user && req.user.email,
                        error: err.message
                    }, res.statusCode + ": " + err.name || err.message);
                } else {
                    req.log.error({
                        req: req,
                        err: err,
                        res: res,
                        method: req.method,
                        url: req.url,
                        path: (req.route && req.route.path) || req.url,
                        'x-real-ip': req.headers['x-real-ip'],
                        username: req.user && req.user.email,
                        statusCode: res.statusCode,
                        reqbody: req.body,
                        resbody: _.isFunction(res._body.toObject) ? res._body.toObject() : res._body
                    }, res.statusCode + ': ' + err.name + ': Error while handling request');
                }
            } else if (req.method === 'POST' || req.method === 'PUT') {
                req.log.debug({
                    method: req.method,
                    url: req.url,
                    path: (req.route && req.route.path) || req.url,
                    statusCode: res.statusCode,
                    'x-real-ip': req.headers['x-real-ip'],
                    username: req.user && req.user.email,
                    reqbody: req.body
                }, 'POST/PUT: request body');
            }

            if (req.log.debug() && res._body && _.keys(res._body).length > 0) {

                var resbody = JSON.stringify(res._body);
                req.log.debug({
                    resbody: resbody,
                    method: req.method,
                    url: req.url,
                    'x-real-ip': req.headers['x-real-ip'],
                    username: req.user && req.user.email,
                    path: (req.route && req.route.path) || req.url,
                    statusCode: res.statusCode
                }, 'response body');
            }
        });

        // initialize i18n
        var ypi18n = require('./util/ypi18n')(config);

        var i18nOptions = {
            fallbackLng: config.i18n.fallbackLng,
            supportedLngs: config.i18n.supportedLngs,
            ns: {
                namespaces: config.i18n.namespaces || ['email', 'ical', 'general']
            }
        };

        var i18n = ypi18n.initialize(i18nOptions);

        // setup CORS
        var myCustomHeaders = ['X-Requested-With', 'Cookie', 'Set-Cookie', 'X-Api-Version', 'X-Request-Id', 'yp-language', 'location', 'authorization'];
        _.forEach(myCustomHeaders, function (header) {
            restify.CORS.ALLOW_HEADERS.push(header);
        });

        server.pre(restify.CORS({
            credentials: true,                  // defaults to false
            headers: myCustomHeaders
        }));

        // setup middlewares to be used by server
        server.use(restify.requestLogger());
        server.use(restify.acceptParser(server.acceptable));
        server.use(restify.queryParser());
        server.use(restify.bodyParser({mapParams: false}));
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

        // setup swagger documentation
        swagger.setRestifyServer(server);
        swagger.setAuthorizationMiddleWare(auth.roleBasedAuth);
        swagger.configureSwaggerPaths("", "/api-docs", "");

        swagger.setErrorHandler(function (req, res, err) {

            if (err.statusCode && err.restCode) {
                req.log.error({req: req,
                    err: err,
                    url: req.url,
                    path: (req.route && req.route.path) || req.url,
                    'x-real-ip': req.headers['x-real-ip'],
                    username: req.user && req.user.email,
                    statusCode: res.statusCode,
                    reqbody: req.body,
                    resbody: res._body}, "Uncaught error in Swagger ErrorHandler");
                res.send(err.statusCode, err);
            } else {
                req.log.error({
                    req: req,
                    method: req.method,
                    url: req.url,
                    path: (req.route && req.route.path) || req.url,
                    'x-real-ip': req.headers['x-real-ip'],
                    username: req.user && req.user.email,
                    statusCode: res.statusCode,
                    resbody: res._body,
                    err: err,
                    reqbody: req.body
                }, req.method + " failed for path '" + require('url').parse(req.url).href + "': " + err);
                res.send(500, new error.InternalError(err.message || 'unexpected error', err));
            }
        });

        auth.setupPassport(passport);


        function _addRoutes(routesDir, fileExtension) {
            console.log('Loading Routes from: ' + routesDir);
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