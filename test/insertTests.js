//here we test the insert functions
//making sure the database is filled with objects of the schema type

var assert = require('assert');
var should = require('should');

var winjs = require('../win.js');


var winapp;


var next = function(range)
{
    return Math.floor((Math.random()*range));
};


describe('Testing Database Insertion',function(){

    //we need to start up the WIN backend
    before(function(done){

        winjs.launchWIN({artifactType: "schema1", directory: __dirname, seedDirectory: './testseeds', schemaDirectory: './'}, {modifier: 'test'}, function(err,app)
        {
            if(err){
                console.log(err)
                throw new Error('Messed up starting WIN tests- make sure mongo is running.');
            }

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


    it('Should create and save objects to DB',function(done){
        var wutil = winapp.winRoutes.utilities;
        var om = wutil.objectManipulator;
        var insertAPI = winapp.winRoutes.insertAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        //TODO: Need to check for genome saves as well
        //let's create a fake object from a schema
        var insertionTests = 100;
        var allValid = [];

//        console.log('Creating generic');

        for(var i=0; i < insertionTests; i++)
        {
            //we have our object created based on test schema1
            var obj = om.createGenericObject('schema1');
            allValid.push(obj);
//            console.log(obj);
        }

//        console.log('end generic')

        var ArtifactModel = schemaLoader.getSchemaModels()['schema1'];

        //build the artifact objects
        insertAPI.checkAndConstructArtifactDBObjects('schema1', allValid, function(err, artifactConstruct){

            //map from local ids to global ids
            var mapping = artifactConstruct.mapping;

            //let's make a save -- send in the models
            insertAPI.saveArtifactModelsToDB(artifactConstruct.models, artifactConstruct.modelMapList, function(err, aComplexObject)
            {
                //we create a function to check if everything is saved!
                var findCheckArtifact = function(wid, artifact, callback)
                {
                    ArtifactModel.find({wid: wid}, function(err, artifactModelArray)
                    {
                        if(err){
                            throw new Error(err);
                        }

                        artifactModelArray.length.should.equal(1);

                        var genomeModel = artifactModelArray[0];

                        //now we do a validation across the model

                        callback();
                    });
                };


                var mapCount = allValid.length;

                //validate each artifact -- that it's there, and it has the right properties
                for(var i=0; i < allValid.length; i++)
                {
                    findCheckArtifact(mapping[allValid[i].wid], allValid[i], function()
                    {
                        mapCount--;
                        if(mapCount <= 0){

                            ArtifactModel.count({}, function(err, count){
                                count.should.equal(allValid.length);
                                //we finished our test, everything came back with a green check!
                                done();
                            })

                        }
                    });
                }

            });


        });

    });





});
