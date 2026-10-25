const statusRepository = require("../../repository/Status/statusRepository");

const getStatuses = async (req, res) => {
  const statuses = await statusRepository.getStatuses();

  return res.status(200).json({ statuses });
};

const getStatusById = async (req, res) => {
  const status = await statusRepository.getStatusById(req.params.id);

  if (!status) {
    return res.status(404).json({ message: "Status not found" });
  }

  return res.status(200).json({ status });
};

module.exports = {
  getStatuses,
  getStatusById,
};
