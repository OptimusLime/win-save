//Sessions hold information about what happened during a client run of evolution
//Sessions could be the start of automated evolutionary run, or they could be the start of an iec run
//say you choose a picture on picbreeder to start evolving (e.g. pic 113)
//when you are finished, you choose to publish a new evolved image (pic 258)
//-- that picture (258) you publish branched from the inidividual you chose in the beginning (pic 113)
//there should be a record of that -- hence sessions.

var fs = require('fs'),
    path = require('path'),
    util = require('util');

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var sSessionModelName = "Session";
var uuid = require('../uuid/cuid.js');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    //guaranteed to be created and setup by the time it reaches any route files
    var schemaLoader = winroutes.schemaLoader;
    var mainArtifact = winroutes.artifactType;

    var sessionAPI = this;

    var SessionModel;



    //session objects are really quite simple, they are the artifacats you branch from
    //the sessionID is the wid attached to all default objects
    sessionAPI.createSessionSchemaType = function(artifactType)
    {
        return {
            artifacts : ["String"]
        };
    };

    sessionAPI.registerSessionSchema = function()
    {
        var sessionSchema = sessionAPI.createSessionSchemaType();

        //we let the thing that loads schemas deal with loading the schema duhhhhhh
        var sModel = schemaLoader.loadSingleSchema(sSessionModelName, JSON.stringify(sessionSchema));
        schemaLoader.processSchemaReferences(sSessionModelName);
        return sModel;
    };

    sessionAPI.sessionCount = function(finish)
    {
        SessionModel.count({}, function(err, c)
        {
            finish(err,c);
        });
    };


    //this really shouldn't be called ever -- except in clearing out THE ENTIRE db
    sessionAPI.clearSessions = function(areYouSure, finish)
    {
        if(typeof areYouSure === 'function'){
            areYouSure("Error: make sure to confirm you want to clear sessions, this is dangerous!!!")
            return;
        }

        SessionModel.remove({}, function(err)
        {
            //we remove everything
            //which means we need to reset all the branch counts of everything


            var schemaModels = schemaLoader.getSchemaModels();
            var ArtModel = schemaModels[mainArtifact];

            //notice that the 'sessionID' field hasn't been removed.
            //that can be updated later I guess
            //this really shouldn't be called every
            ArtModel.update({},  {$set: { 'branchCount' : 0}}, {multi:true}, function(err){

                //Ev

                finish();

            });




        });

    };

    sessionAPI.postSessionAndParents = function(req, res)
    {
        var parentIDs = req.body.parents;

        sessionAPI.createSessionRetrieveParents(parentIDs,
            //success goes here-- with final object
            function(oFinal)
        {
            res.json(oFinal);
        },
            //errors go here
            function(errors)
        {
            res.send(500, JSON.stringify(errors));
        });
    };

    sessionAPI.createSessionRetrieveParents = function(parentIDs, success, failure)
    {

        var errors;
        var sessionObject, parentObjects;

        var finishSending = function()
        {
            if(parentObjects !== undefined && sessionObject !== undefined)
            {
                //we erred!  time to end it
                if(errors)
                {
                    failure(errors);
                    return;
                }
                else if(parentObjects.length != parentIDs.length)
                {
                    failure(["One of the parents was not found!"]);
                }

                for(var i=0; i < parentObjects.length; i++)
                {
                    //mark the session as this new session object -- despite them having a different originating session
                    parentObjects[i].sessionID = sessionObject.wid;
                }

                //loop through parent objects, and mark the sessionID

                //and we're done!
                success({session: sessionObject, parents: parentObjects});
            }
        };

        //now we have the ids, we need to rock the session, and we need to rock the bodies themselves
        sessionAPI.createSessionID(parentIDs, function(err, session)
        {
            if(err)
            {
                //we erred!
                if(!errors)
                    errors = [];

                errors.push(err);
            }

            //otherwise no error, we can keep going
            //we have our session object

            sessionObject = session;

            //if we have our parents, we're ready to finish this!
            finishSending();

        });

        winroutes.getAPI.fetchArtifacts(mainArtifact, parentIDs, function(err, artifacts)
        {
            if(err)
            {
                //we erred!
                if(!errors)
                    errors = [];

                errors.push(err);
            }

//            console.log('Artfacts fetched in session: ');
//            console.log(parentIDs);
//            console.log(artifacts);

            //we have our full artifacts
            parentObjects = artifacts;

            //if we have our seeds, we're ready to finish this!
            finishSending();
        });
    };


    sessionAPI.createSessions = function(singleParentWids, finished)
    {
        var sessionSaved = {};
        var toReturn = singleParentWids.length;
        var errors;

        for(var i=0; i < singleParentWids.length; i++)
        {
            var widOfParent = singleParentWids[i];
            sessionAPI.createSessionID([widOfParent], function(err, session)
            {
                if(err)
                {
                    if(!errors)
                        errors = [];

                    errors.push(toReturn);
                }
                else
                {
                    //we access the session artifact id (which we know is the singple parent wid
                    //and we note the session that was saved for that object
                    sessionSaved[session.artifacts[0]] = session.wid;
                }

                toReturn--;
                if(toReturn == 0)
                {
                    //allfinisehd on our returns -- check for errors
                    if(errors)
                        finished(errors);
                    else
                        //otherwise, we created our sessions, and mapped from wid to sessionID
                        finished(null, sessionSaved);

                }
            });
        }
    };
    sessionAPI.createSessionID = function(parentWids, finished)
    {
        if(!SessionModel)
        {
            //make sure the model is created
            SessionModel = sessionAPI.registerSessionSchema();
        }

        //now we have a session model, we should create one, and process it
        if(!parentWids || !parentWids.length)
            finished("Error: parentwids must have at least 1 object -- you can't start from nothing no matter what");

        var session = {artifacts: parentWids};
        session.wid = uuid();
        //don't create parents for sessions -- this should be dropped as a defactor thing

        var sessionObject = new SessionModel(session);

        sessionObject.save(function(err)
        {
             //if error, it will be handled by next step -- we still know the session id!
            finished(err, sessionObject);

//            if(err)
//            {
//                finished(err);
//                return;
//            }



            //here we actually update the parents involved
//            var ArtModel = schemaLoader.getSchemaModels()[mainArtifact];
//
//            ArtModel.update({wid: {$in: parentWids}}, {$inc: {schemaCount: 1}}, {multi: true}, function(err)
//            {
//                //if error, it will be handled by next step -- we still know the session id!
//                finished(err, sessionObject);
//            });
        });
    };
};








