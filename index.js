/* backend/index.js - express app */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Rutas
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const boxRoutes = require("./routes/boxes");
const storeRoutes = require("./routes/store");
const adminRoutes = require("./routes/admin");
const reservasRoutes = require("./routes/reservas"); // 🟢 AÑADIDO

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Usar rutas
app.use("/api/auth", authRoutes);
app.use("/api", productRoutes);
app.use("/api", boxRoutes);
app.use("/api/store", storeRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reservas", reservasRoutes); // 🟢 AÑADIDO

const PORT = process.env.PORT || 4000;

// Escuchar en todas las interfaces de red (0.0.0.0)
app.listen(PORT, () => console.log(`RescueBox API running on port ${PORT}`));

/*
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RescueBox API running on port ${PORT}`);
});
*/
