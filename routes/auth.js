// backend/routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const router = express.Router();

/**
 * Registro de usuario
 */
router.post("/register", async (req, res) => {
  try {
    const { nombre, email, contrasena, rol } = req.body;

    // Verificar si ya existe
    const [rows] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (rows.length > 0) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Insertar usuario
    const [result] = await pool.query(
      "INSERT INTO users (nombre, email, contrasena, rol) VALUES (?,?,?,?)",
      [nombre, email, hashedPassword, rol || "user"]
    );

    // Si es tienda, crear store vacío por defecto
    if (rol === "store") {
      await pool.query(
        "INSERT INTO stores (nombre, user_id) VALUES (?, ?)",
        [nombre || "Tienda", result.insertId]
      );
    }

    res.json({ id: result.insertId, email, rol: rol || "user" });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

/**
 * Login
 */
router.post("/login", async (req, res) => {
  const { email, contrasena } = req.body;

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(400).json({ error: "Usuario no encontrado" });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(contrasena, user.contrasena);
    if (!validPassword) {
      return res.status(400).json({ error: "Contraseña incorrecta" });
    }

    // Buscar store_id si es tienda
    let storeId = null;
    if (user.rol === "store") {
      const [storeRows] = await pool.query(
        "SELECT id FROM stores WHERE user_id = ?",
        [user.id]
      );
      if (storeRows.length > 0) storeId = storeRows[0].id;
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.rol, store_id: storeId },
      process.env.JWT_SECRET || "change_this_jwt_secret",
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.rol,
        store_id: storeId,
        name: user.nombre || null,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
