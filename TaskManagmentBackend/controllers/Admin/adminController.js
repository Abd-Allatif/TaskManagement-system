const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../../services/emailService");
const adminRepository = require("../../repository/Admin/adminRepository");

// Register
const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "Please provide all required fields (Name, Email, Password)",
    });
  }

  const existingAdmin = await adminRepository.findByEmail(email);

  if (existingAdmin) {
    return res.status(400).json({ message: "Admin email already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newAdmin = await adminRepository.createAdmin({
    name,
    email,
    password: hashedPassword,
  });

  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Minutes from now

  await adminRepository.createVerificationToken({
    token: verificationCode,
    expiresAt,
    adminId: newAdmin.id,
  });

  await sendVerificationEmail(email, verificationCode, name);

  return res.status(201).json({
    message:
      "Admin registration successful. Please check your email for the verification code.",
    adminId: newAdmin.id,
  });
};

// Verify Email
const verifyEmail = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res
      .status(400)
      .json({ message: "Email and verification code are required" });
  }

  const admin = await adminRepository.findByEmailWithTokens(email);

  if (!admin) {
    return res.status(404).json({
      message: "Admin not found. Please check your email or register first.",
    });
  }

  if (admin.emailVerifiedAt) {
    return res.status(400).json({ message: "Email already verified" });
  }

  const isValidToken = admin.adminVerificationTokens.find(
    (t) => t.token === code && t.expiresAt > new Date()
  );

  if (!isValidToken) {
    return res
      .status(400)
      .json({ message: "Invalid or expired verification code" });
  }

  // Update admin's verification timestamp and delete the token via transaction
  await adminRepository.consumeVerificationToken(admin.id, isValidToken.id);

  return res
    .status(200)
    .json({ message: "Email verified successfully. You can now log in." });
};

// Login (With Verification Gating & JWT Issuance)
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const admin = await adminRepository.findByEmail(email);
  if (!admin) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Block login if email is not verified
  if (!admin.emailVerifiedAt) {
    return res.status(403).json({
      error: "Email not verified.",
      message: "Please verify your email address before logging in.",
      requiresVerification: true,
      email: admin.email,
    });
  }

  const token = jwt.sign(
    { adminId: admin.id, email: admin.email, type: "ADMIN" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return res.status(200).json({
    message: "Admin login successful!",
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  });
};

// Logout
const logout = async (req, res) => {
  // Since JWTs are stateless on the server, client-side removal handles log out.
  return res.status(200).json({ message: "Logged out successfully." });
};

// Resend Verification Code
const resendCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const admin = await adminRepository.findByEmail(email);

  if (!admin) {
    return res.status(404).json({
      message: "Admin not found. Please check your email or register first.",
    });
  }

  if (admin.emailVerifiedAt) {
    return res.status(400).json({ message: "Email already verified" });
  }

  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Minutes from now

  // Invalidate any previous codes so only the newest one stays valid.
  await adminRepository.deleteVerificationTokensByAdminId(admin.id);
  await adminRepository.createVerificationToken({
    token: verificationCode,
    expiresAt,
    adminId: admin.id,
  });

  await sendVerificationEmail(email, verificationCode, admin.name);

  return res
    .status(200)
    .json({ message: "Verification code resent. Please check your email." });
};

// Current Profile
const getMe = async (req, res) => {
  const admin = await adminRepository.findById(req.user.id);

  if (!admin) {
    return res.status(404).json({ message: "Admin not found." });
  }

  return res.status(200).json({
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      emailVerifiedAt: admin.emailVerifiedAt,
      type: req.user.type,
    },
  });
};

module.exports = {
  register,
  verifyEmail,
  login,
  logout,
  resendCode,
  getMe,
};
