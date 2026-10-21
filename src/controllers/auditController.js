const { AuditLogRepo } = require('../repositories');
const repo = require('../repositories/jsonRepository');

const auditController = {
  getAll: (req, res) => {
    const { module: mod, userId, startDate, endDate, action } = req.query;
    let logs = AuditLogRepo.findAll();
    if (mod) logs = logs.filter((l) => l.module === mod);
    if (userId) logs = logs.filter((l) => l.userId === userId);
    if (action) logs = logs.filter((l) => l.action === action);
    if (startDate) logs = logs.filter((l) => l.timestamp >= startDate);
    if (endDate) logs = logs.filter((l) => l.timestamp <= endDate);
    logs.sort((a, b) => b.timestamp?.localeCompare(a.timestamp));
    const { data, pagination } = repo.paginate(logs, parseInt(req.query.page) || 1, 50);
    res.json({ success: true, data, pagination });
  },
};

module.exports = auditController;
