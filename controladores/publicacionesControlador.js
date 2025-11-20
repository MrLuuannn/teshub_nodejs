'use strict';

const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

async function registrarPublicacion(req, res) {
    const publicacionesFolder = path.join(__dirname, '..', 'uploads', 'publicaciones');
    if (!fs.existsSync(publicacionesFolder)) {
        fs.mkdirSync(publicacionesFolder, { recursive: true });
    }

    const { titulo, colaboradores, descripcion } = req.body;
    let archivos = req.files ? req.files.map(file => 'uploads/publicaciones/' + file.filename) : [];

    if (!titulo || !descripcion) {
        return res.status(400).json({ mensaje: 'Campos obligatorios faltantes' });
    }

    // Siempre convierte colaboradores a array de strings, aunque venga como string o array
    let colaboradoresArray = [];
    if (Array.isArray(colaboradores)) {
        colaboradoresArray = colaboradores.flatMap(c =>
            c.toString().split(',').map(x => x.trim()).filter(Boolean)
        );
    } else if (typeof colaboradores === 'string' || typeof colaboradores === 'number') {
        colaboradoresArray = colaboradores.toString().split(',').map(c => c.trim()).filter(Boolean);
    }

    // Verifica si todos los colaboradores existen
    if (colaboradoresArray.length > 0) {
        const sqlCheck = `SELECT matricula FROM usuario WHERE matricula IN (?)`;
        pool.query(sqlCheck, [colaboradoresArray], (err, results) => {
            if (err) return res.status(500).json({ mensaje: 'Error al verificar colaboradores', error: err });

            const existentes = results.map(r => r.matricula.toString());
            const noExistentes = colaboradoresArray.filter(m => !existentes.includes(m));

            if (noExistentes.length > 0) {
                return res.status(400).json({ mensaje: `Los siguientes colaboradores no existen: ${noExistentes.join(', ')}` });
            }

            // Si todos existen, continúa con el registro de la publicación
            insertarPublicacion();
        });
    } else {
        // Si no hay colaboradores, solo registra la publicación
        insertarPublicacion();
    }

    function insertarPublicacion() {
        const sql = `INSERT INTO publicacion (nombre, descripcion, fecha) VALUES (?, ?, CURDATE())`;
        pool.query(sql, [titulo, descripcion], (err, result) => {
            if (err) return res.status(500).json({ mensaje: 'Error al registrar la publicación', error: err });

            const id_publi = result.insertId;

            // Función para insertar integrantes y responder
            const insertarIntegrantesYResponder = () => {
                if (colaboradoresArray.length > 0) {
                    const values = colaboradoresArray.map(matricula => [matricula, id_publi]);
                    const sqlIntegrantes = `INSERT IGNORE INTO integrantes (matricula, id_publi) VALUES ?`;
                    pool.query(sqlIntegrantes, [values], (err2) => {
                        if (err2) return res.status(500).json({ mensaje: 'Error al agregar integrantes', error: err2 });
                        res.status(200).json({ mensaje: 'Publicación registrada correctamente', id_publi });
                    });
                } else {
                    res.status(200).json({ mensaje: 'Publicación registrada correctamente (sin colaboradores)', id_publi });
                }
            };

            // Inserta los archivos en la tabla archivos y luego los integrantes
            if (archivos.length > 0) {
                const archivosValues = archivos.map(ruta => [id_publi, ruta]);
                const sqlArchivos = `INSERT INTO archivos (id_publi, ruta) VALUES ?`;
                pool.query(sqlArchivos, [archivosValues], (errArchivos) => {
                    if (errArchivos) return res.status(500).json({ mensaje: 'Error al guardar archivos', error: errArchivos });
                    insertarIntegrantesYResponder();
                });
            } else {
                insertarIntegrantesYResponder();
            }
        });
    }
}

async function verPublicacion(req, res) {
    const { id_publi } = req.params;

    if (!id_publi) {
        return res.status(400).json({ mensaje: 'ID de publicación requerido' });
    }

    try {
        // Consulta la publicación y sus archivos
        const sql = `
            SELECT p.id_publi, p.nombre, p.descripcion, p.fecha, a.ruta AS archivo
            FROM publicacion p
            LEFT JOIN archivos a ON p.id_publi = a.id_publi
            WHERE p.id_publi = ?
        `;
        pool.query(sql, [id_publi], (err, results) => {
            if (err) return res.status(500).json({ mensaje: 'Error al obtener la publicación', error: err });

            if (results.length === 0) {
                return res.status(404).json({ mensaje: 'Publicación no encontrada' });
            }

            // Consulta los nombres de los integrantes
            const sqlIntegrantes = `
                SELECT u.nombre, u.apellido
                FROM integrantes i
                JOIN usuario u ON i.matricula = u.matricula
                WHERE i.id_publi = ?
            `;
            pool.query(sqlIntegrantes, [id_publi], (err2, integrantes) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al obtener integrantes', error: err2 });

                // Consulta los comentarios
                const sqlComentarios = `
                    SELECT c.comentario, u.nombre, c.matricula
                    FROM comentario c
                    JOIN usuario u ON c.matricula = u.matricula
                    WHERE c.id_publi = ?
                `;
                pool.query(sqlComentarios, [id_publi], (err3, comentarios) => {
                    if (err3) return res.status(500).json({ mensaje: 'Error al obtener comentarios', error: err3 });

                    // Calificación promedio
                    const sqlEval = 'SELECT AVG(evaluacion) as promedio, COUNT(*) as total FROM evaluacion WHERE id_publi = ?';
                    console.log(sqlEval);
                    pool.query(sqlEval, [id_publi], (err4, evalResult) => {
                        if (err4) return res.status(500).json({ mensaje: 'Error al obtener evaluación', error: err4 });

                        res.status(200).json({
                            publicacion: {
                                id_publi: results[0].id_publi,
                                nombre: results[0].nombre,
                                descripcion: results[0].descripcion,
                                fecha: results[0].fecha,
                                archivos: results.map(r => r.archivo).filter(Boolean),
                                integrantes: integrantes.map(i => i.nombre + ' ' + i.apellido),
                                comentarios: comentarios || [],
                                calificacion_promedio: evalResult[0].promedio ? Number(evalResult[0].promedio).toFixed(2) : 0,
                                total_calificaciones: evalResult[0].total
                            }
                        });
                    });
                });
            });
        });

    } catch (error) {
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
}

async function eliminarPublicacion(req, res) {
    const matriculaSolicitante = req.usuario.matricula;
    const { id_publi } = req.params;

    if (!id_publi) {
        return res.status(400).json({ mensaje: 'ID de publicación requerido' });
    }

    try {
        // 1. Verifica si la publicación existe
        const sqlCheck = `SELECT 1 FROM publicacion WHERE id_publi = ?`;
        pool.query(sqlCheck, [id_publi], (err, results) => {
            if (err) return res.status(500).json({ mensaje: 'Error al verificar publicación', error: err });
            if (results.length === 0) {
                return res.status(404).json({ mensaje: 'Publicación no encontrada' });
            }

            // 2. Busca integrantes de la publicación
            const sqlIntegrantes = `SELECT matricula FROM integrantes WHERE id_publi = ?`;
            pool.query(sqlIntegrantes, [id_publi], (err, integrantes) => {
                if (err) return res.status(500).json({ mensaje: 'Error al obtener integrantes', error: err });
                const esIntegrante = integrantes.some(i => i.matricula.toString() === matriculaSolicitante.toString());
                if (!esIntegrante && req.usuario.rol !== 1) {
                    return res.status(403).json({ mensaje: 'No tienes permiso para actualizar esta publicación' });
                }

                // 3. Elimina los archivos físicos y registros
                const sqlArchivos = `SELECT ruta FROM archivos WHERE id_publi = ?`;
                pool.query(sqlArchivos, [id_publi], (err, archivos) => {
                    if (err) return res.status(500).json({ mensaje: 'Error al obtener archivos', error: err });

                    archivos.forEach(archivo => {
                        const filePath = path.join(__dirname, '..', archivo.ruta);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    });

                    const sqlDeleteArchivos = `DELETE FROM archivos WHERE id_publi = ?`;
                    pool.query(sqlDeleteArchivos, [id_publi], (err2) => {
                        if (err2) return res.status(500).json({ mensaje: 'Error al eliminar archivos de la base de datos', error: err2 });

                        // 4. Elimina integrantes
                        const sqlIntegrantesDelete = `DELETE FROM integrantes WHERE id_publi = ?`;
                        pool.query(sqlIntegrantesDelete, [id_publi], (errIntegrantes) => {
                            if (errIntegrantes) return res.status(500).json({ mensaje: 'Error al eliminar integrantes', error: errIntegrantes });

                            // 5. Elimina comentarios
                            const sqlComentarios = `DELETE FROM comentario WHERE id_publi = ?`;
                            pool.query(sqlComentarios, [id_publi], (err) => {
                                if (err) return res.status(500).json({ mensaje: 'Error al eliminar comentarios', error: err });

                                // 6. Elimina evaluaciones
                                const sqlEvaluaciones = `DELETE FROM evaluacion WHERE id_publi = ?`;
                                pool.query(sqlEvaluaciones, [id_publi], (err2) => {
                                    if (err2) return res.status(500).json({ mensaje: 'Error al eliminar evaluaciones', error: err2 });

                                    // 7. Finalmente elimina la publicación
                                    const sqlDelete = `DELETE FROM publicacion WHERE id_publi = ?`;
                                    pool.query(sqlDelete, [id_publi], (err3) => {
                                        if (err3) return res.status(500).json({ mensaje: 'Error al eliminar la publicación', error: err3 });
                                        res.status(200).json({ mensaje: 'Publicación eliminada correctamente' });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
}

async function actualizarPublicacion(req, res) {
    const matriculaSolicitante = req.usuario.matricula;
    const { id_publi } = req.params;
    const { titulo, colaboradores, descripcion } = req.body;
    let archivos = req.files ? req.files.map(file => 'uploads/publicaciones/' + file.filename) : [];

    if (!id_publi || !titulo || !descripcion) {
        return res.status(400).json({ mensaje: 'Campos obligatorios faltantes' });
    }

    // Siempre convierte colaboradores a array de strings, aunque venga como string o array
    let colaboradoresArray = [];
    if (Array.isArray(colaboradores)) {
        colaboradoresArray = colaboradores.flatMap(c =>
            c.toString().split(',').map(x => x.trim()).filter(Boolean)
        );
    } else if (typeof colaboradores === 'string' || typeof colaboradores === 'number') {
        colaboradoresArray = colaboradores.toString().split(',').map(c => c.trim()).filter(Boolean);
    }

    try {
        // 1. Verifica si la publicación existe
        const sqlCheckPubli = `SELECT 1 FROM publicacion WHERE id_publi = ?`;
        pool.query(sqlCheckPubli, [id_publi], (errPubli, publiResult) => {
            if (errPubli) return res.status(500).json({ mensaje: 'Error al verificar publicación', err: errPubli });
            if (publiResult.length === 0) {
                return res.status(404).json({ mensaje: 'Publicación no encontrada' });
            }

            // 2. Busca integrantes de la publicación
            const sqlIntegrantes = `SELECT matricula FROM integrantes WHERE id_publi = ?`;
            pool.query(sqlIntegrantes, [id_publi], (err, integrantes) => {
                if (err) return res.status(500).json({ mensaje: 'Error al obtener integrantes', error: err });

                // Verifica si el solicitante es un integrante
                const esIntegrante = integrantes.some(i => i.matricula.toString() === matriculaSolicitante.toString());
                if (!esIntegrante && req.usuario.rol !== 1) {
                    if (archivos.length > 0) {
                        archivos.forEach(ruta => {
                            const filePath = path.join(__dirname, '..', ruta);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        });
                    }
                    return res.status(403).json({ mensaje: 'No tienes permiso para actualizar esta publicación' });
                }

                // 3. Actualiza la publicación
                const sqlUpdate = `UPDATE publicacion SET nombre = ?, descripcion = ? WHERE id_publi = ?`;
                pool.query(sqlUpdate, [titulo, descripcion, id_publi], (err) => {
                    if (err) return res.status(500).json({ mensaje: 'Error al actualizar la publicación', error: err });

                    // 4. Actualiza los archivos
                    if (archivos.length > 0) {
                        const sqlSelectArchivos = `SELECT ruta FROM archivos WHERE id_publi = ?`;
                        pool.query(sqlSelectArchivos, [id_publi], (errSelect, archivosAntiguos) => {
                            if (errSelect) return res.status(500).json({ mensaje: 'Error al obtener archivos antiguos', error: errSelect });

                            archivosAntiguos.forEach(archivo => {
                                const filePath = path.join(__dirname, '..', archivo.ruta);
                                if (fs.existsSync(filePath)) {
                                    fs.unlinkSync(filePath);
                                }
                            });

                            const sqlDeleteArchivos = `DELETE FROM archivos WHERE id_publi = ?`;
                            pool.query(sqlDeleteArchivos, [id_publi], (err2) => {
                                if (err2) return res.status(500).json({ mensaje: 'Error al eliminar archivos antiguos', error: err2 });

                                const archivosValues = archivos.map(ruta => [id_publi, ruta]);
                                const sqlInsertArchivos = `INSERT INTO archivos (id_publi, ruta) VALUES ?`;
                                pool.query(sqlInsertArchivos, [archivosValues], (err3) => {
                                    if (err3) return res.status(500).json({ mensaje: 'Error al guardar nuevos archivos', error: err3 });
                                    actualizarIntegrantes();
                                });
                            });
                        });
                    } else {
                        actualizarIntegrantes();
                    }

                    // 5. Actualiza los integrantes
                    function actualizarIntegrantes() {
                        const sqlDeleteIntegrantes = `DELETE FROM integrantes WHERE id_publi = ?`;
                        pool.query(sqlDeleteIntegrantes, [id_publi], (err4) => {
                            if (err4) return res.status(500).json({ mensaje: 'Error al eliminar integrantes antiguos', error: err4 });
                            if (colaboradoresArray.length > 0) {
                                const values = colaboradoresArray.map(matricula => [matricula, id_publi]);
                                const sqlInsertIntegrantes = `INSERT IGNORE INTO integrantes (matricula, id_publi) VALUES ?`;
                                pool.query(sqlInsertIntegrantes, [values], (err5) => {
                                    if (err5) return res.status(500).json({ mensaje: 'Error al agregar nuevos integrantes', error: err5 });
                                    res.status(200).json({ mensaje: 'Publicación actualizada correctamente' });
                                });
                            } else {
                                res.status(200).json({ mensaje: 'Publicación actualizada correctamente (sin colaboradores)' });
                            }
                        });
                    }
                });
            });
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
}

async function listarPublicaciones(req, res) {
    try {
        // 1. Trae todas las publicaciones y sus archivos
        const sqlPublicaciones = `
            SELECT p.id_publi, p.nombre, p.descripcion, p.fecha, a.ruta AS archivo
            FROM publicacion p
            LEFT JOIN archivos a ON p.id_publi = a.id_publi
            ORDER BY p.id_publi DESC
        `;
        pool.query(sqlPublicaciones, async (err, publicacionesRaw) => {
            if (err) return res.status(500).json({ mensaje: 'Error al obtener publicaciones', error: err });

            if (publicacionesRaw.length === 0) {
                return res.status(404).json({ mensaje: 'No hay publicaciones' });
            }

            // Agrupa archivos por publicación
            const publicacionesMap = {};
            publicacionesRaw.forEach(publi => {
                if (!publicacionesMap[publi.id_publi]) {
                    publicacionesMap[publi.id_publi] = {
                        id_publi: publi.id_publi,
                        nombre: publi.nombre,
                        descripcion: publi.descripcion,
                        fecha: publi.fecha,
                        archivos: publi.archivo ? [publi.archivo] : []
                    };
                } else if (publi.archivo) {
                    publicacionesMap[publi.id_publi].archivos.push(publi.archivo);
                }
            });
            const publicaciones = Object.values(publicacionesMap);

            // 2. Trae todos los integrantes de todas las publicaciones
            const sqlIntegrantes = `
                SELECT i.id_publi, u.matricula, u.nombre, u.apellido
                FROM integrantes i
                JOIN usuario u ON i.matricula = u.matricula
            `;
            pool.query(sqlIntegrantes, (err2, integrantesRaw) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al obtener integrantes', error: err2 });

                // 3. Trae todos los comentarios de todas las publicaciones
                const sqlComentarios = `
                    SELECT c.id_publi, c.comentario, u.nombre, c.matricula
                    FROM comentario c
                    JOIN usuario u ON c.matricula = u.matricula
                `;
                pool.query(sqlComentarios, (err3, comentariosRaw) => {
                    if (err3) return res.status(500).json({ mensaje: 'Error al obtener comentarios', error: err3 });

                    // 4. Trae todas las evaluaciones de todas las publicaciones
                    const sqlEval = `
                        SELECT id_publi, AVG(evaluacion) as promedio, COUNT(*) as total
                        FROM evaluacion
                        GROUP BY id_publi
                    `;
                    pool.query(sqlEval, (err4, evalRaw) => {
                        if (err4) return res.status(500).json({ mensaje: 'Error al obtener evaluaciones', error: err4 });

                        // Arma la respuesta
                        publicaciones.forEach(publi => {
                            // Integrantes
                            publi.integrantes = integrantesRaw
                                .filter(i => i.id_publi === publi.id_publi)
                                .map(i => ({
                                    matricula: i.matricula,
                                    nombre: i.nombre + ' ' + i.apellido
                                }));

                            // Comentarios
                            publi.comentarios = comentariosRaw
                                .filter(c => c.id_publi === publi.id_publi)
                                .map(c => ({
                                    comentario: c.comentario,
                                    nombre: c.nombre,
                                    matricula: c.matricula
                                }));

                            // Evaluaciones
                            const evalPubli = evalRaw.find(e => e.id_publi === publi.id_publi);
                            publi.calificacion_promedio = evalPubli ? Number(evalPubli.promedio).toFixed(2) : 0;
                            publi.total_calificaciones = evalPubli ? evalPubli.total : 0;
                        });

                        res.status(200).json({ publicaciones });
                    });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error en el servidor', error });
    }
}

async function calificarPublicacion(req, res) {
    const matricula = req.usuario.matricula;
    const { id_publi, evaluacion } = req.body;

    if (!id_publi || !evaluacion) {
        return res.status(400).json({ mensaje: 'ID de publicación y evaluación requeridos' });
    }
    if (![1, 2, 3, 4, 5].includes(Number(evaluacion))) {
        return res.status(400).json({ mensaje: 'La evaluación debe ser un número del 1 al 5' });
    }

    // Verifica si la publicación existe
    const sqlCheckPubli = 'SELECT 1 FROM publicacion WHERE id_publi = ?';
    pool.query(sqlCheckPubli, [id_publi], (errPubli, publiResult) => {
        if (errPubli) return res.status(500).json({ mensaje: 'Error al verificar publicación', err: errPubli });
        if (publiResult.length === 0) {
            return res.status(404).json({ mensaje: 'Publicación no encontrada' });
        }

        // Verifica si ya existe una evaluación
        const sqlCheck = 'SELECT * FROM evaluacion WHERE matricula = ? AND id_publi = ?';
        pool.query(sqlCheck, [matricula, id_publi], (err, results) => {
            if (err) return res.status(500).json({ mensaje: 'Error al verificar evaluación', err });
            if (results.length > 0) {
                return res.status(400).json({ mensaje: 'Ya has calificado esta publicación' });
            }

            // Inserta la evaluación
            const sqlInsert = 'INSERT INTO evaluacion (matricula, id_publi, evaluacion) VALUES (?, ?, ?)';
            pool.query(sqlInsert, [matricula, id_publi, evaluacion], (err2) => {
                if (err2) return res.status(500).json({ mensaje: 'Error al guardar evaluación', err: err2 });
                res.json({ mensaje: 'Evaluación registrada correctamente' });
            });
        });
    });
}


// controladores/publicacionesControladores.js
async function comentarPublicacion(req, res) {
    const matricula = req.usuario.matricula;
    const { id_publi, comentario } = req.body;

    if (!id_publi || !comentario || comentario.trim() === "") {
        return res.status(400).json({ mensaje: 'ID de publicación y comentario requeridos' });
    }
    if (comentario.length > 300) {
        return res.status(400).json({ mensaje: 'El comentario no puede exceder 300 caracteres' });
    }
    const sql0 = 'SELECT * FROM publicacion WHERE id_publi = ?';
    pool.query(sql0, [id_publi], (err0, results) => {
        if (err0) return res.status(500).json({ mensaje: 'Error al verificar publicación', err: err0 });
        if (results.length === 0) {
            return res.status(404).json({ mensaje: 'Publicación no encontrada' });
        }

        // Solo aquí ejecuta el INSERT
        const sql = 'INSERT INTO comentario (comentario, matricula, id_publi) VALUES (?, ?, ?)';
        pool.query(sql, [comentario.trim(), matricula, id_publi], (err) => {
            if (err) return res.status(500).json({ mensaje: 'Error al guardar comentario', err });
            res.json({ mensaje: 'Comentario agregado correctamente' });
        });
    });
}

async function eliminarComentario(req, res) {
    const matriculaSolicitante = req.usuario.matricula;
    const rol = req.usuario.rol;
    const { matricula, id_publi, comentario } = req.body;

    if (!matricula || !id_publi || !comentario || comentario.trim() === "") {
        return res.status(400).json({ mensaje: 'matricula, id_publi y comentario son requeridos' });
    }

    // Compara como string para evitar errores de tipo
    if (matriculaSolicitante.toString() !== matricula.toString() && rol !== 1) {
        return res.status(403).json({ mensaje: 'No tienes permiso para eliminar este comentario' });
    }

    const sqlDelete = 'DELETE FROM comentario WHERE matricula = ? AND id_publi = ? AND comentario = ?';
    pool.query(sqlDelete, [matricula, id_publi, comentario.trim()], (err, result) => {
        if (err) return res.status(500).json({ mensaje: 'Error al eliminar comentario' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Comentario no encontrado' });
        }
        res.json({ mensaje: 'Comentario eliminado correctamente' });
    });
}

module.exports = {
    registrarPublicacion,
    verPublicacion,
    eliminarPublicacion,
    actualizarPublicacion,
    listarPublicaciones,
    calificarPublicacion,
    comentarPublicacion,
    eliminarComentario
}