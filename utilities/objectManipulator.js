var fs = require('fs'),
//use nodejs to find all js files, and update them
    path = require('path'),
    traverse = require('traverse'),
    util = require('util');


module.exports = function(appRoutes)
{
    var winroutes = appRoutes;
    var utilities = appRoutes.utilities;
    var next = utilities.next;

    var objectManipulator = this;

    //Section: Using a processed schema - generate a generic object
    objectManipulator.createGenericObject = function(artifactType)
    {
        //we have all the object information here
        var processedSchema = winroutes.schemaLoader.getPropertyPaths()[artifactType];
        var models = winroutes.schemaLoader.getSchemaModels();
        var specificModel = models[artifactType];

        var references = winroutes.schemaLoader.getSchemaReferences()[artifactType];

        return objectManipulator.traverseClone(processedSchema, function(original, schema)
            {
                //we must return a count - 0 to 10
                return 1 + next(10);
            },
            function(original, type, path)
            {
//                console.log('Path: ' + path);
//                console.log('type: ' + type);
                //have to set the DB path when creating generic objects!
                var split = path.split('.');
                if(split.length && split[split.length-1] === 'dbType')
                {
                    if(split.length == 1)
                        return artifactType;
                    else {
                        var potentialRefPath = split.slice(0, split.length-1).join('.');
                        return references[potentialRefPath];
                    }
                }

                if(typeof type === 'string')
                    return utilities.randomObjectFromType(type, null);

                //this should work otherwise!
                return utilities.randomObjectFromType(type['type'], models[type['ref']]);//models[type['ref']]);

            });
//
//        return objectManipulator.stepThroughCloneSchema('',processedSchema, processedSchema,
//            function(original, schema)
//            {
//                //we must return a count - 0 to 10
//                return 1;// + next(10);
//            },
//            function(original, type, path)
//            {
//                //have to set the DB path when creating generic objects!
//                var split = path.split('.');
//                if(split.length && split[split.length-1] === 'dbType')
//                {
////                    console.log('Path: ' + path);
////                    console.log('type: ' + type);
////                    console.log(split.length == 1 ? artifactType : references[split.slice(0, split.length-1).join('.')]);
//                    if(split.length == 1)
//                        return artifactType;
//                    else {
//                        var potentialRefPath = split.slice(0, split.length-1).join('.');
//                        return references[potentialRefPath];
//                    }
//                }
//
//
//                if(typeof type === 'string')
//                    return utilities.randomObjectFromType(type, null);
//
//                console.log('Path: ' + path);
//                console.log('type: ' + type);
//
//                //this should work otherwise!
//                return utilities.randomObjectFromType(type['type'], models[type['ref']]);//models[type['ref']]);
//
//            });

    };

    objectManipulator.findReferences = function(obj, defaultPathCheck)
    {
        var schemaTraverse = traverse(obj);

        var objRefs = {};
        var allTypes = {};

        schemaTraverse.forEach(function(node)
        {
            if(this.isLeaf && this.key == 'ref')
            {
                //there is an array issue
                //when you have a key of 0, you're indexing into an array
                //we need to make sure the object you're indexing into isn't a treacherous default path!
                var pathCheck = this.parent.key == '0' ? this.parent.parent.path : this.parent.path;

                //if you aren't a default property (parents, wid, creation etc), we don't count you as a reference
                if(!defaultPathCheck(pathCheck))
                {
                    objRefs[utilities.pathToString(this.parent.path)] = node;
                    allTypes[node] = true;
                }
            }
        });

        return {references: objRefs, types: allTypes};
    };

    objectManipulator.traverseReferences = function(startObjects, fullRefs, callbackWhenFound)
    {
        var refObjectsFound = {};

        //we go through and pick up references from FULL objects
        traverse(startObjects).forEach(function(node)
        {
            //check the path that everything comes through on
            var path = utilities.pathToString(this.path);

            //we're a reference path, and our object is a string
            if(fullRefs[path])
            {
                //type of object we got here yo
                var type = fullRefs[path];


                if(!refObjectsFound[type])
                    refObjectsFound[type] = {};
                if(!refObjectsFound[type][path])
                    refObjectsFound[type][path] = [];

                refObjectsFound[type][path].push(node);
            }
        });

        for(var type in refObjectsFound)
        {
            for(var path in refObjectsFound[type])
            {
                callbackWhenFound(type, refObjectsFound[type][path], path);
            }
        }
    };
    //this will clone everything, and just replace strings with objects according to the provided function
    objectManipulator.replaceRefStrings = function(model, schema, fullRefs, replaceCB)
    {
        var mTraverse = traverse(model);

        //function to rplace object wids with the objects themselves!
        var replaceRefRecursive = function(node)
        {
            if(this.isLeaf)
            {
                var path = utilities.pathToString(this.path);

                //we're a reference path, and our object is a string
                if(fullRefs[path] && typeof node === 'string')
                {
//                    console.log('I reaplce: ' + node);
//                    console.log(this.path);

                    //this is the mismatch we're looking for, we replace with the object
                    var toReplace = replaceCB(node, node, path);

                    //replace with whatever object is returned
                    this.update(toReplace);
                }
            }
        };

        return mTraverse.map(replaceRefRecursive);

    };

    //build a complete picture of references
    objectManipulator.createLayeredReferences = function(references, refTypeObject)
    {
        var layeredReferences = traverse(references).clone();

        var count = 1;
        var curRefs = references;
        while(count)
        {
            count = 0;
            var nextLayer = {};
            for(var key in curRefs)
            {
                var aType = curRefs[key];
                var pathRefs = refTypeObject[aType];

                for(var innerRef in pathRefs)
                {
                    //store the type in the next layer
                    layeredReferences[key + '.' + innerRef] = pathRefs[innerRef];
                    nextLayer[key + '.' + innerRef] = pathRefs[innerRef];
                    count++;
                }
            }

            curRefs = nextLayer;
        }

        //return all layered references
        return layeredReferences;
    };


    objectManipulator.traverseClone = function(schema, arrayCB, typeCB)
    {
//        console.log(arguments);

        var sTraverse = traverse(schema);

        var pathsTraveled= {};

        //we want to go through our scheme and clone an object -- sounds like mapping!
        var recursiveCreate = function(node)
        {
            //we're an array in the schema object -- we need to know how many to create
            if(Array.isArray(node))// this.key == '0')
            {
                var path = utilities.pathToString(this.path);
                var count = arrayCB(node[0], node[0], path);

                var innerTraverse = typeof node[0] !== 'string' ? traverse(node[0]) : undefined;
                var buildArray = [];

                for(var i=0; i < count; i++)
                {
                    //make a clone of the object
                    //if you are a leaf object -- you're just a type like "Number" or "String"
                    // so we just use our callback function for handling each new object
                    var obj = (innerTraverse ? innerTraverse.map(recursiveCreate) : typeCB(node[0], node[0], path));

                    //now our obj is cloned for us
                    buildArray.push(obj);
                }

                //Set the built array as this object, don't look into any of the nodes (stopsHere = true)
                this.update(buildArray, true);

            }
            else if(this.isLeaf)
            {
                var path, replaceObject;
                //we're ready to go
                if(this.key =='type')
                {
                    //this is a {type: 'String'} kinda situation, replace our parent, not us!
                    replaceObject = this.parent;
                }
                else if(typeof node === 'string')
                {
                    //we're going to replace this actual object (as opposed to parent)
                    replaceObject = this;
                }
                else
                {
                    //no other leaf node types please!
                    this.remove();
                }

                //now we only do updates when demanded
                if(replaceObject)
                {
                    path = utilities.pathToString(replaceObject.path);

                    //it should be a simple type, and can be generated on the spot
                    var simpleType = typeCB(replaceObject.node, replaceObject.node, path);
//                    console.log('Replaced with: ' + simpleType);
                    replaceObject.update(simpleType, true);
                }
            }
        };

        return sTraverse.map(recursiveCreate);
    };


    //This will clone an object with a certain schema
    //when it gets to an array, it will make a callback that returns the number of items to go through
    //then when it gets to a given type, it will make a type callback for the objects
    //--This makes the function kind of generic-- it doesn't have to clone the object, instead it can create
    //a new generic object, or assign properties to specific pathways
    objectManipulator.stepThroughCloneSchema = function(path, original, schema, arrayCB, typeCB, mismatchCB)
    {
        if(path == '')
        {
            var clone = objectManipulator.traverseClone.apply(this, [schema, arrayCB, typeCB]);
//            console.log(clone);
        }

        //we delve deeper into the schema - cloning structures as we go
        //until we hit a standard type -- then we send
        //type information to the callback

        //    console.log(schema);
        //    console.log("schema object: "  +  util.inspect(schema));
        //    console.log("original object: "  +  util.inspect(original));

        if(mismatchCB && typeof original === 'string' && (typeof schema === 'object' && schema['type'] !== 'String')){
            //        console.log('here!');
            //        console.log("schema object: "  +  util.inspect(schema));
            //        console.log("original object: "  +  util.inspect(original));
            var oReplace = mismatchCB(original, schema, path);
            original = oReplace;
        }


        //if you are an array, just process whatever is inside and return an array
        if(Array.isArray(schema))
        {
            var arrayClone = [];

            //this will tell us how many to clone
            var arrayCount = arrayCB(original, schema, path);

            //        console.log('Schema:' );
            //        console.log('Isarray: ' + Array.isArray(schema));
            //        console.log(schema[0]);

            //for all clones
            for(var i=0; i < arrayCount; i++)
            {
                //make a clone of the object
                var obj = objectManipulator.stepThroughCloneSchema(path, original[Math.min(i, original.length-1)], schema[0], arrayCB, typeCB, mismatchCB);

                //now our obj is cloned for us
                arrayClone.push(obj);
            }

            //return the array cloned
            return arrayClone;
        }

        //we are not an array, we must be an object with keys

        //we check to see if there is a type of objectid reference we need to replace
        //in that case, we're just a type, not multiple properties, so just send back the type explicitly
        if(schema['type'] || typeof schema === 'string')
        {
            //process the type and return!
            //we have to call out to our typeCB

            //it should be a simple type, and can be generated on the spot
            var simpleType = typeCB(original, schema, path);

            //should be done!
            return simpleType;
        }

        var processedKeys = {};

        for(var key in schema)
        {
            var currentPath = path + (path.length ? '.' : '') + key;
            //we don't need to process strings, they are just the types themselves!
            if(typeof schema[key] === 'string'){
                processedKeys[key] = typeCB(original[key], schema[key],currentPath);
            }
            else
            //otherwise, we need to process the object
                processedKeys[key] = objectManipulator.stepThroughCloneSchema(currentPath, original[key], schema[key], arrayCB, typeCB, mismatchCB);
        }

        //all finished! On we go...
        return processedKeys;

    };

};