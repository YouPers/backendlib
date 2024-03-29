/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    common = require('./common'),
    error = require('../util/error'),
    Profile = mongoose.model('Profile'),
    bcrypt = require('bcrypt');

var BCRYPT_PREFIX = "bcrypt:";
/**
 * User Schema
 */
var UserSchema = common.newSchema({
    firstname: {type: String, trim: true, required: true},
    lastname: {type: String, trim: true, required: true},
    fullname: {type: String, trim: true, required: true},
    accessToken: {type: String, select: false},
    refreshToken: {type: String, select: false},
    provider: {type: String, select: false},
    providerId: {type: String, select: false},
    emails: [String],
    photos: [String],
    email: {type: String, trim: true, lowercase: true, required: true, unique: true, select: false},
    avatar: {type: String},
    emailValidatedFlag: {type: Boolean, default: false, select: false},
    username: {type: String, trim: true, lowercase: true, required: true, unique: true, select: false},
    lastLogin: {type: Date},
    lastSummaryMail: {type: Date},
    roles: {type: [String], select: false},
    hashed_password: {type: String, trim: true, select: false},
    tempPasswordFlag: {type: Boolean, default: false, select: false},
    profile: {type: ObjectId, ref: 'Profile', select: false}
});

/**
 * Methods
 */

UserSchema.methods = {

    /**
     * Encrypt password
     *
     * @param {String} password
     * @return {String}
     * @api public
     */
    encryptPassword: function (password, cb) {
        if (!password || !this._id) {
            return cb(null, '');
        }
//        return crypto.createHmac('sha1', this._id.toString()).update(password).digest('hex'); // using the ObjectId as the salt
        bcrypt.hash(password, 8, function (err, hash) {
            if (err) {
                return cb(err);
            }
            return cb(null, BCRYPT_PREFIX + hash);
        });
    },

    validPassword: function (password, cb) {
        if (this.hashed_password.indexOf(BCRYPT_PREFIX) === 0) {
            return bcrypt.compare(password, this.hashed_password.substring(BCRYPT_PREFIX.length), cb);
        } else {
            return cb(null, crypto.createHmac('sha1', this._id.toString()).update(password).digest('hex') === this.hashed_password);
        }
    },
    toJsonConfig: function () {
        return {
            hide: ['hashed_password', 'tempPasswordFlag']
        };
    },

    getPersonalNotificationQueues: function () {
        // the personal _id of the user for personal messages
        var queues = [this._id];

        // add the campaign _id to get Notifications from the camapaign commuinity
        if (this.campaign) {
            queues.push(this.campaign._id || this.campaign);
        }

        // add special queues the user has subscribed to
        if (this.profile && this.profile.notificationQueues) {
            queues = queues.concat(this.profile.notificationQueues);
        }
        return queues;
    }
};

UserSchema.statics.privatePropertiesSelector = '+email +roles +emailValidatedFlag +hashed_password +tempPasswordFlag +profile +username';
/**
 * helper functions
 */
var validatePresenceOf = function (value) {
    return value && value.length;
};

/**
 * Virtuals
 */

UserSchema.virtual('password_old')
    .set(function (password_old) {
        this._password_old = password_old;
    })
    .get(function () {
        return this._password_old;
    });

UserSchema
    .virtual('password')
    .set(function (password) {
        this._password = password;
    })
    .get(function () {
        return this._password;
    });

/**
 * // Validation pre-save hook
 */
UserSchema.pre('save', function (next, req, callback) {
    if (!validatePresenceOf(this.username)) {
        return next(new error.MissingParameterError({required: 'username'}));
    }
    if (!validatePresenceOf(this.roles)) {
        return next(new error.MissingParameterError({required: 'roles'}));
    }
    if (!validatePresenceOf(this.email)) {
        return next(new error.MissingParameterError({required: 'email'}));
    }
    if (this.email.indexOf('@') <= 0) {
        return next(new error.MissingParameterError('Email address must be valid'));
    }
    return next(req, callback);

});

/**
 *  Password handling pre-save hook
 */
UserSchema.pre('save', function (next, req, callback) {
    var self = this;

    function saveNewPassword() {
        self.encryptPassword(self.password, function (err, hash) {
            self.hashed_password = hash;
            return next(req, callback);
        });
    }

    if (!self.hashed_password) {
        // this user does not have a password yet
        return saveNewPassword();
    } else if (this.password_old) {
        // this is a user who wants to change his password, check whether we got a correct old password
        self.validPassword(self.password_old, function (err, result) {
            if (result) {
                return saveNewPassword();
            } else {
                return next(new error.InvalidArgumentError('Invalid password.'));
            }
        });
    } else {
        // no password operations needed
        return next(req, callback);
    }

});


/**
 * Profile handling pre-save hook
 */
UserSchema.pre('save', function (next, req, callback) {

    if (!this.isNew || this.profile) {
        if (this.campaign && (this.campaign !== this.profile.campaign )) {
            Profile.update({_id: this.profile._id || this.profile}, {campaign: this.campaign._id || this.campaign}).exec(function (err) {
                if (err) {
                    return error.handleError(err, next);
                }
                return next(callback);
            });
        } else {
            return next(callback);
        }
    } else {
        // generate and store new profile id into new user object
        var newProfileId = mongoose.Types.ObjectId();
        this.profile = newProfileId;

        var newProfile = new Profile({
            _id: newProfileId,
            owner: this.id,
            timestamp: new Date(),
            campaign: this.campaign,
            language: req.locale
        });

        newProfile.save(function (err) {
            if (err) {
                return error.handleError(err, next);
            }
        });
        if (!this.avatar) {
            this.avatar = this.profile.gender === 'male' ? 'https://insp-ci.youpers.com/assets/img/default_avatar_man.png' : 'https://insp-ci.youpers.com/assets/img/default_avatar_woman.png';
        }
        return next(callback);

    }
});

UserSchema.pre('remove', function (next) {


    var profile = Profile.find({owner: this._id});

    profile.remove(function (err) {
        if (err) {
            return error.handleError(err, next);
        }
    });

    next();
});

UserSchema.plugin(require('mongoose-eventify'));

module.exports = UserSchema;
