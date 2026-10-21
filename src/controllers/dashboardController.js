const { LeadRepo, ClientRepo, InvoiceRepo, PaymentRepo, TaskRepo, ProjectRepo, EmployeeRepo, AttendanceRepo, LeaveRepo, EnquiryRepo } = require('../repositories');

const dashboardController = {
  getSummary: (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    // Team
    const employees = EmployeeRepo.findAll().filter((e) => !e.archived && e.status === 'active');
    const todayAttendance = AttendanceRepo.findByDate(today);
    const present = todayAttendance.filter((a) => a.status === 'present' || a.status === 'late').length;
    const late = todayAttendance.filter((a) => a.status === 'late').length;
    const onLeave = LeaveRepo.findAll().filter((l) => l.status === 'approved' && l.startDate <= today && l.endDate >= today).length;
    const absent = employees.length - present - onLeave;

    // Sales
    const leads = LeadRepo.findAll().filter((l) => !l.archived);
    const newLeads = leads.filter((l) => l.createdAt?.startsWith(currentMonth)).length;
    const wonDeals = leads.filter((l) => l.status === 'won').length;
    const expectedRevenue = leads.filter((l) => !['won', 'lost'].includes(l.status)).reduce((s, l) => s + (l.estimatedValue || 0), 0);
    const followUpsToday = leads.filter((l) => l.nextFollowUp?.startsWith(today)).length;

    // Finance
    const payments = PaymentRepo.findAll();
    const invoices = InvoiceRepo.findAll();
    const todayCollections = payments.filter((p) => p.paidAt?.startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0);
    const monthlyRevenue = payments.filter((p) => p.paidAt?.startsWith(currentMonth)).reduce((s, p) => s + (p.amount || 0), 0);
    const pendingPayments = invoices.filter((i) => ['pending', 'sent'].includes(i.status)).reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0);
    const overdueInvoices = invoices.filter((i) => i.dueDate && i.dueDate < today && !['paid', 'cancelled'].includes(i.status)).length;

    // Operations
    const projects = ProjectRepo.findAll().filter((p) => !p.archived);
    const tasks = TaskRepo.findAll().filter((t) => !t.archived);
    const activeProjects = projects.filter((p) => p.status === 'in_progress').length;
    const nearDeadlineProjects = projects.filter((p) => p.endDate && p.endDate >= today && p.endDate <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] && p.status !== 'completed').length;
    const tasksDueToday = tasks.filter((t) => t.dueDate === today && t.status !== 'completed').length;
    const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'completed').length;
    const blockedTasks = tasks.filter((t) => t.status === 'blocked').length;

    // Enquiries (Admin only)
    let enquiriesData = null;
    if (['super_admin', 'admin'].includes(req.user?.role)) {
      const allEnq = EnquiryRepo.findAll() || [];
      enquiriesData = {
        total: allEnq.length,
        new: allEnq.filter((e) => e.status === 'new').length,
      };
    }

    res.json({
      success: true,
      data: {
        team: { total: employees.length, present, late, onLeave, absent: Math.max(0, absent) },
        sales: { newLeads, wonDeals, followUpsToday, expectedRevenue, totalLeads: leads.length, activeLeads: leads.filter((l) => !['won', 'lost'].includes(l.status)).length },
        finance: { todayCollections, monthlyRevenue, pendingPayments, overdueInvoices },
        operations: { activeProjects, nearDeadlineProjects, tasksDueToday, overdueTasks, blockedTasks, totalProjects: projects.length },
        ...(enquiriesData ? { enquiries: enquiriesData } : {}),
      },
    });
  },

  getRecentActivity: (req, res) => {
    const { AuditLogRepo } = require('../repositories');
    const logs = AuditLogRepo.findAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    res.json({ success: true, data: logs });
  },

  getWorkload: (req, res) => {
    const employees = EmployeeRepo.findAll().filter((e) => !e.archived && e.status === 'active');
    const tasks = TaskRepo.findAll().filter((t) => !t.archived && !['completed', 'cancelled'].includes(t.status));
    const workload = employees.map((emp) => {
      const empTasks = tasks.filter((t) => t.assignedTo === emp.id);
      const estimatedHours = empTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
      const overdueTasks = empTasks.filter((t) => t.dueDate && t.dueDate < new Date().toISOString().split('T')[0]).length;
      return { employee: emp, taskCount: empTasks.length, estimatedHours, availableHours: 40, utilization: Math.round((estimatedHours / 40) * 100), overdueTasks };
    });
    res.json({ success: true, data: workload });
  },
};

module.exports = dashboardController;
