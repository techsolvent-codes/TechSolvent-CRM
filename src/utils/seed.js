const bcrypt = require('bcryptjs');
const { UserRepo, RoleRepo, EmployeeRepo, DepartmentRepo, SettingsRepo, ChatGroupRepo, ChatMemberRepo, ProjectTemplateRepo } = require('../repositories');

async function seed() {
  try {
    // ─── Roles & Permissions ─────────────────────────────────────────
    const existingRoles = RoleRepo.findAll();
    if (existingRoles.length === 0) {
      const roles = [
        { name: 'super_admin', displayName: 'Super Admin', permissions: ['*'] },
        { name: 'admin', displayName: 'Admin', permissions: ['employee.read', 'employee.create', 'employee.update', 'employee.delete', 'attendance.read', 'attendance.update', 'leave.read', 'leave.decide', 'leave.delete', 'lead.read', 'lead.create', 'lead.update', 'lead.assign', 'lead.delete', 'proposal.read', 'proposal.create', 'proposal.update', 'proposal.delete', 'client.read', 'client.create', 'client.update', 'client.delete', 'invoice.read', 'invoice.create', 'invoice.update', 'invoice.delete', 'payment.read', 'payment.create', 'payment.update', 'payment.delete', 'expense.read', 'expense.create', 'expense.update', 'expense.approve', 'expense.delete', 'recurring.read', 'recurring.create', 'recurring.update', 'recurring.delete', 'project.read', 'project.create', 'project.update', 'project.delete', 'task.read', 'task.create', 'task.update', 'task.delete', 'department.read', 'department.create', 'department.update', 'department.delete', 'report.view', 'audit.read', 'chat.view', 'chat.create_group', 'chat.manage_group', 'chat.delete_message', 'chat.manage_member'] },
        { name: 'hr', displayName: 'HR Manager', permissions: ['employee.read', 'employee.create', 'employee.update', 'attendance.read', 'attendance.update', 'leave.read', 'leave.decide'] },
        { name: 'finance', displayName: 'Finance', permissions: ['invoice.read', 'invoice.create', 'invoice.update', 'payment.read', 'payment.create', 'expense.read', 'expense.approve', 'report.view'] },
        { name: 'bd_manager', displayName: 'BD Manager', permissions: ['lead.read', 'lead.create', 'lead.update', 'lead.assign', 'lead.delete', 'proposal.read', 'proposal.create', 'proposal.update', 'proposal.send', 'client.read', 'report.view'] },
        { name: 'bd_executive', displayName: 'BD Executive', permissions: ['lead.read', 'lead.create', 'lead.update', 'proposal.read', 'proposal.create', 'client.read'] },
        { name: 'project_manager', displayName: 'Project Manager', permissions: ['project.read', 'project.create', 'project.update', 'task.read', 'task.create', 'task.update', 'task.assign', 'client.read', 'report.view'] },
        { name: 'team_member', displayName: 'Team Member', permissions: ['task.read', 'task.update', 'project.read', 'client.read'] },
        { name: 'client', displayName: 'Client', permissions: ['project.read', 'task.read', 'invoice.read', 'payment.read'] },
      ];
      roles.forEach((r) => RoleRepo.create({ id: `ROLE-${r.name}`, ...r }));
      console.log('[Seed] Roles created');
    }

    // ─── Departments ─────────────────────────────────────────────────
    const existingDepts = DepartmentRepo.findAll();
    if (existingDepts.length === 0) {
      const departments = ['Business Development', 'Sales', 'SEO', 'Social Media', 'Performance Marketing', 'Graphic Design', 'Video', 'Web Development', 'Shopify', 'Custom Development', 'Operations', 'Finance', 'Management'];
      departments.forEach((name) => DepartmentRepo.create({ name }));
      console.log('[Seed] Departments created');
    }

    // ─── Super Admin User ─────────────────────────────────────────────
    const existingAdmin = UserRepo.findByEmail('admin@techsolvent.com');
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('Admin@123', 12);
      const adminUser = UserRepo.create({ id: 'USR-000001', name: 'Super Admin', email: 'admin@techsolvent.com', passwordHash, role: 'super_admin', isActive: true });
      EmployeeRepo.create({ id: 'EMP-000001', userId: adminUser.id, name: 'Super Admin', email: 'admin@techsolvent.com', designation: 'Super Administrator', department: 'Management', status: 'active', employmentType: 'full_time', joiningDate: new Date().toISOString().split('T')[0] });
      console.log('[Seed] Super Admin created: admin@techsolvent.com / Admin@123');
    }

    // ─── Sample Employee ──────────────────────────────────────────────
    const sampleUser = UserRepo.findByEmail('manager@techsolvent.com');
    if (!sampleUser) {
      const passwordHash = await bcrypt.hash('Manager@123', 12);
      const mgrUser = UserRepo.create({ name: 'Rahul Sharma', email: 'manager@techsolvent.com', passwordHash, role: 'project_manager', isActive: true });
      EmployeeRepo.create({ userId: mgrUser.id, name: 'Rahul Sharma', email: 'manager@techsolvent.com', phone: '+91-9876543210', designation: 'Project Manager', department: 'Management', status: 'active', employmentType: 'full_time', joiningDate: '2024-01-15' });

      const bdUser = UserRepo.create({ name: 'Priya Singh', email: 'bd@techsolvent.com', passwordHash: await bcrypt.hash('BD@123', 12), role: 'bd_executive', isActive: true });
      EmployeeRepo.create({ userId: bdUser.id, name: 'Priya Singh', email: 'bd@techsolvent.com', phone: '+91-9876543211', designation: 'BD Executive', department: 'Business Development', status: 'active', employmentType: 'full_time', joiningDate: '2024-03-01' });
      console.log('[Seed] Sample employees created');
    }

    // ─── Settings ─────────────────────────────────────────────────────
    const settings = SettingsRepo.get();
    if (!settings.companyName) {
      SettingsRepo.update({ companyName: 'TECHSOLVENT', companyEmail: 'info@techsolvent.com', companyPhone: '+91-9876543200', timezone: 'Asia/Kolkata', currency: 'INR', gstRate: 18, workingHoursPerDay: 8, lateLoginThresholdMinutes: 30 });
      console.log('[Seed] Default settings created');
    }

    // ─── Default Chat Groups ──────────────────────────────────────────
    const existingGroups = ChatGroupRepo.findAll();
    if (existingGroups.length === 0) {
      const adminEmp = EmployeeRepo.findByUserId('USR-000001');
      const generalGroup = ChatGroupRepo.create({ name: 'General', description: 'General company discussions', type: 'announcement', status: 'active', createdBy: adminEmp?.id });
      if (adminEmp) ChatMemberRepo.create({ groupId: generalGroup.id, employeeId: adminEmp.id, role: 'admin', joinedAt: new Date().toISOString() });

      const mgmtGroup = ChatGroupRepo.create({ name: 'Management', description: 'Management team discussions', type: 'department', status: 'active', createdBy: adminEmp?.id });
      if (adminEmp) ChatMemberRepo.create({ groupId: mgmtGroup.id, employeeId: adminEmp.id, role: 'admin', joinedAt: new Date().toISOString() });
      console.log('[Seed] Default chat groups created');
    }

    console.log('[Seed] Database seeding complete ✓');
  } catch (err) {
    console.error('[Seed] Error:', err.message);
  }
}

seed();
