const jwt = require('jsonwebtoken');
require('dotenv').config();

const secretKey = process.env.SECRETKEY;

exports.crearToken = (usuario) => {
    const payload = {
        matricula: usuario.matricula,
        nombre: usuario.nombre,
        rol: usuario.rol
    };
    return jwt.sign(payload, secretKey, { expiresIn: process.env.EXPIRESINJWT });
};