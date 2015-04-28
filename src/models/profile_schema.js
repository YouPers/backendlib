/**
 * Created by irig on 13.01.14.
 */

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    common = require('./common');


var enums = {
    gender: "undefined female male".split(' '),
    maritalStatus: "undefined single unmarried married separated divorced widowed".split(' ')
};

/**
 * Profile Schema
 */
var ProfileSchema = common.newSchema({
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gender: { type: String, enum: enums.gender, default: "undefined" },
    birthDate: { type: Date },
    campaign: {type:  Schema.Types.ObjectId, ref:'Campaign'},
    devices: [{
        deviceType: {type: String, required: true, enum: ['ios', 'android']},
        token: {type: String, required: true},
        osVersion: {type: String},
        model: {type: String}
    }],
    homeAddress: {
        street: { type: String, trim: true },
        houseNumber: { type: String, trim: true },
        zipCode: { type: Number },
        city: { type: String, trim: true },
        country: { type: String, enum: enums.country },
        location:  {type: [Number], index: '2d'}
},
    workAddress: {
        street: { type: String, trim: true },
        houseNumber: { type: String, trim: true },
        zipCode: { type: Number },
        city: { type: String, trim: true },
        country: { type: String, trim: true },
        location:  {type: [Number], index: '2d'}
    },
    maritalStatus: { type: String, enum: enums.maritalStatus, default: "undefined" },
    language: { type: String, trim: true},
    prefs: {
        defaultWorkWeek: {type: [String], default: ['MO', 'TU', 'WE', 'TH', 'FR']},
        personalGoal: {type: String},
        focus: [
            {
                timestamp: {type: Date},
                question: {type: ObjectId, ref: 'AssessmentQuestion'}
            }
        ],
        starredIdeas: [
            {
                timestamp: {type: Date},
                idea: {type: ObjectId, ref: 'Idea'}
            }
        ],
        rejectedIdeas: [
            {
                timestamp: {type: Date},
                idea: {type: ObjectId, ref: 'Idea'}
            }
        ],
        rejectedActivities: [
            {
                timestamp: {type: Date},
                activity: {type: ObjectId, ref: 'Activity'}
            }
        ],
        firstDayOfWeek: { type: String, enum: ['SU', 'MO'] },
        timezone: { type: String, trim: true },
        calendarNotification: {type: String, enum: enums.calendarNotifications, default: '900'},
        email: {
            iCalInvites: { type: Boolean, default: false },
            actPlanInvites: { type: Boolean, default: true },
            dailyUserMail: { type: Boolean, default: true },
            weeklyCampaignLeadMail: { type: Boolean, default: true }
        }
    }

});

ProfileSchema.plugin(require('mongoose-eventify'));

module.exports = ProfileSchema;
