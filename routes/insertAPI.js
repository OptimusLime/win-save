//We insert our objects using this method -- hashing based on vital schema properties potentially
//this also checks if objects are well structured from the client
var util = require('util');

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var ObjectId = Schema.Types.ObjectId;
var SchemaType = mongoose.SchemaType;

//Todo: pretty much replace everything here with new insert that's faster (using traverse library)
//
module.exports = function(appRoutes)
{
    var winroutes = appRoutes;

    var insertAPI = this;
    var schemaLoader = winroutes.schemaLoader;
    var wutil = winroutes.utilities;
    var om = wutil.objectManipulator;

    //What we want to do in posting genome batches
    //is to check for nodes and connections we've never seen before, add them, then add the genomes, then update the parents
    insertAPI.postInsertArtifactBatch = function(req, res)
    {
        console.log('Post artifact batching: ');
//        console.log(req.body);
        var batchArtifacts = req.body.artifacts;
//        console.log(req.body.artifacts);
        var artifactType = req.body.artifactType;



        if(req.body.sessionID === undefined){
            res.send(500, 'No body session defined!');
            return;
        }
        var creation = {sessionID: req.body.sessionID, timeOfCreation: Date.now(), isPublic: req.body.publish ? true : false};

        console.log('To publish? ' + req.body.publish);
        console.log(creation);

        insertAPI.fullInsertArtifacts(artifactType, batchArtifacts, {creation: creation}, function(err, finalObjects)
        {
            if(err)
            {
                res.send(500, 'Insert error: ' + JSON.stringify(err));
                return;
            }

            res.json(finalObjects);
        });
    };

    insertAPI.fullInsertArtifacts = function(artifactType, artifacts, parameters, callback)
    {
        if(typeof parameters === 'function')
        {
            callback = parameters;
            parameters = {};
        }

        //todo: flow control library -- these things shoudl happen simultaneously, and then you can continue after done
        insertAPI.separateInsertAndUpdate(artifactType, artifacts, parameters, function(err, shouldSave, shouldUpdate)
        {

            var finishedUpdate, finishedSave, errors;
            var savedComplex;

            var checkDoneWithInsert = function(errors)
            {
                if(finishedUpdate && finishedSave)
                {
                  if(errors)
                  {
                    callback(errors, savedComplex);
                  }
                    else
                  {
                      //don't send back empty
                    callback(null, savedComplex || {duplicates: true});
                  }
                }
            };

            //if we have nothing to update, don't go on an update exploration!
            if(!shouldUpdate.length)
                finishedUpdate = true;
            else
            {
                insertAPI.updateObjectCreation(artifactType, shouldUpdate, parameters, function(err)
                {

                    finishedUpdate = true;
                    if(err)
                    {
                        if(!errors)
                            errors = [];

                        errors.push(err);
                    }

                    checkDoneWithInsert();
                });
            }

            if(!shouldSave.length)
                finishedSave = true;
            else
            {
                //build the artifact objects
                insertAPI.checkAndConstructArtifactDBObjects(artifactType, shouldSave, parameters, function(err, artifactConstruct){

                    if(err)
                    {
                        if(!errors)
                            errors = [];

                        errors.push(err);

                        finishedSave = true;
                        checkDoneWithInsert();
                        return;
                    }

                    //let's make a save -- send in the models
                    insertAPI.saveArtifactModelsToDB(artifactConstruct.models, artifactConstruct.modelMapList, function(err, aComplexObject)
                    {

                        savedComplex = aComplexObject;
                        finishedSave = true;

                        if(err)
                        {
                            if(!errors)
                            {
                                errors = [];
                            }
                            errors.push(err);

                            checkDoneWithInsert();
                            return;
                        }

                        //all saved, return complex objects -- successful artifacts should be here
                        checkDoneWithInsert();

                       // callback(null, aComplexObject)
                    });
                });
            }

            if(finishedSave && finishedUpdate)
                console.log('Nothing to do, update and save are empty!');

            //check immediately if finished (that is there is nothing to update and nothing to save -- nothing to do!
            checkDoneWithInsert();

        });
    };

    //we only update creation here
    insertAPI.updateObjectCreation = function(artifactType, updateObjects, parameters, callback)
    {

        var ArtifactModel = schemaLoader.getSchemaModels()[artifactType];

        if(!parameters.creation){
            callback('Oops, no creation params for our update function!');
            return;
        }

        var wids = [];
        for(var i=0; i < updateObjects.length; i++){ wids.push(updateObjects[i].wid);}

        var publicUpdate = parameters.creation.isPublic;

        var multiUpdates = updateObjects.length;
        var errors;

        for(var i=0; i < updateObjects.length; i++)
        {
            insertAPI.updateObject(ArtifactModel, updateObjects[i].wid,
                {$set : {'creation.isPublic' : publicUpdate, meta: updateObjects[i].meta}},
            function(err)
            {
                if(err)
                {
                    if(!errors)
                        errors = [];
                    errors.push(err);
                }

                multiUpdates--;

                if(multiUpdates == 0)
                {
                    //all done with updates
                    callback(errors);
                }
            });
        }

//        ArtifactModel.update({wid: {$in: wids}}, {$set : {'creation.isPublic' : publicUpdate}}, {multi:true}, function(err, numChanged)
//        {
//            console.log('Finished update of models! : ' + numChanged);
//            //if error, it'll get propogated here -- otherwise, it's all done
//            callback(err);
//        });

    };

    insertAPI.updateObject = function(Model, wid, updateParams, callback)
    {
        Model.update({wid: wid}, updateParams, function(err, numChanged)
        {
            //if error, it'll get propogated -- otherwise, done with this one update
            callback(err, numChanged);
        });
    };

    insertAPI.separateInsertAndUpdate = function(artifactType, artifacts, parameters, callback)
    {
        var ArtifactModel = schemaLoader.getSchemaModels()[artifactType];

        //check if these artifacts exists
        var wids = [];
        var widMap = {};
        for(var i=0; i < artifacts.length; i++){ widMap[artifacts[i].wid] = artifacts[i]; wids.push(artifacts[i].wid);}

        //We find any artifacts with these wids, returning only their wids as well as their creation objects
        var findQuery = ArtifactModel.find({wid: {$in: wids}}).select({wid: 1, creation: 1}).lean();

        var shouldUpdate = [], shouldSave = [];

//        console.log('executing find for separation purposes');
//        console.log(wids);

        findQuery.exec(function(err, smallArts)
        {
            if(err)
            {
                callback(err);
                return;
            }
            //loop through our small documents
            for(var i=0; i < smallArts.length; i++)
            {
                var small = smallArts[i];
                var potentialSave = widMap[small.wid];
                if(potentialSave)
                {
//                    console.log('potential: ');
//                    console.log(small);
//                    console.log(potentialSave);

                    //already inserted the object, we need to decide if it makes sense to update this object
                    if(insertAPI.shouldUpdateObject(small, potentialSave, parameters))
                    {
                        shouldUpdate.push(potentialSave);
                    }

                    //remove this key from the map
                    delete widMap[small.wid];
                }
            }

            //now what's left in the widmap is what we should save
            for(var key in widMap)
                shouldSave.push(widMap[key]);

//            console.log('Finisehd find query!');
//            console.log(shouldSave);
//            console.log(shouldUpdate);

            callback(null, shouldSave, shouldUpdate);

        });

    };

    insertAPI.shouldUpdateObject = function(dbSmallObject, actualObject, paramters)
    {
//        console.log('Should chk: ' + dbSmallObject.creation.isPublic + ' actual: ' + paramters.creation.isPublic);

        //we don't change public to not public
        if(dbSmallObject.creation.isPublic)
            return false;
        //we DO change not public to public -- so long as our params exist
        else if(paramters.creation === undefined)
            return false;
        else if(dbSmallObject.creation.isPublic != paramters.creation.isPublic)
            return true;
        //and we just ignore everything else
        else
            return false;
    };

    insertAPI.InsertErrors =
    {
        missing: 'missing/undefined',
        type: 'wrong type',
        array: 'not an array'
    };

    var validateAgainstType = function(object, osType)
    {
        var type;
        //if we are an object coming in, we must have a type identifier
        if(typeof osType === 'object')
            type = osType['type'];
        else if(typeof osType === 'string')
            type = osType;


        //check the type defined by the string
        var lowerType = type.toLowerCase();

        if(typeof object !== lowerType)
        {
            if(typeof object === 'object')
            {
                //check the object type, sometimes typeof isn't specific enough
                //if that fails, we check it's a database schema type!
                return (Object.prototype.toString.call(object) === '[object ' + type + ']'
                    || object instanceof Schema.Types[type])

            }
        }
        //validated!
        return true;
    };

    //TODO: Might be an issue if the artifact is just a string object -- simplest type
    //check missing properties
    var recursiveCheckMissedProperties = function(missing, object, paths)
    {
        var count = 0;


        //check the object, if it has a "type" property
        //then we have a {"type":ObjectId, "ref": NEATGenotype} kind of situation
        if(paths['type'] && paths['ref'])
        {
            if(!validateAgainstType(object, paths))
            {
                console.log('Type error2');
                console.log(typeof object);
    //            console.log(object);
    //            console.log(schemaLoader.getSchemaModels()[paths['ref']].isValid(object));
    //            console.log(mongoose.Schema.ObjectId.isValid(object));
    //            console.log(object.constructor === ObjectId);
    //            console.log(object instanceof Schema.Types['ObjectId']);
    //            console.log(require('util').inspect(Object.prototype.toString.call(object), true, 10));
                console.log(Object.prototype.toString.call(object));
                console.log(paths);
                //we have a mistmatch in type, add it to missing object
                missing[key] = insertAPI.InsertErrors.type;
                count++;
                return count;
            }
            //we match type, we've passed
            //we are done
            return 0;
        }


        //just check against type and if it exists
        for(var key in paths)
        {
            var pathObject = paths[key];
            var compareObject = object[key];

            if(compareObject === undefined){
                //check if you are a date object with a default setter
                if(!(typeof pathObject !== 'string' && pathObject['type'] == "Date" && pathObject['default']))
                {
                    //you are a date without a default setter -- probably not age!
                    console.log('Checking and missed: ' + key);
                    console.log(object);
                    missing[key] = insertAPI.InsertErrors.missing;
                    count++;
                    continue;
                }
            }

            if(typeof pathObject === 'string' || pathObject['type'])
            {
                if(!validateAgainstType(compareObject, pathObject))
                {
                    console.log('Type error2');
//                    console.log(paths);
//                    console.log(compareObject);
//                    console.log(pathObject);

                    //we have a mistmatch in type, add it to missing object
                    missing[key] = insertAPI.InsertErrors.type;
                    count++;
                    continue;
                }
                //we match type, we've passed
            }
            //are we checking for an array and types inside
            else if(Array.isArray(pathObject))
            {
                //our object is an array, if not, we have an error
                if(!Array.isArray(compareObject))
                {
                    missing[key] = insertAPI.InsertErrors.array;
                    count++;
                    continue;
                }

                if(typeof pathObject[0] === 'string')
                {
                    //don't send this forward, deal with it here

                    //check the type defined by the string
                    var lowerType = pathObject[0].toLowerCase();

                    //otherwise we have an array of objects to look through, validating each is that type
                    for(var i=0; i < compareObject.length; i++)
                    {
                        //validate each object against the single type object
                        if(!validateAgainstType(compareObject[i], pathObject[0]))
                        {
                            console.log('Type error2');
                            //we have a mistmatch in type, add it to missing object
                            missing[key] = insertAPI.InsertErrors.type;
                            count++;
                            break;
                        }
                    }

                    continue;
                }


                //otherwise we have an array of objects to look through, validating each on
                for(var i=0; i < compareObject.length; i++)
                {
                    var possibleMissing = {};
                    //we have to check each one!
                    //send in the object, and also the path properties we're looking for (NOT the array- take the first object-- the type descriptor)
                    var errorCount = recursiveCheckMissedProperties(possibleMissing, compareObject[i], pathObject[0]);

                    //we break out of the loop when we hit an error -- don't overcount errors by having errors for each object checked!
                    //when you encounter an error, just kill the process
                    if(errorCount){
                        //error already added to "possibleMissing"
                        missing[key] = possibleMissing;
                        count += errorCount;
                        break;
                    }
                }

                //we checked all the objects, errors logged where applicable, done here!
                continue;
            }
            else if(typeof pathObject === 'object')
            {
                //we're an object -- we need to check the interior
                var checkMissing = {};
                var errorCount = recursiveCheckMissedProperties(checkMissing, compareObject, pathObject);
                if(errorCount)
                {
                    missing[key] = checkMissing;
                    count += errorCount;
                }

                //done with this key!
                continue;
            }

            //now we just have to return the count when we are done
        }

        return count;
    };

    insertAPI.validateObjects = function(artifacts, artifactName)
    {
        //we need to use the schema to go through and validate each artifact
        var schema = schemaLoader.getPropertyPaths();
    //    console.log(schema);

        var artValidator = schema[artifactName];

        //now we need to go through the artifact object, and validate that all required objects are there,
        //and have a proper type
        var allMissing = [];

        for(var i=0; i < artifacts.length; i++)
        {
            var missing = {};
            var errorCount = recursiveCheckMissedProperties(missing, artifacts[i], artValidator);
            if(errorCount)
            {
                //check missing objects
                allMissing.push(missing);
            }
        }
        if(allMissing.length)
        {
            console.log('Error adding artifacts, missing: ');
            console.log(allMissing);
            return allMissing;
        }

    };


    var startRecursiveArtifactCreation = function(type, artifacts)
    {
        var TypeModel = schemaLoader.getSchemaModels()[type];
        var typeInformation = schemaLoader.getSchemaTypes()[type];

        if(!typeInformation)
            throw new Error('Type information not loaded for this type of artifact saving');

        var artifactMapping = {};

        for(var i=0; i < artifacts.length; i++)
        {
            var art = artifacts[i];
            var modelsToSave = {};

            var built = recursiveCreateArtifact(typeInformation, art, modelsToSave);
            built.dbType = type;

            //the only model left to build is the top level one!
            var constructedModel = new TypeModel(built.final);

            //add our constructed model to the models required for saving
            if(!modelsToSave[type])
                modelsToSave[type] = [];

            //push onto the models
            modelsToSave[type].push(constructedModel);

            //contains all models required for saving
            artifactMapping[art.wid] = {allModels: modelsToSave, artifactModel: constructedModel};
        }

        //we created a mapping -- onwards!
        //we must save each individual object all together -- any failures should result in an overall failure for that object
        return artifactMapping;
    };


    //TODO: Redundant code, break into sub routine calls, should only be 3 separate situations
    //(If array, process each object separately in 3 different function calls)
    //1. Is a reference
    //2. is a simple object
    //3. is a multiple-key object
    //we create an array of objects to be saved in the database for each artifact we want to save
    var recursiveCreateArtifact = function(artifactConstruct, artifactPlace, oModelObjects)
    {
        //we need to find a reference and pull the reference object out
        //Look for a references

        //if we are an array, look inside the array for each artifact object
        if(Array.isArray(artifactConstruct))
        {
            var arrayToConstruct = [];

            var innerConstruct = artifactConstruct[0];
            //now we need to check if we have a reference type at the surface level
            //otherwise, we need to process the lower levels

            //check if we have a reference and we are a string
            if(innerConstruct['type'] === 'String' && innerConstruct['ref'])
            {
                //We need to prep these objects for saving
                //we've got to replace the inner object with a objectid reference for save time

                //we must investigate this new reference type
                var type = innerConstruct['ref'];
                var TypeModel = schemaLoader.getSchemaModels()[type];
                var typeInformation = schemaLoader.getSchemaTypes()[type];


                //artifactPlace is an array object as well, so we have to investigate
                //ALL objects in the array - to the end
                for(var i=0; i < artifactPlace.length; i++)
                {
                    if(typeof artifactPlace[i] === 'string')
                    {
                        //we're already a reference, nothing to do here!
                        arrayToConstruct.push(artifactPlace[i]);
                    }
                    else
                    {
                        //this will build an object out of this, AND add it to the model object
                        //final will return either the object in it's whole, or the relevant references will be taken care of
                        var built = recursiveCreateArtifact(typeInformation, artifactPlace[i], oModelObjects);
                        built.final.dbType = type;

                        //now, this built object actually refers to a fully constructed model object
                        //we use this information, to build a model of our type
                        var constructedModel = new TypeModel(built.final);

                        //We have the final object, and all the models built
                        //add them to model objects
                        if(!oModelObjects[type])
                            oModelObjects[type] = [];

                        oModelObjects[type].push(constructedModel);

                        //push the string object into our array, it's been turned into references where appropriate
                        arrayToConstruct.push(constructedModel.wid.toString());

                        //all models have been added to omodelobjects
                    }
                }

                //we have now created a replacement array, return that!

                //all models accounted for, add nothing!
                return {final: arrayToConstruct};
            }
            else if(innerConstruct['type'] || typeof innerConstruct === 'string')
            {
                //we are an array of simple objects
                //simple, no processing needed!
                arrayToConstruct = artifactPlace.slice(0);

                //no models constructed, simply returned the constructed array
                return {final: arrayToConstruct};
            }
            else
            {
                //otherwise, we've got objects we have to go through

                //for each object, we need to investigate each key
                for(var i=0; i < artifactPlace.length; i++)
                {
                    var art = artifactPlace[i];
                    var objectReplication = {};
                    for(var key in innerConstruct)
                    {
                        //build the object
                        var built = recursiveCreateArtifact(innerConstruct[key], art[key], oModelObjects);

                        //build will add models to model objects, and replace relevant references
                        //the final object is all you need
                        objectReplication[key] = built.final;
                    }

                    arrayToConstruct.push(objectReplication);
                }

                //finished we are -- time to suit up
                return {final: arrayToConstruct};
            }
        }

        //we know we're not an array object, we're just a plain object
        if(artifactConstruct['type'] === 'String' && artifactConstruct['ref'])
        {
            //arguably the most important situation -- from a logic perspective
            //replace object created with model object ID

            //we gotta dig in, and pull the reference if we don't already have it set
            if(typeof artifactPlace === 'string')
            {
                //we are done here, easy peasy cover girl
                return {final: artifactPlace};
            }

            //otherwise,
            //artifact place represent the whole object we need to submit
            var type = artifactConstruct['ref'];
            var TypeModel = schemaLoader.getSchemaModels()[type];
            var typeInformation  = schemaLoader.getSchemaTypes()[type];

            //type information need to be processed actually
            //we'll send in the same information we have, just with the actual object!
            var built = recursiveCreateArtifact(typeInformation, artifactPlace, oModelObjects);
            //set the database type of the object
            built.final.dbType = type;

            //now, this built object actually refers to a fully constructed model object
            //we use this information, to build a model of our type
            var constructedModel = new TypeModel(built.final);

            //We have the final object, and all the models built
            //add them to model objects
            if(!oModelObjects[type])
                oModelObjects[type] = [];

            oModelObjects[type].push(constructedModel);

            //return JUST the string of the ID, not the object itself, with a constructed model
            return {final: constructedModel.wid.toString()};
        }
        else if(artifactConstruct['type'] || typeof artifactConstruct === 'string')
        {
            //easy, we just return the object itself, nothing to be done here
            //there are no references to correct
            return {final: artifactPlace};
        }
        else
        {
            //we have multiple keys inside of this object, each key must be replicated
            var objectReplication = {};
            for(var key in artifactConstruct)
            {
                //build the object
                var built = recursiveCreateArtifact(artifactConstruct[key], artifactPlace[key], oModelObjects);

                //build will add models to model objects, and replace relevant references
                //the final object is all you need
                objectReplication[key] = built.final;
            }

            //return the replicated object, references taken care of
            return {final: objectReplication};
        }
    };

    insertAPI.checkAndConstructArtifactDBObjects = function (type, artifacts, parameters, callback)
    {
        if(typeof parameters === 'function')
        {
            callback = parameters;
            parameters = {};
//            console.log("Error: parameters isn't defined when making check call");
//            callback('parameters not defined');
//            return;
        }
//        else if(parameters.creation === undefined)
//        {
//            callback('Creation not defined');
//            return;
//        }

        var artifactIDMapping = {};
        var inverseIDMapping = {};
        var modelMapList = {};
        var justArtifactModels = {};
        var fullRefs = winroutes.schemaLoader.getFullSchemaReferences();


        //TODO: standardize the creation event logic, does it always happen? When does it not happen?
        //if you've specified a creation event, it will be propogated
        if(parameters.creation)
        {
            //replacing the high level creation objects
            for(var i=0; i < artifacts.length; i++)
            {
                artifacts[i].creation = parameters.creation;
            }

            //replacing the inner level creation objects
//            winroutes.getAPI.findReferencesInObjects(type, artifacts,
            om.traverseReferences(artifacts, fullRefs[type],
                    function(refFound, objs)
            {
                for(var i=0; i < objs.length; i++)
                {
    //                console.log('Replacing creation: ');
    //                console.log(parameters.creation)

                    //set our creation event for all objects!
                    objs[i].creation = parameters.creation;
                }
            });
        }

        var invalidObjects = insertAPI.validateObjects(artifacts, type);

        //we have made it past validation, let's create our objects, and then shazam, save them
        if(invalidObjects){
            callback('Error validating objects', invalidObjects);
            return;
        }

    



//        console.log(util.inspect(artifacts, 4));

        //Make sure creation is done BEFORE this step -- doh!

        //Todo: This check and construct function is a little wasteful in terms of space and redundancy
        //idea: should return 1.  {gids : [all models] }
        //and {gids : {artifact model} }

        //this function will process all objects, and create all the models needed to save
        var modelsToSave = startRecursiveArtifactCreation(type, artifacts);

//        console.log(util.inspect(artifacts, false, 4));
//        console.log(util.inspect(modelsToSave, false, 4));


        //now we create an art model from each object
        for(var i=0; i < artifacts.length; i++)
        {
            var startingArtifact = artifacts[i];
            //we need to loop through, and pull out objects that are meant to be refernces
            //That is, we need to pull out the JSON objects and convert them to models
            //then reference the model ID numbers instead

            var mSaveObjects = modelsToSave[startingArtifact.wid];
            var modelArtifact = mSaveObjects.artifactModel;

            var modelList = [];
            for(var mType in mSaveObjects.allModels)
            {
                modelList = modelList.concat(mSaveObjects.allModels[mType]);
            }

            justArtifactModels[startingArtifact.wid] = modelArtifact;

            modelMapList[startingArtifact.wid] = modelList;


            //we create a maping from the local ID to the WIN ID
            //after we save, we'll send this back
            artifactIDMapping[startingArtifact.wid] = modelArtifact.wid;

            //going in the opposite direction, we can find what local artifact is attached to the win model
            inverseIDMapping[modelArtifact.wid] = startingArtifact.wid;
        }

        //no errors back we go!
        callback(null, {models: justArtifactModels, modelMapList: modelMapList, mapping: artifactIDMapping, inverse: inverseIDMapping});

    };

    //save the artifact now!
    insertAPI.saveArtifactModelsToDB = function(artifactModels, modelMapList, callback)
    {
        //artifactModels is a complex object
        //contains all the inner models necessary for saving
        //it is in the format
        // { gid: [modelsToSave] }

        var totalSaveCount = 0;
        for(var key in artifactModels)
            totalSaveCount++;

        var errorCount = 0;
        var errorMessages = {};

        var successArtifacts = {};
        var failArtifacts = {};

        var gidMapping = {};

        for(var gid in artifactModels)
        {
            var mArtifact = artifactModels[gid];
            //this is a list of models to save
            var aSaves = modelMapList[gid];

            gidMapping[gid] = mArtifact.wid;

            //Now let's save it
            insertAPI.saveIndividualArtifact(mArtifact, aSaves, function(err, savedArtifact){
                if(err)
                {
                    console.log('Failed saving artifact, error noted');
                    console.log(err);

                    //push onto our failures
                    failArtifacts[savedArtifact.wid] = (savedArtifact);

                    //save error message
                    errorMessages[savedArtifact.wid] = (err);

                    //note error count
                    errorCount++;
                }
                else
                {
                    //if we made it here, we've saved another one
                    //add to our saved artifacts
                    successArtifacts[savedArtifact.wid] = (savedArtifact);

                }

                //done with this individual - success or failure
                totalSaveCount--;

                if(totalSaveCount === 0)
                {

                    //we have an error!
                    if(errorCount)
                    {
                        //callback with the errors
                        callback(errorMessages, {map: gidMapping, success: successArtifacts, failure: failArtifacts, errors: errorCount});
                        //done
                        return;
                    }

                    //we're all finished saving the artifacts, and the mapping is already known -- send our successes
                    //all done, unless there was an error
                    console.log('Successfully saved all artifacts');

                    //send em away
                    callback(null, {map: gidMapping, success: successArtifacts, errors: 0});
                    //done here --return unnecesaary
                }
            });
        }

    };


    insertAPI.saveIndividualArtifact = function(mArtifact, modelsToSave, callback)
    {
        //how many we need saved for this artifact object
        var itemSaveCount = modelsToSave.length;

        var errors;

        for(var i=0; i < modelsToSave.length; i++)
        {
            modelsToSave[i].save(function(err){
                if(err)
                {
                    console.log('Error saving model of artifact: ' + mArtifact.wid);

                    //create error array if error seen -- otherwise null
                    if(!errors)
                        errors = [];

                    errors.push(err);
                }

                //successful/failed save of the model for artifact, countdown the seen count
                itemSaveCount--;

                if(itemSaveCount === 0)
                {
                    //successful callback
                    callback(errors, mArtifact);

                    return;
                }
            });
        }
    };
};