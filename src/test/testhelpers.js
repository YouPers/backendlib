var _ = require('lodash');

var reqDefaults =  {
    params: {},
    user: {
        _id: "afakeid",
        fullname: "Fake Testuser",
        firstname: "Fake",
        lastname: "Testuser",
        profile: {}
    },
    body: {},
    method: "GET"
};

var respDefaults =  {
    send: function(obj, status) {
        this.payload = obj;
        this.status = status || 200;
    }
};

var nextDefaults = function(err) {
    this.err = err;
};

var _mockRequest = function (req) {
    return _.defaults(req, reqDefaults);
};

var _mockResponse = function (res) {
    return _.defaults(res, respDefaults);
};

var _mockNext = function () {
    return nextDefaults;
};

module.exports = {
    getMockRequest: _mockRequest,
    getMockResponse: _mockResponse,
    getMockNext: _mockNext
};