//Handles calls for the home page -- processing queries for mofos

var util = require('util');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    var homeAPI = this;
    var schemaLoader = winroutes.schemaLoader;

    //now let's create some routes, yo

    var individualsPerPage = 6;

    //normally, you would request 3 pages, set the max to 5 -- so you can't slam the database
    var maxPageCount = 5;

    var maxIndividuals = 40;


    homeAPI.mostRecentRequest = function(req,res)
    {
      //derrrr

//        console.log('Recent request: ');
//        console.log(req.body.start);
//        console.log(req.query ? req.query: "no params");
//        console.log(req.query.end);

        if(req.query.start === undefined || req.query.end === undefined)
        {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({error: "No genome start and/or end specified."}));
            return;
        }

        var artifact = winroutes.artifactType;
        var startIx = parseInt(req.query.start);
        //only allow the smallest of the two, friend
        var endIx = Math.min(startIx + maxIndividuals, parseInt(req.query.end));

        console.log('Making recent request')
        console.log('Start: ' + startIx + ' end: ' + endIx);
        console.log(artifact);

        //let's make a request, there should be some information for us
        homeAPI.getMostRecent(artifact, startIx, endIx, function(err, artifactsAndInfo)
        {
            if(err){
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(err));
            }
            else
                res.json(artifactsAndInfo);
        });

        //dunzo above
    };

    homeAPI.getMostRecent = function(artifactType, start, end, finished)
    {
        var skip = start;
        var limit = end- start;

        if(limit-1 <= 0)
        {
            finished('Error: invalid start/end request -- need to request at least 1 object: start- ' + start + ' end- ' + end);
            return;
        }
        var getAPI = winroutes.getAPI;

        var artifactQuery = {};
        artifactQuery[getAPI.QueryIdentifier.isComplex] = true;
        //only select published objects
        artifactQuery[getAPI.QueryIdentifier.find] =  {'creation.isPublic' : true};
        artifactQuery[getAPI.QueryIdentifier.sort] =  {_id: -1};
        artifactQuery[getAPI.QueryIdentifier.limit] = limit;
        artifactQuery[getAPI.QueryIdentifier.skip] = skip;
//            = [{}, {}, {skip: skip, limit: limit-1, sort: {_id: -1}}];

        winroutes.getAPI.makeArtifactQuery(artifactType, artifactQuery, function(err, artifacts)
        {
            //if there is any error, we'll just pass the buck!
            finished(err, {artifacts: artifacts, start: start, end: end});
        });

    };





};
