const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { UserRepo, EmployeeRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');

function signToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

const authController = {
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }
      const user = UserRepo.findByEmail(email.toLowerCase().trim());
      if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      if (!user.isActive) return res.status(401).json({ success: false, message: 'Account is deactivated' });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      const token = signToken(user.id);
      const employee = EmployeeRepo.findByUserId(user.id);

      auditLog({ userId: user.id, userName: user.name, action: 'LOGIN', module: 'auth', ipAddress: req.ip });

      const { passwordHash, ...safeUser } = user;
      res.json({
        success: true,
        message: 'Login successful',
        data: { token, user: safeUser, employee },
      });
    } catch (err) {
      next(err);
    }
  },

  logout: (req, res) => {
    auditLog({ userId: req.user?.id, userName: req.user?.name, action: 'LOGOUT', module: 'auth' });
    res.json({ success: true, message: 'Logged out successfully' });
  },

  me: (req, res) => {
    const { passwordHash, ...safeUser } = req.user;
    const employee = EmployeeRepo.findByUserId(req.user.id);
    res.json({ success: true, data: { user: safeUser, employee } });
  },

  changePassword: async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Both current and new password are required' });
      }
      const user = UserRepo.findById(req.user.id);
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      if (newPassword.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

      const passwordHash = await bcrypt.hash(newPassword, 12);
      UserRepo.update(req.user.id, { passwordHash });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CHANGE_PASSWORD', module: 'auth' });
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = authController;
