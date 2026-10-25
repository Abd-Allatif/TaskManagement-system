const { body, validationResult } = require("express-validator");

// Validation Chains

const registerRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 4 })
    .withMessage("Name must be at least 4 characters long"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid Email format")
    .normalizeEmail(),

  body("password")
    .trim()
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
];

const loginRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid Email format")
    .normalizeEmail(),
  body("password").trim().notEmpty().withMessage("Password is required"),
];

const resendCodeRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid Email format")
    .normalizeEmail(),
];

// MiddleWare

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({
        message: "Validation Error",
        errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      });
  }

  next();
};

module.exports = {
  registerRules,
  loginRules,
  resendCodeRules,
  validate,
};
