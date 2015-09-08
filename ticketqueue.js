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


var turnos = [];
var cajas = {};
function agregarTurno(turno) {
  if (turnos.indexOf(turno) == -1) {
    turnos.push(turno);    
  }
}
function ultimoTurnoRegistrado() {
  if (turnos.length == 0) {
    return 0;
  } else {
    return turnos[turnos.length - 1];
  }
}
function registrarCaja(caja) {
  if (!(caja in cajas)) {
    cajas[caja] = {
      atendidos: 0, 
      disponible: true, 
      turnoActual: -1
    };
  }
  return cajas[caja].atendidos;
}
function turnoActual(caja) {
  if (caja in cajas) {
    return cajas[caja].turnoActual;
  }
  return -1;
}
function asignarTurno(caja, turno) {
  if (caja in cajas) {
    cajas[caja].disponible = false;
    cajas[caja].turnoActual = turno;
    return true;
  }
  return false;
}
function turnoAtendido(caja) {
  if (caja in cajas) {
    cajas[caja].disponible = true;
    cajas[caja].turnoActual = -1;
    cajas[caja].atendidos += 1;
    return true;
  }
  return false;
}
function seleccionarCaja() {
  var seleccionada = "";
  var menor = -1;
  for (caja in cajas) {
    var info = cajas[caja];
    if (info.disponible) {
      if (menor = -1) {
        menor = info.atendidos;
        seleccionada = caja;
      } else if (info.atendidos < menor) {
        menor = info.atendidos;
        seleccionada = caja;
      }
    }
  }
  return seleccionada;
}
function obtenerTurno() {
  var turno = -1;
  if (turnos.length > 0) {
    turno = turnos.shift();
  }
  return turno;
}
function despachar(socket) {
  var caja = seleccionarCaja();
  if (caja == "") return;  
  turno = obtenerTurno();
  if (turno == -1) return;
  asignarTurno(caja, turno);
  var datos = {"caja": caja, "turno": turno};
  socket.broadcast.emit('turno asignado', JSON.stringify(datos));
  socket.broadcast.emit(caja, turno);
}

io.on('connection', function(socket) {
  socket.on('turno actual', function() {
    var turno = ultimoTurnoRegistrado();
    socket.emit('turno actual', turno);
  });
  socket.on('agregar turno', function(turno) {
    console.log('agregar turno '+turno);
    agregarTurno(turno);
    despachar(socket);        
  });
  socket.on('registrar caja', function(caja) {
    registrarCaja(caja);
    socket.emit(caja, turnoActual(caja));
    despachar(socket);
  });
  socket.on('turno atendido', function(caja) {
    turnoAtendido(caja);
    despachar(socket);
  });
  socket.on('turno actual', function(caja) {
    socket.emit(caja, turnoActual(caja));
  });
  socket.on('turno asignado', function(datos) {
    var o = JSON.parse(datos);
    console.log('turno '+o.turno+' asignado a caja: '+o.caja);
    socket.broadcast.emit('turno asignado',datos);
    socket.broadcast.emit(o.caja, o.turno);
  });
  socket.on('keep-alive', function(d) {
    socket.emit('keep-alive', null);
  });
});

http.listen(app.get('port'), function() {
  console.log(
    'Aplicacion iniciada en puerto: ' + app.get('port'));
});

