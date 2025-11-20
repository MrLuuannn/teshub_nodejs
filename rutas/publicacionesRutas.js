const express = require('express');
const router = express.Router();
const publicacionesControlador = require('../controladores/publicacionesControlador');
const upload = require('../middlewares/uploadFiles');
const autenticar = require('../middlewares/auth');

router.post('/crear', autenticar, upload.array('archivos', 10), publicacionesControlador.registrarPublicacion);
router.get('/ver/:id_publi', autenticar, publicacionesControlador.verPublicacion);
router.put('/actualizar/:id_publi', autenticar, upload.array('archivos', 10), publicacionesControlador.actualizarPublicacion);
router.delete('/eliminar/:id_publi', autenticar, publicacionesControlador.eliminarPublicacion);
router.get('/listar', autenticar, publicacionesControlador.listarPublicaciones);
router.post('/calificar', autenticar, publicacionesControlador.calificarPublicacion);
router.post('/comentar', autenticar, publicacionesControlador.comentarPublicacion);
router.post('/eliminar-comentario', autenticar, publicacionesControlador.eliminarComentario);

module.exports = router;