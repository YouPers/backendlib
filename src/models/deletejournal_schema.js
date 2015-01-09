/**
 * Module dependencies.
 */
var common = require('./common');

/**
 * deletejournal Schema
 */
var DeleteJournal = common.newSchema({
    model: { type: String, trim: true, required: true },
    deleted: {type: Date, required: true}
});

module.exports = DeleteJournal;