var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    _ = require('lodash'),
    auth = require('../util/auth'),
    swaggerAdapter = require('../util/swaggerMongooseAdapter'),
    timestamps = require('mongoose-timestamp');

module.exports = {

    /**
     * general additions that all our Schemas can use.
     *
     * @param definition
     * @param options
     * @returns {Schema}
     * @param BaseSchema
     */
    newSchema: function (definition, options, BaseSchema) {

        // we keep track of all i18n strings on this schema
        var multilingualValues = [];

        // TODO: Move to some global config
        var supportedLanguages = ['de', 'en', 'fr', 'it'];
        var defaultLanguage = 'de';

        // go through all properties defined for this model
        // for every prop check whether it has the attribute i18n with value true
        // for every such i18n property replace the simple String model by a struct: {de: String, fr: String, ....}
        // so, in the database we store an object with a key for each language instead of just a String.
        // we change the key from 'keyname' to 'keynameI18n'
        _.forEach(definition, function (value, key) {
            value = definition[key];
            if ('i18n' in value && value['i18n'] === true) {
                delete value['i18n'];

                multilingualValues.push(key);

                var struct = {};
                _.forEach(supportedLanguages, function (lang) {
                    struct[lang] = value;
                    if ((lang !== defaultLanguage) && 'required' in value && value['required'] === true) {
                        delete struct[lang]['required'];
                    }
                });
                definition[key + 'I18n'] = struct;
                delete definition[key];
            }
        });

        var mySchema = BaseSchema ? new BaseSchema(definition, options) :
            new Schema(definition, options);

        // To make it easy for clients/handlers/controllers to access the i18n properties we add virtual
        // getters and setters
        _.forEach(multilingualValues, function (key) {
            mySchema.virtual(key)
                // the getter check whether one or multiple languages have been loaded from the Database in the
                // property 'keynameI18n'. If only one was loaded, it returns the unwrapped value, because the
                // client has asked for only one locale and we queried the Database to only return this locale
                // if more than one locale was loaded we return the full struct and expects the client to handle it.
                .get(function () {
                    var myValue = this.get(key + 'I18n');
                    var nrOfLocalesLoaded = _.keys(myValue).length;
                    if (nrOfLocalesLoaded === 1) {
                        return myValue[_.keys(myValue)[0]];
                    } else if (nrOfLocalesLoaded === 0) {
                        // TODO: find a way to deliver a reasonable Fallback in this case, needs adjusting of the querySelector!!!
                        return "";
                    } else {
                        // many locales loaded, --> so we give him a reasonable default
                        return  myValue[this.$locale || defaultLanguage] || myValue['en'] || myValue[_.keys(myValue)[0]];
                    }
                })
                .set(function (value) {
                    if(!this[key + 'I18n']) {
                        this[key + 'I18n'] = {};
                    }
                    this[key + 'I18n'][this.$locale || defaultLanguage] = value;
                });
        });

        if (multilingualValues.length > 0) {

            /**
             * This Method returns an Object that can be given to any mongoose Database query with a
             * .select() statement. When you use this selector, the query will return only the passed in locale
             * for any i18n=true properties. And the JSON Formatter of this schema will then unwrap the i18n objects
             * into normal localized String.
             *
             * @param locale the locale to be loaded.
             * @param basePath used for recursive calls, do not pass any value when you call this Fn in a controller.
             * @returns {*} that can be given to mongoose.query.select()
             */
            mySchema.statics.getI18nPropertySelector = function (locale, basePath) {

                var selectObj = {};
                basePath = basePath ? basePath + '.' : '';

                // add the multilingual Values of this Model
                _.forEach(multilingualValues, function (prop) {
                    _.forEach(supportedLanguages, function (lng) {
                        if (lng !== locale) {
                            selectObj[basePath + prop + 'I18n.' + lng] = 0;
                        }
                    });
                });

                // recursivly call for all subSchemas and merge the results together
                _.forEach(definition, function (value, key) {
                    var propertyType = Array.isArray(value) ? value[0] : value;
                    if (propertyType instanceof mongoose.Schema && propertyType.statics.getI18nPropertySelector) {
                        _.merge(selectObj, propertyType.statics.getI18nPropertySelector(locale, basePath ? basePath + key : key));
                    }
                });
                return selectObj;
            };
        }

        mySchema.statics.adminRoles = [auth.roles.systemadmin];

        /**
         * overwrite the way we generally render objects to JSON.
         *
         * This is called automatically for every subschema, so we do not have to do recursion ourselves.
         */
        mySchema.set('toJSON', {
            transform: function (doc, ret, options) {
                if (!ret) {return;}
                ret.id = ret._id;
                delete ret._id;

                _.forEach(multilingualValues, function (prop) {

                    // enable the virtual if there is a value available
                    if (doc[prop]) {
                        ret[prop] = doc[prop];
                    }

                    // the real stored db value is hidden from the client.
                    delete ret[prop + 'I18n'];
                });

                if (doc.toJsonConfig) {

                    // include values from virtuals or manual set flags that are not part of the schema
                    if (doc.toJsonConfig.include) {
                        _.forEach(doc.toJsonConfig.include, function (include) {
                            if (doc[include] !== undefined) {
                                ret[include] = doc[include];
                            }
                        });
                    }

                    if (doc.toJsonConfig.hide) {
                        _.forEach(doc.toJsonConfig.hide, function (propertyToHide) {
                            delete ret[propertyToHide];
                        });
                    }
                }
            }});

        /**
         * This function takes a mongoose Schema description and outputs the same schema as a swagger model to be
         * consumed by Swagger.
         *
         * @returns {{}}
         */
        mySchema.statics.getSwaggerModel = function () {
            return swaggerAdapter.getSwaggerModel(this);
        };

        mySchema.plugin(timestamps, {updatedAt: 'updated', createdAt: 'created'
        });

        mySchema.methods.getStatsString = function () {
            return this.titleI18n || this.title;
        };

        // check whether this is a inherited schema from a schema that has already had a post remove hook added
        // to prevent adding (and then executing) the hook twice.

        // this is only a workaround, not a clean implementation:
        // we could not find a clean way to check whether there is already the same remove hook
        // on this schema. The workaround:
        // - check whether we do not inherit from a AbstractBaseSchema --> we are a simple normal class
        // - check whether we are the concrete instantiation of the BaseSchema and not some inherited
        // object of the BaseSchame, add the method if we are the partent itself. We assume to be the parent
        // if the definition object is empty.

        if (!BaseSchema || _.keys(definition).length === 0) {
            mySchema.post('remove', function(doc) {
                var DeleteJournal = mongoose.model('Deletejournal');
                var journal = new DeleteJournal(
                    {
                        model: doc.constructor.modelName,
                        deleted: new Date(),
                        _id: doc._id
                    }
                );
                journal.save(function (err) {
                    if (err) {
                        if (err.code !== 11000) {
                            throw err;
                        } else {
                            console.log('duplicate deletion of: ' + doc.id);
                        }
                    }
                });

            });
        }

        return mySchema;
    },

    getSwaggerModel: swaggerAdapter.getSwaggerModel
};