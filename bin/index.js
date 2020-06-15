#!/usr/bin/env node
require('dotenv').config();
const AWS = require('aws-sdk');
const yargs = require("yargs");
const fs = require('fs');

AWS.config.update({
    region: "us-west-2",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const delimiter = "/";
const maxKeys = 1000;
const bucket = "atk-bucket";
const typeFolder = "application/x-directory";

const s3 = new AWS.S3();

async function main() {

    yargs.usage('Usage: $0 <command> [options]');

    //SUBIDA ARCHIVOS Y CARPETAS
    yargs.command(['upload <fileOrFolder> [folderIns3]', 'up'],
        'upload a file',
        (yargs) => {},
        (argv) =>upload(argv)
    ).argv;

    //LISTAR CONTENIDO EN S3
    yargs.command(
        ['list [folder]','ls'],
        'lista archivos',
        (yargs) => {},
        (argv) =>list(argv)
    ).argv;

    //BORRAR ARCHIVOS Y/O CARPETAS
    yargs.command(['rm <file>'],
        'remove a file',
        (yargs) => {},
        (argv) =>deleteObjs(argv)
    ).argv;

    //CREAR CARPETAS
    yargs.command(
        ['mkdir <folder>'],
        'make a dir',
        (yargs) => {},
        (argv) =>mkdir(argv)
    ).argv;

    //descargar objeto
    //descargar carpeta
    //mover objeto o carpeta

    // yargs.command('$0', 'the default command', () => {}, (argv) => {
    //     console.log('this command will be run by default')
    // }).argv
}

async function deleteObjs(args) {

    var paramsObj = {
        Bucket: bucket,
        Key: args.file
    };

    try {
        var objToDelete = await s3.getObject(paramsObj).promise();
        // console.log("getObject: ",obj);

        if(objToDelete.ContentType===typeFolder){

            var folderToDelete = args.file;

            let paramsFolderToDelete = {
              Bucket: bucket,
              Prefix: folderToDelete,
              Delimiter:delimiter,
              MaxKeys: maxKeys
            };

            var folderData = await s3.listObjects(paramsFolderToDelete).promise();
            var keysToDelete = [];
            var del = (folderData.CommonPrefixes.length>0) ? false:true;

            // console.log("folderData: ",folderData);
            if(del===false){
                return console.log("No se puede eliminar la carpeta y su contenido. posee carpetas anidadas");
            }

            folderData.Contents.forEach(e => {
                if (e.Size > 0) {
                    console.log("   " + getSizeString(e.Size) + " " + e.Key.replace(folderData.Prefix, " "));
                    keysToDelete.push( {Key: e.Key} );
                }
            });
            // console.log("keys to delete: ",keysToDelete);
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            })
            readline.question(`deseas borrar la carpeta y su contenido? (y/n): `, (confirm) => {

                readline.close();
                if (confirm === 'y' && keysToDelete.length>0) {
                    var paramsKeysToDelete = {
                        Bucket: bucket,
                        Delete: {
                            Objects: keysToDelete,
                            Quiet: false
                        }
                    };
                    s3.deleteObjects(paramsKeysToDelete, function(err, data) {
                        if (err) console.log(err, err.stack); // error
                        else {
                            console.log(data); // deleted
                            console.log("contenido Eliminado!"); // deleted
                            if(deleteFromS3(paramsObj)){
                                console.log("se ha borrado la carpeta: ",paramsObj.Key)
                            }
                        }
                    });
                }
                else{
                    if(deleteFromS3(paramsObj)){
                        console.log("se ha borrado la carpeta: ",paramsObj.Key)
                    }
                }
            });
        }
        else {
            // console.log(objToDelete);
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            })
            readline.question("deseas borrar el archivo '"+paramsObj.Key+"' ? (y/n): ", (confirm) => {
                readline.close();
                if (confirm === 'y') {
                    if(deleteFromS3(paramsObj)){
                        console.log("se ha borrado el archivo: ",paramsObj.Key)
                    }
                }
            });
        }
    }
    catch (e) {
        return console.log("El comando rm devuelto un ERROR: ",e);
    }
}

async function deleteFromS3(paramsToDelete){
    try {
        await s3.deleteObject(paramsToDelete).promise();
        return true;
    } catch (e) {
        console.log(e, e.stack); // error
        return false;
    }
}

function mkdir(args){

    if(args.folder === undefined){
        return console.warn("debe indicar un nombre para la carpeta");
    }
    folderInS3 = (args.folder.slice(-1)[0] !== delimiter) ? args.folder+delimiter : args.folder;

    var uploadParams = {Bucket: bucket, Key: folderInS3, ContentType: typeFolder, Body: ''};

    console.log("  creando carpeta: ",uploadParams);
    s3.upload (uploadParams, function (err, data) {
      if (err) {
        console.log("s3 mkdir Error: ", err);
      }
      if (data) {
        console.log("mkdir Success", data.key);
      }
    });
}

function upload(args){
    var folderInS3 = "";
    if(args.folderIns3 !== undefined){//con carpeta en argumentos
        folderInS3 = (args.folderIns3.slice(-1)[0] !== delimiter) ? args.folderIns3+delimiter : args.folderIns3;
    }

    if(fs.statSync(args.fileOrFolder).isFile()){
        uploadToS3(args.fileOrFolder, folderInS3);
    }
    else if(fs.statSync(args.fileOrFolder).isDirectory()){//case folder

        const folderUp = (args.fileOrFolder.slice(-1)[0] !== delimiter) ? args.fileOrFolder+delimiter : args.fileOrFolder;
        console.log("subida de carpeta:");
        console.log(folderUp);
        fs.readdir(folderUp, (err, files) => {

            if(err){// On error, show it and return
                return console.error(err);
            }
            files.forEach((file,i) => {
                if(fs.statSync(folderUp+delimiter+file).isFile()){

                    uploadToS3(folderUp+file,folderInS3);
                }
            });
        });
    }
    else {
        console.warn("el argumento para up no se reconoce como archivo o carpeta valido, verifica su existencia.");
    }
}

function uploadToS3(fileUp,folderInS3=""){

    var fileStream = fs.createReadStream(fileUp);
    fileStream.on('error', function(err) {
      return console.log('File Error:', err);
    });

    const mime = require('mime-types');
    let contentType = mime.lookup(fileUp);

    // call S3 to retrieve upload file to specified bucket
    var uploadParams = {Bucket: bucket, Key: '', Body: ''};//ContentType: contentType
    if(contentType!==false){
        uploadParams.ContentType = contentType;
    }
    uploadParams.Body = fileStream;

    const path = require('path');
    uploadParams.Key = folderInS3 + path.basename(fileUp);

    // call S3 to retrieve upload file to specified bucket
    console.log("  uploadToS3: ",uploadParams.Key,folderInS3);
    s3.upload(uploadParams, function(err, data) {
        if (err) {
            console.log("s3 upload Error: ", err);
        }
        if (data) {
            console.log("Upload Success", data.Key);
        }
    });
}

function list(args){
    // console.log(args);
    var folder = "";
    if(args.folder !== undefined){//con carpeta en argumentos
        folder = (args.folder.slice(-1)[0] !== delimiter) ? args.folder+delimiter : args.folder;
    }

    var params = {
      Bucket: bucket,
      Prefix: folder,
      Delimiter:delimiter,
      MaxKeys: maxKeys
    };
    s3.listObjects(params, listResultObjects);
}

function listResultObjects(err,data){
    if (err){
        console.error('Ha ocurrido un error:');
        console.error(err, err.stack); // an error occurred
    }
    else {
        // console.debug(data);
        //"CARPETAS"
        if(data.CommonPrefixes.length>0){
            console.log("-------------------------------------------------------");
            console.log(data.CommonPrefixes.length + " carpetas:");

            if (data.Prefix.length > 0){
                console.log(data.Prefix+":");
            }

            data.CommonPrefixes.forEach( e => {
                    console.log("    "+e.Prefix.replace(data.Prefix,""))
                }//console.log(element.Prefix)
            );
        }
        //"ARCHIVOS"
        if(data.Contents.length>0){
            console.log("-------------------------------------------------------");
            var nroArchivos =0;
            data.Contents.forEach(e => {if(e.Size>0){nroArchivos++;}});
            console.log(nroArchivos + " archivos:");
            console.log(data.Prefix+":");

            data.Contents.forEach(e => {
                if(e.Size>0){
                    //ajuste para imprimir tamaño objeto
                    console.log("   "+getSizeString(e.Size)+" "+e.Key.replace(data.Prefix," "))
                }
                // else{
                //     //cuando la carpeta listada posee carpetas dentro
                //     //la misma carpeta aparece como contenido del list
                //     //con Size = 0
                //     console.log("carpeta?:"+e.Key);
                // }
            });
        }
    }
}

//recibe Size en bytes y devuelve string legible
function getSizeString(Size){
    if(Size>1024*1024){
        var size = Size/(1024*1024);
        var ssize = size.toFixed(1)+'Mb';
    }
    else if (Size>1023){
        var size = Size/(1024);
        var ssize = size.toFixed(1)+'Kb';
    }
    else {
        var ssize = Size+' b  ';
    }
    return ssize;
}

main().catch(console.error);
