/**
 * Error Routes module
 *    log errors posted by the client
 */
var fs = require('fs');
var error = require('../util/error');
var spawn = require('child_process').spawn;
var rimraf = require('rimraf');
var async = require('async');

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
            if (config.dbdump.dumpenabled !== "enabled") {
                return next(new Error('dbdump not enabled on this instance'));
            }

            req.log.warn({requestinguser: req.user.fullname, dumpname: req.params.dumpname, requestheaders: req.headers}, 'dumping database: ' + config.db_database + ' to : ' + config.dbdump.dumpdir + '/' + req.params.dumpname);

            var args = ['--db', config.db_database, '--out', config.dbdump.dumpdir + '/' + req.params.dumpname];

            _addUserPwArgs(args, config);
            req.log.info(args, 'calling mongodump with these args');
            var mongodump = spawn(config.dbdump.mongodumpexe, args);

            var output = _attachStdOutErr(mongodump);

            mongodump.on('exit', function (code) {
                if (code !== 0) {
                    res.send(500, {code: code, stdOut: output.out, stdErr: output.err});
                    req.log.error({code: code, stdOut: output.out, stdErr: output.err}, 'error dumping the db');
                    return next(new Error('error dumping the db'));
                } else {
                    req.log.info({code: code, stdOut: output.out, stdErr: output.err}, 'db successfully dumped');

                    if (config.dbdump.excludedCollections) {
                        req.log.info(config.dbdump.excludedCollections, "excluding these collections");
                        var excludedCollections = config.dbdump.excludedCollections.split(',');
                        var dumpdir = config.dbdump.dumpdir + '/' + req.params.dumpname + '/' + config.db_database;
                        async.forEach(excludedCollections, function (colName, done) {
                            fs.unlink(dumpdir + '/' + colName + '.bson', function(err) {
                                fs.unlink(dumpdir + '/' + colName + '.metadata.json', function(err) {
                                    return done();
                                });
                            });
                        }, function(err) {
                            res.send(200, {code: code, stdOut:  output.out, stdErr:  output.err});
                            return next();
                        });

                    } else {
                        res.send(200, {code: code, stdOut: output.out, stdErr: output.err});
                        return next();
                    }

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
            if (config.dbdump.restoreenabled === "enabled") {
                fs.readdir(config.dbdump.dumpdir, function (err, files) {
                    if (err) {return error.handleError(err, next);}
                    res.send(files);
                    return next();
                });
            } else {
                return next(new Error('dbrestore not enabled on this instance'));
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
            if (config.dbdump.restoreenabled !== "enabled") {
                return next(new Error('dbrestore not enabled on this instance'));
            }

            var dumpdir = config.dbdump.dumpdir + '/' + req.params.id + '/' + config.db_database;

            req.log.warn({
                requestinguser: req.user.fullname,
                dumpname: req.params.id,
                requestheaders: req.headers
            }, 'dropping and restoring database: ' + config.db_database + ' from : ' + dumpdir);

            // check whether we have "excluded collections" if not we drop the whole database first.
            if (!config.dbdump.excludedCollections || config.dbdump.excludedCollections.length === 0) {
                req.log.warn({excl: config.dbdump.excludedCollections}, 'Dropping WHOLE Db, because we do not have excluded tables');

                //  mongo <dbname> --eval "db.dropDatabase()"
                var args = [config.db_database, '--eval', 'db.dropDatabase()'];
                _addUserPwArgs(args, config);
                var mongoDrop = spawn(config.dbdump.mongoexe, args);
                var output = _attachStdOutErr(mongoDrop);
                mongoDrop.on('exit', function(code) {
                    if (code !== 0) {
                        req.log.error(output, "error dropping db");
                    }

                    return _restoreDb();
                });

            } else {
                return _restoreDb();
            }

            function _restoreDb() {
                var args = ['--db', config.db_database, '--drop'];
                _addUserPwArgs(args, config);
                args.push(dumpdir);

                var mongorestore = spawn(config.dbdump.mongorestoreexe, args);
                var output = _attachStdOutErr(mongorestore);
                mongorestore.on('exit', function (code) {
                    var respCode = (code === 0 && output.err.length === 0) ? 200 : 500;
                    res.send(respCode, {code: code, stdOut: output.out, stdErr: output.err});
                    req.log.info('mongorestore exited with code ' + code);
                    return next();
                });
            }
        }
    });

    function _addUserPwArgs(args, config) {
        if (config.db_user && config.db_user !== 'None') {
            args.push('-u', config.db_user);
        }
        if (config.db_password && config.db_password !== 'None') {
            args.push('-p', config.db_password);
        }
    }

    function _attachStdOutErr(mongorestore, stdOut, stdErr) {
        var output = {
            out: "",
            err: ""
        };

        mongorestore.stdout.on('data', function (data) {
            output.out =  output.out + data + "/n";
        });
        mongorestore.stderr.on('data', function (data) {
            output.err = output.err + data + "/n";
        });
        return output;
    }

};