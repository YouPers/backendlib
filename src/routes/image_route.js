module.exports = function (swagger, config) {

    var imageHandlers = require('../handlers/image_handlers')(config);
    var baseUrl = '/images';


    swagger.addOperation({
        spec: {
            description: "send an example push notification",
            path: baseUrl,
            summary: "initiates push notifications to all devices registered for this user",
            method: "POST",
            params: [
                swagger.bodyParam("file", "file to be uploaded", "{}"),
                swagger.queryParam("type", "the image type this image should be used for, used for sizeing correctly", "{}")
            ],
            "nickname": "imagePost",
            accessLevel: 'al_user'
        },
        action: imageHandlers.imagePostFn()

    });
};