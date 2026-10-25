// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Prisma unique constraint violation (e.g., duplicate email)
  if (err.code === "P2002") {
    statusCode = 409;
    message = "A record with this value already exists.";
  }

  // Prisma record not found
  if (err.code === "P2025") {
    statusCode = 404;
    message = "Record not found.";
  }

  if (err.code === "P2003") {
    statusCode = 400;
    message = "Invalid reference — a related record does not exist.";
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token.";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired.";
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

module.exports = errorHandler;
