const { LeadRepo, ClientRepo, InvoiceRepo, PaymentRepo, TaskRepo, ProjectRepo, EmployeeRepo, AttendanceRepo, LeaveRepo } = require('../repositories');

function getMonthRange(monthsBack = 6) {
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

const reportsController = {
  getSalesReport: (req, res) => {
    const months = getMonthRange(6);
    const leads = LeadRepo.findAll();
    const byMonth = months.map((m) => ({
      month: m,
      leadsGenerated: leads.filter((l) => l.createdAt?.startsWith(m)).length,
      dealsWon: leads.filter((l) => l.status === 'won' && l.updatedAt?.startsWith(m)).length,
      dealsLost: leads.filter((l) => l.status === 'lost' && l.updatedAt?.startsWith(m)).length,
    }));

    const bySource = {};
    leads.forEach((l) => { if (l.source) bySource[l.source] = (bySource[l.source] || 0) + 1; });

    const byOwner = {};
    leads.forEach((l) => { if (l.assignedToName) byOwner[l.assignedToName] = (byOwner[l.assignedToName] || 0) + 1; });

    res.json({ success: true, data: { byMonth, bySource, byOwner, totalLeads: leads.length, conversionRate: leads.length ? Math.round((leads.filter((l) => l.status === 'won').length / leads.length) * 100) : 0 } });
  },

  getFinanceReport: (req, res) => {
    const months = getMonthRange(6);
    const payments = PaymentRepo.findAll();
    const invoices = InvoiceRepo.findAll();
    const byMonth = months.map((m) => ({
      month: m,
      revenue: payments.filter((p) => p.paidAt?.startsWith(m)).reduce((s, p) => s + (p.amount || 0), 0),
      invoicesCreated: invoices.filter((i) => i.createdAt?.startsWith(m)).length,
    }));

    const today = new Date().toISOString().split('T')[0];
    const outstanding = invoices.filter((i) => !['paid', 'cancelled'].includes(i.status)).reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0);
    const overdue = invoices.filter((i) => i.dueDate && i.dueDate < today && !['paid', 'cancelled'].includes(i.status));

    res.json({ success: true, data: { byMonth, outstanding, overdueCount: overdue.length, overdueAmount: overdue.reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0) } });
  },

  getEmployeeReport: (req, res) => {
    const employees = EmployeeRepo.findAll().filter((e) => !e.archived);
    const attendance = AttendanceRepo.findAll();
    const tasks = TaskRepo.findAll();
    const currentMonth = new Date().toISOString().slice(0, 7);

    const report = employees.map((emp) => {
      const monthAttendance = attendance.filter((a) => a.employeeId === emp.id && a.date?.startsWith(currentMonth));
      const totalHours = monthAttendance.reduce((s, a) => s + (a.workingHours || 0), 0);
      const empTasks = tasks.filter((t) => t.assignedTo === emp.id);
      return { employee: emp, daysPresent: monthAttendance.filter((a) => a.loginTime).length, totalHours: Math.round(totalHours * 100) / 100, tasksAssigned: empTasks.length, tasksCompleted: empTasks.filter((t) => t.status === 'completed').length, tasksOverdue: empTasks.filter((t) => t.dueDate && t.dueDate < new Date().toISOString().split('T')[0] && t.status !== 'completed').length };
    });

    res.json({ success: true, data: report });
  },

  getProjectReport: (req, res) => {
    const projects = ProjectRepo.findAll().filter((p) => !p.archived);
    const tasks = TaskRepo.findAll();
    const report = projects.map((p) => {
      const pTasks = tasks.filter((t) => t.projectId === p.id);
      const completedTasks = pTasks.filter((t) => t.status === 'completed').length;
      const progress = pTasks.length ? Math.round((completedTasks / pTasks.length) * 100) : 0;
      return { ...p, totalTasks: pTasks.length, completedTasks, progress };
    });
    const byStatus = {};
    projects.forEach((p) => { byStatus[p.status] = (byStatus[p.status] || 0) + 1; });
    res.json({ success: true, data: { projects: report, byStatus } });
  },
};

module.exports = reportsController;
