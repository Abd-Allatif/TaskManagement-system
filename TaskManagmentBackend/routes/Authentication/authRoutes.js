const express = require("express");
const verifyToken = require("../../middleware/auth");
const {
  register,
  verifyEmail,
  login,
  logout,
  resendCode,
  getMe,
} = require("../../controllers/Authentication/authController.js");
const {
  registerRules,
  loginRules,
  resendCodeRules,
  validate,
} = require("../../middleware/validators/authValidators.js");

const router = express.Router();

router.post("/register", registerRules, validate, register);
router.post("/verify-email", verifyEmail);
router.post("/resend-code", resendCodeRules, validate, resendCode);
router.post("/login", loginRules, validate, login);
router.post("/logout", logout);
router.get("/me", verifyToken, getMe);

module.exports = router;
