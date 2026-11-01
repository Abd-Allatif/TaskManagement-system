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

  // Validate category IDs exist **in this workspace**
  const validCategoryIds = await taskRepository.findExistingCategoryIds(
    req.workspace.id,
    categories
  );
  const invalidCategories = (categories || []).filter(
    (id) => !validCategoryIds.includes(id)
  );
  if (invalidCategories.length > 0) {
    return res.status(400).json({
      message: `Invalid category IDs: ${invalidCategories.join(", ")}`,
    });
  }

  // Validate assignment IDs exist (TYPE:id pairs, so a USER id pointing at an
  // admin record is rejected). Assignees must be members of this workspace.
  const validAssignables = await taskRepository.findExistingAssignables(
    assignments,
    req.workspace.id
  );
  const invalidAssignments = (assignments || [])
    .filter(
      (a) => !validAssignables.includes(`${a.assignableType}:${a.assignableId}`)
    );

  if (invalidAssignments.length > 0) {
    return res.status(400).json({
      message: `Invalid assignable IDs: ${invalidAssignments
        .map((a) => a.assignableId)
        .join(", ")}`,
    });
  }

  // Subtask: the parent must exist, be alive, live in this workspace, and be
  // a root task
  if (parentTaskId) {
    const parent = await taskRepository.findExistingParentTask(
      req.workspace.id,
      parentTaskId
    );
    if (!parent) {
      return res.status(400).json({
        message:
          "Invalid parentTaskId: parent not found, is deleted, or is itself a subtask",
      });
    }
  }

  const task = await taskRepository.createTask({
    // Every task lives in exactly one workspace; creation targets the
    // resolved one (sudo-mode admins must also have sent the header).
    workspaceId: req.workspace.id,
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

// Read single — the middleware chain loads the task and enforces isolation
const getTaskById = async (req, res) => {
  return res.status(200).json({ task: req.task });
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

  // Workspace isolation: members only see their resolved workspace; a
  // platform admin without a workspace header sweeps across all workspaces.
  const workspaceId = req.isPlatformAdmin && !req.workspace
    ? undefined
    : req.workspace.id;

  const filters = {
    workspaceId,
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
    const validCategoryIds = await taskRepository.findExistingCategoryIds(
      req.task.workspaceId,
      categories
    );
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
    const validAssignables = await taskRepository.findExistingAssignables(
      assignments,
      req.task.workspaceId
    );
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

  // Subtask: parent must exist, be alive, be a root task, be not the task itself,
  // and live in the same workspace (isolation)
  if (parentTaskId !== undefined && parentTaskId !== null) {
    if (parentTaskId === req.params.id) {
      return res.status(400).json({ message: "A task cannot be its own parent" });
    }

    const parent = await taskRepository.findExistingParentTask(
      req.task.workspaceId,
      parentTaskId
    );
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
