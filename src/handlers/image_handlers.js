var error = require('../util/error');

module.exports = function (config) {

    var image = require('../util/image')(config);


    var imagePostFn = function () {
        return function (req, res, next) {
            req.log.debug("imagePostFn");

            if (!req.files || !req.files.file || !req.files.file.path || !req.files.file.name) {
                return next(new error.MissingParameterError({ required: ['file', 'file.name']} ));
            }

            if (!req.params.type) {
                return next(new error.MissingParameterError({ required: ['type']} ));
            }

            image.resizeImage(req, req.files.file, req.params.type, function (err, image) {

                if (err) {
                    return next(err);
                }
                req.log.debug("stored image, available at url: " + image);

                res.header('Location', image);

                // send response
                res.send(201);
                return next();
            });
        };
    };


    return {
        imagePostFn: imagePostFn
    };

};