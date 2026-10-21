const repo = require('./jsonRepository');

// ─── Users ───────────────────────────────────────────────────────
const UserRepo = {
  findAll: () => repo.readAll('users'),
  findById: (id) => repo.findById('users', id),
  findByEmail: (email) => repo.findWhere('users', (u) => u.email === email)[0] || null,
  create: (data) => repo.create('users', 'USR', data),
  update: (id, data) => repo.update('users', id, data),
  remove: (id) => repo.remove('users', id),
};

// ─── Roles ───────────────────────────────────────────────────────
const RoleRepo = {
  findAll: () => repo.readAll('roles'),
  findById: (id) => repo.findById('roles', id),
  findByName: (name) => repo.findWhere('roles', (r) => r.name === name)[0] || null,
  create: (data) => repo.create('roles', 'ROLE', data),
  update: (id, data) => repo.update('roles', id, data),
  remove: (id) => repo.remove('roles', id),
};

// ─── Employees ───────────────────────────────────────────────────
const EmployeeRepo = {
  findAll: () => repo.readAll('employees'),
  findById: (id) => repo.findById('employees', id),
  findByUserId: (userId) => repo.findWhere('employees', (e) => e.userId === userId)[0] || null,
  create: (data) => repo.create('employees', 'EMP', data),
  update: (id, data) => repo.update('employees', id, data),
  remove: (id) => repo.remove('employees', id),
  search: (q) => repo.search('employees', q, ['name', 'email', 'designation', 'department']),
};

// ─── Departments ─────────────────────────────────────────────────
const DepartmentRepo = {
  findAll: () => repo.readAll('departments'),
  findById: (id) => repo.findById('departments', id),
  create: (data) => repo.create('departments', 'DEPT', data),
  update: (id, data) => repo.update('departments', id, data),
  remove: (id) => repo.remove('departments', id),
};

// ─── Attendance ───────────────────────────────────────────────────
const AttendanceRepo = {
  findAll: () => repo.readAll('attendance'),
  findById: (id) => repo.findById('attendance', id),
  findByEmployee: (employeeId) => repo.findWhere('attendance', (a) => a.employeeId === employeeId),
  findByDate: (date) => repo.findWhere('attendance', (a) => a.date === date),
  findByEmployeeAndDate: (employeeId, date) =>
    repo.findWhere('attendance', (a) => a.employeeId === employeeId && a.date === date)[0] || null,
  create: (data) => repo.create('attendance', 'ATT', data),
  update: (id, data) => repo.update('attendance', id, data),
  remove: (id) => repo.remove('attendance', id),
};

// ─── Leaves ──────────────────────────────────────────────────────
const LeaveRepo = {
  findAll: () => repo.readAll('leaves'),
  findById: (id) => repo.findById('leaves', id),
  findByEmployee: (employeeId) => repo.findWhere('leaves', (l) => l.employeeId === employeeId),
  create: (data) => repo.create('leaves', 'LVE', data),
  update: (id, data) => repo.update('leaves', id, data),
  remove: (id) => repo.remove('leaves', id),
};

// ─── Holidays ────────────────────────────────────────────────────
const HolidayRepo = {
  findAll: () => repo.readAll('holidays'),
  findById: (id) => repo.findById('holidays', id),
  create: (data) => repo.create('holidays', 'HOL', data),
  update: (id, data) => repo.update('holidays', id, data),
  remove: (id) => repo.remove('holidays', id),
};

// ─── Leave Types ─────────────────────────────────────────────────
const LeaveTypeRepo = {
  findAll: () => repo.readAll('leaveTypes'),
  findById: (id) => repo.findById('leaveTypes', id),
  findByCode: (code) => repo.findWhere('leaveTypes', (lt) => lt.code === code)[0] || null,
  create: (data) => repo.create('leaveTypes', 'LTP', data),
  update: (id, data) => repo.update('leaveTypes', id, data),
  remove: (id) => repo.remove('leaveTypes', id),
};

// ─── Leads ───────────────────────────────────────────────────────
const LeadRepo = {
  findAll: () => repo.readAll('leads'),
  findById: (id) => repo.findById('leads', id),
  create: (data) => repo.create('leads', 'LEAD', data),
  update: (id, data) => repo.update('leads', id, data),
  remove: (id) => repo.remove('leads', id),
  search: (q) => repo.search('leads', q, ['companyName', 'contactPerson', 'email', 'phone']),
};

// ─── Activities ──────────────────────────────────────────────────
const ActivityRepo = {
  findAll: () => repo.readAll('activities'),
  findByLead: (leadId) => repo.findWhere('activities', (a) => a.leadId === leadId),
  findByClient: (clientId) => repo.findWhere('activities', (a) => a.clientId === clientId),
  create: (data) => repo.create('activities', 'ACT', data),
  update: (id, data) => repo.update('activities', id, data),
};

// ─── Proposals ───────────────────────────────────────────────────
const ProposalRepo = {
  findAll: () => repo.readAll('proposals'),
  findById: (id) => repo.findById('proposals', id),
  findByLead: (leadId) => repo.findWhere('proposals', (p) => p.leadId === leadId),
  create: (data) => repo.create('proposals', 'PROP', data),
  update: (id, data) => repo.update('proposals', id, data),
  remove: (id) => repo.remove('proposals', id),
};

// ─── Clients ─────────────────────────────────────────────────────
const ClientRepo = {
  findAll: () => repo.readAll('clients'),
  findById: (id) => repo.findById('clients', id),
  create: (data) => repo.create('clients', 'CLI', data),
  update: (id, data) => repo.update('clients', id, data),
  remove: (id) => repo.remove('clients', id),
  search: (q) => repo.search('clients', q, ['companyName', 'email', 'phone', 'industry']),
};

// ─── Invoices ────────────────────────────────────────────────────
const InvoiceRepo = {
  findAll: () => repo.readAll('invoices'),
  findById: (id) => repo.findById('invoices', id),
  findByClient: (clientId) => repo.findWhere('invoices', (i) => i.clientId === clientId),
  create: (data) => repo.create('invoices', 'INV', data),
  update: (id, data) => repo.update('invoices', id, data),
  remove: (id) => repo.remove('invoices', id),
};

// ─── Payments ────────────────────────────────────────────────────
const PaymentRepo = {
  findAll: () => repo.readAll('payments'),
  findById: (id) => repo.findById('payments', id),
  findByInvoice: (invoiceId) => repo.findWhere('payments', (p) => p.invoiceId === invoiceId),
  create: (data) => repo.create('payments', 'PAY', data),
  update: (id, data) => repo.update('payments', id, data),
  remove: (id) => repo.remove('payments', id),
};

// ─── Expenses ────────────────────────────────────────────────────
const ExpenseRepo = {
  findAll: () => repo.readAll('expenses'),
  findById: (id) => repo.findById('expenses', id),
  findByEmployee: (employeeId) => repo.findWhere('expenses', (e) => e.employeeId === employeeId),
  create: (data) => repo.create('expenses', 'EXP', data),
  update: (id, data) => repo.update('expenses', id, data),
  remove: (id) => repo.remove('expenses', id),
};

// ─── Recurring Services ──────────────────────────────────────────
const RecurringServiceRepo = {
  findAll: () => repo.readAll('recurringServices'),
  findById: (id) => repo.findById('recurringServices', id),
  findByClient: (clientId) => repo.findWhere('recurringServices', (s) => s.clientId === clientId),
  create: (data) => repo.create('recurringServices', 'REC', data),
  update: (id, data) => repo.update('recurringServices', id, data),
  remove: (id) => repo.remove('recurringServices', id),
};

// ─── Projects ────────────────────────────────────────────────────
const ProjectRepo = {
  findAll: () => repo.readAll('projects'),
  findById: (id) => repo.findById('projects', id),
  findByClient: (clientId) => repo.findWhere('projects', (p) => p.clientId === clientId),
  create: (data) => repo.create('projects', 'PROJ', data),
  update: (id, data) => repo.update('projects', id, data),
  remove: (id) => repo.remove('projects', id),
  search: (q) => repo.search('projects', q, ['name', 'clientName', 'serviceType']),
};

// ─── Project Templates ───────────────────────────────────────────
const ProjectTemplateRepo = {
  findAll: () => repo.readAll('projectTemplates'),
  findById: (id) => repo.findById('projectTemplates', id),
  create: (data) => repo.create('projectTemplates', 'TMPL', data),
  update: (id, data) => repo.update('projectTemplates', id, data),
  remove: (id) => repo.remove('projectTemplates', id),
};

// ─── Tasks ───────────────────────────────────────────────────────
const TaskRepo = {
  findAll: () => repo.readAll('tasks'),
  findById: (id) => repo.findById('tasks', id),
  findByProject: (projectId) => repo.findWhere('tasks', (t) => t.projectId === projectId),
  findByAssignee: (employeeId) => repo.findWhere('tasks', (t) => t.assignedTo === employeeId),
  create: (data) => repo.create('tasks', 'TASK', data),
  update: (id, data) => repo.update('tasks', id, data),
  remove: (id) => repo.remove('tasks', id),
  search: (q) => repo.search('tasks', q, ['name', 'description', 'projectName']),
};

// ─── Notifications ───────────────────────────────────────────────
const NotificationRepo = {
  findAll: () => repo.readAll('notifications'),
  findByUser: (userId) => repo.findWhere('notifications', (n) => n.userId === userId),
  create: (data) => repo.create('notifications', 'NOTIF', data),
  update: (id, data) => repo.update('notifications', id, data),
  markAllRead: (userId) => {
    const all = repo.readAll('notifications');
    const updated = all.map((n) =>
      n.userId === userId ? { ...n, read: true, updatedAt: new Date().toISOString() } : n
    );
    repo.writeAll('notifications', updated);
  },
};

// ─── Push Subscriptions ──────────────────────────────────────────
const PushSubscriptionRepo = {
  findAll: () => repo.readAll('push_subscriptions'),
  findByUser: (userId) => repo.findWhere('push_subscriptions', (s) => s.userId === userId),
  findByEndpoint: (endpoint) => repo.findWhere('push_subscriptions', (s) => s.subscription?.endpoint === endpoint)[0] || null,
  saveSubscription: ({ userId, subscription, userAgent }) => {
    const existing = repo.findWhere('push_subscriptions', (s) => s.subscription?.endpoint === subscription?.endpoint)[0];
    if (existing) {
      return repo.update('push_subscriptions', existing.id, { userId, subscription, userAgent, updatedAt: new Date().toISOString() });
    }
    return repo.create('push_subscriptions', 'SUB', { userId, subscription, userAgent });
  },
  removeByEndpoint: (endpoint) => {
    const existing = repo.findWhere('push_subscriptions', (s) => s.subscription?.endpoint === endpoint)[0];
    if (existing) {
      return repo.remove('push_subscriptions', existing.id);
    }
    return false;
  },
  removeByUser: (userId) => {
    const all = repo.readAll('push_subscriptions');
    const remaining = all.filter((s) => s.userId !== userId);
    repo.writeAll('push_subscriptions', remaining);
  },
};

// ─── Approvals ───────────────────────────────────────────────────
const ApprovalRepo = {
  findAll: () => repo.readAll('approvals'),
  findById: (id) => repo.findById('approvals', id),
  findByReference: (refId) => repo.findWhere('approvals', (a) => a.referenceId === refId),
  create: (data) => repo.create('approvals', 'APR', data),
  update: (id, data) => repo.update('approvals', id, data),
};

// ─── Audit Logs ──────────────────────────────────────────────────
const AuditLogRepo = {
  findAll: () => repo.readAll('auditLogs'),
  findByUser: (userId) => repo.findWhere('auditLogs', (l) => l.userId === userId),
  create: (data) => repo.create('auditLogs', 'LOG', data),
};

// ─── Documents ───────────────────────────────────────────────────
const DocumentRepo = {
  findAll: () => repo.readAll('documents'),
  findById: (id) => repo.findById('documents', id),
  findByReference: (refId) => repo.findWhere('documents', (d) => d.referenceId === refId),
  create: (data) => repo.create('documents', 'DOC', data),
  update: (id, data) => repo.update('documents', id, data),
  remove: (id) => repo.remove('documents', id),
};

// ─── Settings ────────────────────────────────────────────────────
const SettingsRepo = {
  get: () => {
    const all = repo.readAll('settings');
    return all[0] || {};
  },
  update: (data) => {
    const all = repo.readAll('settings');
    if (all.length === 0) {
      const record = { ...data, id: 'SETTINGS', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      repo.writeAll('settings', [record]);
      return record;
    }
    all[0] = { ...all[0], ...data, updatedAt: new Date().toISOString() };
    repo.writeAll('settings', all);
    return all[0];
  },
};

// ─── Chat ────────────────────────────────────────────────────────
const ChatGroupRepo = {
  findAll: () => repo.readAll('chatGroups'),
  findById: (id) => repo.findById('chatGroups', id),
  create: (data) => repo.create('chatGroups', 'GRP', data),
  update: (id, data) => repo.update('chatGroups', id, data),
};

const ChatMemberRepo = {
  findAll: () => repo.readAll('chatMembers'),
  findByGroup: (groupId) => repo.findWhere('chatMembers', (m) => m.groupId === groupId),
  findByEmployee: (employeeId) => repo.findWhere('chatMembers', (m) => m.employeeId === employeeId),
  findMembership: (groupId, employeeId) =>
    repo.findWhere('chatMembers', (m) => m.groupId === groupId && m.employeeId === employeeId)[0] || null,
  create: (data) => repo.create('chatMembers', 'CMEM', data),
  update: (id, data) => repo.update('chatMembers', id, data),
  remove: (id) => repo.remove('chatMembers', id),
};

const ChatMessageRepo = {
  findAll: () => repo.readAll('chatMessages'),
  findById: (id) => repo.findById('chatMessages', id),
  findByGroup: (groupId) => repo.findWhere('chatMessages', (m) => m.groupId === groupId && !m.deletedAt),
  findByConversation: (conversationId) =>
    repo.findWhere('chatMessages', (m) => m.conversationId === conversationId && !m.deletedAt),
  create: (data) => repo.create('chatMessages', 'MSG', data),
  update: (id, data) => repo.update('chatMessages', id, data),
};

const DirectConversationRepo = {
  findAll: () => repo.readAll('directConversations'),
  findById: (id) => repo.findById('directConversations', id),
  findBetween: (emp1, emp2) =>
    repo.findWhere('directConversations', (c) => {
      const members = c.members || [];
      return members.includes(emp1) && members.includes(emp2);
    })[0] || null,
  create: (data) => repo.create('directConversations', 'DM', data),
  update: (id, data) => repo.update('directConversations', id, data),
};

const ChatReactionRepo = {
  findAll: () => repo.readAll('chatReactions'),
  findByMessage: (messageId) => repo.findWhere('chatReactions', (r) => r.messageId === messageId),
  create: (data) => repo.create('chatReactions', 'REACT', data),
  remove: (id) => repo.remove('chatReactions', id),
  toggle: (messageId, employeeId, reaction) => {
    const existing = repo.findWhere('chatReactions', (r) =>
      r.messageId === messageId && r.employeeId === employeeId && r.reaction === reaction
    )[0];
    if (existing) {
      repo.remove('chatReactions', existing.id);
      return { added: false };
    }
    const created = repo.create('chatReactions', 'REACT', { messageId, employeeId, reaction });
    return { added: true, reaction: created };
  },
};

module.exports = {
  UserRepo,
  RoleRepo,
  EmployeeRepo,
  DepartmentRepo,
  AttendanceRepo,
  LeaveRepo,
  LeadRepo,
  ActivityRepo,
  ProposalRepo,
  ClientRepo,
  InvoiceRepo,
  PaymentRepo,
  ExpenseRepo,
  RecurringServiceRepo,
  ProjectRepo,
  ProjectTemplateRepo,
  TaskRepo,
  NotificationRepo,
  PushSubscriptionRepo,
  ApprovalRepo,
  AuditLogRepo,
  DocumentRepo,
  SettingsRepo,
  ChatGroupRepo,
  ChatMemberRepo,
  ChatMessageRepo,
  DirectConversationRepo,
  ChatReactionRepo,
  HolidayRepo,
  LeaveTypeRepo,
  EnquiryRepo: {
    findAll: () => repo.readAll('enquiries'),
    findById: (id) => repo.findById('enquiries', id),
    create: (data) => repo.create('enquiries', 'ENQ', data),
    update: (id, data) => repo.update('enquiries', id, data),
    remove: (id) => repo.remove('enquiries', id),
  },
};
