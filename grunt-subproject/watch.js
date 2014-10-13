module.exports = {

    gruntfile: {
        files: '<%= jshint.gruntfile.src %>',
        tasks: ['jshint:gruntfile']
    },
    test: {
        files: 'spec/**/*spec.js',
        tasks: [ 'jasmine_node']
    },
    express: {
        files: [ 'src/**/*.js'],
        tasks: [ 'express:dev' ],
        options: {
            nospawn: true //Without this option specified express won't be reloaded
        }
    }

};