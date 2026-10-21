const { LeadRepo, ActivityRepo, EmployeeRepo, ClientRepo, ProposalRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notify } = require('../utils/notificationService');

const PIPELINE_STAGES = ['new_lead', 'contacted', 'requirement_discussed', 'meeting', 'proposal', 'negotiation', 'payment_pending', 'won', 'lost'];

const leadController = {
  getAll: (req, res) => {
    const { status, source, assignedTo, priority, search: q } = req.query;
    let leads = LeadRepo.findAll().filter((l) => !l.archived);
    if (status) leads = leads.filter((l) => l.status === status);
    if (source) leads = leads.filter((l) => l.source === source);
    if (assignedTo) leads = leads.filter((l) => l.assignedTo === assignedTo);
    if (priority) leads = leads.filter((l) => l.priority === priority);
    if (q) leads = leads.filter((l) => ['companyName', 'contactPerson', 'email', 'phone'].some((f) => l[f]?.toLowerCase().includes(q.toLowerCase())));
    leads.sort((a, b) => b.createdAt?.localeCompare(a.createdAt));
    res.json({ success: true, data: leads });
  },

  getById: (req, res) => {
    const lead = LeadRepo.findById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
    const activities = ActivityRepo.findByLead(lead.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const proposals = ProposalRepo.findByLead(lead.id);
    res.json({ success: true, data: { ...lead, activities, proposals } });
  },

  create: (req, res, next) => {
    try {
      const { companyName, contactPerson, email, phone, source, estimatedValue, priority = 'medium', notes } = req.body;
      if (!companyName || !contactPerson) return res.status(400).json({ success: false, message: 'Company name and contact person required' });

      const lead = LeadRepo.create({ companyName, contactPerson, email, phone, website: req.body.website, industry: req.body.industry, location: req.body.location, source, estimatedValue, priority, status: 'new_lead', assignedTo: req.body.assignedTo || req.user.id, assignedToName: req.body.assignedToName || req.user.name, notes, createdBy: req.user.id, createdByName: req.user.name });

      // Auto-log activity
      ActivityRepo.create({ leadId: lead.id, type: 'note', description: `Lead created by ${req.user.name}`, performedBy: req.user.id, performedByName: req.user.name });

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_LEAD', module: 'leads', referenceId: lead.id, newValue: lead });
      res.status(201).json({ success: true, message: 'Lead created', data: lead });
    } catch (err) { next(err); }
  },

  update: (req, res, next) => {
    try {
      const lead = LeadRepo.findById(req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      const isAdmin = ['super_admin', 'admin', 'bd_manager'].includes(req.user.role);
      const isOnlyStatusUpdate = Object.keys(req.body).length === 1 && req.body.status !== undefined;
      if (!isAdmin && !isOnlyStatusUpdate) {
        return res.status(403).json({ success: false, message: 'Only admins and BD managers can update lead details' });
      }

      const oldStatus = lead.status;
      const updatePayload = { ...req.body };

      // Synchronize company and name aliases
      if (updatePayload.companyName) updatePayload.company = updatePayload.companyName;
      if (updatePayload.contactPerson) updatePayload.name = updatePayload.contactPerson;
      if (updatePayload.estimatedValue !== undefined && updatePayload.estimatedValue !== null && updatePayload.estimatedValue !== '') {
        updatePayload.estimatedValue = Number(updatePayload.estimatedValue) || 0;
      }

      // If assignedTo changed, sync assignedToName and notify employee
      if (updatePayload.assignedTo && updatePayload.assignedTo !== lead.assignedTo) {
        const emp = EmployeeRepo.findById(updatePayload.assignedTo);
        if (emp) {
          updatePayload.assignedToName = emp.name;
          ActivityRepo.create({
            leadId: lead.id,
            type: 'assignment_change',
            description: `Lead assigned to ${emp.name}`,
            performedBy: req.user.id,
            performedByName: req.user.name,
          });
          if (emp.userId) {
            notify({
              userId: emp.userId,
              title: 'Lead Assigned',
              message: `Lead "${updatePayload.companyName || lead.companyName}" assigned to you`,
              type: 'info',
              link: `/crm/leads/${lead.id}`,
            }).catch(() => {});
          }
        }
      }

      const updated = LeadRepo.update(req.params.id, updatePayload);

      // Log status change as activity
      if (req.body.status && req.body.status !== oldStatus) {
        ActivityRepo.create({
          leadId: lead.id,
          type: 'status_change',
          description: `Status changed from ${oldStatus} to ${req.body.status}`,
          performedBy: req.user.id,
          performedByName: req.user.name,
        });
      }

      // If won — trigger client creation prompt (flag)
      if (req.body.status === 'won' && oldStatus !== 'won') {
        updated._triggerClientCreation = true;
      }

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'UPDATE_LEAD',
        module: 'leads',
        referenceId: lead.id,
        oldValue: { status: oldStatus },
        newValue: { status: updated.status },
      });
      res.json({ success: true, message: 'Lead updated', data: updated });
    } catch (err) { next(err); }
  },

  assign: async (req, res, next) => {
    try {
      const lead = LeadRepo.findById(req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      const { employeeId, employeeName } = req.body;
      const updated = LeadRepo.update(req.params.id, { assignedTo: employeeId, assignedToName: employeeName });
      ActivityRepo.create({ leadId: lead.id, type: 'assignment_change', description: `Lead assigned to ${employeeName}`, performedBy: req.user.id, performedByName: req.user.name });

      // Find user for that employee and notify
      const emp = EmployeeRepo.findById(employeeId);
      if (emp) await notify({ userId: emp.userId, title: 'Lead Assigned', message: `Lead "${lead.companyName}" assigned to you`, type: 'info', link: `/crm/leads/${lead.id}` });

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'ASSIGN_LEAD', module: 'leads', referenceId: lead.id });
      res.json({ success: true, message: 'Lead assigned', data: updated });
    } catch (err) { next(err); }
  },

  addActivity: (req, res, next) => {
    try {
      const lead = LeadRepo.findById(req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      const { type, description, scheduledAt } = req.body;
      if (!type || !description) return res.status(400).json({ success: false, message: 'Activity type and description required' });
      const activity = ActivityRepo.create({ leadId: lead.id, type, description, scheduledAt, performedBy: req.user.id, performedByName: req.user.name });

      // Update lead's last contacted
      LeadRepo.update(lead.id, { lastContacted: new Date().toISOString() });
      res.status(201).json({ success: true, data: activity });
    } catch (err) { next(err); }
  },

  delete: (req, res, next) => {
    try {
      const lead = LeadRepo.findById(req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      LeadRepo.update(req.params.id, { archived: true });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_LEAD', module: 'leads', referenceId: lead.id });
      res.json({ success: true, message: 'Lead deleted' });
    } catch (err) { next(err); }
  },
};

module.exports = leadController;
