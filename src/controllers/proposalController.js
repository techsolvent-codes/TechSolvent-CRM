const { ProposalRepo, LeadRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');

const proposalController = {
  getAll: (req, res) => {
    const { status, leadId } = req.query;
    let proposals = ProposalRepo.findAll();
    if (status) proposals = proposals.filter((p) => p.status === status);
    if (leadId) proposals = proposals.filter((p) => p.leadId === leadId);
    proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: proposals });
  },

  getById: (req, res) => {
    const p = ProposalRepo.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Proposal not found' });
    res.json({ success: true, data: p });
  },

  create: (req, res, next) => {
    try {
      const { leadId, title, services, items, totalValue, validUntil, notes, templateId } = req.body;
      if (!title) return res.status(400).json({ success: false, message: 'Proposal title required' });
      const proposal = ProposalRepo.create({ leadId, title, services, items: items || [], totalValue, validUntil, notes, status: 'draft', createdBy: req.user.id, createdByName: req.user.name, versionHistory: [], templateId });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_PROPOSAL', module: 'proposals', referenceId: proposal.id });
      res.status(201).json({ success: true, message: 'Proposal created', data: proposal });
    } catch (err) { next(err); }
  },

  update: (req, res, next) => {
    try {
      const p = ProposalRepo.findById(req.params.id);
      if (!p) return res.status(404).json({ success: false, message: 'Proposal not found' });

      const isAdmin = ['super_admin', 'admin', 'bd_manager'].includes(req.user.role);
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: 'Only admins and BD managers can edit proposals' });
      }

      // Save old version to history
      const history = p.versionHistory || [];
      history.push({ version: history.length + 1, updatedAt: new Date().toISOString(), updatedBy: req.user.name, snapshot: { ...p } });
      const updateData = { ...req.body };
      if (updateData.amount !== undefined && updateData.amount !== null && updateData.amount !== '') {
        updateData.amount = parseFloat(updateData.amount) || 0;
      }
      const updated = ProposalRepo.update(req.params.id, { ...updateData, versionHistory: history });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_PROPOSAL', module: 'proposals', referenceId: p.id, oldValue: p, newValue: updated });
      res.json({ success: true, message: 'Proposal updated', data: updated });
    } catch (err) { next(err); }
  },

  send: (req, res, next) => {
    try {
      const p = ProposalRepo.findById(req.params.id);
      if (!p) return res.status(404).json({ success: false, message: 'Proposal not found' });
      const updated = ProposalRepo.update(req.params.id, { status: 'sent', sentAt: new Date().toISOString(), sentBy: req.user.id });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'SEND_PROPOSAL', module: 'proposals', referenceId: p.id });
      res.json({ success: true, message: 'Proposal marked as sent', data: updated });
    } catch (err) { next(err); }
  },

  updateStatus: (req, res, next) => {
    try {
      const p = ProposalRepo.findById(req.params.id);
      if (!p) return res.status(404).json({ success: false, message: 'Proposal not found' });
      const { status } = req.body;
      const updated = ProposalRepo.update(req.params.id, { status, [`${status}At`]: new Date().toISOString() });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  delete: (req, res, next) => {
    try {
      const p = ProposalRepo.findById(req.params.id);
      if (!p) return res.status(404).json({ success: false, message: 'Proposal not found' });
      ProposalRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_PROPOSAL', module: 'proposals', referenceId: p.id, oldValue: p });
      res.json({ success: true, message: 'Proposal deleted successfully' });
    } catch (err) { next(err); }
  },
};

module.exports = proposalController;
