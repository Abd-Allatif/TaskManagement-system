const authValidators = require("../middleware/validators/authValidators");
const adminValidators = require("../middleware/validators/adminValidators");
const taskValidators = require("../middleware/validators/taskValidators");
const categoryValidators = require("../middleware/validators/categoryValidators");
const statusValidators = require("../middleware/validators/statusValidators");

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";
const PAST_ISO = new Date(Date.now() - 3600000).toISOString();
const FUTURE_ISO = new Date(Date.now() + 3600000).toISOString();

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Runs the express-validator chains against a body, then invokes the module's
// own `validate` middleware exactly as the routes do.
const runValidation = async (rules, validate, body) => {
  const req = { body };
  const res = mockRes();
  const next = jest.fn();

  for (const rule of rules) {
    await rule.run(req);
  }
  validate(req, res, next);

  return { req, res, next };
};

describe("auth validators", () => {
  it("registerRules rejects a missing name", async () => {
    const { res, next } = await runValidation(
      authValidators.registerRules,
      authValidators.validate,
      { email: "a@b.com", password: "secret123" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("registerRules rejects a short password", async () => {
    const { res } = await runValidation(
      authValidators.registerRules,
      authValidators.validate,
      { name: "Abda", email: "a@b.com", password: "short" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("registerRules rejects an invalid email", async () => {
    const { res } = await runValidation(
      authValidators.registerRules,
      authValidators.validate,
      { name: "Abda", email: "not-an-email", password: "secret123" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("registerRules accepts a valid payload", async () => {
    const { res, next } = await runValidation(
      authValidators.registerRules,
      authValidators.validate,
      { name: "Abda", email: "a@b.com", password: "secret123" }
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("loginRules rejects missing credentials", async () => {
    const { res } = await runValidation(
      authValidators.loginRules,
      authValidators.validate,
      {}
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("admin validators", () => {
  it("adminRegisterRules accepts a valid payload", async () => {
    const { res, next } = await runValidation(
      adminValidators.adminRegisterRules,
      adminValidators.validate,
      { name: "Abda", email: "admin@b.com", password: "secret123" }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("adminRegisterRules rejects a short name", async () => {
    const { res } = await runValidation(
      adminValidators.adminRegisterRules,
      adminValidators.validate,
      { name: "Ab", email: "admin@b.com", password: "secret123" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("adminRegisterRules rejects a short password", async () => {
    const { res } = await runValidation(
      adminValidators.adminRegisterRules,
      adminValidators.validate,
      { name: "Abda", email: "admin@b.com", password: "short" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("adminLoginRules rejects a bad email", async () => {
    const { res } = await runValidation(
      adminValidators.adminLoginRules,
      adminValidators.validate,
      { email: "nope", password: "secret123" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("task validators", () => {
  it("createTaskRules rejects a missing title", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      {}
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules rejects a title longer than 200 chars", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      { title: "x".repeat(201) }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules rejects a deadline in the past", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      { title: "Task", deadline: PAST_ISO }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules rejects a malformed statusId", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      { title: "Task", statusId: "not-a-uuid" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules rejects a non-array categories field", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      { title: "Task", categories: "nope" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules rejects an invalid assignment type", async () => {
    const { res } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      { title: "Task", assignments: [{ assignableType: "ROBOT", assignableId: VALID_UUID }] }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createTaskRules accepts a fully valid payload", async () => {
    const { res, next } = await runValidation(
      taskValidators.createTaskRules,
      taskValidators.validate,
      {
        title: "Task",
        description: "desc",
        deadline: FUTURE_ISO,
        statusId: VALID_UUID,
        parentTaskId: VALID_UUID,
        categories: [VALID_UUID],
        assignments: [{ assignableType: "USER", assignableId: VALID_UUID }],
      }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("updateTaskRules allows a partial update (only endFlag)", async () => {
    const { res, next } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      { endFlag: true }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("updateTaskRules rejects an empty title if provided", async () => {
    const { res } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      { title: "   " }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("updateTaskRules rejects a non-boolean endFlag", async () => {
    const { res } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      { endFlag: "yes" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("updateTaskRules rejects a non-array categories field", async () => {
    const { res } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      { categories: "nope" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("updateTaskRules rejects an invalid assignment type", async () => {
    const { res } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      { assignments: [{ assignableType: "ROBOT", assignableId: VALID_UUID }] }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("updateTaskRules accepts relation updates", async () => {
    const { res, next } = await runValidation(
      taskValidators.updateTaskRules,
      taskValidators.validate,
      {
        categories: [VALID_UUID],
        assignments: [{ assignableType: "ADMIN", assignableId: VALID_UUID }],
      }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("category validators", () => {
  it("createCategoryRules rejects a missing name", async () => {
    const { res } = await runValidation(
      categoryValidators.createCategoryRules,
      categoryValidators.validate,
      {}
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createCategoryRules rejects a name longer than 100 chars", async () => {
    const { res } = await runValidation(
      categoryValidators.createCategoryRules,
      categoryValidators.validate,
      { name: "x".repeat(101) }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createCategoryRules rejects a non-string color", async () => {
    const { res } = await runValidation(
      categoryValidators.createCategoryRules,
      categoryValidators.validate,
      { name: "Work", color: 123 }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("createCategoryRules accepts name only", async () => {
    const { res, next } = await runValidation(
      categoryValidators.createCategoryRules,
      categoryValidators.validate,
      { name: "Work" }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("updateCategoryRules allows a partial update (only color)", async () => {
    const { res, next } = await runValidation(
      categoryValidators.updateCategoryRules,
      categoryValidators.validate,
      { color: "#fff" }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("resend code validators", () => {
  it("auth resendCodeRules rejects a missing email", async () => {
    const { res } = await runValidation(
      authValidators.resendCodeRules,
      authValidators.validate,
      {}
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("auth resendCodeRules rejects an invalid email", async () => {
    const { res } = await runValidation(
      authValidators.resendCodeRules,
      authValidators.validate,
      { email: "nope" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("auth resendCodeRules accepts a valid email", async () => {
    const { res, next } = await runValidation(
      authValidators.resendCodeRules,
      authValidators.validate,
      { email: "a@b.com" }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("admin resendCodeRules rejects a missing email", async () => {
    const { res } = await runValidation(
      adminValidators.resendCodeRules,
      adminValidators.validate,
      {}
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("status validators", () => {
  it("statusRules rejects a missing code", async () => {
    const { res } = await runValidation(
      statusValidators.statusRules,
      statusValidators.validate,
      { label: "Pending" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("statusRules rejects a missing label", async () => {
    const { res } = await runValidation(
      statusValidators.statusRules,
      statusValidators.validate,
      { code: "PENDING" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("statusRules rejects an over-long code", async () => {
    const { res } = await runValidation(
      statusValidators.statusRules,
      statusValidators.validate,
      { code: "x".repeat(51), label: "Pending" }
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("statusRules accepts a valid payload", async () => {
    const { res, next } = await runValidation(
      statusValidators.statusRules,
      statusValidators.validate,
      { code: "PENDING", label: "Pending" }
    );
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
