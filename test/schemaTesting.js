//here we test the schema loader, we create an arbitrary schema
//create an arbitrary schema that matches or mismatches, and test that the mismatch is caught

var assert = require('assert');
var should = require('should');

var winjs = require('../win.js');

var winapp;

var next = function(range)
{
    return Math.floor((Math.random()*range));
};


describe('Testing Schema Generation',function(){

    //we need to start up the WIN backend

    before(function(done){

        //launch in specific db subset wintest
        winjs.launchWIN({artifactType: "schema1",directory: __dirname, seedDirectory: './testseeds', schemaDirectory: './'}, {modifier: 'test'}, function(err,app)
        {
            if(err)
                throw new Error('Messed up starting WIN tests- make sure mongo is running.');

            winapp = app;

            done();
        });

    });

    it('Should create objects from schemas',function(done){
        console.log('');
        var wutil = winapp.winRoutes.utilities;
        var om = wutil.objectManipulator;
        var insertAPI = winapp.winRoutes.insertAPI;
        var schemaLoader = winapp.winRoutes.schemaLoader;

        //let's create a fake object from a schema
        var validityTests = 100;
        var allValid = [];

        for(var i=0; i < validityTests; i++)
        {
            //we have our object created based on test schema1
            var obj = om.createGenericObject('schema1');
            allValid.push(obj);
        }

        //it should be all valid!
        (insertAPI.validateObjects(allValid, 'schema1') === undefined).should.equal(true);

        done();

    });

//
//    it('Should load our various schemas',function(done){
//
//        //let's create a fake schema
//
//        //should be missing some things
//        var picGenotypes = [{pictureGenotype: {nodes: [], connections: []}}];
//
//        //now we'll test a schema1!
//        //send in our varied objects, and the schema type
//        var invalid = insertAPI.validateObjects(picGenotypes, 'schema1');
//
//        //we should have invalid objects
//        (invalid !== undefined).should.equal(true);
//
//        done();
//
//    });
//




});
