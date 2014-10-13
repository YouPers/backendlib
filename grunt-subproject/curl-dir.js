module.exports = {

    apidocfiles: {
        src: '',
        router: function (url) {
            return url.split('/')[4] ;
        },
        dest: 'dist/api-docs'
    }

};