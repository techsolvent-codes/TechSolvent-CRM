const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { UserRepo, RoleRepo } = require('../repositories');

/**
 * Verify JWT and attach user + role to req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required', error: { code: 'UNAUTHORIZED' } });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = UserRepo.findById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated', error: { code: 'UNAUTHORIZED' } });
    }
    // Attach full role with permissions
    const role = RoleRepo.findByName(user.role);
    req.user = { ...user, permissions: role ? role.permissions : [] };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token', error: { code: 'TOKEN_INVALID' } });
  }
}

/**
 * Authorize based on required permission(s)
 */
function authorize(...permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated', error: { code: 'UNAUTHORIZED' } });
    }
    // Super Admin has all permissions
    if (req.user.role === 'super_admin') return next();

    const userPerms = req.user.permissions || [];
    const hasAll = permissions.every((p) => userPerms.includes(p));
    if (!hasAll) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permissions: ${permissions.join(', ')}`,
        error: { code: 'FORBIDDEN' },
      });
    }
    next();
  };
}

/**
 * Require one of several roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (req.user.role === 'super_admin') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient role.', error: { code: 'FORBIDDEN' } });
    }
    next();
  };
}

module.exports = { authenticate, authorize, requireRole };
