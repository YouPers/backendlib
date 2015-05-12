var passport = require('passport');


module.exports = function (swagger, config) {
    var auth = require('../util/auth').handlers(config);
    var baseUrl = '/auth/';


    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: baseUrl + "basic",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth over HTTPS",
            method: "POST",
            params: [swagger.headerParam("Authentication", "HTTP Basic Auth credentials", "string", true)],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            authMiddleware: passport.authenticate([ 'basic' ], {session: false}),
            accessLevel: 'al_user'
        },
        action: auth.loginAndExchangeTokenAjax
    });

    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: baseUrl + "github",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth over HTTPS",
            method: "GET",
            params: [swagger.headerParam("Authentication", "HTTP Basic Auth credentials", "string", true)],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            authMiddleware: passport.authenticate([ 'github' ], {session: false}),
            accessLevel: 'al_user'
        },
        action: null
    });

    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: baseUrl + "github/callback",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth over HTTPS",
            method: "GET",
            params: [swagger.headerParam("Authentication", "HTTP Basic Auth credentials", "string", true)],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            authMiddleware: passport.authenticate([ 'github' ], {session: false}),
            accessLevel: 'al_user'
        },
        action: auth.loginAndExchangeTokenRedirect
    });

    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: baseUrl + "facebook",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth over HTTPS",
            method: "GET",
            params: [swagger.headerParam("Authentication", "HTTP Basic Auth credentials", "string", true)],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            authMiddleware: passport.authenticate([ 'facebook' ], {session: false}),
            accessLevel: 'al_user'
        },
        action: null
    });

    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: baseUrl + "facebook/callback",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth over HTTPS",
            method: "GET",
            params: [swagger.headerParam("Authentication", "HTTP Basic Auth credentials", "string", true)],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            authMiddleware: passport.authenticate([ 'facebook' ], {session: false}),
            accessLevel: 'al_user'
        },
        action: auth.loginAndExchangeTokenRedirect
    });


    swagger.addOperation({
        spec: {
            description: "validate authentication credentials",
            path: "/login",
            notes: "validates the passed credentials and returns the user object belonging to the credentials",
            summary: "currently supports HTTP Basic Auth and Bearer Token over HTTPS",
            method: "POST",
            params: [
                swagger.headerParam("Authentication", "HTTP Basic Auth credentials or HTTP Bearer Token", "string", false),
                swagger.bodyParam("Device Information",
                    "Information about the user's mobile device, including the id needed for push notifications", "Device", false),
                ],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "login",
            accessLevel: 'al_user'
        },
        action: auth.loginAndExchangeTokenAjax
    });

    swagger.addOperation({
        spec: {
            description: "logout",
            path: "/logout",
            notes: "disconnects this user from a device",
            summary: "disconnects a user from a device",
            method: "POST",
            params: [
                swagger.headerParam("Authentication", "HTTP Basic Auth credentials or HTTP Bearer Token", "string", false),
                swagger.bodyParam("token",
                    "the device Token", "String", false),
            ],
            responseClass: "User",
            "errorResponses": [],
            "beforeCallbacks": [],
            "nickname": "logout",
            accessLevel: 'al_user'
        },
        action: auth.logout
    });

};