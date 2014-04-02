
var assert = require('assert');
var should = require('should');
var util = require('util');
var fs = require('fs');
var traverse = require('traverse');



var winjs = require('../win.js');

var winapp;

var next = function(range)
{
    return Math.floor((Math.random()*range));
};


describe('Testing Generator Schema Processing -',function(){

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


    var refCountObject = function(obj)
    {
        var allPaths = traverse(obj).paths();
        var refcount = 0;
        allPaths.forEach(function(path)
        {
            if(path.length &&  path[path.length-1] == 'ref')
                refcount++;
        });

        return refcount;
    };


    it('schema generator',function(done){

        var generator = winapp.winRoutes.generator;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        //let's process a new schema object

        var schemaName = 'complexSchema';
        fs.readFile("./test/" + schemaName + ".json", function(err,data)
        {
            if(err)
            {
                throw err;
            }
            var schema = JSON.parse(data);

            //takes a json schema, and turns it into an actual schema
            var objectSchema = generator.mapConvert(schema);

            //no more references please!
            refCountObject(objectSchema).should.equal(0);


            schemaLoader.traverseProcess(schemaName, schema);


            //the schema has 3 references in it, make sure it gets both
            ///this is SCHEMA1 specific! Be careful if you change test
//            var refcount = refCountObject(objectSchema);
//            refcount.should.equal(3);
//            console.log(util.inspect(objectSchema,true, 2));
//            console.log('mapped object:');
//            console.log(util.inspect(mappedSchema,true, 2));

//            var traversed = traverse(objectSchema);
//
//            var genoPath = ['pictureGenotype'];
//            traversed.has(genoPath).should.equal(true);
//            genoPath.push('type');
//            traversed.has(genoPath).should.equal(true);
//            genoPath[1] = 'ref';
//            traversed.has(genoPath).should.equal(true);
//
//            //"secondTest": {"second" : "String", "genoSecond" : {"type": "String", "ref" : "NEATGenotype"}}
//            var secoPath = ['secondTest'];
//            traversed.has(secoPath).should.equal(true);
//            secoPath.push('second');
//            traversed.has(secoPath).should.equal(true);
////            traversed.get(secoPath).should.equal(String);
//            secoPath[1] = 'genoSecond';
//            traversed.has(secoPath).should.equal(true);
//            secoPath.push('type');
//            traversed.has(secoPath).should.equal(true);
//            secoPath[2] = 'ref';
//            traversed.has(secoPath).should.equal(true);

//            traversed.forEach(function(node)
//            {
//                if(this.isLeaf)
//                {
//                    console.log('Key: ' + this.key + ' prop: ' + node + ' path: ' + this.path);
//                }
//
//            });

//            var processSchema = generator.process(schemaName, objectSchema);
//            console.log(util.inspect(processSchema,true, 2));

            //process schema should remove everything
//            refcount  = refCountObject(processSchema);
//            refcount.should.equal(0);



            done();

        });





    });

});
