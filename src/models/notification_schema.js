/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    common = require('./common');


/**
 * deletejournal Schema
 */
var Notification = common.newSchema({
    "status": {type: String, enum: ['unread', 'read', 'deleted'], required: true, default: 'unread'},
    "gcmtype": {type: String},
    "title": {type: String},
    "description": {type: String},
    "triggeringUser": {type: ObjectId, ref: 'User'},
    "owner": {type: ObjectId, ref: 'User', required: true},
    "data": {}
});

module.exports = Notification;