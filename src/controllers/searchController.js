const { LeadRepo, ClientRepo, InvoiceRepo, ProjectRepo, TaskRepo, EmployeeRepo } = require('../repositories');

const searchController = {
  globalSearch: (req, res) => {
    const { q, module: mod } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });
    const query = q.toLowerCase();
    const results = [];

    const match = (obj, fields) => fields.some((f) => obj[f] && String(obj[f]).toLowerCase().includes(query));

    if (!mod || mod === 'leads') {
      LeadRepo.findAll().filter((l) => !l.archived && match(l, ['companyName', 'contactPerson', 'email', 'phone', 'id']))
        .slice(0, 5).forEach((l) => results.push({ type: 'lead', id: l.id, title: l.companyName, subtitle: l.contactPerson, status: l.status, link: `/crm/leads/${l.id}` }));
    }
    if (!mod || mod === 'clients') {
      ClientRepo.findAll().filter((c) => !c.archived && match(c, ['companyName', 'email', 'phone', 'id']))
        .slice(0, 5).forEach((c) => results.push({ type: 'client', id: c.id, title: c.companyName, subtitle: c.email, status: c.status, link: `/clients/${c.id}` }));
    }
    if (!mod || mod === 'projects') {
      ProjectRepo.findAll().filter((p) => !p.archived && match(p, ['name', 'clientName', 'id']))
        .slice(0, 5).forEach((p) => results.push({ type: 'project', id: p.id, title: p.name, subtitle: p.clientName, status: p.status, link: `/projects/${p.id}` }));
    }
    if (!mod || mod === 'tasks') {
      TaskRepo.findAll().filter((t) => !t.archived && match(t, ['name', 'description', 'id', 'projectName']))
        .slice(0, 5).forEach((t) => results.push({ type: 'task', id: t.id, title: t.name, subtitle: t.projectName, status: t.status, link: `/tasks/${t.id}` }));
    }
    if (!mod || mod === 'employees') {
      EmployeeRepo.findAll().filter((e) => !e.archived && match(e, ['name', 'email', 'phone', 'designation', 'id']))
        .slice(0, 5).forEach((e) => results.push({ type: 'employee', id: e.id, title: e.name, subtitle: e.designation, status: e.status, link: `/employees/${e.id}` }));
    }
    if (!mod || mod === 'invoices') {
      InvoiceRepo.findAll().filter((i) => match(i, ['id', 'clientName']))
        .slice(0, 5).forEach((i) => results.push({ type: 'invoice', id: i.id, title: i.id, subtitle: i.clientName, status: i.status, link: `/finance/invoices/${i.id}` }));
    }

    res.json({ success: true, data: results, total: results.length });
  },
};

module.exports = searchController;
