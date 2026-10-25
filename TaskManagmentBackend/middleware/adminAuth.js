const verifyToken = require("./auth");

// Requires a valid token AND that the token belongs to an admin.
// Composes verifyToken so the JWT is verified once, then checks the role.
const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, (err) => {
    if (err) return next(err);

    if (!req.user || req.user.type !== "ADMIN") {
      return res.status(403).json({
        message: "Access denied. Admin access required.",
      });
    }

    next();
  });
};

module.exports = verifyAdmin;
