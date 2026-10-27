const taskRepository = require("../../repository/Task/taskRepository");

// Create
const createTask = async (req, res) => {
  const {
    title,
    description,
    deadline,
    statusId,
    parentTaskId,
    categories,
    assignments,
  } = req.body;

  // Default status if not provided
  const resolvedStatusId =
    statusId || (await taskRepository.getStatusByCode("PENDING"))?.id;

  if (!resolvedStatusId) {
    return res.status(500).json({
      message: "Default status not found. Please run the seed script.",
    });
  }

  // Validate category IDs exist
  const validCategoryIds = await taskRepository.findExistingCategoryIds(categories);
  const invalidCategories = (categories || []).filter(
    (id) => !validCategoryIds.includes(id)
  );
  if (invalidCategories.length > 0) {
    return res.status(400).json({
      message: `Invalid category IDs: ${invalidCategories.join(", ")}`,
    });
  }

  // Validate assignment IDs exist (TYPE:id pairs, so a USER id pointing at an
  // admin record is rejected)
  const validAssignables = await taskRepository.findExistingAssignables(assignments);
  const invalidAssignments = (assignments || []).filter(
    (a) => !validAssignables.includes(`${a.assignableType}:${a.assignableId}`)
  );
  if (invalidAssignments.length > 0) {
    return res.status(400).json({
      message: `Invalid assignable IDs: ${invalidAssignments
        .map((a) => a.assignableId)
        .join(", ")}`,
    });
  }

  // Subtask: the parent must exist, be alive and be a root task
  if (parentTaskId) {
    const parent = await taskRepository.findExistingParentTask(parentTaskId);
    if (!parent) {
      return res.status(400).json({
        message:
          "Invalid parentTaskId: parent not found, is deleted, or is itself a subtask",
      });
    }
  }

  const task = await taskRepository.createTask({
    title,
    description,
    deadline,
    statusId: resolvedStatusId,
    parentTaskId,
    categories: categories || [],
    assignments: assignments || [],
    createdBy: { type: req.user.type, id: req.user.id },
  });

  return res.status(201).json({ message: "Task created successfully", task });
};

// Read single
const getTaskById = async (req, res) => {
  const task = await taskRepository.getTaskById(req.params.id);

  if (!task) {
    return res.status(404).json({ message: "Task not found" });
  }

  return res.status(200).json({ task });
};

// Read list
const getTasks = async (req, res) => {
  const {
    statusId,
    createdById,
    createdByType,
    endFlag,
    search,
    parentTaskId,
    page,
    limit,
    sortBy,
    sortOrder,
  } = req.query;

  const filters = {
    ...(statusId && { statusId }),
    ...(createdById && { createdById, createdByType }),
    ...(endFlag !== undefined && { endFlag: endFlag === "true" }),
    ...(parentTaskId && { parentTaskId }),
    ...(search && { search }),
    ...(page && { page }),
    ...(limit && { limit }),
    ...(sortBy && { sortBy }),
    ...(sortOrder && { sortOrder }),
  };

  const result = await taskRepository.getTasks(filters);

  return res.status(200).json({
    tasks: result.tasks,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

// Update
const updateTask = async (req, res) => {
  const {
    title,
    description,
    deadline,
    statusId,
    parentTaskId,
    endFlag,
    categories,
    assignments,
  } = req.body;

  // Validate category IDs when relations are being replaced
  if (categories !== undefined) {
    const validCategoryIds = await taskRepository.findExistingCategoryIds(categories);
    const invalidCategories = categories.filter(
      (id) => !validCategoryIds.includes(id)
    );
    if (invalidCategories.length > 0) {
      return res.status(400).json({
        message: `Invalid category IDs: ${invalidCategories.join(", ")}`,
      });
    }
  }

  // Validate assignment IDs when relations are being replaced
  if (assignments !== undefined) {
    const validAssignables = await taskRepository.findExistingAssignables(assignments);
    const invalidAssignments = assignments.filter(
      (a) => !validAssignables.includes(`${a.assignableType}:${a.assignableId}`)
    );
    if (invalidAssignments.length > 0) {
      return res.status(400).json({
        message: `Invalid assignable IDs: ${invalidAssignments
          .map((a) => a.assignableId)
          .join(", ")}`,
      });
    }
  }

  // Subtask: parent must exist, be alive, be a root task, and not be the task itself
  if (parentTaskId !== undefined && parentTaskId !== null) {
    if (parentTaskId === req.params.id) {
      return res.status(400).json({ message: "A task cannot be its own parent" });
    }

    const parent = await taskRepository.findExistingParentTask(parentTaskId);
    if (!parent) {
      return res.status(400).json({
        message:
          "Invalid parentTaskId: parent not found, is deleted, or is itself a subtask",
      });
    }
  }

  const task = await taskRepository.updateTask(req.params.id, {
    title,
    description,
    deadline,
    statusId,
    parentTaskId,
    endFlag,
    categories,
    assignments,
  });

  return res.status(200).json({ message: "Task updated successfully", task });
};

// Soft Delete
const deleteTask = async (req, res) => {
  await taskRepository.deleteTask(req.params.id);

  return res.status(200).json({ message: "Task deleted successfully" });
};

module.exports = {
  createTask,
  getTaskById,
  getTasks,
  updateTask,
  deleteTask,
};
