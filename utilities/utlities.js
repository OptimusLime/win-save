var fs = require('fs'),
//use nodejs to find all js files, and update them
    path = require('path'),
    traverse = require('traverse'),
    util = require('util');

var fileReaderClass = require('./fileReader.js');
var objManipClass = require('./objectManipulator.js');
var uuid = require('../uuid/cuid.js');

module.exports = function(appRoutes)
{

    var winroutes = appRoutes;

    //set our selves as the utilities object!
    winroutes.utilities = this;

    var utilities = this;

    utilities.next = function(range)
    {
        return Math.floor((Math.random()*range));
    };

    var next = utilities.next;

    utilities.pathToString = function(pathArray)
    {
        var path = "";
        pathArray.forEach(function(item)
        {
            if(isNaN(parseInt(item)))
            {
                if(path !== "")
                    path += '.' + item;
                else
                    path += item;
            }

        });
        return path;
    };

    //String that's usable directly by the traverse object
    utilities.pathToTraverseString = function(pathArray)
    {
        var path = "";
        pathArray.forEach(function(item)
        {
            if(path !== "")
                path += '.' + item;
            else
                path += item;
        });
        return path;
    };

    utilities.pathFromString = function(pathString)
    {
        return pathString.split('.');
    };

    utilities.randomObjectFromType = function(type, model)
    {
        switch(type)
        {
            case 'String':
                //if we have a ref type, return an ID here, not random numbers together
                return (model ? uuid() ://uuid.cuid() :
                    '' + next(5000) + next(23424) + next(234234));
            case 'Number':
                return next(130934) + Math.random();
            case 'ObjectId':
                //            console.log('Has model? ' + (model ? "yes" : "no"));
                //we either return a generic created model ID, or just a generic object ID
                return uuid();//uuid.cuid();//(model ? new ObjectId(new model()._id) : new ObjectId());//(model ? new ObjectId(new model()._id) : new ObjectId());//ObjectId();
            case 'Date':
                return Date.now();//new Date();
            case 'Boolean':
                return (Math.random() <.5 ? true : false);
            default:
                throw new Error("SchemaGen: Type not defined: " + type);
        }
    };

    utilities.recursiveVerify = function(retrieved, original, ignoreKeys)
    {
        ignoreKeys = ignoreKeys || {};

        var rTraverse = traverse(retrieved);
        var oTraverse = traverse(original);

//    console.log(retrieved);
//    console.log(original);

        oTraverse.forEach(function(node)
        {
            if(this.isLeaf && !ignoreKeys[this.key])
            {
                var otherNode = rTraverse.get(this.path);

                //first we check -- if they're equal -- don't attempt date parsing
                if(node === otherNode){
                    node.should.equal(otherNode);
                }
                else if(Array.isArray(node) && Array.isArray(otherNode))
                {
                    node.length.should.equal(otherNode.length);
                    for(var i=0; i < node.length; i++)
                    {
                        node[i].should.equal(otherNode[i]);
                    }
                }
                else
                {
                    //if we can parse a date, it's a date object -- and we know now!
                    var date = Date.parse(otherNode);

                    if(date)
                        date.should.equal(node);
                    else
                        node.should.equal(otherNode);

                }

            }
        });
    };


    //setting up the other objects inside the utilties class -- after creating required functions
    utilities.fileReader = new fileReaderClass(appRoutes);
    utilities.objectManipulator = new objManipClass(appRoutes);

};