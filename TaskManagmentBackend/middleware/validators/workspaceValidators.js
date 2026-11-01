const { body, param, validationResult } = require("express-validator");

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

const validateCreate = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Workspace name is required")
    .isLength({ max: 120 })
    .withMessage("Workspace name must be 120 characters or less"),
  validate,
];

const validateUpdate = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Workspace name is required")
    .isLength({ max: 120 })
    .withMessage("Workspace name must be 120 characters or less"),
  validate,
];

const validateTransfer = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  body("userId").isUUID().withMessage("userId must be a valid ID"),
  validate,
];

const validateCreateRole = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Role name is required")
    .isLength({ max: 60 })
    .withMessage("Role name must be 60 characters or less"),
  validate,
];

const validateUpdateRole = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  param("roleId").isUUID().withMessage("roleId must be a valid ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Role name is required")
    .isLength({ max: 60 })
    .withMessage("Role name must be 60 characters or less"),
  validate,
];

const validateSetRolePermissions = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  param("roleId").isUUID().withMessage("roleId must be a valid ID"),
  body("permissionCodes")
    .isArray({ min: 1 })
    .withMessage("permissionCodes must be a non-empty array"),
  body("permissionCodes.*")
    .isString()
    .withMessage("Each permission code must be a string"),
  validate,
];

const validateInvite = [
  param("id").isUUID().withMessage("Workspace id must be a valid ID"),
  body("email").isEmail().withMessage("A valid email is required"),
  body("roleId").isUUID().withMessage("roleId must be a valid ID"),
  validate,
];

const validateRedeem = [
  body("token")
    .trim()
    .notEmpty()
    .withMessage("Invite token is required"),
  validate,
];

module.exports = {
  validateCreate,
  validateUpdate,
  validateTransfer,
  validateCreateRole,
  validateUpdateRole,
  validateSetRolePermissions,
  validateInvite,
  validateRedeem,
  validate,
};
