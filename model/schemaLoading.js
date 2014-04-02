var fs = require('fs'),
//use nodejs to find all js files, and update them
    path = require('path'),
    util = require('util');

var traverse = require('traverse');

//can use same mongoose object across many apps
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;

    var schemaLoading = this;

    //generator is guaranteed to have been created at this point -- since there are no references to other files inside generator objects
    var generator = winroutes.generator;
    var utilities = winroutes.utilities;
    var fileReader = utilities.fileReader;
    var om = utilities.objectManipulator;

    var homeDirectory  = path.resolve(__dirname, './../schemas');

    var referencePaths = {};
    var schemaFiles = {};
    //var vanillaSchemaFiles = {};
    var schemaModels = {};
    var requiredProperties = {};
    var fullMultilayerReferences = {};

    //wid can be unique?
    //, unique: true
    var defaultSchemaObjects =
    {
      wid : {type: "String", ref: ''},
      dbType : {type: "String"},
//        Not sure on if this should be a default -- I'm a little skeptical for sure
      creation : {sessionID: {type: "String"}, timeOfCreation: {type: "Date"}, isPublic: {type: "Boolean"}},
      parents: [{type: "String", ref: ''}]
    };

    var traverseIsDefault = function(path)
    {
        //get string
        var pathString = path[path.length -1];

        //if any of our default objects is equal to the top level path -- we should ignore this object
        for(var key in defaultSchemaObjects)
        {
            if(pathString === key.toString())
                return true;
        }

        //we made it here, it's not default
        return false;
    };

    var inProcess = {};
    schemaLoading.traverseProcess = function(type, obj)
    {

        inProcess[type] = true;

        var schemaTraverse = traverse(obj);

        var references = om.findReferences(obj, traverseIsDefault);
        var objRefs = references.references;
        var allTypes = references.types;

        //replace any of the type objects, while at the same time pulling our reference objects
        //we will replace these references with the full objects -- but we need to know their location first
        var replaceTypesFindRefs = function(node)
        {
            //replace anything with a type
            if(this.notLeaf && node['type'] && !node['ref'])
            {
                //update, and don't call into children (none exist anyways)
                //take type {type: 'String'} and turn into {'String'} that's all
                this.update(node['type'], true);
            }
            //find our reference objects
            else if(this.isLeaf && this.key == 'ref')
            {
                //if we have a refernce node, but we don't know the reference
                //and it's not in progress currently -- then we quickly grab the reference type info
                if(!inProcess[node] && !requiredProperties[node])
                {
                    schemaLoading.processSchemaReferences(node, schemaFiles[node]);
                }

                //replace references if we have a reference object already loaded up
                if(requiredProperties[node])
                    this.parent.update(requiredProperties[node], true);

            }
        };

        //the only objects left are reference types/complex objects
        //there are no "type" objects
        var onlyReferences = schemaTraverse.map(replaceTypesFindRefs);

        inProcess[type] = false;

        //detect circular reference -- one of the objects we're replacing is ... this object!
        if(allTypes[type] == true)
            throw new Error("Type reference error! There is a circular reference in type: " + type);

        return {processed: onlyReferences, references: objRefs, types: allTypes};

    };

    schemaLoading.processSchemaReferences = function(type)
    {
        var requiredPaths = schemaLoading.traverseProcess(type, schemaFiles[type]);
        requiredProperties[type] = requiredPaths.processed;
        referencePaths[type] = requiredPaths.references;
        fullMultilayerReferences[type] = om.createLayeredReferences(requiredPaths.references,  schemaLoading.getSchemaReferences());

    };

    var initializedSchemas = false;

    //TODO: Schema dependences at the artifact level
    schemaLoading.loadAllSchemas = function(path)
    {
        if(initializedSchemas)
            return;

        //we load up our base schemas synchronously when we first start
        var baseSchema = fileReader.recursiveReadDirectorySync(homeDirectory, '/');


         for(var type in baseSchema)
        {
            schemaLoading.loadSingleSchema(type, baseSchema[type]);
        }

        //we load up our aritfact schemas synchronously when we first start
        var artifactSchemas = fileReader.recursiveReadDirectorySync(path, '/');

//        console.log('Loading custom: ');
        //now our schemas have been loaded into schemaFiles -- but we haven't created our database schemas
        //let's step through our schemas, and see if we need to load anything else first
        for(var type in artifactSchemas)
        {
            schemaLoading.loadSingleSchema(type, artifactSchemas[type]);
        }

//        console.log('Done custom load');

        //process each type
        for(var type in schemaFiles)
            schemaLoading.processSchemaReferences(type);

        initializedSchemas = true;

        //TODO: if we've already done it, don't do it again!
    };

    var saveSchemaObject = function(type, finalSchemaObject)
    {
        if(schemaFiles[type] && schemaFiles[type] != finalSchemaObject)
            throw new Error("Schema object already entered, what gives? : " + type);

        schemaFiles[type] = finalSchemaObject;
    };

    var saveSchemaModel = function(type, model)
    {
        if(schemaModels[type] && schemaModels[type] != model)
            throw new Error("Schema model already entered, what gives?");

        schemaModels[type] = model;
    };

    var addDefaultSchema = function(parentType, jsonObject)
    {
        //we replace our references inside of a clone of the object
        var defaultsClone = traverse(defaultSchemaObjects).map(function(node)
        {
            if(this.isLeaf && this.key === 'ref')
                this.update(parentType);
        });

        //go through our defaults, and tack them on
        for(var key in defaultsClone)
        {
            jsonObject[key] = defaultsClone[key];
        }
    };

    schemaLoading.loadSingleSchema = function(type, bufferString)
    {
        var schemaObject = JSON.parse(bufferString);

        //attach default schema (wid, parents, creation, etc)
        addDefaultSchema(type, schemaObject);
        //save the plain object with defaults
        saveSchemaObject(type, schemaObject);
        //create the schema objects in database
        generator.schema(type, schemaObject);
        //fetch the model from the database after creating it
        var monObject = generator.getConnection().model(type);

        //Save the model object
        saveSchemaModel(type, monObject);

        return monObject;
    };

    schemaLoading.getSchemaReferences = function(){ return referencePaths; };
    schemaLoading.setSchemaReference = function(type, obj) { referencePaths[type] = obj; };


    schemaLoading.getFullSchemaReferences = function(){ return fullMultilayerReferences; };
    schemaLoading.setFullSchemaReference = function(type, obj) { fullMultilayerReferences[type] = obj; };


    schemaLoading.getSchemaTypes = function(){ return schemaFiles; };
    schemaLoading.setSchemaType = function(type, obj){ schemaFiles[type] = obj; };

    schemaLoading.getSchemaModels = function() {return schemaModels;};
    schemaLoading.setSchemaModel = function(type, obj){schemaModels[type] = obj;};

    schemaLoading.getPropertyPaths = function(){return requiredProperties;};
    schemaLoading.setPropertyPath = function(type, obj){requiredProperties[type] = obj;};

    schemaLoading.getSchemaDefaults = function(){return defaultSchemaObjects;};
};
