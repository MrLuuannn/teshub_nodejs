// rutas/busquedaRutas.js
const express = require('express');
const router = express.Router();
const { busquedaGeneral } = require('../controladores/busquedaControlador');

router.get('/buscar', busquedaGeneral);

module.exports = router;