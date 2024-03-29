var error = require('../util/error'),
    handlerUtils = require('./handlerUtils'),
    auth = require('../util/auth'),
    mongoose = require('mongoose'),
    User = mongoose.model('User'),
    _ = require('lodash'),
    generic = require('./generic');

module.exports = function (config) {

    var email = require('../util/email')(config);
    var image = require('../util/image')(config);

    var postFn = function (baseUrl) {
        return function (req, res, next) {

            var err = handlerUtils.checkWritingPreCond(req.body, req.user, User);

            if (err) {
                return error.handleError(err, next);
            }

            var password = req.params.password || req.body.password;
            if (!password) {
                return next(new error.MissingParameterError('User needs a password', {required: 'password'}));
            }
            req.body.password = password;

            var newUser = new User(req.body);

            newUser.lastLogin = new Date();

            // assign default roles
            if (newUser.roles.length === 0) {
                newUser.roles = ['individual'];
            }

            if (!auth.canAssign(req.user, newUser.roles)) {
                return next(new error.NotAuthorizedError(
                    'The user is not authorized to assign these roles.', {
                        roles: newUser.roles
                    }
                ));
            }

            req.log.trace(newUser, 'PostFn: Saving new user and profile objects');

            // try to save the new user and profile objects
            newUser.save(req, function (err) {
                if (err) {
                    return error.handleError(err, next);
                }

                // send verificationEmail
                if(config.email.emailConfirmation !== 'disabled') {
                    email.sendEmailVerification(newUser, req.i18n);
                }

                res.header('location', req.url + '/' + newUser._id);
                res.send(201, newUser);
                return next();
            });
        };
    };

    var validateUserPostFn = function (baseUrl) {
        return function (req, res, next) {
            var fields = 'username email'.split(' ');

            var field = _.find(fields, function (field) {
                return req.body[field];
            });

            if (field) {
                var query = {};
                query[field] = req.body[field].toLowerCase();

                User.findOne(query).select(field).exec(function (err, value) {
                    if (err) {
                        return error.handleError(err, next);
                    }
                    if (value) {
                        // we use a HTTP error to communicate the fact that this is a duplicate username or email
                        // but there is no reason to fill the server logs with this, as this is an expected case
                        // therefore we suppress the automatic logging of errors
                        var errorMsg = new error.ConflictError(field + ' is already in use', { value: query[field] });
                        errorMsg.doNotLog = true;
                        return next(errorMsg);
                    } else {
                        res.send(200);
                        return next();
                    }
                });
            } else {
                return next(new error.MissingParameterError('no field to validate was provided', { expectedFields: fields }));
            }
        };
    };

    var getUser = function (req, res, next, callback) {


        if (req.params.id !== req.user.id) {
            return next(new error.ConflictError('User ID in request parameters does not match authenticated user', {
                requestUserId: req.params.id,
                authenticatedUserId: req.user.id
            }));
        }

        User.findById(req.params.id)
            .select(User.privatePropertiesSelector)
            .exec(function (err, user) {
                if (err) {
                    return error.handleError(err, next);
                }
                if (!user) {
                    return next(new error.ResourceNotFoundError('User not found', { id: req.params.id }));
                }

                callback(user);
            });
    };

    var sendVerificationEmailPostFn = function (baseUrl) {
        return function (req, res, next) {
            email.sendEmailVerification(req.user, req.i18n);
            res.send(200);
            return next();
        };
    };

    var emailVerificationPostFn = function (baseUrl) {
        return function (req, res, next) {

            getUser(req, res, next, function (user) {

                if (req.body && req.body.token === email.encryptLinkToken(user.email)) {

                    user.emailValidatedFlag = true;
                    user.save();


                    res.send(200, {});
                    return next();
                } else if (!req.body || !req.body.token) {
                    return next(new error.MissingParameterError({ required: 'token' }));
                } else {
                    return next(new error.InvalidArgumentError('Invalid Token', { token: req.body.token }));
                }

            });

        };
    };


    var requestPasswordResetPostFn = function (baseUrl) {
        return function (req, res, next) {

            // check payload
            if (!req.body || !req.body.usernameOrEmail) {
                return next(new error.MissingParameterError({ required: 'usernameOrEmail'}));
            }


            User.findOne()
                .or([
                    {username: req.body.usernameOrEmail},
                    {email: req.body.usernameOrEmail}
                ])
                .select('+email +username')
                .exec(function (err, user) {
                    if (err) {
                        error.handleError(err, next);
                    }
                    if (!user) {
                        return next(new error.InvalidArgumentError('unknown username or email', { usernameOrEmail: req.body.usernameOrEmail }));
                    }

                    email.sendPasswordResetMail(user, req.i18n);

                    res.send(200, {});
                    return next();

                });

        };

    };

    var passwordResetPostFn = function (baseUrl) {
        return function (req, res, next) {

            // check payload
            if (!req.body || !req.body.token || !req.body.password) {
                return next(new error.MissingParameterError({ required: ['token', 'password']}));
            }

            var decryptedToken;

            try {
                decryptedToken = email.decryptLinkToken(req.body.token);
            } catch (err) {
                return next(new error.InvalidArgumentError('Invalid Token', { token: req.body.token, err: err }));
            }

            var userId = decryptedToken.split(config.linkTokenEncryption.separator)[0];
            var tokentimestamp = decryptedToken.split(config.linkTokenEncryption.separator)[1];

            if (new Date().getMilliseconds() - tokentimestamp > config.linkTokenEncryption.maxTokenLifetime) {
                return next(new error.InvalidArgumentError('Token is expired', { token: req.body.token }));
            }

            User.findById(userId)
                .select(User.privatePropertiesSelector)
                .exec(function (err, user) {
                    if (err) {
                        return error.handleError(err, next);
                    }
                    if (!user) {
                        return next(new error.ResourceNotFoundError('User not found', { id: userId }));
                    }

                    user.hashed_password = undefined;
                    user.password = req.body.password;
                    user.tempPasswordFlag = false;
                    user.emailValidatedFlag = true;
                    user.save(function (err, saveduser) {

                        res.send(200, {});
                        return next();
                    });

                });

        };
    };

    var avatarImagePostFn = function (baseUrl) {
        return function (req, res, next) {

            if (!req.files || !req.files.file || !req.files.file.path || !req.files.file.name) {
                return next(new error.MissingParameterError({ required: ['file', 'file.name']} ));
            }

            image.resizeImage(req, req.files.file, 'user', function (err, image) {

                if (err) {
                    return next(err);
                }
                req.log.debug("stored image, available at url: " + image);
                var user = req.user;
                user.avatar = image;
                user.save(function (err, savedUser) {
                    if (err) {
                        return error.handleError(err, next);
                    }
                });

                // send response
                res.send({avatar: user.avatar});
                return next();
            });

        };
    };

    var getAllFn = function getAllFn(baseUrl) {
        return function (req, res, next) {

            var isAdmin = auth.isAdminForModel(req.user, User);
            var isProductAdmin = auth.checkAccess(req.user, auth.accessLevels.al_productadmin);
            var campaign = req.params.campaign || req.user.campaign && (req.user.campaign._id || req.user.campaign);
            var isCampaignLead = campaign && _.any(campaign.campaignLeads, function (campaignLead) {
                    return req.user._id.equals(campaignLead);
                });
            var dbQuery = User.find();

            if (!isAdmin) {
                dbQuery.limit(10);
                if (campaign) {
                    dbQuery.where({campaign: campaign});
                }
                if(isCampaignLead) {
                    dbQuery.select('+email');
                }
                if (isProductAdmin) {
                    dbQuery.select('+profile');
                }
            } else {
                dbQuery.select('+profile +email +username');
            }

            generic.processDbQueryOptions(req.query, dbQuery, User)
                .exec(generic.sendListCb(req, res, next));
        };
    };

    return {
        postFn: postFn,
        validateUserPostFn: validateUserPostFn,
        sendVerificationEmailPostFn: sendVerificationEmailPostFn,
        emailVerificationPostFn: emailVerificationPostFn,
        requestPasswordResetPostFn: requestPasswordResetPostFn,
        passwordResetPostFn: passwordResetPostFn,
        avatarImagePostFn: avatarImagePostFn,
        getAllFn: getAllFn
    };

};