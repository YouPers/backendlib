module.exports = {

    dev: {
        script: 'src/app.js',
        options: {
            nodeArgs: ['--debug'],
            watch: ['src'],
            delay: 1,
            env: {
                PORT: '8000',
                TZ: 'UTC',
                NODE_TIME_KEY: '9f2bf583430d5bdf2636153a901ec841cd6a51fa'
            }
        }
    }

};