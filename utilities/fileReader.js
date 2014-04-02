var fs = require('fs'),
//use nodejs to find all js files, and update them
    path = require('path'),
    util = require('util');

module.exports = function(appRoutes)
{
    var winroutes = appRoutes;

    var fileReader = this;

    var directoryCount = 0;
    var ignoreList =
        [
            'test',
            'node_modules',
            '.git',
            '.idea'
        ];


    fileReader.shouldIgnore = function(fileName)
    {
        for(var i=0; i < ignoreList.length; i++)
        {
            if(fileName.indexOf(ignoreList[i]) !== -1)
                return true;
        }
        return false;
    };

    fileReader.isJSON= function(fileName)
    {
        if(fileName.length < 5)
            return false;

        return fileName.substr(fileName.length - 5, 5) === '.json';
    };

    fileReader.recursiveReadDirectorySync = function(directoryPath, builtDirectory, finished)
    {
        var schemaFiles = {};

        directoryCount++;
        var files = fs.readdirSync(directoryPath);

        files.forEach(function(f)
        {
            if(fs.lstatSync(path.resolve(directoryPath, f)).isDirectory())
            {
                //we're a directory, but not node modules or test directory, please investigate!
                //we should make sure we're not in our .gitignore list!
                if(!fileReader.shouldIgnore(f))
                {
                    fileReader.recursiveReadDirectorySync(path.resolve(directoryPath, f), builtDirectory + f + '/', finished);
                }
            }
            else
            {
                //are we a js file?
                if(fileReader.isJSON(f))
                {
                    var baseName = f.replace('.json','');
                    schemaFiles[baseName] = fs.readFileSync(path.resolve(directoryPath, f));
                }
            }

        });

        directoryCount--;

        if(directoryCount == 0)
            return schemaFiles;
    };

};