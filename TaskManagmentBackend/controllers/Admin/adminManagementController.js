const adminRepository = require("../../repository/Admin/adminRepository");
const statusRepository = require("../../repository/Status/statusRepository");

// Listing

const getUsers = async (req, res) => {
  const users = await adminRepository.findAllUsers();

  return res.status(200).json({ users });
};

const getAdmins = async (req, res) => {
  const admins = await adminRepository.findAllAdmins();

  return res.status(200).json({ admins });
};

const getOverview = async (req, res) => {
  const overview = await adminRepository.getOverview();

  return res.status(200).json({ overview });
};

// Status management

const createStatus = async (req, res) => {
  const { code, label } = req.body;

  const existing = await statusRepository.getStatusByCode(code);

  if (existing) {
    return res.status(400).json({ message: "Status code already exists" });
  }

  const status = await statusRepository.createStatus({ code, label });

  return res.status(201).json({ message: "Status created successfully", status });
};

const updateStatus = async (req, res) => {
  const { code, label } = req.body;

  const status = await statusRepository.updateStatus(req.params.id, {
    code,
    label,
  });

  return res.status(200).json({ message: "Status updated successfully", status });
};

const deleteStatus = async (req, res) => {
  await statusRepository.deleteStatus(req.params.id);

  return res.status(200).json({ message: "Status deleted successfully" });
};

module.exports = {
  getUsers,
  getAdmins,
  getOverview,
  createStatus,
  updateStatus,
  deleteStatus,
};
