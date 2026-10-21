const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const config = require('../config/config');

const { authenticate, authorize, requireRole } = require('../middleware/auth');
const authController = require('../controllers/authController');
const employeeController = require('../controllers/employeeController');
const attendanceController = require('../controllers/attendanceController');
const leaveController = require('../controllers/leaveController');
const leadController = require('../controllers/leadController');
const proposalController = require('../controllers/proposalController');
const clientController = require('../controllers/clientController');
const financeController = require('../controllers/financeController');
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const notificationController = require('../controllers/notificationController');
const dashboardController = require('../controllers/dashboardController');
const reportsController = require('../controllers/reportsController');
const searchController = require('../controllers/searchController');
const auditController = require('../controllers/auditController');
const chatController = require('../controllers/chatController');
const enquiryController = require('../controllers/enquiryController');
const { AuditLogRepo, DocumentRepo } = require('../repositories');

// ─── File Upload Config ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Auth ────────────────────────────────────────────────────────
router.post('/auth/login', authController.login);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.me);
router.post('/auth/change-password', authenticate, authController.changePassword);

// ─── Employees ───────────────────────────────────────────────────
router.get('/employees', authenticate, employeeController.getAll);
router.get('/employees/search', authenticate, employeeController.search);
router.get('/employees/:id', authenticate, employeeController.getById);
router.post('/employees', authenticate, requireRole('super_admin', 'admin', 'hr'), upload.single('profilePhoto'), employeeController.create);
router.put('/employees/:id', authenticate, requireRole('super_admin', 'admin', 'hr'), upload.single('profilePhoto'), employeeController.update);
router.delete('/employees/:id', authenticate, requireRole('super_admin', 'admin'), employeeController.remove);

// Departments & Roles
router.get('/departments', authenticate, employeeController.getDepartments);
router.post('/departments', authenticate, requireRole('super_admin', 'admin'), employeeController.createDepartment);
router.delete('/departments/:id', authenticate, requireRole('super_admin', 'admin'), employeeController.deleteDepartment);
router.get('/roles', authenticate, employeeController.getRoles);
router.put('/roles/:id', authenticate, requireRole('super_admin'), employeeController.updateRole);

// ─── Attendance ───────────────────────────────────────────────────
router.post('/attendance/check-in', authenticate, attendanceController.checkIn);
router.post('/attendance/check-out', authenticate, attendanceController.checkOut);
router.post('/attendance/break/start', authenticate, attendanceController.startBreak);
router.post('/attendance/break/end', authenticate, attendanceController.endBreak);
router.get('/attendance/report', authenticate, attendanceController.getReport);
router.get('/attendance', authenticate, attendanceController.getAll);
router.get('/attendance/my', authenticate, attendanceController.getMyAttendance);
router.put('/attendance/:id', authenticate, requireRole('super_admin', 'admin', 'hr'), attendanceController.correct);

// ─── Leave ───────────────────────────────────────────────────────
router.post('/leaves', authenticate, leaveController.apply);
router.get('/leaves', authenticate, leaveController.getAll);
router.get('/leaves/my', authenticate, leaveController.getMyLeaves);
router.get('/leaves/balance', authenticate, leaveController.getBalance);
router.put('/leaves/:id/decide', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.decide);

// Holidays
router.get('/holidays', authenticate, leaveController.getHolidays);
router.post('/holidays', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.addHoliday);
router.delete('/holidays/:id', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.removeHoliday);

// Leave Types
router.get('/leave-types', authenticate, leaveController.getLeaveTypes);
router.post('/leave-types', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.addLeaveType);
router.put('/leave-types/:id', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.updateLeaveType);
router.delete('/leave-types/:id', authenticate, requireRole('super_admin', 'admin', 'hr'), leaveController.removeLeaveType);

// ─── Leads ───────────────────────────────────────────────────────
router.get('/leads', authenticate, leadController.getAll);
router.get('/leads/:id', authenticate, leadController.getById);
router.post('/leads', authenticate, leadController.create);
router.put('/leads/:id', authenticate, leadController.update);
router.delete('/leads/:id', authenticate, requireRole('super_admin', 'admin', 'bd_manager'), leadController.delete);
router.post('/leads/:id/assign', authenticate, leadController.assign);
router.post('/leads/:id/activities', authenticate, leadController.addActivity);

// ─── Proposals ───────────────────────────────────────────────────
router.get('/proposals', authenticate, proposalController.getAll);
router.get('/proposals/:id', authenticate, proposalController.getById);
router.post('/proposals', authenticate, proposalController.create);
router.put('/proposals/:id', authenticate, proposalController.update);
router.delete('/proposals/:id', authenticate, requireRole('super_admin', 'admin', 'bd_manager'), proposalController.delete);
router.post('/proposals/:id/send', authenticate, proposalController.send);
router.put('/proposals/:id/status', authenticate, proposalController.updateStatus);

// ─── Clients ─────────────────────────────────────────────────────
router.get('/clients', authenticate, clientController.getAll);
router.get('/clients/:id', authenticate, clientController.getById);
router.post('/clients', authenticate, clientController.create);
router.put('/clients/:id', authenticate, clientController.update);
router.delete('/clients/:id', authenticate, requireRole('super_admin', 'admin', 'bd_manager'), clientController.delete);
router.post('/clients/:id/activities', authenticate, clientController.addActivity);

// ─── Finance — Invoices ───────────────────────────────────────────
router.get('/invoices', authenticate, financeController.getAllInvoices);
router.get('/invoices/:id', authenticate, financeController.getInvoiceById);
router.post('/invoices', authenticate, financeController.createInvoice);
router.put('/invoices/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.updateInvoice);
router.delete('/invoices/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.deleteInvoice);
router.post('/invoices/:id/send', authenticate, financeController.sendInvoice);

// Finance — Payments
router.get('/payments', authenticate, financeController.getAllPayments);
router.post('/payments', authenticate, financeController.recordPayment);
router.put('/payments/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.updatePayment);
router.delete('/payments/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.deletePayment);

// Finance — Expenses
router.get('/expenses', authenticate, financeController.getAllExpenses);
router.post('/expenses', authenticate, upload.single('receipt'), financeController.createExpense);
router.put('/expenses/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.updateExpense);
router.delete('/expenses/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.deleteExpense);
router.put('/expenses/:id/approve', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.approveExpense);

// Finance — Recurring Services
router.get('/recurring-services', authenticate, financeController.getAllRecurring);
router.post('/recurring-services', authenticate, financeController.createRecurring);
router.post('/recurring-services/generate-due', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.generateDueRecurring);
router.put('/recurring-services/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.updateRecurring);
router.delete('/recurring-services/:id', authenticate, requireRole('super_admin', 'admin', 'finance'), financeController.deleteRecurring);

// Finance Summary
router.get('/finance/summary', authenticate, financeController.getSummary);

// ─── Projects ─────────────────────────────────────────────────────
router.get('/projects', authenticate, projectController.getAll);
router.get('/projects/templates', authenticate, projectController.getTemplates);
router.get('/projects/:id', authenticate, projectController.getById);
router.post('/projects', authenticate, projectController.create);
router.put('/projects/:id', authenticate, projectController.update);
router.delete('/projects/:id', authenticate, requireRole('super_admin', 'admin', 'project_manager'), projectController.delete);
router.post('/projects/:id/milestones', authenticate, projectController.addMilestone);

// ─── Tasks ───────────────────────────────────────────────────────
router.get('/tasks', authenticate, taskController.getAll);
router.get('/tasks/my', authenticate, taskController.getMyTasks);
router.get('/tasks/:id', authenticate, taskController.getById);
router.post('/tasks', authenticate, taskController.create);
router.put('/tasks/:id', authenticate, taskController.update);
router.delete('/tasks/:id', authenticate, taskController.delete);
router.post('/tasks/:id/comments', authenticate, taskController.addComment);
router.post('/tasks/:id/attachments', authenticate, upload.single('file'), taskController.addAttachment);

// ─── Notifications ───────────────────────────────────────────────
router.get('/notifications', authenticate, notificationController.getMyNotifications);
router.get('/notifications/unread-count', authenticate, notificationController.getUnreadCount);
router.put('/notifications/:id/read', authenticate, notificationController.markRead);
router.put('/notifications/mark-all-read', authenticate, notificationController.markAllRead);
router.get('/notifications/vapid-key', authenticate, notificationController.getVapidPublicKey);
router.post('/notifications/push-subscribe', authenticate, notificationController.subscribePush);
router.post('/notifications/push-unsubscribe', authenticate, notificationController.unsubscribePush);
router.post('/notifications/test-push', authenticate, notificationController.testPush);

// ─── Dashboard ───────────────────────────────────────────────────
router.get('/dashboard/summary', authenticate, dashboardController.getSummary);
router.get('/dashboard/activity', authenticate, dashboardController.getRecentActivity);
router.get('/dashboard/workload', authenticate, dashboardController.getWorkload);

// ─── Reports ─────────────────────────────────────────────────────
router.get('/reports/sales', authenticate, reportsController.getSalesReport);
router.get('/reports/finance', authenticate, reportsController.getFinanceReport);
router.get('/reports/employees', authenticate, reportsController.getEmployeeReport);
router.get('/reports/projects', authenticate, reportsController.getProjectReport);

// ─── Search ──────────────────────────────────────────────────────
router.get('/search', authenticate, searchController.globalSearch);

// ─── Audit Logs ──────────────────────────────────────────────────
router.get('/audit-logs', authenticate, requireRole('super_admin', 'admin'), auditController.getAll);

// ─── Documents ───────────────────────────────────────────────────
router.post('/documents', authenticate, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const doc = DocumentRepo.create({ fileName: req.file.originalname, fileUrl: `/uploads/${req.file.filename}`, fileSize: req.file.size, fileType: req.file.mimetype, referenceId: req.body.referenceId, referenceType: req.body.referenceType, category: req.body.category, uploadedBy: req.user.id, uploadedByName: req.user.name });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
});
router.get('/documents', authenticate, (req, res) => {
  const { referenceId, referenceType } = req.query;
  let docs = DocumentRepo.findAll();
  if (referenceId) docs = docs.filter((d) => d.referenceId === referenceId);
  if (referenceType) docs = docs.filter((d) => d.referenceType === referenceType);
  res.json({ success: true, data: docs });
});

// ─── Settings ────────────────────────────────────────────────────
router.get('/settings', authenticate, (req, res) => {
  const { SettingsRepo } = require('../repositories');
  res.json({ success: true, data: SettingsRepo.get() });
});
router.put('/settings', authenticate, requireRole('super_admin', 'admin'), (req, res, next) => {
  try {
    const { SettingsRepo } = require('../repositories');
    const updated = SettingsRepo.update(req.body);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ─── Chat — Unread & Global ──────────────────────────────────────
router.get('/chat/unread-count', authenticate, chatController.getUnreadCount);

// ─── Chat — Groups ────────────────────────────────────────────────
router.get('/chat/groups', authenticate, chatController.getGroups);
router.post('/chat/groups', authenticate, requireRole('super_admin', 'admin'), chatController.createGroup);
router.get('/chat/groups/:groupId/messages', authenticate, chatController.getGroupMessages);
router.post('/chat/groups/:groupId/messages', authenticate, upload.single('file'), chatController.sendGroupMessage);
router.put('/chat/groups/:groupId/read', authenticate, chatController.markGroupRead);
router.put('/chat/messages/:messageId', authenticate, chatController.editMessage);
router.delete('/chat/messages/:messageId', authenticate, chatController.deleteMessage);
router.post('/chat/messages/:messageId/react', authenticate, chatController.reactToMessage);
router.get('/chat/groups/:groupId/members', authenticate, chatController.getGroupMembers);
router.post('/chat/groups/:groupId/members', authenticate, chatController.addGroupMember);
router.put('/chat/groups/:groupId/members/:employeeId/role', authenticate, chatController.updateGroupMemberRole);
router.delete('/chat/groups/:groupId/members/:employeeId', authenticate, chatController.removeGroupMember);

// Chat — DMs
router.get('/chat/dm', authenticate, chatController.getDirectConversations);
router.get('/chat/dm/employees', authenticate, chatController.getAllEmployeesForDM);
router.get('/chat/dm/:employeeId', authenticate, chatController.getOrCreateDM);
router.get('/chat/dm/conversation/:conversationId/messages', authenticate, chatController.getDMMessages);
router.post('/chat/dm/conversation/:conversationId/messages', authenticate, chatController.sendDMMessage);
router.put('/chat/dm/conversation/:conversationId/read', authenticate, chatController.markDMRead);

// ─── Enquiries (Public Submission, Admin Management) ─────────────
router.post('/enquiries', enquiryController.create);
router.get('/enquiries', authenticate, requireRole('super_admin', 'admin'), enquiryController.getAll);
router.put('/enquiries/:id', authenticate, requireRole('super_admin', 'admin'), enquiryController.update);
router.delete('/enquiries/:id', authenticate, requireRole('super_admin', 'admin'), enquiryController.remove);

module.exports = router;
