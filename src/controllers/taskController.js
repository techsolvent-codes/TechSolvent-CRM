const { TaskRepo, ProjectRepo, EmployeeRepo, UserRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notify } = require('../utils/notificationService');
const emailService = require('../utils/emailService');

const taskController = {
  getAll: (req, res) => {
    const { projectId, assignedTo, status, priority, search: q } = req.query;
    let tasks = TaskRepo.findAll().filter((t) => !t.archived);

    // ─── Role-Based Visibility ──────────────────────────────────────────
    // Admin can see all tasks.
    // Employee can only see tasks assigned to them and tasks they assigned/created (or report to them).
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
    if (!isAdmin) {
      const currentEmp = EmployeeRepo.findByUserId(req.user.id);
      const currentEmpId = currentEmp ? currentEmp.id : null;

      tasks = tasks.filter((t) => {
        const isAssigned = (currentEmpId && t.assignedTo === currentEmpId) || t.assignedTo === req.user.id;
        const isCreator = t.createdBy === req.user.id || (currentEmpId && t.createdById === currentEmpId);
        const isReportTo = (currentEmpId && t.reportedTo === currentEmpId) || t.reportedTo === req.user.id;
        return isAssigned || isCreator || isReportTo;
      });
    }

    if (projectId) tasks = tasks.filter((t) => t.projectId === projectId);
    if (assignedTo) tasks = tasks.filter((t) => t.assignedTo === assignedTo);
    if (status) tasks = tasks.filter((t) => t.status === status);
    if (priority) tasks = tasks.filter((t) => t.priority === priority);
    if (q) tasks = tasks.filter((t) => t.name?.toLowerCase().includes(q.toLowerCase()) || t.description?.toLowerCase().includes(q.toLowerCase()));
    tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, data: tasks });
  },

  getById: (req, res) => {
    const task = TaskRepo.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
    if (!isAdmin) {
      const currentEmp = EmployeeRepo.findByUserId(req.user.id);
      const currentEmpId = currentEmp ? currentEmp.id : null;
      const isAssigned = (currentEmpId && task.assignedTo === currentEmpId) || task.assignedTo === req.user.id;
      const isCreator = task.createdBy === req.user.id || (currentEmpId && task.createdById === currentEmpId);
      const isReportTo = (currentEmpId && task.reportedTo === currentEmpId) || task.reportedTo === req.user.id;
      if (!isAssigned && !isCreator && !isReportTo) {
        return res.status(403).json({ success: false, message: 'Access denied: You can only view tasks assigned to or created by you' });
      }
    }

    res.json({ success: true, data: task });
  },

  getMyTasks: (req, res) => {
    const emp = EmployeeRepo.findByUserId(req.user.id);
    if (!emp) return res.json({ success: true, data: [] });
    const tasks = TaskRepo.findByAssignee(emp.id).filter((t) => !t.archived);
    res.json({ success: true, data: tasks });
  },

  create: async (req, res, next) => {
    try {
      const {
        name,
        title,
        projectId,
        projectName,
        clientId,
        clientName,
        assignedTo,
        reportedTo,
        priority = 'medium',
        startDate,
        dueDate,
        description,
        estimatedHours,
        dependencies,
      } = req.body;

      const taskTitle = name || title;
      if (!taskTitle) return res.status(400).json({ success: false, message: 'Task name required' });

      const currentEmp = EmployeeRepo.findByUserId(req.user.id);

      // Resolve assignee details
      let assigneeName = req.body.assigneeName || req.body.assignedToName;
      let assigneeEmployee = null;
      if (assignedTo) {
        assigneeEmployee = EmployeeRepo.findById(assignedTo);
        if (assigneeEmployee) {
          assigneeName = `${assigneeEmployee.firstName || ''} ${assigneeEmployee.lastName || ''}`.trim() || assigneeEmployee.name;
        }
      }

      // Resolve reportedTo details
      let reportedToName = req.body.reportedToName;
      let reportedToEmployee = null;
      if (reportedTo) {
        reportedToEmployee = EmployeeRepo.findById(reportedTo);
        if (reportedToEmployee) {
          reportedToName = `${reportedToEmployee.firstName || ''} ${reportedToEmployee.lastName || ''}`.trim() || reportedToEmployee.name;
        }
      } else {
        // Default report to task creator/manager if not provided
        reportedToName = req.user.name;
        if (currentEmp) reportedToEmployee = currentEmp;
      }

      const task = TaskRepo.create({
        name: taskTitle,
        title: taskTitle,
        projectId,
        projectName,
        clientId,
        clientName,
        assignedTo,
        assignedToName: assigneeName || 'Unassigned',
        assigneeName: assigneeName || 'Unassigned',
        reportedTo: reportedTo || (currentEmp ? currentEmp.id : null),
        reportedToName: reportedToName || req.user.name,
        priority,
        startDate,
        dueDate,
        description,
        estimatedHours,
        dependencies: dependencies || [],
        status: 'todo',
        comments: [],
        attachments: [],
        createdBy: req.user.id,
        createdByName: req.user.name,
        createdById: currentEmp ? currentEmp.id : null,
      });

      // ─── Notifications on Task Assignment ──────────────────────────
      if (assignedTo && assigneeEmployee) {
        // App Notification
        await notify({
          userId: assigneeEmployee.userId,
          title: 'New Task Assigned',
          message: `"${taskTitle}" has been assigned to you by ${req.user.name}.`,
          type: 'info',
          link: `/tasks`,
          referenceId: task.id,
          referenceType: 'task',
        });

        // Email Notification
        try {
          await emailService.sendTaskAssigned({
            assignee: { ...assigneeEmployee, email: assigneeEmployee.email },
            assigner: { name: req.user.name },
            task,
            project: projectName,
            client: clientName,
          });
        } catch (err) {
          console.error('[TaskController] Failed to send task assigned email:', err.message);
        }
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_TASK', module: 'tasks', referenceId: task.id, newValue: task });
      res.status(201).json({ success: true, message: 'Task created', data: task });
    } catch (err) { next(err); }
  },

  update: async (req, res, next) => {
    try {
      const task = TaskRepo.findById(req.params.id);
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      const currentEmp = EmployeeRepo.findByUserId(req.user.id);
      const isCreator = task.createdBy === req.user.id || (currentEmp && task.createdById === currentEmp.id);
      const isAssignee = (currentEmp && task.assignedTo === currentEmp.id) || task.assignedTo === req.user.id;

      // ─── Permission Check ──────────────────────────────────────────
      // "Employee can only update the task he created. Admin can see and update all tasks."
      // Assignee is permitted to change the status (so they can complete tasks).
      if (!isAdmin) {
        if (!isCreator) {
          if (isAssignee) {
            const nonStatusKeys = Object.keys(req.body).filter((k) => k !== 'status');
            if (nonStatusKeys.length > 0) {
              return res.status(403).json({
                success: false,
                message: 'You can only update the status of this task. Only the creator or an admin can edit task details.',
              });
            }
          } else {
            return res.status(403).json({
              success: false,
              message: 'Access denied: You can only update tasks you created.',
            });
          }
        }
      }

      const oldStatus = task.status;
      const oldAssignee = task.assignedTo;

      // Enrich assigneeName / reportedToName if IDs are updated
      const updatePayload = { ...req.body };
      if (req.body.name || req.body.title) {
        updatePayload.name = req.body.name || req.body.title;
        updatePayload.title = req.body.name || req.body.title;
      }
      if (req.body.assignedTo && req.body.assignedTo !== oldAssignee) {
        const emp = EmployeeRepo.findById(req.body.assignedTo);
        if (emp) {
          updatePayload.assignedToName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name;
          updatePayload.assigneeName = updatePayload.assignedToName;
        }
      }
      if (req.body.reportedTo && req.body.reportedTo !== task.reportedTo) {
        const rep = EmployeeRepo.findById(req.body.reportedTo);
        if (rep) {
          updatePayload.reportedToName = `${rep.firstName || ''} ${rep.lastName || ''}`.trim() || rep.name;
        }
      }

      const updated = TaskRepo.update(req.params.id, updatePayload);

      // ─── If re-assigned, notify new assignee via App & Email ──────
      if (req.body.assignedTo && req.body.assignedTo !== oldAssignee) {
        const emp = EmployeeRepo.findById(req.body.assignedTo);
        if (emp) {
          await notify({
            userId: emp.userId,
            title: 'Task Assigned',
            message: `Task "${task.name}" has been assigned to you by ${req.user.name}.`,
            type: 'info',
            link: `/tasks`,
            referenceId: task.id,
            referenceType: 'task',
          });
          try {
            await emailService.sendTaskAssigned({
              assignee: { ...emp, email: emp.email },
              assigner: { name: req.user.name },
              task: updated,
              project: task.projectName,
              client: task.clientName,
            });
          } catch (err) {
            console.error('[TaskController] Reassign email failed:', err.message);
          }
        }
      }

      // ─── If task completed, notify Report To & Admin ──────────────
      if (req.body.status === 'completed' && oldStatus !== 'completed') {
        // 1. Notify Report To person (App + Email)
        const reportToId = updated.reportedTo || task.reportedTo;
        if (reportToId) {
          const reportEmp = EmployeeRepo.findById(reportToId);
          if (reportEmp) {
            await notify({
              userId: reportEmp.userId,
              title: 'Task Completed',
              message: `Task "${task.name}" reported to you was marked completed by ${req.user.name}.`,
              type: 'success',
              link: `/tasks`,
              referenceId: task.id,
              referenceType: 'task',
            });
            try {
              await emailService.sendTaskCompleted({
                recipient: reportEmp,
                completedBy: req.user,
                task: updated,
                project: task.projectName,
              });
            } catch (err) {
              console.error('[TaskController] Task completed email failed:', err.message);
            }
          }
        }

        // 2. Notify Admins
        const adminUsers = UserRepo.findAll().filter((u) => ['super_admin', 'admin'].includes(u.role));
        for (const admin of adminUsers) {
          // Avoid duplicate notification if the admin completed it or is already the reportTo
          const isCompleter = admin.id === req.user.id;
          const isReportUser = reportToId && EmployeeRepo.findById(reportToId)?.userId === admin.id;
          if (!isCompleter && !isReportUser) {
            await notify({
              userId: admin.id,
              title: 'Task Completed',
              message: `Task "${task.name}" (${task.projectName || 'General'}) was completed by ${req.user.name}.`,
              type: 'success',
              link: `/tasks`,
              referenceId: task.id,
              referenceType: 'task',
            });
          }
        }

        // Unblock downstream tasks
        const allTasks = TaskRepo.findAll();
        const downstream = allTasks.filter((t) => t.dependencies?.includes(task.id) && t.status === 'blocked');
        downstream.forEach((t) => TaskRepo.update(t.id, { status: 'todo' }));
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_TASK', module: 'tasks', referenceId: task.id, oldValue: { status: oldStatus }, newValue: { status: updated.status } });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  addComment: (req, res, next) => {
    try {
      const task = TaskRepo.findById(req.params.id);
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
      const comments = task.comments || [];
      comments.push({ id: require('../repositories/jsonRepository').uuidv4(), text: req.body.text, mentions: req.body.mentions || [], author: req.user.id, authorName: req.user.name, createdAt: new Date().toISOString() });
      const updated = TaskRepo.update(task.id, { comments });
      res.status(201).json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  addAttachment: (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
      const task = TaskRepo.findById(req.params.id);
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
      const attachments = task.attachments || [];
      attachments.push({ id: require('../repositories/jsonRepository').uuidv4(), fileName: req.file.originalname, fileUrl: `/uploads/${req.file.filename}`, fileSize: req.file.size, uploadedBy: req.user.id, uploadedByName: req.user.name, uploadedAt: new Date().toISOString() });
      const updated = TaskRepo.update(task.id, { attachments });
      res.status(201).json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  delete: (req, res, next) => {
    try {
      const task = TaskRepo.findById(req.params.id);
      if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      const isCreator = task.createdBy === req.user.id;
      const isPM = req.user.role === 'project_manager';

      if (!isAdmin && !isCreator && !isPM) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
      }

      TaskRepo.remove(req.params.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'DELETE_TASK', module: 'task', referenceId: req.params.id });
      res.json({ success: true, message: 'Task deleted successfully' });
    } catch (err) { next(err); }
  },
};

module.exports = taskController;
