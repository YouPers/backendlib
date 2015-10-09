/**
 * Module dependencies.
 */
var common = require('./common');

/**
 * deletejournal Schema
 */
var BatchReport = common.newSchema({
    batchName: { type: String, trim: true},
    "batchId": { type: String, trim: true, required: true },
    "instance": { type: String, trim: true, required: true },
    "started":  { type: Date, required: true },
    "foundWorkItems":  { type: Number},
    "successCount": { type: Number},
    "errorCount": { type: Number},
    "success": [
        {
            "id": { type: String},
            "result": {}
        }
    ],
    "errored": [{
        "id": { type: String},
        "result": {}
    }],
    "ended": { type: Date, required: true },
    "runTimeTotal": { type: Number},
    "avgItemTime": { type: Number}
});

module.exports = BatchReport;