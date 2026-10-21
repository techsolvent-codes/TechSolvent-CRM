const { InvoiceRepo, PaymentRepo, ClientRepo, ExpenseRepo, RecurringServiceRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const emailService = require('../utils/emailService');

const financeController = {
  // ─── Invoices ────────────────────────────────────────────────────
  getAllInvoices: (req, res) => {
    const { status, clientId, startDate, endDate } = req.query;
    let invoices = InvoiceRepo.findAll();
    if (status) invoices = invoices.filter((i) => i.status === status);
    if (clientId) invoices = invoices.filter((i) => i.clientId === clientId);
    if (startDate) invoices = invoices.filter((i) => i.createdAt >= startDate);
    if (endDate) invoices = invoices.filter((i) => i.createdAt <= endDate);
    invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: invoices });
  },

  getInvoiceById: (req, res) => {
    const inv = InvoiceRepo.findById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
    const payments = PaymentRepo.findByInvoice(inv.id);
    res.json({ success: true, data: { ...inv, payments } });
  },

  createInvoice: (req, res, next) => {
    try {
      const { clientId, clientName, items, dueDate, notes, projectId, gstRate = 18 } = req.body;
      if (!clientId || !items?.length) return res.status(400).json({ success: false, message: 'Client and items required' });

      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
      const gstAmount = Math.round(subtotal * (gstRate / 100) * 100) / 100;
      const total = subtotal + gstAmount;

      const invoice = InvoiceRepo.create({ clientId, clientName, items, subtotal, gstRate, gstAmount, total, dueDate, notes, projectId, status: 'pending', paidAmount: 0, createdBy: req.user.id });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_INVOICE', module: 'finance', referenceId: invoice.id, newValue: invoice });
      res.status(201).json({ success: true, message: 'Invoice created', data: invoice });
    } catch (err) { next(err); }
  },

  updateInvoice: (req, res, next) => {
    try {
      const inv = InvoiceRepo.findById(req.params.id);
      if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
      const updateData = { ...req.body };
      if (updateData.items && Array.isArray(updateData.items)) {
        const gstRate = updateData.gstRate !== undefined ? Number(updateData.gstRate) : (inv.gstRate || 18);
        const subtotal = updateData.items.reduce((sum, item) => sum + (Number(item.quantity || 1) * Number(item.rate || 0)), 0);
        const gstAmount = Math.round(subtotal * (gstRate / 100) * 100) / 100;
        updateData.subtotal = subtotal;
        updateData.gstRate = gstRate;
        updateData.gstAmount = gstAmount;
        updateData.total = subtotal + gstAmount;
      }
      if (updateData.clientId && updateData.clientId !== inv.clientId) {
        const client = ClientRepo.findById(updateData.clientId);
        if (client) updateData.clientName = client.companyName || client.name;
      }
      const updated = InvoiceRepo.update(req.params.id, updateData);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_INVOICE', module: 'finance', referenceId: inv.id, oldValue: inv, newValue: updated });
      res.json({ success: true, message: 'Invoice updated', data: updated });
    } catch (err) { next(err); }
  },

  sendInvoice: async (req, res, next) => {
    try {
      const inv = InvoiceRepo.findById(req.params.id);
      if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
      const client = ClientRepo.findById(inv.clientId);
      const updated = InvoiceRepo.update(req.params.id, { status: 'sent', sentAt: new Date().toISOString() });
      if (client) { try { await emailService.sendInvoiceReminder({ client, invoice: updated }); } catch {} }
      res.json({ success: true, message: 'Invoice sent', data: updated });
    } catch (err) { next(err); }
  },

  deleteInvoice: (req, res, next) => {
    try {
      const inv = InvoiceRepo.findById(req.params.id);
      if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });
      InvoiceRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_INVOICE', module: 'finance', referenceId: inv.id, oldValue: inv });
      res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (err) { next(err); }
  },

  // ─── Payments ────────────────────────────────────────────────────
  getAllPayments: (req, res) => {
    const { invoiceId, clientId } = req.query;
    let payments = PaymentRepo.findAll();
    if (invoiceId) payments = payments.filter((p) => p.invoiceId === invoiceId);
    if (clientId) payments = payments.filter((p) => p.clientId === clientId);
    payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: payments });
  },

  recordPayment: (req, res, next) => {
    try {
      const { invoiceId, amount, method, reference, notes, paidAt } = req.body;
      if (!invoiceId || !amount) return res.status(400).json({ success: false, message: 'Invoice and amount required' });

      const inv = InvoiceRepo.findById(invoiceId);
      if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });

      const payment = PaymentRepo.create({ invoiceId, clientId: inv.clientId, clientName: inv.clientName, amount, method, reference, notes, paidAt: paidAt || new Date().toISOString(), recordedBy: req.user.id });

      // Update invoice paid amount and status
      const newPaid = (inv.paidAmount || 0) + amount;
      const newStatus = newPaid >= inv.total ? 'paid' : newPaid > 0 ? 'partial' : inv.status;
      InvoiceRepo.update(invoiceId, { paidAmount: newPaid, status: newStatus });

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'RECORD_PAYMENT', module: 'finance', referenceId: payment.id, newValue: payment });
      res.status(201).json({ success: true, message: 'Payment recorded', data: payment });
    } catch (err) { next(err); }
  },

  updatePayment: (req, res, next) => {
    try {
      const payment = PaymentRepo.findById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
      const updateData = { ...req.body };
      if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount) || 0;
      if (updateData.clientId && updateData.clientId !== payment.clientId) {
        const client = ClientRepo.findById(updateData.clientId);
        if (client) updateData.clientName = client.companyName || client.name;
      }
      const updated = PaymentRepo.update(req.params.id, updateData);

      // Recompute invoice paidAmount and status if linked to an invoice
      const invId = updateData.invoiceId || payment.invoiceId;
      if (invId) {
        const inv = InvoiceRepo.findById(invId);
        if (inv) {
          const allPayments = PaymentRepo.findByInvoice(invId);
          const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const newStatus = totalPaid >= inv.total ? 'paid' : totalPaid > 0 ? 'partial' : 'pending';
          InvoiceRepo.update(invId, { paidAmount: totalPaid, status: newStatus });
        }
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_PAYMENT', module: 'finance', referenceId: payment.id, oldValue: payment, newValue: updated });
      res.json({ success: true, message: 'Payment updated', data: updated });
    } catch (err) { next(err); }
  },

  deletePayment: (req, res, next) => {
    try {
      const payment = PaymentRepo.findById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
      PaymentRepo.remove(req.params.id);

      // Recompute invoice paidAmount and status if linked to an invoice
      if (payment.invoiceId) {
        const inv = InvoiceRepo.findById(payment.invoiceId);
        if (inv) {
          const allPayments = PaymentRepo.findByInvoice(payment.invoiceId);
          const totalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          const newStatus = totalPaid >= inv.total ? 'paid' : totalPaid > 0 ? 'partial' : 'pending';
          InvoiceRepo.update(payment.invoiceId, { paidAmount: totalPaid, status: newStatus });
        }
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_PAYMENT', module: 'finance', referenceId: payment.id, oldValue: payment });
      res.json({ success: true, message: 'Payment deleted successfully' });
    } catch (err) { next(err); }
  },

  // ─── Expenses ────────────────────────────────────────────────────
  getAllExpenses: (req, res) => {
    const { employeeId, status, projectId } = req.query;
    let expenses = ExpenseRepo.findAll();
    if (employeeId) expenses = expenses.filter((e) => e.employeeId === employeeId);
    if (status) expenses = expenses.filter((e) => e.status === status);
    if (projectId) expenses = expenses.filter((e) => e.projectId === projectId);
    expenses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: expenses });
  },

  createExpense: (req, res, next) => {
    try {
      const { category, amount, description, date, projectId, clientId } = req.body;
      if (!category || !amount) return res.status(400).json({ success: false, message: 'Category and amount required' });
      const { EmployeeRepo } = require('../repositories');
      const emp = EmployeeRepo.findByUserId(req.user.id);
      const expense = ExpenseRepo.create({ employeeId: emp?.id, employeeName: req.user.name, category, amount, description, date: date || new Date().toISOString().split('T')[0], projectId, clientId, receipt: req.file ? `/uploads/${req.file.filename}` : null, status: 'pending', createdBy: req.user.id });
      res.status(201).json({ success: true, data: expense });
    } catch (err) { next(err); }
  },

  approveExpense: (req, res, next) => {
    try {
      const exp = ExpenseRepo.findById(req.params.id);
      if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });
      const { decision } = req.body;
      const updated = ExpenseRepo.update(req.params.id, { status: decision === 'approve' ? 'approved' : 'rejected', approvedBy: req.user.id, approvedByName: req.user.name, approvedAt: new Date().toISOString() });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  updateExpense: (req, res, next) => {
    try {
      const exp = ExpenseRepo.findById(req.params.id);
      if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });
      const updateData = { ...req.body };
      if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount) || 0;
      const updated = ExpenseRepo.update(req.params.id, updateData);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_EXPENSE', module: 'finance', referenceId: exp.id, oldValue: exp, newValue: updated });
      res.json({ success: true, message: 'Expense updated', data: updated });
    } catch (err) { next(err); }
  },

  deleteExpense: (req, res, next) => {
    try {
      const exp = ExpenseRepo.findById(req.params.id);
      if (!exp) return res.status(404).json({ success: false, message: 'Expense not found' });
      ExpenseRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_EXPENSE', module: 'finance', referenceId: exp.id, oldValue: exp });
      res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (err) { next(err); }
  },

  // ─── Recurring Services ──────────────────────────────────────────
  getAllRecurring: (req, res) => {
    res.json({ success: true, data: RecurringServiceRepo.findAll() });
  },

  createRecurring: (req, res, next) => {
    try {
      const rec = RecurringServiceRepo.create({ status: 'active', autoInvoice: true, ...req.body, createdBy: req.user.id });
      res.status(201).json({ success: true, data: rec });
    } catch (err) { next(err); }
  },

  updateRecurring: (req, res, next) => {
    try {
      const rec = RecurringServiceRepo.findById(req.params.id);
      if (!rec) return res.status(404).json({ success: false, message: 'Recurring service not found' });
      const updateData = { ...req.body };
      if (updateData.amount !== undefined) updateData.amount = Number(updateData.amount) || 0;
      if (updateData.clientId && updateData.clientId !== rec.clientId) {
        const client = ClientRepo.findById(updateData.clientId);
        if (client) updateData.clientName = client.companyName || client.name;
      }
      const updated = RecurringServiceRepo.update(req.params.id, updateData);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_RECURRING', module: 'finance', referenceId: rec.id, oldValue: rec, newValue: updated });
      res.json({ success: true, message: 'Recurring service updated', data: updated });
    } catch (err) { next(err); }
  },

  deleteRecurring: (req, res, next) => {
    try {
      const rec = RecurringServiceRepo.findById(req.params.id);
      if (!rec) return res.status(404).json({ success: false, message: 'Recurring service not found' });
      RecurringServiceRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_RECURRING', module: 'finance', referenceId: rec.id, oldValue: rec });
      res.json({ success: true, message: 'Recurring service deleted successfully' });
    } catch (err) { next(err); }
  },

  generateDueRecurring: async (req, res, next) => {
    try {
      const { processRecurringBilling } = require('../services/recurringBillingService');
      const result = await processRecurringBilling({
        triggeredBy: 'manual_api',
        userId: req.user?.id,
        userName: req.user?.name || 'Admin User'
      });
      res.json({
        success: true,
        message: result.count > 0 ? `Successfully generated ${result.count} invoice(s)` : 'No recurring invoices are currently due for billing.',
        count: result.count,
        invoices: result.invoices,
        errors: result.errors
      });
    } catch (err) { next(err); }
  },

  // ─── Finance Summary ─────────────────────────────────────────────
  getSummary: (req, res) => {
    const invoices = InvoiceRepo.findAll();
    const payments = PaymentRepo.findAll();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    const monthlyRevenue = payments.filter((p) => p.paidAt?.startsWith(currentMonth)).reduce((s, p) => s + (p.amount || 0), 0);
    const todayCollections = payments.filter((p) => p.paidAt?.startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0);
    const pending = invoices.filter((i) => i.status === 'pending' || i.status === 'sent').reduce((s, i) => s + ((i.total || 0) - (i.paidAmount || 0)), 0);
    const overdue = invoices.filter((i) => i.dueDate && i.dueDate < today && i.status !== 'paid' && i.status !== 'cancelled').length;

    res.json({ success: true, data: { monthlyRevenue, todayCollections, pendingAmount: pending, overdueCount: overdue, totalInvoices: invoices.length, totalPayments: payments.length } });
  },
};

module.exports = financeController;
