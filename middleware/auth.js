const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

function auth(roleAllowed) {
  return async function (req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Token no proporcionado" });

    const token = header.split(" ")[1];
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || "change_this_jwt_secret"
      );

      // Buscar store_id si es tienda
      if (payload.role === "store" && !payload.store_id) {
        const [rows] = await pool.query("SELECT id FROM stores WHERE user_id=?", [payload.id]);
        if (rows.length > 0) payload.store_id = rows[0].id;
      }

      req.user = payload;

      // Validar roles permitidos
      if (roleAllowed?.length && !roleAllowed.includes(payload.role)) {
        return res.status(403).json({ error: "No tienes permisos" });
      }

      next();
    } catch (e) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }
  };
}

module.exports = auth;
