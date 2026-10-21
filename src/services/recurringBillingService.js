const { InvoiceRepo, RecurringServiceRepo, ProjectRepo, ClientRepo, UserRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notifyMany } = require('../utils/notificationService');

/**
 * Calculate the next billing date based on frequency.
 * Preserves the original billing day of the month where possible.
 */
function calculateNextDate(currentDateStr, frequency) {
  const base = currentDateStr ? new Date(currentDateStr) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString().split('T')[0];

  const target = new Date(base);
  const origDay = base.getDate();

  switch ((frequency || 'monthly').toLowerCase()) {
    case 'weekly':
      target.setDate(target.getDate() + 7);
      break;
    case 'biweekly':
      target.setDate(target.getDate() + 14);
      break;
    case 'quarterly':
      target.setMonth(target.getMonth() + 3);
      if (target.getDate() !== origDay) {
        target.setDate(0);
      }
      break;
    case 'annually':
    case 'yearly':
      target.setFullYear(target.getFullYear() + 1);
      break;
    case 'monthly':
    default:
      target.setMonth(target.getMonth() + 1);
      if (target.getDate() !== origDay) {
        target.setDate(0);
      }
      break;
  }
  return target.toISOString().split('T')[0];
}

/**
 * Generate sequential invoice number (e.g. INV-2026-004)
 */
function getNextInvoiceNumber() {
  const invoices = InvoiceRepo.findAll();
  const currentYear = new Date().getFullYear();
  let maxSeq = 0;
  invoices.forEach((inv) => {
    if (inv.invoiceNumber) {
      const match = inv.invoiceNumber.match(/INV-\d{4}-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
  });
  return `INV-${currentYear}-${String(maxSeq + 1).padStart(3, '0')}`;
}

/**
 * Core function: Checks all recurring services and projects,
 * and automatically generates invoices for any where nextBillingDate <= today.
 */
async function processRecurringBilling({ triggeredBy = 'system', userId = null, userName = 'Automated Billing System' } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const generatedInvoices = [];
  const errors = [];

  // 1. Process Recurring Services / Retainers
  const services = RecurringServiceRepo.findAll();
  for (const s of services) {
    try {
      // Must be active (or undefined which defaults to active) and autoInvoice enabled (defaults to true)
      const isActive = s.status === 'active' || !s.status;
      if (!isActive) continue;
      if (s.autoInvoice === false) continue;
      if (!s.nextBillingDate) continue;

      // Check if billing date is today or overdue
      if (s.nextBillingDate <= today) {
        // Prevent duplicate generation for the same billing date
        if (s.lastInvoicedDate === s.nextBillingDate) {
          const nextDate = calculateNextDate(s.nextBillingDate, s.frequency);
          RecurringServiceRepo.update(s.id, { nextBillingDate: nextDate });
          continue;
        }

        const client = ClientRepo.findById(s.clientId) || {};
        const clientName = client.companyName || client.name || s.clientName || 'Valued Client';
        const amount = Number(s.amount) || 0;
        const gstRate = 18;
        const subtotal = amount;
        const gstAmount = Math.round(subtotal * (gstRate / 100) * 100) / 100;
        const total = subtotal + gstAmount;

        const issueDate = s.nextBillingDate;
        // Due date: 15 days from issue date
        const dueObj = new Date(issueDate);
        dueObj.setDate(dueObj.getDate() + 15);
        const dueDate = dueObj.toISOString().split('T')[0];

        const invNumber = getNextInvoiceNumber();
        const cycleLabel = s.frequency ? (s.frequency.charAt(0).toUpperCase() + s.frequency.slice(1)) : 'Monthly';

        const invoiceData = {
          invoiceNumber: invNumber,
          clientId: s.clientId,
          clientName: clientName,
          projectId: s.projectId || null,
          issueDate: issueDate,
          dueDate: dueDate,
          subtotal: subtotal,
          taxRate: gstRate,
          gstRate: gstRate,
          taxAmount: gstAmount,
          gstAmount: gstAmount,
          total: total,
          paidAmount: 0,
          balanceDue: total,
          status: 'pending',
          isRecurring: true,
          recurringServiceId: s.id,
          items: [
            {
              description: `${s.serviceName} - ${cycleLabel} Retainer Agreement`,
              quantity: 1,
              rate: amount,
              amount: amount,
            },
          ],
          notes: `Automatically generated on ${today} for ${cycleLabel.toLowerCase()} retainer agreement (${s.serviceName}).`,
          createdBy: userId || 'SYSTEM',
        };

        const createdInvoice = InvoiceRepo.create(invoiceData);

        // Advance next billing date and update audit fields
        const nextBillingDate = calculateNextDate(s.nextBillingDate, s.frequency);
        RecurringServiceRepo.update(s.id, {
          lastInvoicedDate: issueDate,
          lastInvoiceId: createdInvoice.id,
          nextBillingDate: nextBillingDate,
        });

        // Audit Log
        auditLog({
          userId: userId || 'SYSTEM',
          userName: userName,
          action: 'AUTO_GENERATE_INVOICE',
          module: 'finance',
          referenceId: createdInvoice.id,
          newValue: { invoice: createdInvoice, recurringService: s.id, nextBillingDate },
        });

        generatedInvoices.push({
          invoice: createdInvoice,
          sourceType: 'service',
          sourceName: s.serviceName,
          clientName: clientName,
          amount: total,
          nextBillingDate,
        });
      }
    } catch (err) {
      console.error(`[RecurringBilling] Error processing service ${s.id}:`, err);
      errors.push({ id: s.id, name: s.serviceName, error: err.message });
    }
  }

  // 2. Process Recurring Projects
  const projects = ProjectRepo.findAll();
  for (const p of projects) {
    try {
      if (!p.isRecurring || p.status === 'cancelled') continue;
      if (p.autoInvoice === false) continue;
      if (!p.nextBillingDate) continue;

      if (p.nextBillingDate <= today) {
        if (p.lastInvoicedDate === p.nextBillingDate) {
          const nextDate = calculateNextDate(p.nextBillingDate, p.billingFrequency || 'monthly');
          ProjectRepo.update(p.id, { nextBillingDate: nextDate });
          continue;
        }

        const client = ClientRepo.findById(p.clientId) || {};
        const clientName = client.companyName || client.name || p.clientName || 'Valued Client';
        const amount = Number(p.recurringAmount || p.budget || 0);
        if (amount <= 0) continue;

        const gstRate = 18;
        const subtotal = amount;
        const gstAmount = Math.round(subtotal * (gstRate / 100) * 100) / 100;
        const total = subtotal + gstAmount;

        const issueDate = p.nextBillingDate;
        const dueObj = new Date(issueDate);
        dueObj.setDate(dueObj.getDate() + 15);
        const dueDate = dueObj.toISOString().split('T')[0];

        const invNumber = getNextInvoiceNumber();
        const freq = p.billingFrequency || 'monthly';
        const cycleLabel = freq.charAt(0).toUpperCase() + freq.slice(1);

        const invoiceData = {
          invoiceNumber: invNumber,
          clientId: p.clientId,
          clientName: clientName,
          projectId: p.id,
          issueDate: issueDate,
          dueDate: dueDate,
          subtotal: subtotal,
          taxRate: gstRate,
          gstRate: gstRate,
          taxAmount: gstAmount,
          gstAmount: gstAmount,
          total: total,
          paidAmount: 0,
          balanceDue: total,
          status: 'pending',
          isRecurring: true,
          items: [
            {
              description: `${p.name} - ${cycleLabel} Project Retainer`,
              quantity: 1,
              rate: amount,
              amount: amount,
            },
          ],
          notes: `Automatically generated on ${today} for recurring project billing (${p.name}).`,
          createdBy: userId || 'SYSTEM',
        };

        const createdInvoice = InvoiceRepo.create(invoiceData);
        const nextBillingDate = calculateNextDate(p.nextBillingDate, freq);

        ProjectRepo.update(p.id, {
          lastInvoicedDate: issueDate,
          lastInvoiceId: createdInvoice.id,
          nextBillingDate: nextBillingDate,
        });

        auditLog({
          userId: userId || 'SYSTEM',
          userName: userName,
          action: 'AUTO_GENERATE_INVOICE',
          module: 'finance',
          referenceId: createdInvoice.id,
          newValue: { invoice: createdInvoice, project: p.id, nextBillingDate },
        });

        generatedInvoices.push({
          invoice: createdInvoice,
          sourceType: 'project',
          sourceName: p.name,
          clientName: clientName,
          amount: total,
          nextBillingDate,
        });
      }
    } catch (err) {
      console.error(`[RecurringBilling] Error processing project ${p.id}:`, err);
      errors.push({ id: p.id, name: p.name, error: err.message });
    }
  }

  // 3. Send notifications if invoices were generated
  if (generatedInvoices.length > 0) {
    try {
      const adminUsers = UserRepo.findAll().filter((u) => ['super_admin', 'admin', 'finance'].includes(u.role));
      const adminIds = adminUsers.map((u) => u.id);
      if (adminIds.length > 0) {
        const invNumbers = generatedInvoices.map((g) => g.invoice.invoiceNumber || g.invoice.id).join(', ');
        await notifyMany(adminIds, {
          title: `⚡ ${generatedInvoices.length} Recurring Invoice(s) Generated`,
          message: `Auto-generated ${generatedInvoices.length} invoice(s) [${invNumbers}] for scheduled retainer billing.`,
          type: 'invoice',
          link: '/finance/invoices',
        });
      }
    } catch (notifErr) {
      console.error('[RecurringBilling] Notification error:', notifErr.message);
    }
  }

  return {
    success: true,
    count: generatedInvoices.length,
    invoices: generatedInvoices,
    errors,
  };
}

module.exports = {
  calculateNextDate,
  getNextInvoiceNumber,
  processRecurringBilling,
};
