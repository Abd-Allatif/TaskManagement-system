const { body, validationResult } = require("express-validator");

const createCategoryRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or less"),

  body("color")
    .optional()
    .isString()
    .withMessage("Color must be a string")
    .isLength({ max: 50 })
    .withMessage("Color must be 50 characters or less"),
];

const updateCategoryRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ max: 100 })
    .withMessage("Name must be 100 characters or less"),

  body("color")
    .optional()
    .isString()
    .withMessage("Color must be a string")
    .isLength({ max: 50 })
    .withMessage("Color must be 50 characters or less"),
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
  createCategoryRules,
  updateCategoryRules,
  validate,
};
