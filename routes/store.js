// backend/routes/store.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload'); // <- multer config

// middleware asegura que solo stores accedan
router.use(auth(['store']));

/**
 * Helper local: obtener id del producto desde distintas formas
 */
function getProductId(prod) {
  return prod?.id ?? prod?.product_id ?? null;
}

/**
 * Calcula precio total (suma precio * cantidad)
 */
async function calcularPrecioTotal(productos = [], storeId) {
  let total = 0;
  for (const prod of productos) {
    const pid = getProductId(prod);
    if (!pid) continue;
    const [rows] = await pool.query("SELECT precio FROM products WHERE id = ? AND store_id = ?", [pid, storeId]);
    if (rows.length === 0) continue;
    const precioUnitario = parseFloat(rows[0].precio) || 0;
    const cantidad = Number(prod.cantidad) || 1;
    total += precioUnitario * cantidad;
  }
  return total;
}

// ============================
// PRODUCTOS (compatibilidad)
// ============================

// obtener productos de la tienda
router.get('/products', async (req, res) => {
  try {
    const storeId = req.user.store_id;
    if (!storeId) return res.json([]);

    const [rows] = await pool.query('SELECT * FROM products WHERE store_id=?', [storeId]);
    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'error servidor' });
  }
});

// crear producto
router.post('/products', upload.single('foto'), async (req, res) => {
  try {
    const storeId = req.user.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'No se encontró la tienda para este usuario' });
    }

    const { nombre, precio, stock } = req.body;
    const foto = req.file ? `/uploads/${req.file.filename}` : null;

    // Validación: nombre y precio son obligatorios
    if (!nombre || precio === undefined || precio === null) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, precio)' });
    }

    const [result] = await pool.query(
      'INSERT INTO products (store_id, nombre, precio, stock, foto) VALUES (?,?,?,?,?)',
      [storeId, nombre, precio, stock || 0, foto]
    );

    res.json({
      id: result.insertId,
      nombre,
      precio,
      stock: stock || 0,
      foto,
      message: 'Producto creado'
    });
  } catch (e) {
    console.error('Error al crear producto:', e);
    res.status(500).json({ error: 'error servidor' });
  }
});

// ============================
// CAJAS (compatibilidad)
// ============================

// obtener cajas de la tienda (con productos asociados)
router.get('/boxes', async (req, res) => {
  try {
    const storeId = req.user.store_id;
    if (!storeId) return res.json([]);

    const [boxes] = await pool.query(
      'SELECT * FROM boxes WHERE store_id=? ORDER BY fecha_creacion DESC',
      [storeId]
    );

    for (const box of boxes) {
      const [prods] = await pool.query(
        `SELECT bp.product_id, bp.cantidad, p.nombre, p.precio, p.foto
         FROM box_products bp
         JOIN products p ON bp.product_id = p.id
         WHERE bp.box_id = ?`,
        [box.id]
      );
      box.productos = prods || [];

      // calcular precio y actualizar DB si es NULL
      let precioNormal = 0;
      for (const p of box.productos) {
        precioNormal += (parseFloat(p.precio) || 0) * (p.cantidad || 1);
      }

      if (box.precio_normal === null || box.precio_normal === undefined) {
        try {
          await pool.query('UPDATE boxes SET precio_normal = ? WHERE id = ?', [precioNormal, box.id]);
        } catch (e) {
          console.warn('No se pudo actualizar precio_normal en store.get /boxes:', e);
        }
      }
      box.precio_normal = parseFloat(box.precio_normal) || precioNormal;
    }

    res.json(boxes || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'error servidor' });
  }
});

// crear caja con productos (ahora también guarda precio_normal)
router.post('/boxes', async (req, res) => {
  try {
    const storeId = req.user.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'No se encontró la tienda para este usuario' });
    }

    let { nombre, descripcion, precio_descuento, stock, fecha_vencimiento, productos } = req.body;
    // parsear si productos viene como string
    if (typeof productos === 'string') {
      try { productos = JSON.parse(productos); } catch (e) { productos = []; }
    }
    if (!Array.isArray(productos)) productos = [];

    // calcular precio normal
    const precioNormal = await calcularPrecioTotal(productos, storeId);

    const [result] = await pool.query(
      'INSERT INTO boxes (store_id, nombre, descripcion, precio_normal, precio_descuento, stock, fecha_vencimiento) VALUES (?,?,?,?,?,?,?)',
      [storeId, nombre, descripcion, precioNormal, precio_descuento, stock || 0, fecha_vencimiento]
    );

    const boxId = result.insertId;

    for (const p of productos) {
      const pid = getProductId(p);
      if (!pid) continue;
      await pool.query(
        'INSERT INTO box_products (box_id, product_id, cantidad) VALUES (?,?,?)',
        [boxId, pid, p.cantidad || 1]
      );
    }

    res.json({ id: boxId, message: 'Caja creada con productos asociados', precio_normal: precioNormal });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'error servidor' });
  }
});

// ============================
// STATS
// ============================
router.get('/stats', async (req, res) => {
  try {
    const storeId = req.user.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'No se encontró la tienda para este usuario' });
    }

    const [[sales]] = await pool.query(
      'SELECT COUNT(*) as ventas_total, SUM(o.total) as ingresos FROM orders o JOIN boxes b ON o.box_id=b.id WHERE b.store_id=?',
      [storeId]
    );

    res.json({ ventas_total: sales.ventas_total || 0, ingresos: sales.ingresos || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'error servidor' });
  }
});

module.exports = router;
