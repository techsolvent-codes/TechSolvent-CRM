const bcrypt = require('bcryptjs');
const { UserRepo, EmployeeRepo, DepartmentRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const repo = require('../repositories/jsonRepository');

const employeeController = {
  getAll: (req, res) => {
    const employees = EmployeeRepo.findAll().filter((e) => !e.archived);
    const users = UserRepo.findAll();
    const enriched = employees.map((e) => {
      const user = users.find((u) => u.id === e.userId);
      return { ...e, userEmail: user?.email, userRole: user?.role, isActive: user?.isActive };
    });
    res.json({ success: true, data: enriched });
  },

  getById: (req, res) => {
    const emp = EmployeeRepo.findById(req.params.id);
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    const user = UserRepo.findById(emp.userId);
    const { passwordHash, ...safeUser } = user || {};
    res.json({ success: true, data: { ...emp, user: safeUser } });
  },

  create: async (req, res, next) => {
    try {
      const { name, email, phone, designation, department, reportingManager, joiningDate, employmentType, skills, role = 'team_member', password, location = 'Noida / India HQ', workMode = 'on_site', emergencyContact = '', bloodGroup = '' } = req.body;
      if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email are required' });

      if (UserRepo.findByEmail(email)) return res.status(409).json({ success: false, message: 'Email already exists' });

      const passwordHash = await bcrypt.hash(password || 'Techsolvent@123', 12);
      const user = UserRepo.create({ name, email: email.toLowerCase(), passwordHash, role, isActive: true });
      const employee = EmployeeRepo.create({
        userId: user.id,
        name,
        email: email.toLowerCase(),
        phone: phone || '',
        location,
        workMode,
        emergencyContact,
        bloodGroup,
        designation,
        department,
        reportingManager,
        joiningDate,
        employmentType,
        skills: skills || [],
        status: 'active',
        profilePhoto: req.file ? `/uploads/${req.file.filename}` : null
      });

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_EMPLOYEE', module: 'employees', referenceId: employee.id, newValue: employee });
      res.status(201).json({ success: true, message: 'Employee created successfully', data: employee });
    } catch (err) {
      next(err);
    }
  },

  update: (req, res, next) => {
    try {
      const emp = EmployeeRepo.findById(req.params.id);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

      const updateData = { ...req.body };
      if (req.file) updateData.profilePhoto = `/uploads/${req.file.filename}`;
      if (updateData.skills && typeof updateData.skills === 'string') updateData.skills = updateData.skills.split(',');

      const updated = EmployeeRepo.update(req.params.id, updateData);

      // Update user role/email if provided
      if (updateData.role || updateData.email) {
        const userUpdate = {};
        if (updateData.role) userUpdate.role = updateData.role;
        if (updateData.email) { userUpdate.email = updateData.email.toLowerCase(); userUpdate.name = updateData.name || emp.name; }
        UserRepo.update(emp.userId, userUpdate);
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_EMPLOYEE', module: 'employees', referenceId: emp.id, oldValue: emp, newValue: updated });
      res.json({ success: true, message: 'Employee updated', data: updated });
    } catch (err) {
      next(err);
    }
  },

  remove: (req, res, next) => {
    try {
      const emp = EmployeeRepo.findById(req.params.id);
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
      EmployeeRepo.update(req.params.id, { archived: true, status: 'inactive' });
      if (emp.userId) UserRepo.update(emp.userId, { isActive: false });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DEACTIVATE_EMPLOYEE', module: 'employees', referenceId: emp.id });
      res.json({ success: true, message: 'Employee deactivated' });
    } catch (err) {
      next(err);
    }
  },

  search: (req, res) => {
    const { q } = req.query;
    const results = q ? EmployeeRepo.search(q) : EmployeeRepo.findAll();
    res.json({ success: true, data: results });
  },

  // Departments
  getDepartments: (req, res) => {
    res.json({ success: true, data: DepartmentRepo.findAll() });
  },

  createDepartment: (req, res, next) => {
    try {
      const dept = DepartmentRepo.create(req.body);
      res.status(201).json({ success: true, data: dept });
    } catch (err) { next(err); }
  },

  deleteDepartment: (req, res, next) => {
    try {
      const dept = DepartmentRepo.findById(req.params.id);
      if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
      DepartmentRepo.remove(req.params.id);
      res.json({ success: true, message: 'Department deleted successfully' });
    } catch (err) { next(err); }
  },

  // Roles
  getRoles: (req, res) => {
    const { RoleRepo } = require('../repositories');
    res.json({ success: true, data: RoleRepo.findAll() });
  },

  updateRole: (req, res, next) => {
    try {
      const { RoleRepo } = require('../repositories');
      const updated = RoleRepo.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Role not found' });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
};

module.exports = employeeController;
