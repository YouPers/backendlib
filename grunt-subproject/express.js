module.exports = {

    options: {
        // Override defaults here
    },
    dev: {
        options: {
            port: 8000,
            script: './src/app.js',
            delay: 3000,
            output: null  // is needed, otherwise delay is ignored after any server output to System.out

        }
    }

};