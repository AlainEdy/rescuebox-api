const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const auth = require("../middleware/auth");

// ============================
// Crear reserva (usuario)
// ============================
router.post("/", auth(["user"]), async (req, res) => {
  try {
    const userId = req.user.id;
    const { box_id, franja_horaria } = req.body;

    if (!box_id || !franja_horaria) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // ⚠️ Verificar stock disponible
    const [stockRows] = await pool.query(
      "SELECT stock FROM boxes WHERE id = ?",
      [box_id]
    );

    if (stockRows.length === 0) {
      return res.status(404).json({ error: "Caja no encontrada" });
    }

    if (stockRows[0].stock <= 0) {
      return res.status(409).json({ error: "Sin stock disponible" });
    }

    // ⚡ Generar solo el payload corto (no base64)
    const qrPayload = `${userId}-${box_id}-${Date.now()}`;

    // ⚡ Transacción para garantizar consistencia
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insertar reserva
      const [result] = await conn.query(
        "INSERT INTO reservas (user_id, box_id, franja_horaria, qr_code) VALUES (?,?,?,?)",
        [userId, box_id, franja_horaria, qrPayload]
      );

      // Descontar stock
      await conn.query(
        "UPDATE boxes SET stock = stock - 1 WHERE id = ?",
        [box_id]
      );

      await conn.commit();

      res.json({
        id: result.insertId,
        qr_code: qrPayload,
        message: "Reserva creada correctamente",
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("Error en POST /reservas:", e);
    res.status(500).json({ error: "Error al crear reserva" });
  }
});

// ============================
// Mis reservas (usuario)
// ============================
router.get("/mis", auth(["user"]), async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT r.*, b.nombre AS box_nombre, b.precio_descuento, b.fecha_vencimiento, b.stock,
              s.nombre AS store_name, s.direccion
       FROM reservas r
       JOIN boxes b ON r.box_id = b.id
       JOIN stores s ON b.store_id = s.id
       WHERE r.user_id = ?
       ORDER BY r.fecha DESC`,
      [userId]
    );

    res.json(rows || []);
  } catch (e) {
    console.error("Error en GET /reservas/mis:", e);
    res.status(500).json({ error: "Error al obtener reservas" });
  }
});

// ============================
// Reservas de la tienda (para dueños de store)
// ============================
router.get("/store", auth(["store"]), async (req, res) => {
  try {
    const storeId = req.user.store_id;

    const [rows] = await pool.query(
      `SELECT r.*, u.nombre AS user_nombre, u.email, u.id AS user_id,
              b.nombre AS box_nombre, b.precio_descuento
       FROM reservas r
       JOIN boxes b ON r.box_id = b.id
       JOIN users u ON r.user_id = u.id
       WHERE b.store_id = ?
       ORDER BY r.fecha DESC`,
      [storeId]
    );

    res.json(rows || []);
  } catch (e) {
    console.error("Error en GET /reservas/store:", e);
    res.status(500).json({ error: "Error al obtener reservas de la tienda" });
  }
});

// ============================
// Validar QR y marcar como retirado
// ============================
router.post("/:id/validar", auth(["store"]), async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user.store_id;

    const [rows] = await pool.query(
      `SELECT r.*, b.store_id 
       FROM reservas r
       JOIN boxes b ON r.box_id = b.id
       WHERE r.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    const reserva = rows[0];

    if (reserva.store_id !== storeId) {
      return res.status(403).json({ error: "No autorizado para validar esta reserva" });
    }

    await pool.query("UPDATE reservas SET estado = 'retirado' WHERE id = ?", [id]);

    res.json({ message: "Reserva validada y marcada como retirada" });
  } catch (e) {
    console.error("Error en POST /reservas/:id/validar:", e);
    res.status(500).json({ error: "Error al validar reserva" });
  }
});

// ============================
// Cancelar reserva (usuario)
// ============================
router.patch("/:id/cancelar", auth(["user"]), async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM reservas WHERE id = ? AND user_id = ? AND estado = 'pendiente'",
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Reserva no encontrada o no cancelable" });
    }

    const reserva = rows[0];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        "UPDATE reservas SET estado = 'cancelado' WHERE id = ?",
        [id]
      );

      await conn.query(
        "UPDATE boxes SET stock = stock + 1 WHERE id = ?",
        [reserva.box_id]
      );

      await conn.commit();

      res.json({ message: "Reserva cancelada correctamente" });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error("Error en PATCH /reservas/:id/cancelar:", e);
    res.status(500).json({ error: "Error al cancelar reserva" });
  }
});

module.exports = router;
