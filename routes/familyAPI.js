//Handles calls for the home page -- processing queries for mofos

var util = require('util');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    var familyAPI = this;
    var schemaLoader = winroutes.schemaLoader;


    //initial request for family page!
    familyAPI.getInitialFamilyInformation = function(req,res)
    {
        //derrrr

        var wid = req.query.wid;
        var objectWID = wid;
        var artifactType = req.query.artifactType;

        //dunzo above

        var ArtifactModel = schemaLoader.getSchemaModels()[artifactType];
        if(!ArtifactModel)
        {
            res.send(500, 'Incorrect Artifact Type provided!');
            return;
        }

        var leftToComplete = {};
        var allToFetch = ['parents', 'siblings', 'children'];


        var finished = function()
        {
//            console.log('left: ');
//            console.log(leftToComplete);
//            console.log(allToFetch);

            for(var i=0; i < allToFetch.length; i++)
                if(!leftToComplete[allToFetch[i]])
                    return false;

            return true;
        };


        var errors;

        var processError = function(err)
        {
            if(err)
            {
                if(!errors)
                    errors = [];

                errors.push(err);
            }
        };

        var returnFamilyInfo = function(errors, info){

//            console.log('Family info returned!');
//            console.log(info);


            if(errors)
            {
                res.send(500, errors);
                return;
            }
            //we're ready to do a fetch on ALL objects

            var allWIDs = [];

            for(var key in info)
            {
                allWIDs = allWIDs.concat(info[key]);
            }

            //add the object itself! -- we need the full object too -- not just family
            //in intialization this is true
            allWIDs.push(objectWID);

            //ready to search out the wid objects

            console.log('Fetching wids: ');
            console.log(allWIDs);

            winroutes.getAPI.fetchArtifacts(artifactType, allWIDs, function(err,artifacts){


                console.log('Artifacts all returned: ');
                console.log(artifacts);

                var artifactMap = {};
                for(var i=0; i < artifacts.length; i++)
                    artifactMap[artifacts[i].wid] = artifacts[i];

                if(err)
                {
                    res.send(500, [err]);
                    return;
                }

                var finalSendoff = {};

                for(var key in info)
                {
                    finalSendoff[key] = {};

                    for(var i=0; i < info[key].length; i++)
                    {
                        var fwid = info[key][i];

                        if(artifactMap[fwid] && artifactMap[fwid].creation.isPublic)
                        {
                            //give us our artifacts please!
                            finalSendoff[key][fwid] =  artifactMap[fwid];
                        }
                    }
                }

                finalSendoff['object'] = artifactMap[objectWID];

                console.log("retrieved family: ");
                console.log(finalSendoff);

                //arranged by parents, siblings, children
                res.json(finalSendoff);

//                res.json(artifacts);

            });

        };

        familyAPI.getIndividualParents(ArtifactModel, wid, function(err, parents)
        {
            processError(err);
            leftToComplete['parents'] = parents;

//            console.log('Parents returned: ');
//            console.log(parents);

            //fetch other parental children
            familyAPI.getIndividualSiblings(ArtifactModel, parents, function(sErr, siblings)
            {

//                console.log('Siblings returned: ');
//                console.log(siblings);

                //fetch the other children of your parents
                processError(sErr);
                leftToComplete['siblings'] = siblings;
                if(finished())
                    returnFamilyInfo(errors, leftToComplete);

            });

        });

        familyAPI.getIndividualChildren(ArtifactModel, wid, function(err, children)
        {
//            console.log('Children returned: ');
//            console.log(children);

            processError(err);
            leftToComplete['children'] = children;
            if(finished())
                returnFamilyInfo(errors, leftToComplete);
        });
    };

    familyAPI.getIndividualParents = function(ArtifactModel, wid, callback)
    {
        //fetch the parents
        //can actually call the callback directly with the info!
        ArtifactModel.findOne({wid:wid}).lean().exec(function(err, doc)
        {
            //always return an array at least!
            callback(err, (doc ? doc.parents : []));
        });
    };

    familyAPI.getIndividualChildren = function(ArtifactModel, wid, callback)
    {
        //fetch the kids
        ArtifactModel.find({parents: {$all: [wid]}, 'creation.isPublic' : true}).select('wid').limit(3).lean().exec(function(err, children)
        {
            var cIDs = [];
            if(!err)
            {
                for(var i =0;i < children.length; i++)
                {
                    cIDs.push(children[i].wid);
                }
            }

            callback(err, cIDs);
        });
    };

    //fetch other parental children
    familyAPI.getIndividualSiblings = function(ArtifactModel, parents, callback)
    {
        //fetch the other children of your parents
//        ArtifactModel.find({}).lean().exec(callback);
        callback(null, []);
    };









};
