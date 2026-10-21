const { ClientRepo, ActivityRepo, InvoiceRepo, ProjectRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');

const clientController = {
  getAll: (req, res) => {
    const { status, search: q } = req.query;
    let clients = ClientRepo.findAll().filter((c) => !c.archived);
    if (status) clients = clients.filter((c) => c.status === status);
    if (q) clients = clients.filter((c) => ['companyName', 'email', 'phone', 'industry'].some((f) => c[f]?.toLowerCase().includes(q.toLowerCase())));
    clients.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: clients });
  },

  getById: (req, res) => {
    const client = ClientRepo.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
    const invoices = InvoiceRepo.findByClient(client.id);
    const projects = ProjectRepo.findByClient(client.id);
    const activities = ActivityRepo.findByClient(client.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: { ...client, invoices, projects, activities } });
  },

  create: (req, res, next) => {
    try {
      const { companyName, contactPersons, email, phone, website, industry, address, gstInfo, services, accountManager } = req.body;
      if (!companyName) return res.status(400).json({ success: false, message: 'Company name required' });
      const client = ClientRepo.create({ companyName, contactPersons: contactPersons || [], email, phone, website, industry, address, gstInfo, services: services || [], accountManager, status: 'active', createdBy: req.user.id });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_CLIENT', module: 'clients', referenceId: client.id, newValue: client });
      res.status(201).json({ success: true, message: 'Client created', data: client });
    } catch (err) { next(err); }
  },

  update: (req, res, next) => {
    try {
      const client = ClientRepo.findById(req.params.id);
      if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
      const updated = ClientRepo.update(req.params.id, req.body);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_CLIENT', module: 'clients', referenceId: client.id, oldValue: client, newValue: updated });
      res.json({ success: true, message: 'Client updated', data: updated });
    } catch (err) { next(err); }
  },

  delete: (req, res, next) => {
    try {
      const client = ClientRepo.findById(req.params.id);
      if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
      ClientRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_CLIENT', module: 'clients', referenceId: client.id, oldValue: client });
      res.json({ success: true, message: 'Client deleted successfully' });
    } catch (err) { next(err); }
  },

  addActivity: (req, res, next) => {
    try {
      const client = ClientRepo.findById(req.params.id);
      if (!client) return res.status(404).json({ success: false, message: 'Client not found' });
      const activity = ActivityRepo.create({ clientId: client.id, ...req.body, performedBy: req.user.id, performedByName: req.user.name });
      res.status(201).json({ success: true, data: activity });
    } catch (err) { next(err); }
  },
};

module.exports = clientController;
