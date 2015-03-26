module.exports = function (swagger, config) {

    var imageHandlers = require('../handlers/image_handlers')(config);
    var baseUrl = '/images';


    swagger.addOperation({
        spec: {
            description: "uploads a picture to our servers and returns a URL to access the picture later. Will resize the picture to fit the specified type",
            path: baseUrl,
            summary: "uploads a picture and returns a URL",
            notes: "use HTTP multipart form upload to post an image and then get a publicly accessible URL for the image. Use this to upload an avatar picture, store then the URL you get from this call on the object, e.g. object.picture or object.avatar",
            method: "POST",
            params: [
                swagger.bodyParam("file", "file to be uploaded", "{}"),
                swagger.queryParam("type", "the image type this image should be used for, used for sizeing correctly, supported types are: user (user avatar), idea, marketPartnerLogo, campaign, organization, custom", "{}"),
                swagger.queryParam("sizeX", "if you specify type: 'custom' you need to specify the sizeX and sizeY, the image will be resized to sizeXxsizeY", "{}"),
                swagger.queryParam("sizeY", "if you specify type: 'custom' you need to specify the sizeX and sizeY, the image will be resized to sizeXxsizeY", "{}")
            ],
            "nickname": "imagePost",
            accessLevel: 'al_user'
        },
        action: imageHandlers.imagePostFn()

    });
};