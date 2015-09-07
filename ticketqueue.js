var fs = require('fs');
var path = require('path');
var express = require('express');


var handlebars = require('express-handlebars').create(
  { defaultLayout: 'main' } 
);


var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http, { pingTimeout: 60000*3} );
io.set('heartbeat timeout', 60000*3);


app.set('port', process.env.PORT || 8080);
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');


app.get('/monitor', function(req, res) {
  fs.readdir(__dirname + '/public/video', function(err, files) {
    listado = [];
    files.forEach(function(f){
      var t = (path.extname(f) == '.ogv')? 
        'ogg':path.extname(f).replace('.','');
      listado.push( { file: f, type: t } );
    });
    res.render('monitor', { video : listado });
  });
});
app.get('/ticket', function(req, res) {
  res.render('ticket');
});
app.get('/asignador', function(req, res) {
  res.render('asignador');
});
app.get('/caja', function(req, res) {
  res.render('caja');
});
app.use(express.static(__dirname + '/public'));
app.use(function(req, res) {
  res.status(404);
  res.render('404')
});
app.use(function(err, req, res, next) {
  console.log(err.stack);
  res.status(500);
  res.render('500')
});


function agregarTurno(t) {
} 


io.on('connection', function(socket) {
  console.log('a user connected');
  socket.on('disconnect', function() {
    console.log('user disconnected');
  });
  socket.on('agregar turno', function(turno) {
    console.log('agregar turno '+turno);
    agregarTurno(turno);
  });
  socket.on('turno asignado', function(datos) {
    var o = JSON.parse(datos);
    console.log('turno '+o.turno+' asignado a caja: '+o.caja);
    socket.broadcast.emit('turno asignado',datos);
    socket.broadcast.emit('caja '+o.caja, o.turno);
  });
  socket.on('keep-alive', function(d) {
    socket.emit('keep-alive', null);
  });
});

http.listen(app.get('port'), function() {
  console.log(
    'Aplicacion iniciada en puerto: ' + app.get('port'));
});

