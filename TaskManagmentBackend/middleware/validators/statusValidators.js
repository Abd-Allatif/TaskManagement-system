const { body, validationResult } = require("express-validator");

const statusRules = [
  body("code")
    .trim()
    .notEmpty()
    .withMessage("Code is required")
    .isLength({ max: 50 })
    .withMessage("Code must be 50 characters or less"),

  body("label")
    .trim()
    .notEmpty()
    .withMessage("Label is required")
    .isLength({ max: 100 })
    .withMessage("Label must be 100 characters or less"),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation Error",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  next();
};

module.exports = {
  statusRules,
  validate,
};
