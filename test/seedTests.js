//here we test the insert functions
//making sure the database is filled with objects of the schema type

var assert = require('assert');
var should = require('should');
var util = require('util');
var fs = require('fs');
var path = require('path');

var winjs = require('../win.js');

//var seedAPI = require('../routes/seedAPI.js');
//var schemaLoader = require('../model/schemaLoading.js');

var winapp;

var recursiveVerify = function(path, retrieved, original)
{

    //huh?
    if(Array.isArray(retrieved))
    {
        //should be same size array
        retrieved.length.should.equal(original.length);

        for(var i=0; i < retrieved.length; i++)
        {
            recursiveVerify(path, retrieved[i], original[i]);
        }
        return;
    }

    //we aren't an array -- check if we're not an object
    //verify equality if we're an actual object
    if(typeof retrieved !== 'object')
    {
    //        console.log('Checking path: ' + path + ' retri: ' + retrieved  + ' o: ' + original);

        if(retrieved === original)
        {
            retrieved.should.equal(original);
            return;
        }

        if(original ===undefined|| retrieved === undefined)
        {
            console.log('Path fail: ' + path);
            console.log(original);console.log(retrieved);
            console.log('Endfail');
        }
        should.exist(original);
        should.exist(retrieved);

        //we know they aren't equal now

        //if we can parse a date, it's a date object -- and we know now!
        var rDate = Date.parse(retrieved);
        var oDate = Date.parse(original.toString());

        if(!isNaN(rDate) && !isNaN(oDate))
        {
            (rDate === original || rDate === oDate).should.equal(true);
            return;
        }
        else
        {
            retrieved.should.equal(original);
            return;
        }

    }

    //otherwise, we're an object with keys!
    for(var key in retrieved)
    {
        var nPath = path.length ? path + '.' + key : key;
        //process the inside of objects using the keys!
        recursiveVerify(nPath, retrieved[key], original[key]);
    }

};

var isNull = function(err)
{return (err === null || typeof err === 'undefined');}


describe('Testing Seed API -',function(){

    //we need to start up the WIN backend

    before(function(done){

        console.log();
        winjs.launchWIN({artifactType: "schema1", directory: __dirname, seedDirectory: './testseeds', schemaDirectory: './'}, {modifier: 'test'}, function(err, app, mon)
        {
            if(err)
                throw new Error('Messed up starting WIN tests- make sure mongo is running.');

            winapp = app;

            done();
        });
    });

    beforeEach(function(done){
        console.log('');

        var seedAPI = winapp.winRoutes.seedAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        //clear out our seeds every time
        seedAPI.clearSeeds(function(err)
        {
//            console.log(err);
            isNull(err).should.equal(true);
            //otherwise, we should be empty for seeds, but clear out others!

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


    });




    it('Seeds should all be accounted for',function(done){

        var wutil = winapp.winRoutes.utilities;
        var seedAPI = winapp.winRoutes.seedAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        var dir = path.resolve(__dirname, './testseeds');

        var seedFiles = fs.readdirSync(dir);

//        var doubleLoadSeeds =  seedAPI.loadSeeds(dir);
        var loadedSeeds = seedAPI.loadSeeds(dir);

        var seedMapping = {};
        for(var key in loadedSeeds.map)
        {
            var seed = loadedSeeds.map[key];
            seedMapping[seed.seedID] = seed;
        }

        //todo: note that seed objects being sent in are also being modified -- so it's not clear if what's coming back actually is matched together cause of memory references?
        seedAPI.insertSeeds("Seed", loadedSeeds.map, loadedSeeds.idList, function(err, seeds)
        {

            //count seeds first!
            seedAPI.seedCount(function(err,count)
            {
                //we should have an error
                isNull(err).should.equal(true);

                //and we shouldn't have any seeds in there
                count.should.not.equal(0);
                count.should.equal(seedFiles.length);

                seedAPI.getAllSeeds(function(err, dbSeeds){

                    //now get the actual full seed objects
                    for(var i=0; i < dbSeeds.length; i++)
                    {
                        //normally, when being sent JSON style, this would be an issue
                        //however, since it's internal, we need to make a straight object stuff
                        var s = dbSeeds[i];
                        should.exist(s.creation.sessionID);
                        var original = seedMapping[s.seedID];

//                        console.log(s);
//                        console.log(original);

//                        console.log(s);
//                        console.log(original);
                        //ignore creation object -- this is special case
                        wutil.recursiveVerify(s, original, {"timeOfCreation":true});
                    }

                    done();


                })

            });

        });
    });

    it('Seeds should be empty',function(done){

        var seedAPI = winapp.winRoutes.seedAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        seedAPI.saveAllSeeds('schema1', path.resolve(__dirname, './testseeds'), function()
        {
            seedAPI.clearSeeds(function(err)
            {
                isNull(err).should.equal(true);

                seedAPI.seedCount(function(err, count)
                {
                    //we should have an error
                    isNull(err).should.equal(true);

                    //and we shouldn't have any seeds in there
                    count.should.equal(0);

                    done();
                })
            });

        });

    });


});
