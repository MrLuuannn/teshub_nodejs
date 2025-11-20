'use strict'

const jwt = require('jsonwebtoken');
const secretKey = process.env.SECRETKEY;

const autenticar = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(403).send({ message: 'Petición sin token de autorización' });
    }

    try {
        const token = req.headers.authorization.replace(/['"]+/g, '').split(' ')[1]; // Espera formato "Bearer token"
        const payload = jwt.verify(token, secretKey);
        req.usuario = payload;
        next();
    } catch (error) {
        return res.status(401).send({ message: 'Token inválido o expirado' });
    }
};

exports.verificarAdmin = function(req, res, next) {
    if (req.usuario.matricula !== '0') {
        return res.status(403).send({ mensaje: 'Solo el administrador puede realizar esta acción' });
    }
    next();
};


module.exports = autenticar;