var express = require('express')
//  , db = require('./model/db')
//  , routes = require('./routes')
    , http = require('http')
    , path = require('path');

var mongoose = require('mongoose');

var utilitiesClass = require('./utilities/utlities.js');
var generatorClass = require('./generator/generator.js');
var schemaLoaderClass = require('./model/schemaLoading.js');

var seedAPIClass = require('./routes/seedAPI.js');
var getAPIClass = require('./routes/getAPI.js');
var insertAPIClass = require('./routes/insertAPI.js');
var removeAPIClass = require('./routes/removeAPI.js');
var sessionAPIClass = require('./routes/sessionAPI.js');
var homeAPIClass = require('./routes/homeAPI.js');
var familyAPIClass = require('./routes/familyAPI.js');

var winjs = exports;

var initialized = false;

winjs.createWinApp = function(dbModifier, requiredObjects, callback)
{
    if(!requiredObjects)
        throw new Error('Required objects are just that, required!');

    //create an express app
    var app = express();

    app.use(express.errorHandler());
    app.use(express.cookieParser());
    app.use(express.bodyParser());

    //    Origin, X-Requested-With, Content-Type, Accept
    //need cross domain origin for us!
    app.use(function(req, res, next) {
        console.log('Handling cross');
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", 'OPTIONS, POST, GET, PUT, DELETE');
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });

    app.options('*', function(req,res)
    {
        res.send(200);
    });



    // connect to Mongo when the app initializes
    var mongooseConnection = mongoose.createConnection('mongodb://localhost/win' + dbModifier);

    mongooseConnection.on('error', function(e)
    {
        console.log('Mongoose connection error');
        console.log(e);
//        console.error.bind(console, 'connection error:');
        callback(e.message);

    });

    mongooseConnection.on('open', function(){

        var artifactType = requiredObjects.artifactType;

        app.winRoutes = {};
        app.winRoutes.artifactType = artifactType;
        app.winRoutes.utilities = new utilitiesClass(app.winRoutes);
        app.winRoutes.generator = new generatorClass(app.winRoutes);
        app.winRoutes.schemaLoader = new schemaLoaderClass(app.winRoutes);

        app.winRoutes.removeAPI = new removeAPIClass(app.winRoutes);
        app.winRoutes.sessionAPI = new sessionAPIClass(app.winRoutes);
        app.winRoutes.insertAPI = new insertAPIClass(app.winRoutes);
        app.winRoutes.seedAPI = new seedAPIClass(app.winRoutes);
        app.winRoutes.getAPI = new getAPIClass(app.winRoutes);
        app.winRoutes.homeAPI = new homeAPIClass(app.winRoutes);
        app.winRoutes.familyAPI = new familyAPIClass(app.winRoutes);

        var routes = app.winRoutes;

        //Now our connections
//    var insertAPI = require('./routes/insertAPI.js');
        //post artifacts
        app.post('/api/artifacts', routes.insertAPI.postInsertArtifactBatch);

        //making a post to branch an object -- sending the parentIDs
        app.post('/api/branch', routes.sessionAPI.postSessionAndParents);

        //get artifacts
//    var getAPI = require('./routes/getAPI.js');
//        app.get('/api/artifacts', routes.getAPI.fetchArtifacts);

        //Host seed and schema info
        app.get('/api/initial', routes.getAPI.initialSchemaAndSeed);



        //home page
        app.get('/api/home/recent', routes.homeAPI.mostRecentRequest);

        //family relationships!
        app.get('/api/family/initial', routes.familyAPI.getInitialFamilyInformation);


        //send a get request for any type of artifacts
        //these are new additions for the new win-backbone code for alife
        //all of this is going to be redesigned in teh future-- for now, must hurry
        app.get('/api/artifacts', routes.getAPI.getArtifactBatch)
        app.get('/api/seeds', routes.seedAPI.getSeedsRequest);


        //generator and schema loader for this app!
        var generator = app.winRoutes.generator;
        var schemaLoader = app.winRoutes.schemaLoader;
        var seedAPI = app.winRoutes.seedAPI;

        var seedDirectory = path.resolve(requiredObjects.directory || __dirname, requiredObjects.seedDirectory);

        var schemaDirectory = path.resolve(requiredObjects.directory || __dirname,requiredObjects.schemaDirectory);

        if(!seedDirectory || !artifactType || !schemaDirectory)
            throw new Error("Failed to launch WIN, no seed/schema directory and/or artifact type provided!");


        //set connection for mongoose generation
        generator.setConnection(mongooseConnection);

        console.log('Loading: ' + schemaDirectory);
        //load our schemas in -- passing database connection
        schemaLoader.loadAllSchemas(schemaDirectory);

        //save all of our seeds now, since everything is good to go
        seedAPI.saveAllSeeds(artifactType, seedDirectory, function()
        {
            //when we're done opening the connection, and setting up the seeds -- we're officially all setup!
            callback(null, app, mongooseConnection);

        });
    });

};

var lastApp;

winjs.launchWIN = function(requiredObjects, options, callback)
{
    console.log('launching!');
    console.log(options);
    options = options || {};

    //if our first object is a function, it's our callback - and options are blank
    if(typeof options === "function"){
        callback = options;
        options = {};
    }
    if(initialized)
    {
        callback(null, lastApp);
        return;
    }

    initialized = true;

    winjs.createWinApp(options.modifier || '', requiredObjects, function(err, app, mongooseConnection)
    {
        lastApp = app;

        if(err){
            callback(err);
            throw new Error(err);
        }

        var server = http.createServer(app);

        //we listen for the server, as soon as we access the database object
        server.listen(options.port || 80, function(){
            console.log("Express server listening on port " + options.port || 80);

            //finished, no error
            callback(null,app);

        });

    });

};



