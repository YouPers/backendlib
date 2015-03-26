var fs = require('fs'),
    gm = require('gm'),
    AWS = require('aws-sdk'),
    mongoose = require('mongoose'),
    error = require('../util/error'),
    moment = require('moment');

module.exports = function (config) {

    AWS.config.region = config.AWS.defaultRegion;
    AWS.config.update({accessKeyId: config.AWS.accessKeyId, secretAccessKey: config.AWS.secretAccessKey});

    var resizeImage = function (req, fileObject, type, size, callback) {


        var dimensions = {
            user: [100, 100],
            campaign: [265, 167],
            organization: [265, 167],
            idea: [250, 168],
            marketPartnerLogo: [250, 100]
        };

        var imgSize = [200, 200];

        if (type === 'custom') {
            imgSize = size;
        } else {
            imgSize = dimensions[type];
        }

        if (!imgSize || imgSize.length !== 2) {
            return callback(new error.InvalidArgumentError('type and size not valid', {type: type, size: size}));
        }

        var sizeA = imgSize[0];
        var sizeB = imgSize[1];

        var path = fileObject.path;
        var name = fileObject.name;
        var pathResized = path + "_resized";

        req.log.debug('avatar: resize to \n' + sizeA + 'x' + sizeB + path);


        // resize on fs using GraphicMagick
        gm(path)
            .thumbnail(sizeA, sizeB + '^')
            .autoOrient()
            .noProfile() // remove meta
            .write(pathResized, function (err) {
                if (err) {
                    return callback(err);
                }
                req.log.debug('avatar: resize complete\n' + pathResized);

                req.log.trace("file resized");
                storeFile(pathResized, name, req, function(err, url) {
                    if (err) {
                        return callback(err);
                    }
                    req.log.trace("file stored");
                    callback(null, url);

                    fs.unlink(path);
                    fs.unlink(pathResized);

                });
            });

    };

    function _getExtension(filename) {
        if (filename.lastIndexOf('.') !== -1) {
            return filename.substring(filename.lastIndexOf('.')).replace(' ','_');
        } else {
            return '';
        }
    }

    var storeFile = function (filePath, filename, req, cb) {
        req.log.trace("storing...");
        var s3Bucket = new AWS.S3({params: {Bucket: config.AWS.fileupload.bucketName}});

        var body = fs.createReadStream(filePath);
        var key = mongoose.Types.ObjectId().toString() + _getExtension(filename);

        var params = {Key: key, Body: body, Expires: moment().add(1, 'year').toDate(), 'CacheControl': 'max-age=31536000'};
        s3Bucket.upload(params, function(err, result) {
            req.log.trace("in  store cb, err: " + err);
            if (err) {
                return cb(err);
            }
            return cb(null, "https://" + config.AWS.fileupload.bucketName +".s3.amazonaws.com/" + key);
        });
    };


    return {
        resizeImage: resizeImage
    };
};