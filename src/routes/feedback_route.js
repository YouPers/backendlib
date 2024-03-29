/**
 * User Feedback routes
 *    forward user feedback to JIRA API
 */

var restify = require("restify"),
    error = require('../util/error');


module.exports = function (swagger, config) {
    var log = require('../util/log').getLogger(config);
    var baseUrl = '/feedback';

    var client = restify.createJsonClient({
        url: config.feedback.url,
        version: '*',
        log: log
    });

    client.basicAuth(config.feedback.username, config.feedback.password);


    swagger.addOperation({
        spec: {
            description: "Post feedback",
            path: baseUrl,
            notes: "creates an JIRA issue for the posted feedback",
            summary: "Post feedback",
            method: "POST",
            params: [swagger.bodyParam("feedback", "feedback object", "Feedback")],
            "errorResponses": [],
            "nickname": "postFeedback",
            accessLevel: 'al_all'
        },
        action: function (req, res, next) {

            if(!req.body) {
                next(new error.MissingParameterError({ required: 'feedback object'}));
            }

            var feedback = req.body;
            var contactInfo = feedback.contactInfo || 'anonymous';
            var feedbackCategory = feedback.feedbackCategory || 'none';
            var description = feedback.description || 'none';
            var email = feedback.contactInfo && req.user.email || 'noEmailAddressProvided';

            var content = "h4. Category: " + feedbackCategory +
                "\nh4. Reporter: " + contactInfo +
                "\nh4. Email: " + email +
                "\nh4. Description:\n" + description +
                "\n\nh4. Navigator:\n" + feedback.navigator;

            var body = {
                "fields": {
                    "project":
                    {
                        "key": config.feedback.project
                    },
                    "summary": "User Feedback - " + contactInfo,
                    "description": content,
                    "issuetype": {
                        "name": "Bug"
                    },
                    "labels": ["feedback"],
                    "assignee": { name: "feedback" }
                }
            };


            var basePath = '/rest/api/latest';
            client.post(basePath + '/issue', body, function(err, request, response, obj) {
                if(err) { return error.handleError(err, next); }
                log.debug('%j', obj);

                res.send(200);
                return next();
            });



        }
    });

    swagger.addModels({Feedback: {
        id: 'Feedback',
        required: ['id'],
        properties: {
            id: {type: 'string'},
            contactInfo: {type: 'string'},
            feedbackCategory: {type: 'string'},
            description: {type: 'string'},
            navigator: {type: 'string'}
        }
    }});

};