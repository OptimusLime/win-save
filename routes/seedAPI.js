//For calling genome related API functions
var fs = require('fs'),
    path = require('path'),
    util = require('util');

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var sSeedModelName = "Seed";
var uuid = require('../uuid/cuid.js');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    //guaranteed to be created and setup by the time it reaches any route files
    var schemaLoader = winroutes.schemaLoader;
    var wutil = winroutes.utilities;
    var om = wutil.objectManipulator;

    var seedAPI = this;

    var SeedModel;

    //Must find and replace these references!
//    var removeAPI = require('./removeAPI.js');
//    var insertAPI = require('./insertAPI.js');
//    var getAPI = require('./getAPI.js');

    seedAPI.createSeedSchemaType = function(artifactType)
    {
        return {
            seedID : "String",
            artifactID: {type: "String", ref: artifactType}
        };
    };

    seedAPI.registerSeedSchema = function(artifactType)
    {
        var seedSchema = seedAPI.createSeedSchemaType(artifactType);

        //we let the thing that loads schemas deal with loading the schema duhhhhhh
        var sModel = schemaLoader.loadSingleSchema(sSeedModelName, JSON.stringify(seedSchema));
        schemaLoader.processSchemaReferences(sSeedModelName);
        return sModel;

//    seedSchema.statics.random = function(callback) {
//        this.count(function(err, count) {
//            if (err) {
//                return callback(err);
//            }
//            var rand = Math.floor(Math.random() * count);
//            this.findOne().skip(rand).exec(callback);
//        }.bind(this));
//    };


//    //sets the model
//    monConnection.model(sSeedModelName, seedSchema);
//
//    //returns the model object
//    return monConnection.model(sSeedModelName);
    };

    seedAPI.seedCount = function(finish)
    {
        SeedModel.count({}, function(err, c)
        {
            finish(err,c);
        });
    };

    seedAPI.clearSeeds = function(finish)
    {
        //this is harder than it seems, since we need to remove objects from other databases as well
        seedAPI.getAllSeeds(function(err, seeds)
        {
            if(err)
            {
                console.log('Fail retrieve seeds');
                finish(err);
                return;
            }
            var requiredDeletes = {};
            requiredDeletes[sSeedModelName] = [];

            for(var i=0; i < seeds.length; i++)
                requiredDeletes[sSeedModelName].push(seeds[i].wid);

//            console.log(seeds);
            var fullRefs = winroutes.schemaLoader.getFullSchemaReferences();

            //we have our seed objects completely fetched
            //we need to figure out what references we have in these objects
//            winroutes.getAPI.findReferencesInObjects(sSeedModelName, seeds, function(refFound, objects)
            om.traverseReferences(seeds, fullRefs[sSeedModelName],
               function(refFound, objects)
            {
                //objects inbound for certain type!
                //we can mark what we need to delete
                if(!requiredDeletes[refFound])
                    requiredDeletes[refFound] = [];

//                console.log('refs found: ' + refFound);
//                console.log(objects);
                for(var i=0; i < objects.length; i++)
                {
                    requiredDeletes[refFound].push(objects[i].wid);
                }
            });

            //now we need to delete those objects
            //use our nifty removeAPI!!!
            winroutes.removeAPI.removeReferencedObjects(requiredDeletes, function(errors)
            {
                if(errors)
                    console.log('Remove ref fail!');
                finish(errors);
            });
        });

    };

    seedAPI.getAllSeeds = function(finished)
    {
        //we fetch all the seeds!
        winroutes.getAPI.fetchArtifacts(sSeedModelName, [], function(err, seeds)
        {
            if(err)
            {
                finished(err);
                return;
            }
//
//        var finalSeeds = [];
//
//        for(var s=0; s < seeds.length; s++)
//        {
//            var rSeed = seeds[s];
//            var actualSeed = rSeed.artifactID;
//            actualSeed.seedID = rSeed.seedID;
//            finalSeeds.push(actualSeed);
//        }

            //should have all seed objects
            finished(err, seeds);
        });
    };

    seedAPI.saveAllSeeds = function(artifactType, directory, finished)
    {
        if(!SeedModel)
        {

            //make sure the model is created
            SeedModel = seedAPI.registerSeedSchema(artifactType);
        }

        //now we have a seed model, we should load all of our seeds, and process them
        var seedObjects = seedAPI.loadSeeds(directory);

        seedAPI.insertSeeds(sSeedModelName, seedObjects.map, seedObjects.idList, function(err, seedObjects)
        {
            if(err)
            {
                console.log('Error saving seeds: insert error!');
                finished(err);
                return;
            }

            //when we're done, we'll have objects all saved
            finished(null, seedObjects);
        });
    };


    seedAPI.saveIndividualSeed = function(nSeed, callback)
    {
        nSeed.save(function(err)
        {
            if(err){
                console.log('Error saving post node!');
                callback(err);//res.json(err);
                return;
            }

            callback(null,nSeed);

        });
    };

    seedAPI.loadSeeds = function(directory)
    {
        //open
        var files = fs.readdirSync(directory);

        var seeds = {};
        var batchSeeds = [];
        var aSeeds= [];

        files.forEach(function(f)
        {
            //load our seed object
            //batch load
            //don't investigate anything that is not a json object
	    //why would it be otherwise???
	     if(f.indexOf(".json") == -1)
                return;
	    var syncRead = fs.readFileSync(path.resolve(directory, f));
            var gObject = JSON.parse(syncRead);

            var constructedSeed = {seedID: gObject.seedID, artifactID: gObject};
            batchSeeds.push(gObject.seedID);
            aSeeds.push(constructedSeed);

            //check if we have this seed ID
            seeds[gObject.seedID] = constructedSeed;

            //remove the seedID from the internal object -- it should not be anymore!
            delete gObject.seedID;
        });

        //mark the database type!
        setDBStandardTypes(sSeedModelName, aSeeds);

        //
        return {map: seeds, idList: batchSeeds};
    };

    var setDBStandardTypes = function(seedType, objects)
    {
        var setObjectProperties = function(reference, aObj)
        {
            for(var i=0; i < aObj.length; i++)
            {
                var obj = aObj[i];
                obj.wid = uuid();
                obj.parents = [];
                obj.dbType = reference;
                //hack for validation!
                obj.creation = {sessionID: '', timeOfCreation: Date.now(), isPublic: false};
            }
        };

        setObjectProperties(seedType, objects);

        var fullRefs = winroutes.schemaLoader.getFullSchemaReferences();

//        console.log('Looking at: ');
//        console.log(util.inspect(objects, true, 4));

        //callback for when it hits reference objects
//        winroutes.getAPI.findReferencesInObjects(seedType, objects,
        om.traverseReferences(objects, fullRefs[seedType],
            function(refFound, foundObjects)
        {
//            console.log('Looking at: ');
//            console.log(refFound);
//            console.log(foundObjects);
            setObjectProperties(refFound, foundObjects);
        });

    };

    var setSessionID = function(creation, seed)
    {
        //set the seed session
        seed.creation = creation;
        var fullRefs = winroutes.schemaLoader.getFullSchemaReferences();
        //callback for when it hits reference objects inside the seed object
//        winroutes.getAPI.findReferencesInObjects(sSeedModelName, [seed], function(refFound, foundObjects)
        om.traverseReferences([seed], fullRefs[sSeedModelName],
            function(refFound, foundObjects)
        {
            for(var i=0; i < foundObjects.length; i++)
            {
                foundObjects[i].creation = creation;
            }
        });
    };


    //insert all our seeds into the database
    seedAPI.insertSeeds = function(artifactType, seedMap, seedList, finished)
    {
        SeedModel.find({seedID: {$in: seedList}}).lean().exec(function(err, seedObjects)
        {
            if(err){
                finished(err);
                return;
            }

            console.log('Back from seed find');
            //we need to verify all objects coming back have the same seedly stuff we're expecting, right!

            //for all the objects we have, remove them from the process
            for(var i=0; i < seedObjects.length; i++){

                var seedModel = seedObjects[i];
                delete seedMap[seedModel.seedID];
//            seedObjects[i] = seedModel.toObject();
            }

            var seedsToSave = [];
            //grab the ids from the seed objects
            var seedwids = [];

            //we want to save this seed object
            for(var seedID in seedMap)
            {
                var oSeed = seedMap[seedID];
                //todo: Less hacky way of doing this?
                //create a dummy wid to pass inspection :) -- hackish
                oSeed.creation = {sessionID: '', timeOfCreation: Date.now(), isPublic: false};
                seedwids.push(oSeed.artifactID.wid);
                seedsToSave.push(oSeed);
            }

            //no errors, we have nothing to insert! All seeds loaded!
            if(!seedsToSave.length){
                finished(null, seedObjects);
                return;
            }

            //we actually need to verify these objects are in the correct format before processing
            //if we have invalid seeds, the whole thing is shot anyways!
            var validated = winroutes.insertAPI.validateObjects(seedsToSave, sSeedModelName);

            if(validated)
            {
                //we had seed validation errors!
                finished(validated);
                return;
            }

            //send in ids to create a bunch of sessions
            winroutes.sessionAPI.createSessions(seedwids, function(err, sessionMap)
            {
                //we've finished getting our sessions into the database!
                if(err)
                {
                    finished(err);
                    return;
                }

                //we need to use the session mapping to give each seed it's propper sessionID
                for(var s=0; s < seedsToSave.length; s++)
                {
                    var seed = seedsToSave[s];
                    var sessionID = sessionMap[seed.artifactID.wid];
                    var creation = {sessionID: sessionID, timeOfCreation: Date.now(), isPublic: false};

                    setSessionID(creation, seed);
                }



                //we've made it past validation
                winroutes.insertAPI.fullInsertArtifacts(sSeedModelName, seedsToSave, function(err, savedSeeds)
                {
                    //we've finished inserting into the database!
                    if(err)
                    {
                        finished(err, savedSeeds);
                        return;
                    }

                    var successArray = [];
                    for(var key in savedSeeds.success)
                        successArray.push(savedSeeds.success[key].toObject());

                    //great success, return the seeds!
                    finished(null, successArray);

                });

            });

        });
    };


    seedAPI.getSeedsRequest = function(req, res)
    {
        var max = req.query.maxSeeds || 1;

        seedAPI.getAllSeeds(function(err, seeds)
        {
            if(err)
            {
                res.send(500, err.message);
                return;
            }

            if(seeds.length == max)
            {
                res.json(seeds);
            }
            else if(seeds.length ==0)
            {
                res.send(400, "No seeds available");
            }
            else
            {

                //otherwise, we pick as many randomly as desired
                var desiredRemoved = seeds.length - max;

                for(var i=0; i < desiredRemoved; i++)
                {
                    var seedLength = seeds.length;
                    //remove a random index
                    seeds.splice(Math.floor(Math.random()*seedLength), 1);
                }

                //return teh appropraitely sized seed bank
                res.json(seeds);
             }
        })
    }

    seedAPI.getRandomSeed = function(seedReturn)
    {
        SeedModel.count(function(err,count){
            if(err)
            {
                seedReturn(err);
                return;
            }

            //generate a random skip amount
            var skip = Math.floor(Math.random()*count);

            //find an object by skipping that amount!
            SeedModel.findOne().skip(skip).lean().exec(function(err,seed)
            {
                //we have a seedID, and a mildly full seed object, we basically need to fetch the innards
                winroutes.getAPI.fetchArtifacts(sSeedModelName, [seed.wid], function(err, artifacts)
                {
                    //we've pulled everything associated with the seed and it's in an artifact object
                    if(err || artifacts.length === 0)
                    {
                        seedReturn(err);
                        return;
                    }

                    //otherwise, let's create a simple object, devoid of seediness, and send it back!
                    var fullSeed = artifacts[0];

                    var innerArtifact = fullSeed.artifactID;
                    innerArtifact.seedID = fullSeed.seedID;
                    //we can get the sessionID from the seed itself, since every seed is given one on creation
                    innerArtifact.sessionID = seed.creation.sessionID;

                    //send back the inner object, not the seed object with all it's baggage
                    seedReturn(null, innerArtifact);
                });

            });
        });
    };
};







