# nds3cli
simple cli for s3 bucket (testing)


## instalacion

git clone git@github.com:arcoslwm/nds3cli.git

npm install

crear .env



## comandos

listar contenido
```node . list {fotos/trip}```


crear carpetas
```node . mkdir ftest```
```node . mkdir ftest/deep```

subir archivo <fileOrFolder> [folderIns3]
node . up README.md ftest

subir todos los archivos de una carpeta
node . up ../nds3cli/ ftest/deep

borrar archivo
node . rm archivo.txt

borrar carpera y su contenido (pide confirmacion)
node . rm ftest/deep/
