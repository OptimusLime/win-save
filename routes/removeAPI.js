//For removing objects from database
var fs = require('fs'),
    path = require('path'),
    util = require('util');


module.exports = function(appRoutes)
{
    var winroutes = appRoutes;

    var removeAPI = this;

    //Schemalaoder already booted up by the time the routes are loaded
    var schemaLoader = winroutes.schemaLoader;

    removeAPI.removeReferencedObjects = function(refMapping, finished)
    {
        var schemaModels = schemaLoader.getSchemaModels();
        var mapCount = Object.keys(refMapping).length;

        console.log(refMapping);
        var errors;
        for(var refType in refMapping)
        {
            var Model = schemaModels[refType];

            Model.remove({wid: {$in: refMapping[refType]}}, function(err){

                if(err)
                {
                    if(!errors)
                        errors = [];

                    errors.push(err);
                }

                mapCount--;
                if(mapCount <= 0)
                {
                    //finisehd with all removals
                    finished(errors);
                }
            });
        }
    };
};