module.exports = {

    'default' : [
        'jshint',
        'jasmine_node'
    ],

    'test': [
        'jshint',
        'express:dev',
        'jasmine_node'
    ],

    'testdebug' : [
        'jshint',
        'jasmine_node'
    ],

    'server' : [
        'jshint',
        'nodemon'
    ],

    'servertest' : [
        'express:dev',
        'jasmine_node',
        'watch'
    ],

    'pushapidoc' : [
        'express:dev',
        'curl:apidoclist',
        'apidoc'
    ]
};