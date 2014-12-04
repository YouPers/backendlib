/**
 * Error Routes module
 *    log errors posted by the client
 */
var fs = require('fs');
var error = require('../util/error');
var spawn = require('child_process').spawn;
var rimraf = require('rimraf');



module.exports = function (swagger, config) {
    var baseUrl = '/dbdumps';
    var baseUrlWithId = baseUrl + "/{id}";


    swagger.addOperation({
        spec: {
            description: "dump the current state of the database",
            path: baseUrl,
            notes: "creates a named db-dump",
            summary: "dumps the current state of the database and names the dump",
            method: "POST",
            params: [swagger.queryParam("dumpname", "dumpdname", "String")],
            errorResponses: [],
            nickname: "dbDumpCreate",
            accessLevel: "al_productadmin"
        },
        action: function (req, res, next) {
            if (!config.dbdump.dumpenabled) {
                return next(new Error('dbdump not enabled on this instance'));
            }

            req.log.warn({requestinguser: req.user.fullname, dumpname: req.params.dumpname, requestheaders: req.headers}, 'dumping database: ' + config.db_database + ' to : ' + config.dbdump.dumpdir + '/' + req.params.dumpname);

            var args = ['--db', config.db_database, '--out', config.dbdump.dumpdir + '/' + req.params.dumpname];

            if (config.db_user && config.db_user !== 'None') {
                args.push('-u', config.db_user);
            }

            if (config.db_password && config.db_password!== 'None') {
                args.push('-p', config.db_password);
            }
            req.log.info(args, 'calling mongodump with these args');
            var mongodump = spawn(config.dbdump.mongodumpexe, args);

            var stdOut = "";
            var stdErr = "";

            mongodump.stdout.on('data', function (data) {
                stdOut = stdOut + data + "/n";
            });
            mongodump.stderr.on('data', function (data) {
                stdErr = stdErr + data + "/n";
            });
            mongodump.on('exit', function (code) {
                if (code !== 0) {
                    res.send(500, {code: code, stdOut: stdOut, stdErr: stdErr});
                    req.log.error({code: code, stdOut: stdOut, stdErr: stdErr}, 'error dumping the db');
                } else {
                    req.log.info({code: code, stdOut: stdOut, stdErr: stdErr}, 'db successfully dumped');
                    res.send(200, {code: code, stdOut: stdOut, stdErr: stdErr});
                    return next();
                }
            });
        }
    });

    swagger.addOperation({
        spec: {
            description: "list all available dumps",
            path: baseUrl,
            notes: "lists all available dumps",
            summary: "lists all available dbdumps",
            method: "GET",
            errorResponses: [],
            nickname: "dbDumpGet",
            accessLevel: "al_productadmin"
        },
        action: function (req, res, next) {
            if (config.dbdump.restoreenabled) {
                fs.readdir(config.dbdump.dumpdir, function (err, files) {
                    if (err) {error.handleError(err, next);}
                    res.send(files);
                    return next();
                });
            } else {
                res.send([]);
                return next();
            }
        }
    });


    swagger.addOperation({
        spec: {
            description: "delete  dumps",
            path: baseUrlWithId,
            notes: "deletes a dump",
            summary: "deletes a dump",
            method: "DELETE",
            errorResponses: [],
            nickname: "dbDumpDelete",
            accessLevel: "al_productadmin"
        },
        action: function (req, res, next) {
            var dumpdir = config.dbdump.dumpdir + '/' + req.params.id;

            req.log.warn("removing dump: " + dumpdir);
            rimraf(dumpdir, function(err) {
                if (err) {
                    res.send(500);
                    return next(err);
                }
                res.send(200);
                return next();
            });
        }
    });

    swagger.addOperation({
        spec: {
            description: "restores a named dbdump",
            path: baseUrlWithId + '/restore',
            notes: "restores the dump",
            summary: "restores the dump",
            method: "POST",
            params: [swagger.pathParam("id", "name of the dump to restore", "string")],
            errorResponses: [],
            nickname: "dbDumpRestore",
            accessLevel: "al_productadmin"
        },
        action: function (req, res, next) {
            if (!config.dbdump.restoreenabled) {
                return next(new Error('dbrestore not enabled on this instance'));
            }

            var args = ['--db', config.db_database, '--drop'];

            if (config.db_user) {
                args.push('-u', config.db_user);
            }

            if (config.db_password) {
                args.push('-p', config.db_password);
            }

            var dumpdir = config.dbdump.dumpdir + '/' + req.params.id + '/' + config.db_database;
            args.push(dumpdir);

            req.log.warn({requestinguser: req.user.fullname, dumpname: req.params.id, requestheaders: req.headers}, 'dropping and restoring database: ' + config.db_database + ' from : ' + dumpdir);
            var mongorestore = spawn(config.dbdump.mongorestoreexe, args);

            var stdOut = "";
            var stdErr = "";

            mongorestore.stdout.on('data', function (data) {
                stdOut = stdOut + data + "/n";
            });
            mongorestore.stderr.on('data', function (data) {
                stdErr = stdErr + data + "/n";
            });
            mongorestore.on('exit', function (code) {
                var respCode = (code === 0 && stdErr.length === 0) ? 200 : 500;
                res.send(respCode, {code: code, stdOut: stdOut, stdErr: stdErr});
                req.log.info('mongorestore exited with code ' + code);
                return next();
            });
        }
    });

};