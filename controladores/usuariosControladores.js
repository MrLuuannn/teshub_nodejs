'use strict';

const jwt = require('../servicios/jwt');
require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../config/db'); // tu archivo de conexión
const fs = require('fs');
const path = require('path');

function validarContrasena(contrasena) {
    // Al menos una mayúscula, una minúscula, un número, un caracter especial y mínimo 4 caracteres
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{4,}$/;
    return regex.test(contrasena);
}

exports.registrarUsuario = async (req, res) => {
    const { nombre, apellido, correo, matricula, contrasena } = req.body;
    let imagen = req.file ? 'uploads/imagenes/' + req.file.filename : null;

    if (!nombre || !apellido || !correo || !matricula || !contrasena) {
        // Borra la imagen si se subió pero faltan campos
        if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
            fs.unlinkSync(path.join(__dirname, '..', imagen));
        }
        return res.status(400).json({ mensaje: 'Campos obligatorios faltantes' });
    }

    let rol = 2; // Asesor
    if (matricula.toString().length == 5) rol = 1; // Admin
    else if (matricula.toString().length >= 6) rol = 3; // Estudiante                

    if (!validarContrasena(contrasena)) {
        if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
            fs.unlinkSync(path.join(__dirname, '..', imagen));
        }
        return res.status(400).json({ mensaje: 'La contraseña debe tener al menos una mayúscula, una minúscula, un número, un caracter especial y mínimo 4 caracteres.' });
    }

    try {
        // Verifica si la matrícula o el correo ya existen
        const sqlCheck = `SELECT matricula, correo FROM usuario WHERE matricula = ? OR correo = ? LIMIT 1`;
        pool.query(sqlCheck, [matricula, correo], async (err, results) => {
            if (err) {
                if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
                    fs.unlinkSync(path.join(__dirname, '..', imagen));
                }
                return res.status(500).json({ mensaje: 'Error al verificar usuario', error: err });
            }

            if (results.length > 0) {
                if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
                    fs.unlinkSync(path.join(__dirname, '..', imagen));
                }
                const existente = results[0];
                if (existente.matricula == matricula && existente.correo == correo) {
                    return res.status(400).json({ mensaje: 'La matrícula y el correo ya están registrados.' });
                } else if (existente.matricula == matricula) {
                    return res.status(400).json({ mensaje: 'La matrícula ya está registrada.' });
                } else if (existente.correo == correo) {
                    return res.status(400).json({ mensaje: 'El correo ya está registrado.' });
                }
            }

            const hash = await bcrypt.hash(contrasena, 10);

            const sql = `INSERT INTO usuario (matricula, nombre, apellido, contrasena, correo, rol, imagen) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;

            pool.query(sql, [matricula, nombre, apellido, hash, correo, rol, imagen], (err, result) => {
                if (err) {
                    if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
                        fs.unlinkSync(path.join(__dirname, '..', imagen));
                    }
                    return res.status(500).json({ mensaje: 'Error al registrar', error: err });
                }
                res.status(200).json({ mensaje: 'Usuario registrado correctamente' });
            });
        });

    } catch (error) {
        if (imagen && fs.existsSync(path.join(__dirname, '..', imagen))) {
            fs.unlinkSync(path.join(__dirname, '..', imagen));
        }
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
};


exports.loginUsuario = (req, res) => {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
        return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios' });
    }

    const sql = 'SELECT * FROM usuario WHERE correo = ? and estado = 1';

    pool.query(sql, [correo], async(err, results) => {
        if (err) {
            console.error('Error en consulta:', err);
            return res.status(500).json({ mensaje: 'Error de servidor', err });
        }

        if (results.length === 0) {
            console.log('No se encontró usuario con ese correo:', correo);
            return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
        }

        const usuario = results[0];

        console.log('Usuario encontrado:', usuario);

        const coincide = await bcrypt.compare(contrasena, usuario.contrasena);
        console.log('Contraseña coincide:', coincide);

        if (!coincide) {
            return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
        }

        const token = jwt.crearToken(usuario);
        let rolNombre = '';
        switch (usuario.rol) {
            case 1:
                rolNombre = 'Administrador';
                break;
            case 2:
                rolNombre = 'Asesor';
                break;
            case 3:
                rolNombre = 'Estudiante';
                break;
            default:
                rolNombre = 'Ora, que haces aqui?';
        }
        res.status(200).json({ token, matricula: usuario.matricula, nombre: usuario.nombre, apellido: usuario.apellido, correo: usuario.correo, rol: rolNombre });
    });
};


const nodemailer = require('nodemailer'); // npm install nodemailer
// Puedes usar una tabla 'codigos_verificacion' o un objeto en memoria para pruebas
let codigos = {}; // { correo: { codigo, expires } }

// Solicitar código
exports.solicitarCodigoActualizacion = async(req, res) => {
    const matricula = req.usuario.matricula;

    // Busca el usuario por matrícula
    pool.query('SELECT correo FROM usuario WHERE matricula = ? AND estado = 1', [matricula], async(err, results) => {
        if (err) return res.status(500).json({ mensaje: 'Error de servidor', err });
        if (results.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

        const correo = results[0].correo;
        // Genera código y guarda con expiración (5 min)
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        codigos[matricula] = { codigo, expires: Date.now() + 60 * 60 * 1000 };

        // Envía el código por correo
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.CORREO_APP,
                pass: process.env.PASS_CORREO_APP
            }
        });

        await transporter.sendMail({
            from: process.env.CORREO_APP,
            to: correo,
            subject: 'Código de verificación',
            text: `Tu código de verificación es: ${codigo}`
        });

        res.json({ mensaje: 'Código enviado al correo' });
    });
};


exports.actualizarUsuario = async(req, res) => {
    const matricula = req.usuario.matricula;
    const { nombre, apellido, correo, contrasena } = req.body;

    // Verifica código
    // const registro = codigos[matricula];
    // if (!registro || registro.codigo !== codigo || Date.now() > registro.expires) {
    //     return res.status(400).json({ mensaje: 'Código inválido o expirado' });
    // }

    let campos = [];
    let valores = [];

    if (nombre && nombre.trim() !== "") {
        campos.push('nombre = ?');
        valores.push(nombre.trim());
    }
    if (apellido && apellido.trim() !== "") {
        campos.push('apellido = ?');
        valores.push(apellido.trim());
    }
    if (correo && correo.trim() !== "") {
        campos.push('correo = ?');
        valores.push(correo.trim());
    }
    if (contrasena && contrasena.trim() !== "") {
        if (!validarContrasena(contrasena)) {
            return res.status(400).json({ mensaje: 'La contraseña debe tener al menos una mayúscula, una minúscula, un número, un caracter especial y mínimo 4 caracteres.' });
        }
        const hash = await bcrypt.hash(contrasena, 10);
        campos.push('contrasena = ?');
        valores.push(hash);
    }

    // Si hay nueva imagen, elimina la anterior
    if (req.file) {
        // 1. Busca la imagen anterior
        pool.query('SELECT imagen FROM usuario WHERE matricula = ?', [matricula], (err, results) => {
            if (err) return res.status(500).json({ mensaje: 'Error al buscar imagen anterior', err });

            let imagenAnterior = null;
            if (results[0] && results[0].imagen) {
                imagenAnterior = results[0].imagen;
            }
            if (imagenAnterior) {
                const rutaImagen = path.join(__dirname, '..', imagenAnterior);
                // 2. Elimina el archivo si existe
                fs.unlink(rutaImagen, (err) => {
                    // Si hay error al borrar, solo lo loguea, no detiene el flujo
                    if (err && err.code !== 'ENOENT') console.error('Error al borrar imagen anterior:', err);
                });
            }

            // 3. Agrega la nueva imagen al update
            campos.push('imagen = ?');
            valores.push('uploads/imagenes/' + req.file.filename);

            if (campos.length === 0) {
                return res.status(400).json({ mensaje: 'Nada para actualizar' });
            }

            valores.push(matricula);

            const sql = `UPDATE usuario SET ${campos.join(', ')} WHERE matricula = ? AND estado = 1`;
            pool.query(sql, valores, (err, result) => {
                if (err) return res.status(500).json({ mensaje: 'Error al actualizar', err });
                delete codigos[matricula];
                res.json({ mensaje: 'Usuario actualizado correctamente' });
            });
        });
    } else {
        // Si no hay imagen, sigue el flujo normal
        if (campos.length === 0) {
            return res.status(400).json({ mensaje: 'Nada para actualizar' });
        }
        valores.push(matricula);

        const sql = `UPDATE usuario SET ${campos.join(', ')} WHERE matricula = ? AND estado = 1`;
        pool.query(sql, valores, (err, result) => {
        if (err) {
            console.error('Error al actualizar:', err);
            return res.status(500).json({ mensaje: 'Error al actualizar', err });
        }
        delete codigos[matricula];
        res.json({ mensaje: 'Usuario actualizado correctamente' });
        });
    }
};


exports.eliminarCuenta = async(req, res) => {
    const matriculaSolicitante = req.usuario.matricula;
    const rolSolicitante = req.usuario.rol; // Asegúrate de que el rol esté en el token
    const { matricula } = req.body; // Solo el admin puede enviar la matrícula de otro usuario

    // Si es admin, puede eliminar cualquier usuario
    // Si no es admin, solo puede eliminar su propia cuenta
    let matriculaAEliminar;
    if (rolSolicitante === 1) { // 1 = Admin
        if (!matricula) {
            return res.status(400).json({ mensaje: 'Debes especificar la matrícula a eliminar' });
        }
        matriculaAEliminar = matricula;
    } else {
        matriculaAEliminar = matriculaSolicitante;
    }

    // Cambia el estado a 0 (desactivado)
    const sql = 'UPDATE usuario SET estado = 0 WHERE matricula = ? AND estado = 1';
    pool.query(sql, [matriculaAEliminar], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al desactivar cuenta', err });
        if (result.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado o ya desactivado' });
        }
        res.json({ mensaje: 'Cuenta desactivada correctamente' });
    });
};

exports.codigoContrasena = (req, res) => {
    const {correo } = req.body;
    if (!correo) {
        return res.status(400).json({ mensaje: 'El correo es obligatorio' });
    }
    // Verifica si el correo existe en la base de datos
    pool.query('SELECT correo FROM usuario WHERE correo = ? AND estado = 1', [correo], (err, results) => {
        if (err) {
            return res.status(500).json({ mensaje: 'Error de servidor', err });
        }
        if (results.length === 0) {
            return res.status(404).json({ mensaje: 'Correo no encontrado' });
        }

        // Genera un código de verificación
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        codigos[correo] = { codigo, expires: Date.now() + 60 * 60 * 1000 }; // Expira en 1 hora

        // Envía el código por correo
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.CORREO_APP,
                pass: process.env.PASS_CORREO_APP
            }
        });

        transporter.sendMail({
            from: process.env.CORREO_APP,
            to: correo,
            subject: 'Código de verificación',
            text: `Tu código de verificación es: ${codigo}`
        }, (error, info) => {
            if (error) {
                return res.status(500).json({ mensaje: 'Error al enviar el correo', error });
            }
            res.json({ mensaje: 'Código enviado al correo' });
        });
    });
};

exports.actualizarContrasena = async (req, res) => {
    const { correo, codigo, nuevaContrasena } = req.body;

    if (!correo || !codigo || !nuevaContrasena) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios' });
    }

    // Verifica el código
    const registro = codigos[correo];
    if (!registro || registro.codigo !== codigo || Date.now() > registro.expires) {
        return res.status(400).json({ mensaje: 'Código inválido o expirado' });
    }

    if (!validarContrasena(nuevaContrasena)) {
        return res.status(400).json({ mensaje: 'La contraseña debe tener al menos una mayúscula, una minúscula, un número, un caracter especial y mínimo 4 caracteres.' });
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10);

    // Actualiza la contraseña en la base de datos
    pool.query('UPDATE usuario SET contrasena = ? WHERE correo = ? AND estado = 1', [hash, correo], (err, result) => {
        if (err) {
            return res.status(500).json({ mensaje: 'Error al actualizar la contraseña', err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado o ya desactivado' });
        }
        delete codigos[correo]; // Elimina el código usado
        res.json({ mensaje: 'Contraseña actualizada correctamente' });
    });
};

exports.obtenerUsuario = (req, res) => {
    const matricula = req.usuario.matricula;

    pool.query(
        'SELECT matricula, nombre, apellido, correo, rol, imagen FROM usuario WHERE matricula = ? AND estado = 1',
        [matricula],
        (err, results) => {
            if (err) {
                return res.status(500).json({ mensaje: 'Error de servidor', err });
            }
            if (results.length === 0) {
                return res.status(404).json({ mensaje: 'Usuario no encontrado' });
            }
            const usuario = results[0];
            let rolNombre = '';
            switch (usuario.rol) {
                case 1:
                    rolNombre = 'Administrador';
                    break;
                case 2:
                    rolNombre = 'Asesor';
                    break;
                case 3:
                    rolNombre = 'Estudiante';
                    break;
                default:
                    rolNombre = 'Ora, que haces aqui?';
            }

            // Consulta para total de publicaciones
            const sqlTotal = 'SELECT COUNT(*) AS total FROM integrantes WHERE matricula = ?';
            pool.query(sqlTotal, [matricula], (err2, totalRes) => {
                if (err2) {
                    return res.status(500).json({ mensaje: 'Error al contar publicaciones', err: err2 });
                }
                const total_publicaciones = totalRes[0]?.total || 0;

                // Consulta para publicación destacada
                const sqlDestacada = `
                    SELECT p.nombre, AVG(e.evaluacion) as promedio
                    FROM integrantes i
                    JOIN publicacion p ON i.id_publi = p.id_publi
                    LEFT JOIN evaluacion e ON p.id_publi = e.id_publi
                    WHERE i.matricula = ?
                    GROUP BY p.id_publi
                    ORDER BY promedio DESC
                    LIMIT 1
                `;
                pool.query(sqlDestacada, [matricula], (err3, destRes) => {
                    if (err3) {
                        return res.status(500).json({ mensaje: 'Error al buscar publicación destacada', err: err3 });
                    }
                    const publicacion_destacada = destRes.length > 0 ? destRes[0].nombre : null;

                    res.json({
                        ...usuario,
                        rol: rolNombre,
                        total_publicaciones,
                        publicacion_destacada
                    });
                });
            });
        }
    );
}

function tiempoTranscurrido(fecha) {
    const ahora = new Date();
    const fechaPub = new Date(fecha);
    const diffMs = ahora - fechaPub;
    const diffSeg = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSeg / 60);
    const diffHoras = Math.floor(diffMin / 60);
    const diffDias = Math.floor(diffHoras / 24);

    if (diffDias > 0) return `hace ${diffDias} día${diffDias > 1 ? 's' : ''}`;
    if (diffHoras > 0) return `hace ${diffHoras} hora${diffHoras > 1 ? 's' : ''}`;
    if (diffMin > 0) return `hace ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
    return `hace ${diffSeg} segundo${diffSeg !== 1 ? 's' : ''}`;
}

exports.obtenerUsuarioConPublicaciones = (req, res) => {
    const matricula = req.body?.matricula || req.usuario?.matricula;
    if (!matricula) {
        return res.status(400).json({ mensaje: 'Matrícula no proporcionada o usuario no autenticado' });
    }
    const sql = `
        SELECT u.matricula, u.imagen, u.nombre, u.apellido, u.rol, p.id_publi, p.nombre AS proyecto_nombre, p.fecha
        FROM usuario u
        LEFT JOIN integrantes pi ON u.matricula = pi.matricula
        LEFT JOIN publicacion p ON pi.id_publi = p.id_publi
        WHERE u.matricula = ? 
    `;
    pool.query(sql, [matricula], (err, results) => {
        if (err) {
            return res.status(500).json({ mensaje: 'Error de servidor', err });
        }
        if (results.length === 0) {
        // Buscar solo el usuario
        pool.query(
            'SELECT matricula, imagen, nombre, apellido, rol FROM usuario WHERE matricula = ?',
            [matricula],
            (err2, userResults) => {
                if (err2) {
                    return res.status(500).json({ mensaje: 'Error de servidor', err: err2 });
                }
                if (userResults.length === 0) {
                    return res.status(404).json({ mensaje: 'Usuario no encontrado' });
                }
                const usuario = {
                    matricula: userResults[0].matricula,
                    imagen: userResults[0].imagen,
                    nombre: userResults[0].nombre,
                    apellido: userResults[0].apellido,
                    rol: userResults[0].rol,
                    estado: userResults[0].estado,
                    total_publicaciones: 0,
                    publicaciones: []
                };
                let rolNombre = '';
                switch (usuario.rol) {
                    case 1:
                        rolNombre = 'Administrador';
                        break;
                    case 2:
                        rolNombre = 'Asesor';
                        break;
                    case 3:
                        rolNombre = 'Estudiante';
                        break;
                    default:
                        rolNombre = 'Ora, que haces aqui?';
                }
                if (usuario.estado === 0) {
                    rolNombre += ' (perfil desactivado)';
                }
                usuario.rol = rolNombre;
                return res.json(usuario);
            }
        );
        return;
    }

        // Filtra publicaciones válidas (puede haber null si no tiene publicaciones)
        const publicaciones = results
            .filter(row => row.id_publi)
            .map(row => ({
                id_publi: row.id_publi,
                proyecto_nombre: row.proyecto_nombre,
                hace_cuanto: row.fecha ? tiempoTranscurrido(row.fecha) : null
            }));

        const usuario = {
            matricula: results[0].matricula,
            imagen: results[0].imagen,
            nombre: results[0].nombre,
            apellido: results[0].apellido,
            rol: results[0].rol,
            total_publicaciones: publicaciones.length,
            publicaciones
        };

        let rolNombre = '';
        switch (usuario.rol) {
            case 1:
                rolNombre = 'Administrador';
                break;
            case 2:
                rolNombre = 'Asesor';
                break;
            case 3:
                rolNombre = 'Estudiante';
                break;
            default:
                rolNombre = 'Ora, que haces aqui?';
        }

        usuario.rol = rolNombre;

        res.json(usuario);
    });
};
    