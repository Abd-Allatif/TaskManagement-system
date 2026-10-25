const prisma = require("../prismaClient");

// Loads a task (excluding soft-deleted ones) and enforces owner-or-admin.
// On success the loaded task is attached to `req.task` and `next()` is called.
const taskOwnerOrAdmin = async (req, res, next) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, deletedAt: null },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const isAdmin = req.user && req.user.type === "ADMIN";
    const isOwner = req.user && task.createdById === req.user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        message: "Forbidden. You can only modify your own tasks.",
      });
    }

    req.task = task;
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  taskOwnerOrAdmin,
};
