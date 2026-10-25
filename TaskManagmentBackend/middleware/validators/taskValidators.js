const { body, validationResult } = require("express-validator");

const createTaskRules = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required")
    .isLength({ max: 200 })
    .withMessage("Title must be 200 characters or less"),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string"),

  body("deadline")
    .optional()
    .isISO8601()
    .withMessage("Deadline must be a valid date")
    .custom((value) => new Date(value) > new Date())
    .withMessage("Deadline must be in the future"),

  body("statusId")
    .optional()
    .isUUID()
    .withMessage("statusId must be a valid ID"),

  body("parentTaskId")
    .optional()
    .isUUID()
    .withMessage("parentTaskId must be a valid ID"),

  body("categories")
    .optional()
    .isArray()
    .withMessage("Categories must be an array"),

  body("categories.*").isUUID().withMessage("Each category must be a valid ID"),

  body("assignments")
    .optional()
    .isArray()
    .withMessage("Assignments must be an array"),

  body("assignments.*.assignableType")
    .isIn(["USER", "ADMIN"])
    .withMessage("assignableType must be USER or ADMIN"),

  body("assignments.*.assignableId")
    .isUUID()
    .withMessage("Each assignable must be a valid ID"),
];

const updateTaskRules = [
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Title cannot be empty")
    .isLength({ max: 200 })
    .withMessage("Title must be 200 characters or less"),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string"),

  body("deadline")
    .optional()
    .isISO8601()
    .withMessage("Deadline must be a valid date")
    .custom((value) => new Date(value) > new Date())
    .withMessage("Deadline must be in the future"),

  body("statusId")
    .optional()
    .isUUID()
    .withMessage("statusId must be a valid ID"),

  body("parentTaskId")
    .optional()
    .isUUID()
    .withMessage("parentTaskId must be a valid ID"),

  body("endFlag")
    .optional()
    .isBoolean()
    .withMessage("endFlag must be a boolean"),

  body("categories")
    .optional()
    .isArray()
    .withMessage("Categories must be an array"),

  body("categories.*").isUUID().withMessage("Each category must be a valid ID"),

  body("assignments")
    .optional()
    .isArray()
    .withMessage("Assignments must be an array"),

  body("assignments.*.assignableType")
    .isIn(["USER", "ADMIN"])
    .withMessage("assignableType must be USER or ADMIN"),

  body("assignments.*.assignableId")
    .isUUID()
    .withMessage("Each assignable must be a valid ID"),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = {
  createTaskRules,
  updateTaskRules,
  validate,
};
