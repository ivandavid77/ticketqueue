var fs = require('fs');
var path = require('path');
var express = require('express');
var uuid = require('node-uuid');

var handlebars = require('express-handlebars').create(
  { defaultLayout: 'main' } 
);


var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http,{log:false});


app.set('port', process.env.PORT || 8080);
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');


app.get('/monitor', function(req, res) {
  fs.readdir(__dirname + '/public/video', function(err, files) {
    listado = [];
    files.forEach(function(f){
      listado.push( { file: f } );
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
var intervalos = {};
var CAJAS_FILENAME = __dirname + '/cajas.json';
var TURNOS_FILENAME = __dirname + '/turnos.json';
function almacenarDatos(objeto, archivo) {
  fs.writeFile(archivo, JSON.stringify(objeto), function(err) {
    if (err) {
      console.log('Error al guardar el archivo: ', archivo,
        ', error: ', err);
    }
  });
}
function almacenarCajas() {
  almacenarDatos(cajas, CAJAS_FILENAME);
}
function almacenarTurnos() {
  console.log(JSON.stringify(turnos)+'\n');
  almacenarDatos(turnos, TURNOS_FILENAME);
}
function agregarTurno(turno) {
  for (var i = 0; i < turnos.length; i++) {
    if (turnos[i].turno == turno)
      return;
  }
  turnos.push({"turno": turno});
  almacenarTurnos();
}
function ultimoTurnoRegistrado() {
  if (turnos.length == 0) {
    return 0;
  } else {
    return turnos[turnos.length - 1].turno;
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
  almacenarCajas();
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
    almacenarCajas();
    return true;
  }
  return false;
}
function turnoAtendido(caja) {
  if (caja in cajas) {
    cajas[caja].disponible = true;
    cajas[caja].turnoActual = -1;
    cajas[caja].atendidos += 1;
    almacenarCajas();
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
      if (menor === -1) {
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
    turno = turnos.shift().turno;
  }
  almacenarTurnos();
  return turno;
}
function despachar() {
  var caja = seleccionarCaja();
  if (caja == "") return null;
  turno = obtenerTurno();
  if (turno == -1) return null;
  asignarTurno(caja, turno);
  return {"caja": caja, "turno": turno};
}
function difundir(io, asignacion) {
  if (asignacion == null) return;
  asignacion.id = uuid.v1();
  var intervalo = setInterval(function() {
    io.sockets.emit('turno_asignado', JSON.stringify(asignacion));
  },5000);
  intervalos[asignacion.id] = intervalo;
  io.sockets.emit('turno_asignado', JSON.stringify(asignacion));
  io.sockets.emit(asignacion.caja, asignacion.turno);
}


io.sockets.on('connection', function(socket) {
  console.log('conectado');
  socket.on('disconnect', function() {
    console.log('desconectado');
  });
  socket.on('ultimo_turno_registrado', function() {
    socket.emit('ultimo_turno_registrado', ultimoTurnoRegistrado());
  });
  socket.on('agregar_turno', function(turno) {
    agregarTurno(turno);
    difundir(io, despachar());
  });
  socket.on('registrar_caja', function(caja) {
    registrarCaja(caja);
    socket.emit(caja, turnoActual(caja));
    difundir(io, despachar());
  });
  socket.on('comida', function(caja) {
    if (caja in cajas) {
      cajas[caja].disponible = false;
      cajas[caja].turnoActual = 0;
      socket.broadcast.emit(caja, 0);
      almacenarCajas();
    }
  });
  socket.on('turno_atendido', function(caja) {
    turnoAtendido(caja);
    difundir(io, despachar());
  });
  socket.on('turno_actual', function(caja) {
    socket.emit(caja, turnoActual(caja));
  });
  socket.on('monitor_confirma_recepcion', function(id) {
    if (id in intervalos) {
      clearInterval(intervalos[id]);
    }
  });
  socket.on('asignacion_manual', function(asignacion) {
    difundir(io, JSON.parse(asignacion));
  });
  socket.on('videos_actualizados', function() {
    socket.broadcast.emit('videos_actualizados');
  });
  socket.on('refrescar_monitor', function() {
    socket.broadcast.emit('refrescar_monitor');
  });
  socket.on('obtener_turnos', function() {
    socket.emit('turnos', JSON.stringify(turnos));
  });
});

// Verificar si hay datos por cargar
var cargarCacheCajas = function(callback) {
  fs.readFile(CAJAS_FILENAME, function(err, data) {
    if (err) {
      console.log('No se pudieron cargar los datos del archivo: ',
        CAJAS_FILENAME, ', error: ', err);
      cajas = {};
    } else {
      try {
        cajas = JSON.parse(data);
      } catch (err) {
        cajas = {};
      }
    }
    callback();
  });
};
var cargarCacheTurnos = function(callback) {
  fs.readFile(TURNOS_FILENAME, function(err, data) {
    if (err) {
      console.log('No se pudieron cargar los datos del archivo: ',
        TURNOS_FILENAME, ', error: ', err);
      turnos = [];
    } else {
      try {
        turnos = JSON.parse(data);
      } catch (err) {
        turnos = [];
      }
    }
    callback();
  });
};
var iniciarAplicacion = function () {
  http.listen(app.get('port'), function() {
    console.log(
      'Aplicacion iniciada en puerto: ' + app.get('port'));
    console.log('Cajas: ', cajas);
    console.log('Turnos: ', turnos);
    setTimeout(function() {
        io.sockets.emit("ultimo_turno_registrado",ultimoTurnoRegistrado());
    },10000);
  });
};

cargarCacheCajas(function() {
  cargarCacheTurnos( iniciarAplicacion );
});
