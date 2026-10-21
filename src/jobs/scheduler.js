const cron = require('node-cron');
const { InvoiceRepo, ClientRepo } = require('../repositories');
const emailService = require('../utils/emailService');
const { notify } = require('../utils/notificationService');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// ─── Invoice Overdue Check (runs every day at 8 AM) ───────────────
cron.schedule('0 8 * * *', async () => {
  console.log('[Scheduler] Checking overdue invoices...');
  const today = new Date().toISOString().split('T')[0];
  const invoices = InvoiceRepo.findAll().filter((i) => i.dueDate && i.dueDate < today && !['paid', 'cancelled', 'overdue'].includes(i.status));
  for (const inv of invoices) {
    InvoiceRepo.update(inv.id, { status: 'overdue' });
    const client = ClientRepo.findById(inv.clientId);
    if (client) {
      try { await emailService.sendInvoiceReminder({ client, invoice: inv }); } catch {}
    }
    console.log(`[Scheduler] Marked invoice ${inv.id} as overdue`);
  }
});

// ─── Daily Backup (runs every day at midnight) ────────────────────
cron.schedule('0 0 * * *', () => {
  console.log('[Scheduler] Running daily backup...');
  try {
    const backupDir = config.backupDir || path.join(__dirname, '../../backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `backup-${timestamp}`);
    fs.mkdirSync(backupPath, { recursive: true });

    const dataDir = config.dataDir;
    if (fs.existsSync(dataDir)) {
      fs.readdirSync(dataDir).forEach((file) => {
        if (file.endsWith('.json')) {
          fs.copyFileSync(path.join(dataDir, file), path.join(backupPath, file));
        }
      });
    }

    // Clean old backups (keep 30 days)
    const retainDays = parseInt(process.env.BACKUP_RETAIN_DAYS) || 30;
    const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
    fs.readdirSync(backupDir).forEach((dir) => {
      const full = path.join(backupDir, dir);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory() && stat.mtimeMs < cutoff) fs.rmSync(full, { recursive: true });
      } catch {}
    });

    console.log(`[Scheduler] Backup created: ${backupPath}`);
  } catch (err) {
    console.error('[Scheduler] Backup failed:', err.message);
  }
});

// ─── Automated Recurring Invoice Generation ──────────────────────
// Runs every hour to check for due recurring projects & retainers
const { processRecurringBilling } = require('../services/recurringBillingService');

cron.schedule('0 * * * *', async () => {
  console.log('[Scheduler] Running automated recurring invoice generation...');
  try {
    const res = await processRecurringBilling({ triggeredBy: 'cron', userName: 'Cron Scheduler' });
    if (res.count > 0) {
      console.log(`[Scheduler] Automatically generated ${res.count} recurring invoice(s)`);
    } else {
      console.log('[Scheduler] No recurring invoices due at this time');
    }
  } catch (err) {
    console.error('[Scheduler] Error in recurring billing job:', err.message);
  }
});

// Run once on server launch after 3 seconds to catch any currently due recurring invoices
setTimeout(async () => {
  try {
    console.log('[Scheduler] Startup check: Running automated recurring invoice generation...');
    const res = await processRecurringBilling({ triggeredBy: 'startup', userName: 'System Startup' });
    if (res.count > 0) {
      console.log(`[Scheduler] Startup: Automatically generated ${res.count} due recurring invoice(s)`);
    }
  } catch (err) {
    console.error('[Scheduler] Error in startup recurring billing check:', err.message);
  }
}, 3000);

console.log('[Scheduler] Jobs registered: recurring invoice generator (hourly), overdue invoice check (8 AM daily), backup (midnight daily)');
