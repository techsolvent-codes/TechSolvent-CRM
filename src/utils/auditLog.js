const { AuditLogRepo } = require('../repositories');

/**
 * Centralized audit logger. Call this after any state-changing operation.
 */
function auditLog({ userId, userName, action, module, referenceId, referenceType, oldValue, newValue, ipAddress }) {
  try {
    AuditLogRepo.create({
      userId,
      userName,
      action,
      module,
      referenceId,
      referenceType,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      ipAddress: ipAddress || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
}

module.exports = { auditLog };
