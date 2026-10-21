const { ProjectRepo, ProjectTemplateRepo, TaskRepo, ClientRepo, EmployeeRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notify } = require('../utils/notificationService');

const PROJECT_TEMPLATES = {
  seo: ['Keyword Research', 'Technical SEO Audit', 'On-page SEO', 'Off-page SEO', 'Content Planning', 'Monthly Report'],
  social_media: ['Content Calendar', 'Copywriting', 'Design', 'Internal Approval', 'Client Approval', 'Scheduling', 'Publishing', 'Monthly Report'],
  website: ['Requirement Gathering', 'UI/UX Design', 'Design', 'Development', 'QA Testing', 'Client Review', 'Changes', 'Final Approval', 'Deployment'],
  shopify: ['Requirement Gathering', 'Design', 'Development', 'Product Upload', 'QA', 'Client Review', 'Go Live'],
  performance_marketing: ['Strategy', 'Ad Setup', 'Creative Design', 'Campaign Launch', 'Optimization', 'Monthly Report'],
};

const projectController = {
  getAll: (req, res) => {
    const { status, clientId, managerId, health } = req.query;
    let projects = ProjectRepo.findAll().filter((p) => !p.archived);
    if (status) projects = projects.filter((p) => p.status === status);
    if (clientId) projects = projects.filter((p) => p.clientId === clientId);
    if (managerId) projects = projects.filter((p) => p.managerId === managerId);
    if (health) projects = projects.filter((p) => p.health === health);
    projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: projects });
  },

  getById: (req, res) => {
    const project = ProjectRepo.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    const tasks = TaskRepo.findByProject(project.id).filter((t) => !t.archived);
    res.json({ success: true, data: { ...project, tasks } });
  },

  create: async (req, res, next) => {
    try {
      const { name, clientId, clientName, serviceType, managerId, managerName, teamMembers, startDate, endDate, budget, revenue, description, templateType } = req.body;
      if (!name || !clientId) return res.status(400).json({ success: false, message: 'Name and client required' });

      const project = ProjectRepo.create({ name, clientId, clientName, serviceType, managerId, managerName, teamMembers: teamMembers || [], startDate, endDate, budget, revenue, description, status: 'not_started', health: 'green', milestones: [], createdBy: req.user.id });

      // Auto-create tasks from template
      if (templateType && PROJECT_TEMPLATES[templateType]) {
        PROJECT_TEMPLATES[templateType].forEach((taskName, idx) => {
          TaskRepo.create({ name: taskName, projectId: project.id, projectName: project.name, clientId, clientName, status: 'todo', priority: 'medium', order: idx, assignedTo: null, createdBy: req.user.id });
        });
      }

      // Notify project manager
      if (managerId) {
        const mgr = EmployeeRepo.findById(managerId);
        if (mgr) await notify({ userId: mgr.userId, title: 'Project Assigned', message: `You are assigned as PM for project "${name}"`, type: 'info', link: `/projects/${project.id}` });
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_PROJECT', module: 'projects', referenceId: project.id, newValue: project });
      res.status(201).json({ success: true, message: 'Project created', data: project });
    } catch (err) { next(err); }
  },

  update: (req, res, next) => {
    try {
      const project = ProjectRepo.findById(req.params.id);
      if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
      const updated = ProjectRepo.update(req.params.id, req.body);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_PROJECT', module: 'projects', referenceId: project.id, oldValue: { status: project.status }, newValue: { status: updated.status } });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  delete: (req, res, next) => {
    try {
      const project = ProjectRepo.findById(req.params.id);
      if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
      ProjectRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_PROJECT', module: 'projects', referenceId: project.id, oldValue: project });
      res.json({ success: true, message: 'Project deleted successfully' });
    } catch (err) { next(err); }
  },

  addMilestone: (req, res, next) => {
    try {
      const project = ProjectRepo.findById(req.params.id);
      if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
      const milestones = project.milestones || [];
      milestones.push({ id: require('../repositories/jsonRepository').uuidv4(), ...req.body, createdAt: new Date().toISOString() });
      const updated = ProjectRepo.update(project.id, { milestones });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  getTemplates: (req, res) => {
    const templates = Object.keys(PROJECT_TEMPLATES).map((key) => ({ key, name: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()), tasks: PROJECT_TEMPLATES[key] }));
    res.json({ success: true, data: templates });
  },
};

module.exports = projectController;
