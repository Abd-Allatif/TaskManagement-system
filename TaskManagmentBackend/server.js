require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { join } = require("path");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/Authentication/authRoutes");
const taskRoutes = require("./routes/Task/taskRoutes");
const categoryRoutes = require("./routes/Category/categoryRoutes");
const statusRoutes = require("./routes/Status/statusRoutes");
const adminRoutes = require("./routes/Admin/adminRoutes");
const adminManagementRoutes = require("./routes/Admin/adminManagementRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Sets Secure HTTP headers
app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));

// 3. Global rate limit — 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// 4. Strict rate limit for auth routes — 20 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many auth attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});


app.use(express.json());
// app.use(verifyToken);

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth',authLimiter, authRoutes);

app.use("/api/tasks", taskRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/statuses", statusRoutes);

app.use('/api/admin/auth', authLimiter, adminRoutes);
app.use('/api/admin', adminManagementRoutes);

// 404 Route Not Found Middleware (Catches unmatched URLs)
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Global Error Handling Middleware
app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log("server is running on http://localhost:" + PORT);
  });
}
