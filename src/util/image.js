var fs = require('fs'),
    gm = require('gm'),
    AWS = require('aws-sdk'),
    mongoose = require('mongoose'),
    querystring = require('querystring');

module.exports = function (config) {

    AWS.config.region = config.AWS.defaultRegion;
    AWS.config.update({accessKeyId: config.AWS.accessKeyId, secretAccessKey: config.AWS.secretAccessKey});

    var resizeImage = function (req, fileObject, type, callback) {


        var dimensions = {
            user: [100, 100],
            campaign: [265, 167],
            organization: [265, 167]
        };

        var sizeA = dimensions[type][0];
        var sizeB = dimensions[type][1];

        var path = fileObject.path;
        var name = fileObject.name;
        var pathResized = path + "_resized";

        req.log.debug('avatar: resize to \n' + sizeA + 'x' + sizeB + path);


        // resize on fs using GraphicMagick
        gm(path)
            .define('jpeg:size=' + sizeA + 'x' + sizeB) // workspace
            .thumbnail(sizeA, sizeB + '^') // shortest side sizeB
            .gravity('center') // center next operation
            .extent(sizeA, sizeB) // canvas size
            .noProfile() // remove meta
            .write(pathResized, function (err) {
                if (err) {
                    return callback(err);
                }
                req.log.debug('avatar: resize complete\n' + pathResized);

                // read resized image from fs and store in db

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

        var params = {Key: key, Body: body};
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