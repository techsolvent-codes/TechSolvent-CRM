const nodemailer = require('nodemailer');
const config = require('../config/config');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!config.smtp.user || !config.smtp.password) {
      // Dev mode: use ethereal or just log
      console.warn('[EmailService] SMTP not configured. Emails will be logged only.');
      return null;
    }
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password,
      },
    });
  }
  return transporter;
}

/**
 * Send an email. Falls back to console.log in development if SMTP not configured.
 */
async function send({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EmailService] [DEV] To: ${to} | Subject: ${subject}`);
    return { dev: true };
  }
  const info = await t.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });
  return info;
}

// ─── Email Templates ──────────────────────────────────────────────

async function sendTaskAssigned({ assignee, assigner, task, project, client }) {
  const subject = `New Task Assigned: ${task.name} — TECHSOLVENT`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 24px;">
        <h1 style="margin:0;font-size:22px;color:white;">🎯 New Task Assigned</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);">TECHSOLVENT OS</p>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${assignee.name}</strong>,</p>
        <p>A new task has been assigned to you by <strong>${assigner.name}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Task ID</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${task.id}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Task Name</td><td style="padding:8px;border-bottom:1px solid #1e293b;"><strong>${task.name}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Project</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${project || '—'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Client</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${client || '—'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Priority</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${task.priority}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Start Date</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${task.startDate || '—'}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Due Date</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${task.dueDate || '—'}</td></tr>
        </table>
        ${task.description ? `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0;"><p style="margin:0;color:#94a3b8;font-size:14px;">Description</p><p style="margin:8px 0 0;">${task.description}</p></div>` : ''}
        <a href="${config.frontendUrl}/tasks/${task.id}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;border-radius:8px;font-weight:600;">View Task →</a>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #1e293b;font-size:12px;color:#64748b;">TECHSOLVENT OS · Internal Platform</div>
    </div>
  `;
  return send({ to: assignee.email, subject, html });
}

async function sendLeaveDecision({ employee, leave, decision, decidedBy }) {
  const isApproved = decision === 'approved';
  const subject = `Leave ${isApproved ? 'Approved' : 'Rejected'} — TECHSOLVENT`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:${isApproved ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)'};padding:32px 24px;">
        <h1 style="margin:0;font-size:22px;color:white;">${isApproved ? '✅' : '❌'} Leave ${isApproved ? 'Approved' : 'Rejected'}</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);">TECHSOLVENT OS</p>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${employee.name}</strong>,</p>
        <p>Your leave request has been <strong>${decision}</strong> by ${decidedBy}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Leave Type</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${leave.leaveType}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">From</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${leave.startDate}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">To</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${leave.endDate}</td></tr>
        </table>
        <a href="${config.frontendUrl}/leave" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;text-decoration:none;border-radius:8px;font-weight:600;">View Leave →</a>
      </div>
    </div>
  `;
  return send({ to: employee.email, subject, html });
}

async function sendInvoiceReminder({ client, invoice }) {
  const subject = `Invoice ${invoice.id} Due — TECHSOLVENT`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:32px 24px;">
        <h1 style="margin:0;font-size:22px;color:white;">⚠️ Invoice Payment Reminder</h1>
      </div>
      <div style="padding:24px;">
        <p>Dear <strong>${client.companyName}</strong>,</p>
        <p>This is a reminder that invoice <strong>${invoice.id}</strong> of amount <strong>₹${invoice.total?.toLocaleString()}</strong> is due on <strong>${invoice.dueDate}</strong>.</p>
        <a href="${config.frontendUrl}/finance/invoices/${invoice.id}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;text-decoration:none;border-radius:8px;font-weight:600;">View Invoice →</a>
      </div>
    </div>
  `;
  return send({ to: client.email, subject, html });
}

async function sendTaskCompleted({ recipient, completedBy, task, project }) {
  const subject = `Task Completed: ${task.name} — TECHSOLVENT`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#10b981,#059669);padding:32px 24px;">
        <h1 style="margin:0;font-size:22px;color:white;">✅ Task Marked Completed</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);">TECHSOLVENT OS</p>
      </div>
      <div style="padding:24px;">
        <p>Hi <strong>${recipient.name || 'Team Member'}</strong>,</p>
        <p>A task reporting to you has been marked as <strong>Completed</strong> by <strong>${completedBy?.name || 'Assignee'}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Task ID</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${task.id}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Task Name</td><td style="padding:8px;border-bottom:1px solid #1e293b;"><strong>${task.name}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Project</td><td style="padding:8px;border-bottom:1px solid #1e293b;">${project || task.projectName || '—'}</td></tr>
        </table>
        <a href="${config.frontendUrl}/tasks" style="display:inline-block;margin-top:16px;padding:12px 24px;background:linear-gradient(135deg,#10b981,#059669);color:white;text-decoration:none;border-radius:8px;font-weight:600;">View Tasks →</a>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #1e293b;font-size:12px;color:#64748b;">TECHSOLVENT OS · Task Workflow</div>
    </div>
  `;
  return send({ to: recipient.email, subject, html });
}

module.exports = {
  send,
  sendTaskAssigned,
  sendTaskCompleted,
  sendLeaveDecision,
  sendInvoiceReminder,
};
