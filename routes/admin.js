const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Middleware: solo accesible para rol "admin"
router.use(auth(['admin']));

/**
 * Listado de usuarios
 */
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, nombre, email, rol, fecha_registro FROM users'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

/**
 * Listado de tiendas con info de usuario asociado
 */
router.get('/stores', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.id AS store_id,
              s.nombre AS store_nombre,
              s.direccion,
              s.telefono,
              s.descripcion,
              s.hora_inicio,
              s.hora_fin,
              u.id AS user_id,
              u.nombre AS user_nombre,
              u.email
       FROM stores s
       JOIN users u ON s.user_id = u.id`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

/**
 * Listado de tiendas con número de publicaciones (cajas)
 */
router.get('/stores-with-boxes', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS store_id,
             s.nombre AS store_nombre,
             s.direccion,
             s.telefono,
             s.descripcion,
             s.hora_inicio,
             s.hora_fin,
             u.id AS user_id,
             u.nombre AS user_nombre,
             u.email,
             COUNT(b.id) AS publicaciones
      FROM stores s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN boxes b ON b.store_id = s.id
      GROUP BY s.id, u.id
    `);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo tiendas con publicaciones' });
  }
});

/**
 * Crear tienda + usuario asociado (con contraseña hasheada)
 */
router.post('/stores', async (req, res) => {
  try {
    const {
      nombre_user,      // 👤 Nombre del dueño (usuario)
      nombre_store,     // 🏬 Nombre de la tienda
      email,
      contrasena,
      direccion,
      telefono,
      descripcion,
      lat,
      lng,
      hora_inicio,
      hora_fin
    } = req.body;

    // Validar que no exista usuario con el mismo email
    const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length > 0)
      return res.status(400).json({ error: 'Email ya registrado' });

    // Hashear la contraseña del usuario
    const hash = await bcrypt.hash(contrasena, 10);

    // Crear usuario con rol "store"
    const [userResult] = await pool.query(
      'INSERT INTO users (nombre, email, contrasena, rol) VALUES (?,?,?,?)',
      [nombre_user, email, hash, 'store']
    );
    const userId = userResult.insertId;

    // Crear tienda asociada al usuario
    const [storeResult] = await pool.query(
      `INSERT INTO stores 
        (user_id, nombre, direccion, telefono, descripcion, lat, lng, hora_inicio, hora_fin) 
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [userId, nombre_store, direccion, telefono, descripcion, lat, lng, hora_inicio, hora_fin]
    );

    res.json({
      userId,
      storeId: storeResult.insertId,
      message: 'Tienda creada correctamente con contraseña protegida'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error creando tienda' });
  }
});

/**
 * Estadísticas generales
 */
router.get('/stats', async (req, res) => {
  try {
    const [[r]] = await pool.query('SELECT COUNT(*) as users FROM users');
    res.json({ users: r.users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

module.exports = router;
