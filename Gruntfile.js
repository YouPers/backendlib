'use strict';

module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({
        jshint: {
            options: {
                jshintrc: '.jshintrc'
            },
            gruntfile: {
                src: ['Gruntfile.js']
            },
            code: {
                src: ['src/**/*.js']
            }
        },
        watch: {
            gruntfile: {
                files: '<%= jshint.gruntfile.src %>',
                tasks: ['jshint:gruntfile']
            },
            test: {
                files: [ 'src/**/*.js', 'spec/**/*spec.js'],
                tasks: [ 'jasmine_node']
            }
        },
        jasmine_node: {
            specNameMatcher: "spec" // load only specs containing specNameMatcher
        },
        curl: {
            apidoclist: {
                src: 'http://localhost:8000/api-docs',
                dest: 'dist/api-docs/resources.json'
            }
        },
        'curl-dir': {
            apidocfiles: {
                src: '',
                router: function (url) {
                    return url.split('/')[4] ;
                },
                dest: 'dist/api-docs'
            }
        }
    });


    grunt.registerTask('apidoc', 'downloads apidoc to dist/apidoc', function () {
        grunt.task.requires('curl:apidoclist');

        var resourceList = grunt.file.readJSON('dist/api-docs/resources.json');
        var srcPaths = [];
        grunt.log.writeln(JSON.stringify(resourceList));
        grunt.log.writeln(resourceList.apis.length);
        for (var i = 0; i < resourceList.apis.length; i++) {
            grunt.log.writeln(resourceList.basePath + resourceList.apis[i].path);
            srcPaths.push(resourceList.basePath + resourceList.apis[i].path);
        }
        grunt.log.writeln(JSON.stringify(srcPaths));
        grunt.config.set('curl-dir.apidocfiles.src', srcPaths);
        grunt.task.run('curl-dir:apidocfiles');
    });

    // These plugins provide necessary tasks.
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-jasmine-node');
    grunt.loadNpmTasks('grunt-curl');

    // Default task.
    grunt.registerTask('default', ['jshint', 'jasmine_node']);
    grunt.registerTask('test', ['jshint', 'jasmine_node']);
    grunt.registerTask('pushapidoc', ['express:dev', 'curl:apidoclist','apidoc']);
};