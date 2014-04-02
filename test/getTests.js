//here we test the insert functions
//making sure the database is filled with objects of the schema type

var assert = require('assert');
var should = require('should');
var util = require('util');
var traverse = require('traverse');

var winjs = require('../win.js');

var winapp;

//var schemaLoader = require('../model/schemaLoading.js');
//var getAPI = require('../routes/getAPI.js');
//var insertAPI = require('../routes/insertAPI.js');
//var seedAPI = require('../routes/seedAPI.js');
// var uuid = require('cuid');

var next = function(range)
{
    return Math.floor((Math.random()*range));
};

var callDelete = function(count, max, model, callback)
{
};

describe('Testing get artifacts from DB -',function(){

    //we need to start up the WIN backend

    before(function(done){

        winjs.launchWIN({artifactType: "schema1", directory: __dirname, seedDirectory: './testseeds', schemaDirectory: './'}, {modifier: 'test'}, function(err, app)
        {
            if(err)
                throw new Error('Messed up starting WIN tests- make sure mongo is running.');

            winapp = app;

            done();
        });
    });

    beforeEach(function(done){
        console.log('');
        var schemaLoader = winapp.winRoutes.schemaLoader;

        var allSchema = schemaLoader.getSchemaModels();

        var schemaArray = [];
        for(var key in allSchema)
            schemaArray.push(allSchema[key]);

        //we've created an array of models
        //now we need to clean out the models, for a clean slate!
        var emptyIx = 0;

        for(var i=0; i < schemaArray.length; i++)
        {
            schemaArray[i].remove({}, function(err){

                emptyIx++;
                if(emptyIx == schemaArray.length)
                    done();

            });
        }

    });
    it('Check get api traverse references',function(done){
        var wutil = winapp.winRoutes.utilities;
        var om = wutil.objectManipulator;
        var getAPI = winapp.winRoutes.getAPI;


        var artifactType = 'schema1';

        var obj = om.createGenericObject(artifactType);
        var allSchemaRefs = winapp.winRoutes.schemaLoader.getSchemaReferences();
        var fullRefs = winapp.winRoutes.schemaLoader.getFullSchemaReferences()[artifactType];
//
//        getAPI.findReferencesInObjects(artifactType,[obj], function(refFound, foundObjects, refPath)
//        {
//            console.log('Original: ');
//            console.log(refFound);
//            console.log(foundObjects);
//            console.log('At path: ' + refPath)
//            console.log('Endo');
//        });
//        getAPI.traverseReferences([obj], fullRefs, function(refFound, foundObjects, refPath)
//        {
//            console.log('Traverse: ');
//            console.log(refFound);
//            console.log(foundObjects);
//            console.log('At path: ' + refPath)
//            console.log('Endt');
//        });

        done();

    });

    it('Should create and save objects to DB -- creation',function(done){

        var wutil = winapp.winRoutes.utilities;
        var om = wutil.objectManipulator;
        var insertAPI = winapp.winRoutes.insertAPI;
        var getAPI = winapp.winRoutes.getAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        //let's create a fake object from a schema
        var insertionTests = 100;
        var allValid = [];
        var objsByGID = {};

        for(var i=0; i < insertionTests; i++)
        {
            //we have our object created based on test schema1
            var obj = om.createGenericObject('schema1');
            allValid.push(obj);
            objsByGID[obj.wid] = obj;
//            console.log(obj);
        }

        var ArtifactModel = schemaLoader.getSchemaModels()['schema1'];

        //build the artifact objects
        insertAPI.fullInsertArtifacts('schema1', allValid, function(err, stuff)
        {
            //objects have been saved
            //time to retrieve them from the DB!

            //aha! we have saved our objects, lets get them back!
            var retrieveArtifacts = [];
            for(var wid in objsByGID)
                retrieveArtifacts.push(wid);

            getAPI.fetchArtifacts('schema1', retrieveArtifacts, function(err, retrievedObjects)
            {
                if(err)
                    throw new Error(err);

                //counts should be equal
                retrievedObjects.length.should.equal(allValid.length);

                for(var i=0; i < retrievedObjects.length; i++)
                {
                    //test the original against the retrieved
                    var retrieved = retrievedObjects[i];
                    //for testing purposes -- best to turn this object into json and back -- forcing the correct object types
                    retrieved = JSON.parse(JSON.stringify(retrieved));

                    var original = objsByGID[retrieved.wid];

                    //they must match exactly

                    wutil.recursiveVerify(retrieved, original);
                }

                done();
            });

        });
    });

});
