const mockSendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const { sendVerificationEmail } = require("../services/emailService");

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EMAIL_FROM =
    "Task Management System <no-reply@taskmanagement.com>";
  mockSendMail.mockResolvedValue({ messageId: "msg-1" });
});

describe("sendVerificationEmail", () => {
  it("sends the code with a 10 minute validity notice", async () => {
    await sendVerificationEmail("user@example.com", "123456", "Abd");

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("user@example.com");
    expect(mail.html).toContain("123456");
    expect(mail.html).toContain("10 minutes");
    expect(mail.text).toContain("10 minutes");
    expect(mail.html).not.toContain("15 minutes");
    expect(mail.text).not.toContain("15 minutes");
  });

  it("personalises the email with the provided name", async () => {
    await sendVerificationEmail("user@example.com", "654321", "Abda");

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.html).toContain("Abda");
  });

  it("throws a descriptive error when the transporter fails", async () => {
    mockSendMail.mockRejectedValue(new Error("smtp down"));

    await expect(
      sendVerificationEmail("user@example.com", "123456")
    ).rejects.toThrow("Email dispatch failed.");
  });
});
