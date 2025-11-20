'use strict';

const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const usuariosRutas = require('./rutas/usuariosRutas');
const publicacionesRutas = require('./rutas/publicacionesRutas');
const cors = require('cors');
const busquedaRutas = require('./rutas/busquedaRutas');
app.use(cors());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Prefijo de rutas
app.use('/api/usuarios', usuariosRutas);
app.use('/api/publicaciones', publicacionesRutas);

app.use('/api', busquedaRutas);

app.use((req, res) => {
    res.status(404).json({ mensaje: 'Ruta no encontrada, aprende a escrbir prro Atte: Uriel Barrera :)' });
});

module.exports = app;