var error = require('../util/error');
var _ = require('lodash');

module.exports = function (config) {

    var image = require('../util/image')(config);


    var imagePostFn = function () {
        return function (req, res, next) {
            req.log.trace({req: req, body: req.body, reqFiles: req.files}, "imagePostFn");

            if (!req.files || !req.files.file || !req.files.file.path || !req.files.file.name) {
                req.log.error({req: req, files: req.files, filesFile: _.get(req, 'files.file')}, "missing parameter in image post");
                return next(new error.MissingParameterError({ required: ['file', 'file.name'], received: req.files} ));
            }

            if (!req.params.type) {
                return next(new error.MissingParameterError({ required: ['type']} ));
            }

            if (req.params.type === 'custom' ) {
                if (!req.params.sizeX || !req.params.sizeY) {
                    return next(new error.MissingParameterError('"sizeX" and "sizeY" are required for type "custom"', {type: req.params.type, sizeX: req.params.sizeX, sizeY: req.params.sizeY } ));
                }

                if (!_.isFinite(parseFloat(req.params.sizeX)) || !_.isFinite(parseFloat(req.params.sizeY)) ) {
                    return next(new error.InvalidArgumentError('"sizeX" and "sizeY" must be Numbers', {type: req.params.type, sizeX: req.params.sizeX, sizeY: req.params.sizeY } ));
                }
            }

            image.resizeImage(req, req.files.file, req.params.type, [req.params.sizeX, req.params.sizeY], function (err, image) {

                if (err) {
                    return next(err);
                }
                req.log.debug("stored image, available at url: " + image);

                res.header('Location', image);

                // send response
                res.send(201, {url: image});
                return next();
            });
        };
    };


    return {
        imagePostFn: imagePostFn
    };

};