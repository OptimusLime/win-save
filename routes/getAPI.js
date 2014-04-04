//fetch artifacts from the database
var util = require('util');
//var schemaLoader = require('../model/schemaLoading.js');
//var seedAPI = require('./seedAPI.js');
//var getAPI = exports;

var traverse = require('traverse');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    var wutils = winroutes.utilities;
    var om = wutils.objectManipulator;
    var getAPI = this;

    getAPI.initialSchemaAndSeed = function(req, res)
    {
        console.log('Fetching schema objects and a single seed.');
        //doesn't matter who asks for it, this is a simple request -- nothing crazy in here!

        winroutes.seedAPI.getRandomSeed(function(err, seed)
        {
            if(err)
            {
                console.log('Random seed fail!');
                res.json(err);
                return;
            }
            //we have a returned seed -- that's actuall a full artifact object -- ready for next step

            //we need our schema type information

            var schemaInfo = winroutes.schemaLoader.getSchemaTypes();
            var referenceInfo = winroutes.schemaLoader.getSchemaReferences();
            var propPaths = winroutes.schemaLoader.getPropertyPaths();
            var defaults = winroutes.schemaLoader.getSchemaDefaults();

            res.json({seed: seed, default: defaults, schema: schemaInfo, reference: referenceInfo, property: propPaths});


        });
    };


    //What we want to do in posting genome batches
    //is to check for nodes and connections we've never seen before, add them, then add the genomes, then update the parents
    getAPI.getArtifactBatch = function(req, res)
    {
        console.log('Get artifact batch');
        var type = req.query.artifactType;
        var all = req.query.all;
        var pw = req.query.password;

        var allFetch = false;
        var batchArtifacts;
        if(all && pw == "allplease")
        {
            allFetch = true;
            batchArtifacts = {};
        }
        else
        {
          batchArtifacts = req.query.wids.split(',');

        }

        getAPI.fetchArtifacts(type, batchArtifacts, {}, function(err, loadedArtifacts)
        {
            if(allFetch)
            {
                //now we need all the seeds
                winroutes.seedAPI.getAllSeeds(function(err, seeds)
                {
                     //we have our artifacts, return over json
                    if(err)
                        res.json(err);
                    else {
                        res.json(loadedArtifacts);
                        var internalSeeds = [];
                        for(var key in seeds)
                        {
                            internalSeeds.push(seeds[key].artifactID);
                        }
                        
                        //send it ALL back, including seed objects
                        res.json(loadedArtifacts.concat(internalSeeds));                        
                    }


                })


            }
            else
            {
                //we have our artifacts, return over json
                if(err)
                    res.json(err);
                else
                    res.json(loadedArtifacts);
            }
        });

    };

    getAPI.collectReferenceWidsFromObjects = function(artifactType, objects)
    {
        var singleSeedReferences = {};


        var references = winroutes.schemaLoader.getFullSchemaReferences()[artifactType];

        //more importantly thought, through the whole object, parents should be verified -- this is a vital feature
//        getAPI.findReferencesInObjects(artifactType, objects,
        om.traverseReferences(objects, references,
            function(refFound, foundObjects, refPath)
        {
            if(!singleSeedReferences[refPath])
                singleSeedReferences[refPath] = [];

            for(var k in foundObjects)
                singleSeedReferences[refPath].push(foundObjects[k].wid);

        });

        return singleSeedReferences;
    };


    var gatherReferences = function(cache, widToType, objectsToProcess)
    {

        //we want to make sure that our objects aren't actually mongoose docs
        //any GET request returns lean objects -- so this should be all good to go now -- switched to mongoose 3.6.x

        //instead, they should have regular object structure
        //for some reason this causes path issues otherwise
//    var objectsToProcess = [];
//    for(var i=0; i < toProcessObjects.length; i++)
//    {
//        objectsToProcess.push(toProcessObjects[i].toObject());
//    }


        var references = winroutes.schemaLoader.getSchemaReferences();
        var fullReferences = winroutes.schemaLoader.getFullSchemaReferences();

        var nextProcess = {};
//    var nextWidToType = {};


        var groupTypes = {};

        for(var i=0; i < objectsToProcess.length; i++)
        {
            //grab our object
            var process = objectsToProcess[i];

            var refType = widToType[process.wid];
            if(!groupTypes[refType])
                groupTypes[refType] = [];

            groupTypes[refType].push(process);
        }

        for(var refType in groupTypes)
        {
            var aProcesses = groupTypes[refType];

            var refToList = {};
            //we have the objects in array and the reference type
//            getAPI.getReferenceObjects(aProcesses, references[refType],
            om.traverseReferences(aProcesses, fullReferences[refType],
                function(refFoundType, finalRefs){

                if(!refToList[refFoundType])
                    refToList[refFoundType] = finalRefs.slice(0);
                else
                    refToList[refFoundType] = refToList[refFoundType].concat(finalRefs);

            });


            //after grabbing all references - check for them in the cache
            for(var ref in refToList)
            {
                var listWIDs = refToList[ref];

                if(!nextProcess[ref])
                    nextProcess[ref] = [];

                if(cache[ref])
                {
                    for(var r=0; r < listWIDs.length; r++)
                    {
                        if(!cache[ref][listWIDs[r]]){
                            nextProcess[ref].push(listWIDs[r]);
                            widToType[listWIDs[r]] = ref;
                        }
                    }
                }
                else
                {
                    //add all the ids to the next processing object
                    nextProcess[ref] = listWIDs.slice(0).concat(nextProcess[ref]);
                    //mark the inverse mapping
                    for(var r=0; r < listWIDs.length; r++)
                        widToType[listWIDs[r]] = ref;
                }

                //if we didn't add anything, just delete the key!
                if(!nextProcess[ref].length)
                    delete nextProcess[ref];

            }
            //now we proceed to the next set of objects for processing
        }
        //we have all objects in a list for the next processing batch
        return {next: nextProcess, map: widToType};
    };

    var recursiveProcessReferences = function(cache, level, widToTypeMap, fetchObjectIDs, options, callback)
    {

        var models = winroutes.schemaLoader.getSchemaModels();

        if(options.maxLevel && level > options.maxLevel)
        {
            callback();
            return;
        }

        var nextArtifacts = [];

        var errorCount = 0;
        var errors = [];

        //how many arrays to process before being finished
        var levelFinishCount = 0;

        for(var ref in fetchObjectIDs)
            levelFinishCount++;


        if(!levelFinishCount)
        {
            //already done, cache has everything
            callback();
            return;
        }

        for(var refType in fetchObjectIDs)
        {
            var ModelType = models[refType];

            //find all the objects in this model variant!
            ModelType.find({wid: {$in: fetchObjectIDs[refType]}}).lean().exec(function(err, fetchedObjects)
            {
                if(err)
                {
                    console.log('Error finding references : ' + err);
                    errors.push(err);
                    errorCount = errors.length;
                }
                else
                {
                    for(var i=0; i < fetchedObjects.length; i++)
                    {
                        //get the object
                        var fo = fetchedObjects[i];
                        //get the type
                        var rt = widToTypeMap[fo.wid];

                        //add to cache
                        if(!cache[rt])
                            cache[rt] = {};

                        //add to cache! hi-ya
                        cache[rt][fo.wid] = fo;
                    }

                    //everything fetched is fair game
                    nextArtifacts = nextArtifacts.concat(fetchedObjects);
                }

                levelFinishCount--;

                if(levelFinishCount === 0)
                {
                    //oops, there were some errors at this level
                    if(errorCount)
                        callback(errors, {level: level, models: nextArtifacts, map: widToTypeMap, errorCount: errorCount});
                    else if(nextArtifacts.length === 0)
                    {
                        //no errors, no artifacts left to fetch!
                        callback();
                    }
                    else
                    {
                        var gatheredRefs = gatherReferences(cache, widToTypeMap, nextArtifacts);
                        //done with fetching references for this level
                        //proceed to the next level (level check at beginnign of function don't worry)
                        recursiveProcessReferences(cache, level +1, widToTypeMap, gatheredRefs.next, options, callback);
                    }
                }
            });
        }

    };

    var replaceReferences = function(cache, widsToType, artifactType, artifacts)
    {
        //loop through artifacts

        var artifactSchema = winroutes.schemaLoader.getPropertyPaths()[artifactType];
        var refPaths = winroutes.schemaLoader.getSchemaReferences();
        var fullRefPaths = winroutes.schemaLoader.getFullSchemaReferences();

        var fullModels = [];

        for(var i=0; i < artifacts.length; i++)
        {
            var aModel = artifacts[i];

            var count  =0;

            //for each piece, if it's a string and ref -- we replace it
            var clonedModel =
            om.replaceRefStrings(aModel, artifactSchema,fullRefPaths[artifactType], function(widString, node, path){
                //this function is called when there is a potential mismatch between objects
                //the original has a string, BUT the schema is an object!
                //that is a reference call

//                console.log("path: " + path);
//                console.log(widString);
                //wids to type maps all wids in the cache to their reference type
                var refType = widsToType[widString];

                //have the ref type, return cached object
                return cache[refType][widString];
            });

            fullModels.push(clonedModel);
        }

        return fullModels;

    };

    getAPI.listOfArtifactsQuery = function(artifactIDs)
    {
        return  (artifactIDs.length ? {wid: {$in: artifactIDs}} : {});
    };

    //tap into the artifact query logic!
    getAPI.fetchArtifacts = function (artifactType, artifactIDs, options, callback)
    {
        getAPI.makeArtifactQuery(artifactType, getAPI.listOfArtifactsQuery(artifactIDs), options, callback);
    };

    getAPI.QueryIdentifier =
    {
        isComplex: 'complex',
        find: 'find',
        sort: 'sort',
        limit: 'limit',
        skip: 'skip'
    };

    getAPI.complexQuery = function(ArtifactModel, oQuery, callback)
    {
        //we're going to build a complex mongo query

        var buildQuery = ArtifactModel.find(oQuery[getAPI.QueryIdentifier.find]);

        if(oQuery[getAPI.QueryIdentifier.sort])
            buildQuery = buildQuery.sort(oQuery[getAPI.QueryIdentifier.sort]);

        if(oQuery[getAPI.QueryIdentifier.limit])
            buildQuery = buildQuery.limit(oQuery[getAPI.QueryIdentifier.limit]);

        if(oQuery[getAPI.QueryIdentifier.skip])
            buildQuery = buildQuery.limit(oQuery[getAPI.QueryIdentifier.skip]);


        //create a lean version
        buildQuery.lean().exec(callback);

    };

    //this will make any requested query you would like, then shimmy them into a list, and fully populate the object!
    //so custom queries, and full objects -- sickkkkk
    //todo: Make function call for more custom things, like single column queries, or limited searches
    getAPI.makeArtifactQuery = function(artifactType, artifactQuery, options, callback)
    {

        //let's ask our artifact model to go and fetch dem objects
        if(typeof options === 'function')
        {
            callback = options;
            options = {};
        }

        var documentCache = {};
        var widsToType = {};

        //we have our artifact model, check for the IDs we have

        //if we provide artifactIDs, make specific query-- created above

        //this first part is easy
        var models = winroutes.schemaLoader.getSchemaModels();

        var ArtifactModel = models[artifactType];

//        console.log(artifactQuery);

        var artifactCallback = function(err, artifacts)
        {
            if(err)
            {
                //error fetching ! pass it along
                callback(err, artifacts);
                return;
            }

            if(!documentCache[artifactType])
                documentCache[artifactType] = {};

            var artifactCache = documentCache[artifactType];

            //now we need to pull out relevant references, and fetch those as well
            //let's note the type we have, and cache our objects
            for(var a=0; a < artifacts.length; a++)
            {
                //returning documents must be converted to object types
                //cache the returned objects by WID
                artifactCache[artifacts[a].wid] = artifacts[a];
                widsToType[artifacts[a].wid] = artifactType;
            }

            var refObjects = gatherReferences(documentCache, widsToType, artifacts);

            recursiveProcessReferences(documentCache, 1, widsToType, refObjects.next, options, function(err)
            {
                //done with recursive process -- cache has everything we need

                if(err)
                {
                    //oops, error doing recursive references
                    console.log('Error doing recursive references!');
                    callback(err);
                    return;
                }

                //call replace references
                // this function will replace the string references with actual objects -- making them ready to be returned

                //cache has all the objects
                //wid to type maps all cached wids to a reference type
                var fullObjects = replaceReferences(documentCache, widsToType, artifactType, artifacts);
                //and we're finished!

                callback(null, fullObjects);

            });

        };


        //if we send in a complicated query object, we need to make a systematic call -- since we don't know
        //how to do it with an array of callbacks
        if(typeof artifactQuery === 'object' && artifactQuery[getAPI.QueryIdentifier.isComplex])
        {
            getAPI.complexQuery(ArtifactModel, artifactQuery, artifactCallback);
        }
        else
        {
            ArtifactModel.find.call(ArtifactModel, artifactQuery).lean().exec(artifactCallback);
        }


    };
};
