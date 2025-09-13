const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

/**
 * Helper: obtener id del producto desde distintas formas
 */
function getProductId(prod) {
  return prod?.id ?? prod?.product_id ?? null;
}

/**
 * Calcula precio total (suma precio * cantidad) de una lista de productos
 * productos: array con { id | product_id, cantidad }
 * storeId: para validar que el producto pertenece a la tienda
 * devuelve { total, detalles: [{ product_id, precio_unitario, cantidad }] }
 */
async function calcularPrecioTotal(productos = [], storeId) {
  let total = 0;
  const detalles = [];

  for (const prod of productos) {
    const pid = getProductId(prod);
    if (!pid) continue;

    const [rows] = await pool.query(
      "SELECT precio FROM products WHERE id = ? AND store_id = ?",
      [pid, storeId]
    );

    if (rows.length === 0) continue;

    const precioUnitario = parseFloat(rows[0].precio) || 0;
    const cantidad = Number(prod.cantidad) || 1;
    total += precioUnitario * cantidad;

    detalles.push({ product_id: pid, precio_unitario: precioUnitario, cantidad });
  }

  return { total, detalles };
}

// =============================
// Cajas públicas (clientes)
// =============================
router.get('/boxes/public', async (req, res) => {
  try {
    const [boxes] = await pool.query(
      `SELECT b.*, s.nombre AS store_name
       FROM boxes b
       LEFT JOIN stores s ON b.store_id = s.id
       WHERE b.stock > 0
         AND (b.fecha_vencimiento IS NULL OR b.fecha_vencimiento >= NOW())
       ORDER BY b.fecha_creacion DESC`
    );

    for (const box of boxes) {
      const [prods] = await pool.query(
        `SELECT bp.product_id, bp.cantidad, bp.fecha_consumo,
                p.nombre, p.precio, p.foto
         FROM box_products bp
         JOIN products p ON bp.product_id = p.id
         WHERE bp.box_id = ?`,
        [box.id]
      );

      box.productos = prods || [];

      let precioCalculado = 0;
      for (const p of box.productos) {
        precioCalculado += (parseFloat(p.precio) || 0) * (p.cantidad || 1);
      }

      if (box.precio_normal === null || box.precio_normal === undefined) {
        try {
          await pool.query('UPDATE boxes SET precio_normal = ? WHERE id = ?', [precioCalculado, box.id]);
          box.precio_normal = precioCalculado;
        } catch (e) {
          console.warn('No se pudo actualizar precio_normal para box', box.id, e);
        }
      } else {
        box.precio_normal = parseFloat(box.precio_normal) || precioCalculado;
      }
    }

    res.json(boxes || []);
  } catch (e) {
    console.error('Error en /boxes/public:', e);
    res.status(500).json({ error: 'Error servidor al obtener cajas públicas' });
  }
});

// =============================
// Cajas de la tienda logueada
// =============================
router.get('/boxes', auth(['store']), async (req, res) => {
  const storeId = req.user.store_id;
  try {
    const [boxes] = await pool.query(
      `SELECT b.*, s.nombre AS store_name
       FROM boxes b
       LEFT JOIN stores s ON b.store_id = s.id
       WHERE b.store_id = ?`,
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

      let precioNormal = 0;
      for (const p of box.productos) {
        precioNormal += (parseFloat(p.precio) || 0) * (p.cantidad || 1);
      }

      if (box.precio_normal === null || box.precio_normal === undefined) {
        try {
          await pool.query('UPDATE boxes SET precio_normal = ? WHERE id = ?', [precioNormal, box.id]);
        } catch (e) {
          console.warn('No se pudo actualizar precio_normal al obtener cajas para la tienda', box.id, e);
        }
      }

      box.precio_normal = parseFloat(box.precio_normal) || precioNormal;
    }

    res.json(boxes || []);
  } catch (e) {
    console.error('Error en GET /boxes:', e);
    res.status(500).json({ error: 'Error servidor al obtener cajas' });
  }
});

// =============================
// Crear caja
// =============================
router.post('/boxes', auth(['store']), async (req, res) => {
  const storeId = req.user.store_id;
  let {
    nombre,
    descripcion,
    precio_descuento,
    stock,
    productos,
    fecha_vencimiento,
    is_flash
  } = req.body;

  // ⚠️ Limpiar fecha_vencimiento vacía → null
  if (!fecha_vencimiento || fecha_vencimiento.trim() === "") {
    fecha_vencimiento = null;
  }

  let productosArr = productos;
  if (typeof productos === 'string') {
    try { productosArr = JSON.parse(productos); } catch (e) { productosArr = []; }
  }
  if (!Array.isArray(productosArr) || productosArr.length === 0) {
    return res.status(400).json({ error: "Debes agregar al menos un producto" });
  }

  try {
    const { total: precioNormal } = await calcularPrecioTotal(productosArr, storeId);

    let fechasConsumo = [];
    for (const prod of productosArr) {
      if (prod.fecha_consumo) fechasConsumo.push(new Date(prod.fecha_consumo));
    }

    const ahora = new Date();
    const horario_inicio = ahora.toISOString().slice(0, 19).replace("T", " ");

    let horario_fin;

    if (is_flash) {
      // ⚡ flash = expira en 4 horas
      horario_fin = new Date(ahora.getTime() + 4 * 60 * 60 * 1000);
    } else if (fecha_vencimiento) {
      horario_fin = new Date(fecha_vencimiento);
    } else if (fechasConsumo.length > 0) {
      horario_fin = new Date(Math.min(...fechasConsumo.map(f => f.getTime())));
    } else {
      horario_fin = null;
    }

    const horario_fin_sql = horario_fin
      ? horario_fin.toISOString().slice(0, 19).replace("T", " ")
      : null;

    const [result] = await pool.query(
      `INSERT INTO boxes (
         store_id, nombre, descripcion,
         precio_normal, precio_descuento,
         stock, horario_inicio, horario_fin, fecha_vencimiento, is_flash
       )
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        storeId,
        nombre,
        descripcion,
        precioNormal,
        precio_descuento,
        stock,
        horario_inicio,
        horario_fin_sql,
        fecha_vencimiento,
        is_flash ? 1 : 0
      ]
    );

    const boxId = result.insertId;

    for (const prod of productosArr) {
      const pid = getProductId(prod);
      if (!pid) continue;
      await pool.query(
        `INSERT INTO box_products (box_id, product_id, cantidad, fecha_consumo)
         VALUES (?,?,?,?)`,
        [boxId, pid, prod.cantidad || 1, prod.fecha_consumo || null]
      );
    }

    res.json({
      id: boxId,
      message: 'Caja creada correctamente',
      precio_normal: precioNormal,
      horario_inicio,
      horario_fin: horario_fin_sql,
      is_flash: is_flash ? 1 : 0
    });
  } catch (e) {
    console.error('Error en POST /boxes:', e);
    res.status(500).json({ error: 'Error creando caja' });
  }
});

// =============================
// Obtener caja por ID (pública)
// =============================
router.get('/boxes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT b.*, s.nombre AS store_name, s.direccion
       FROM boxes b
       JOIN stores s ON b.store_id = s.id
       WHERE b.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    const [productos] = await pool.query(
      `SELECT p.id AS product_id, p.nombre, p.precio, bp.cantidad, p.foto
       FROM box_products bp
       JOIN products p ON p.id = bp.product_id
       WHERE bp.box_id = ?`,
      [id]
    );

    const box = rows[0];
    box.productos = productos || [];
    box.precio_normal = parseFloat(box.precio_normal) || 0;

    res.json(box);
  } catch (e) {
    console.error('Error en GET /boxes/:id:', e);
    res.status(500).json({ error: 'Error obteniendo la caja' });
  }
});

module.exports = router;
