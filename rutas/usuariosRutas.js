const express = require('express');
const router = express.Router();
const usuariosControlador = require('../controladores/usuariosControladores');
const upload = require('../middlewares/uploadImagen');
const autenticar = require('../middlewares/auth');

// Registrar usuario
router.post('/registrar', upload.single('imagen'), usuariosControlador.registrarUsuario);
// Login
router.post('/login', usuariosControlador.loginUsuario);
//Solicitar codigo de actualización
router.post('/solicitar-codigo', autenticar, usuariosControlador.solicitarCodigoActualizacion);
//codigo de contraseña
router.post('/codigo-contrasena', usuariosControlador.codigoContrasena);
// Actualizar contraseña
router.put('/actualizar-contrasena', usuariosControlador.actualizarContrasena);
// Actualizar usuario
router.put('/actualizar', autenticar, upload.single('imagen'), usuariosControlador.actualizarUsuario);
//Eliminar usuario
router.post('/eliminar', autenticar, usuariosControlador.eliminarCuenta);
// Ver usuario
router.get('/ver-info', autenticar, usuariosControlador.obtenerUsuario);
//Ver info y publicaciones de un usuario
router.post('/ver-info-publicaciones', autenticar, usuariosControlador.obtenerUsuarioConPublicaciones);

module.exports = router;