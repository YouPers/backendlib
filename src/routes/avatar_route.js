var Canvas = require('canvas');
var error = require('../util/error');

module.exports = function (swagger, config) {
    swagger.addOperation({
        spec: {
            description: "returns an avatar as a png for a name",
            path: '/avatar',
            notes: "creates a nice image for a name",
            summary: "always returns the same image for the same name",
            method: "GET",
            params: [swagger.queryParam("name", "name", "String")],
            errorResponses: [],
            nickname: "getAvatar",
            accessLevel: "al_all"
        },
        action: function (req, res, next) {

            if (!req.params.name) {
                next(new error.MissingParameterError('name is missing'));
            }
            var colours = ["#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#34495e", "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#2c3e50", "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6", "#f39c12", "#d35400", "#c0392b", "#bdc3c7", "#7f8c8d"];

            var nameSplit = req.params.name.split(" "),
                initials = nameSplit[0].charAt(0).toUpperCase();
            if (nameSplit[1]) {
                initials += nameSplit[1].charAt(0).toUpperCase();
            }
            var charIndex = initials.charCodeAt(0) - 65,
                colourIndex = charIndex % 19;
            var width =200, height = 200;
            var canvas = new Canvas(width, height);
            var context = canvas.getContext('2d');



            context.fillStyle = colours[colourIndex];
            context.fillRect (0, 0, width, height);
            context.font = "100px Arial";
            context.textAlign = "center";
            context.fillStyle = "#FFF";
            context.fillText(initials, width /2, height/1.5);

            res.writeHead(200, { 'Content-Type': 'image/png'});
            canvas.pngStream().pipe(res);
        }
    });
};