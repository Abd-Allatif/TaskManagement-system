const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../../services/emailService");
const authRepository = require("../../repository/Authentication/authRepository");

// Register
const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({
        message: "Please Provide all Required Fields (Name, Email, Password)",
      });
  }

  const existingUser = await authRepository.findByEmail(email);

  if (existingUser) {
    return res.status(400).json({ message: "User Email Already Exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await authRepository.createUser({
    name,
    email,
    password: hashedPassword,
  });

  const verfificationCode = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Minutes from now

  await authRepository.createVerificationToken({
    token: verfificationCode,
    expiresAt,
    userId: newUser.id,
  });

  await sendVerificationEmail(email, verfificationCode);

  return res
    .status(201)
    .json({
      message:
        "Registration Successfull Please Check You Email for Verification Code",
      userId: newUser.id,
    });
};

// Verify Email
const verifyEmail = async (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res
      .status(400)
      .json({ message: "Email and Verification Code are Required" });
  }

  const user = await authRepository.findByEmailWithTokens(email);

  if (!user) {
    return res
      .status(404)
      .json({
        message: "User Not Found Please Check Your Email, or Register First",
      });
  }

  if (user.emailVerifiedAt) {
    return res.status(400).json({ message: "Email Already Verified" });
  }

  const isValidToken = user.verificationTokens.find(
    (t) => t.token === code && t.expiresAt > new Date(),
  );

  if (!isValidToken) {
    return res
      .status(400)
      .json({ message: "Invalid or Expired Verification Code" });
  }

  // Update user's verification timestamp and drop/delete the token safely via transaction
  await authRepository.consumeVerificationToken(user.id, isValidToken.id);

  return res
    .status(200)
    .json({ message: "Email verified successfully. You can now log in." });
};

// 3. LOGIN (With Verification Gating & JWT Issuance)
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = await authRepository.findByEmail(email);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Block login if email is not verified
  if (!user.emailVerifiedAt) {
    return res.status(403).json({
      error: "Email not verified.",
      message: "Please verify your email address before logging in.",
      requiresVerification: true,
      email: user.email,
    });
  }

  // CREATE AND ASSIGN JWT TOKEN HERE
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  return res.status(200).json({
    message: "Login successful!",
    token, // Return token to client so they can use it with your verifyToken middleware
    user: { id: user.id, name: user.name, email: user.email },
  });
};

// 4. LOGOUT
const logout = async (req, res) => {
  // Since JWTs are stateless on the server, client-side removal handles log out.
  return res.status(200).json({ message: "Logged out successfully." });
};

// 5. RESEND VERIFICATION CODE
const resendCode = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await authRepository.findByEmail(email);

  if (!user) {
    return res
      .status(404)
      .json({ message: "User Not Found Please Check Your Email, or Register First" });
  }

  if (user.emailVerifiedAt) {
    return res.status(400).json({ message: "Email Already Verified" });
  }

  const verificationCode = Math.floor(
    100000 + Math.random() * 900000,
  ).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Minutes from now

  // Invalidate any previous codes so only the newest one stays valid.
  await authRepository.deleteVerificationTokensByUserId(user.id);
  await authRepository.createVerificationToken({
    token: verificationCode,
    expiresAt,
    userId: user.id,
  });

  await sendVerificationEmail(email, verificationCode, user.name);

  return res
    .status(200)
    .json({ message: "Verification Code Resent Please Check Your Email" });
};

// 6. CURRENT PROFILE
const getMe = async (req, res) => {
  const user = await authRepository.findById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User Not Found" });
  }

  return res.status(200).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
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
