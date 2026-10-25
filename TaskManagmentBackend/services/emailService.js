const nodeMailer = require("nodemailer");

const transporter = nodeMailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a stylized HTML verification email to the user.
 * @param {string} toEmail - Recipient email address
 * @param {string} verificationCode - The 6-digit code
 * @param {string} name - User's name for personalization
 */
const sendVerificationEmail = async (
  toEmail,
  verificationCode,
  name = "User",
) => {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f7;
            margin: 0;
            padding: 0;
            color: #333333;
          }
          .email-wrapper {
            width: 100%;
            background-color: #f4f4f7;
            padding: 40px 0;
          }
          .email-content {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
          }
          .email-header {
            background-color: #4f46e5;
            color: #ffffff;
            padding: 24px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
          }
          .email-body {
            padding: 32px;
          }
          .code-box {
            background-color: #f3f4f6;
            border-radius: 6px;
            padding: 16px;
            text-align: center;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 6px;
            color: #4f46e5;
            margin: 24px 0;
          }
          .email-footer {
            background-color: #f9fafb;
            padding: 16px;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
            border-top: 1px solid #e5e7eb;
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-content">
            <div class="email-header">
              Task Management System
            </div>
            <div class="email-body">
              <p>Hello <strong>${name}</strong>,</p>
              <p>Thank you for registering! Please use the verification code below to verify your email address. This code is valid for <strong>10 minutes</strong>.</p>
              
              <div class="code-box">
                ${verificationCode}
              </div>
              
              <p>If you did not request this, please ignore this email.</p>
              <p>Best regards,<br><strong>Task Management Team</strong></p>
            </div>
            <div class="email-footer">
              &copy; 2026 Task Management System. All rights reserved.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from:
      process.env.EMAIL_FROM ||
      '"Task Management System" <no-reply@taskmanagement.com>',
    to: toEmail,
    subject: "Verify You Email Address - Task Management System",
    text: `Hello ${name},\n\nYour verification code is: ${verificationCode}\n\nThis code is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nTask Management Team`,
    html: htmlTemplate,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Verification email sent: %s", info.messageId);
    return true;
  } catch (err) {
    console.error("Error sending verification email:", err);
    throw new Error("Email dispatch failed.", { cause: err });
  }
};

module.exports = {
  sendVerificationEmail,
};
