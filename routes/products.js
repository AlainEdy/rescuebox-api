// backend/routes/products.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Obtener productos de la tienda logueada
router.get('/products', auth(['store']), async (req, res) => {
  const storeId = req.user.store_id;
  try {
    const [rows] = await pool.query(
      `SELECT p.*, s.nombre as store_name 
       FROM products p 
       LEFT JOIN stores s ON p.store_id = s.id 
       WHERE p.store_id = ?`,
      [storeId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error('Error en GET /products:', e);
    res.status(500).json({ error: 'Error servidor al obtener productos' });
  }
});

// Crear producto
router.post(
  '/products',
  auth(['store']),
  upload.single('foto'),
  async (req, res) => {
    const storeId = req.user.store_id;
    const { nombre, precio, stock } = req.body;

    if (!nombre || precio === undefined || precio === null) {
      return res.status(400).json({ error: "Faltan campos obligatorios (nombre, precio)" });
    }

    try {
      const fotoPath = req.file ? `/uploads/${req.file.filename}` : null;

      const [result] = await pool.query(
        `INSERT INTO products (store_id, nombre, precio, stock, foto)
         VALUES (?,?,?,?,?)`,
        [storeId, nombre, precio, stock || 0, fotoPath]
      );

      res.json({
        id: result.insertId,
        message: 'Producto creado correctamente',
        foto: fotoPath,
      });
    } catch (e) {
      console.error('Error en POST /products:', e);
      res.status(500).json({ error: 'Error creando producto' });
    }
  }
);

module.exports = router;
