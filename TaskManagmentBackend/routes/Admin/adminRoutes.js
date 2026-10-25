const express = require("express");
const verifyAdmin = require("../../middleware/adminAuth");
const {
  register,
  verifyEmail,
  login,
  logout,
  resendCode,
  getMe,
} = require("../../controllers/Admin/adminController");
const {
  adminRegisterRules,
  adminLoginRules,
  resendCodeRules,
  validate,
} = require("../../middleware/validators/adminValidators");

const router = express.Router();

router.post("/register", adminRegisterRules, validate, register);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendCodeRules, validate, resendCode);
router.post("/login", adminLoginRules, validate, login);
router.post("/logout", logout);
router.get("/me", verifyAdmin, getMe);

module.exports = router;
