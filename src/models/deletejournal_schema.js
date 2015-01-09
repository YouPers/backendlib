/**
 * Module dependencies.
 */
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    common = require('./common'),
    error = require('../util/error');
/**
 * deletejournal Schema
 */
var DeleteJournal = common.newSchema({
    model: { type: String, trim: true, required: true },
    deleted: {type: Date, required: true}
});

module.exports = DeleteJournal;