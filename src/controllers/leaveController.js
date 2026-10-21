const { LeaveRepo, EmployeeRepo, NotificationRepo, AttendanceRepo, HolidayRepo, LeaveTypeRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notify } = require('../utils/notificationService');
const emailService = require('../utils/emailService');

const leaveController = {
  apply: (req, res, next) => {
    try {
      const employee = EmployeeRepo.findByUserId(req.user.id);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

      const leaveType = req.body.leaveType || req.body.type;
      const { startDate, endDate, reason, halfDayType } = req.body;
      const halfDay = req.body.halfDay === true || req.body.isHalfDay === true;

      if (!leaveType || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'Leave type, start and end date required' });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
      const days = halfDay ? 0.5 : Math.max(1, diffDays);

      const leave = LeaveRepo.create({
        employeeId: employee.id,
        employeeName: employee.name,
        type: leaveType,
        leaveType,
        startDate,
        endDate,
        halfDay,
        isHalfDay: halfDay,
        halfDayType: halfDay ? (halfDayType || 'first_half') : null,
        days,
        daysCount: days,
        reason: reason || '',
        status: 'pending',
        appliedAt: new Date().toISOString(),
      });

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'APPLY_LEAVE',
        module: 'leave',
        referenceId: leave.id,
        newValue: leave,
      });

      res.status(201).json({ success: true, message: 'Leave applied successfully', data: leave });
    } catch (err) {
      next(err);
    }
  },

  getAll: (req, res) => {
    const { employeeId, status, startDate, endDate } = req.query;
    let leaves = LeaveRepo.findAll();
    if (employeeId) leaves = leaves.filter((l) => l.employeeId === employeeId);
    if (status) leaves = leaves.filter((l) => l.status === status);
    if (startDate) leaves = leaves.filter((l) => l.startDate >= startDate);
    if (endDate) leaves = leaves.filter((l) => l.endDate <= endDate);

    const employees = EmployeeRepo.findAll();
    const enriched = leaves.map((l) => {
      const emp = employees.find((e) => e.id === l.employeeId);
      return {
        ...l,
        employeeName: emp?.name || l.employeeName || 'Unknown Employee',
        employeeDepartment: emp?.department || '',
        employeeDesignation: emp?.designation || '',
        employeePhoto: emp?.profilePhoto || null,
      };
    });

    enriched.sort((a, b) => (b.appliedAt || b.createdAt || '').localeCompare(a.appliedAt || a.createdAt || ''));
    res.json({ success: true, data: enriched });
  },

  getMyLeaves: (req, res) => {
    const employee = EmployeeRepo.findByUserId(req.user.id);
    if (!employee) return res.json({ success: true, data: [] });
    const leaves = LeaveRepo.findByEmployee(employee.id).sort((a, b) =>
      (b.appliedAt || b.createdAt || '').localeCompare(a.appliedAt || a.createdAt || '')
    );
    res.json({ success: true, data: leaves });
  },

  decide: async (req, res, next) => {
    try {
      const leave = LeaveRepo.findById(req.params.id);
      if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });
      if (leave.status !== 'pending') return res.status(400).json({ success: false, message: 'Leave already decided' });

      // Support both { decision: 'approved' } and { status: 'approved' }
      const decision = (req.body.decision || req.body.status || '').toLowerCase();
      const remarks = req.body.remarks || req.body.rejectionReason || '';

      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'Decision must be approved or rejected' });
      }

      const updated = LeaveRepo.update(leave.id, {
        status: decision,
        decidedBy: req.user.id,
        decidedByName: req.user.name,
        decidedAt: new Date().toISOString(),
        remarks,
      });

      // ─── If Approved, reflect in Attendance records! ───────────────
      if (decision === 'approved') {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const cur = new Date(start);

        const leaveTypeDisplay = leave.type || leave.leaveType || 'paid';
        const isHalf = leave.halfDay || leave.isHalfDay;

        while (cur <= end) {
          const dateStr = cur.toISOString().split('T')[0];
          const existingAtt = AttendanceRepo.findByEmployeeAndDate(leave.employeeId, dateStr);

          if (existingAtt) {
            AttendanceRepo.update(existingAtt.id, {
              status: isHalf ? 'half_day' : 'on_leave',
              leaveType: leaveTypeDisplay,
              leaveId: leave.id,
              workingHours: isHalf ? 4 : 0,
              notes: `Approved Leave (${leaveTypeDisplay})${leave.reason ? ': ' + leave.reason : ''}`,
            });
          } else {
            AttendanceRepo.create({
              employeeId: leave.employeeId,
              employeeName: leave.employeeName,
              date: dateStr,
              loginTime: null,
              logoutTime: null,
              workingHours: isHalf ? 4 : 0,
              breakDuration: 0,
              status: isHalf ? 'half_day' : 'on_leave',
              leaveType: leaveTypeDisplay,
              leaveId: leave.id,
              notes: `Approved Leave (${leaveTypeDisplay})${leave.reason ? ': ' + leave.reason : ''}`,
            });
          }

          cur.setDate(cur.getDate() + 1);
        }
      }

      // Notify employee
      const employee = EmployeeRepo.findById(leave.employeeId);
      if (employee) {
        await notify({
          userId: employee.userId,
          title: `Leave ${decision === 'approved' ? 'Approved' : 'Rejected'}`,
          message: `Your ${leave.type || leave.leaveType} leave from ${leave.startDate} to ${leave.endDate} has been ${decision}.`,
          type: decision === 'approved' ? 'success' : 'error',
          link: '/leave',
        });
        try {
          await emailService.sendLeaveDecision({ employee, leave, decision, decidedBy: req.user.name });
        } catch {}
      }

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: `LEAVE_${decision.toUpperCase()}`,
        module: 'leave',
        referenceId: leave.id,
      });

      res.json({ success: true, message: `Leave ${decision} successfully`, data: updated });
    } catch (err) {
      next(err);
    }
  },

  getBalance: (req, res) => {
    const employee = EmployeeRepo.findByUserId(req.user.id);
    const leaveTypes = LeaveTypeRepo.findAll();
    const year = new Date().getFullYear().toString();

    const used = {};
    leaveTypes.forEach((lt) => { used[lt.code] = 0; });

    if (employee) {
      const leaves = LeaveRepo.findByEmployee(employee.id).filter(
        (l) => l.status === 'approved' && l.startDate?.startsWith(year)
      );
      leaves.forEach((l) => {
        const code = l.type || l.leaveType;
        const count = parseFloat(l.days || l.daysCount) || 1;
        if (used[code] !== undefined) {
          used[code] += count;
        } else {
          used[code] = count;
        }
      });
    }

    const balance = {};
    leaveTypes.forEach((lt) => {
      const allocated = lt.quotaDays || 0;
      const spent = used[lt.code] || 0;
      balance[lt.code] = {
        name: lt.name,
        code: lt.code,
        isPaid: lt.isPaid !== false,
        allocated,
        used: spent,
        remaining: Math.max(0, allocated - spent),
      };
    });

    res.json({ success: true, data: balance });
  },

  // ─── Holidays Management ─────────────────────────────────────────
  getHolidays: (req, res) => {
    const holidays = HolidayRepo.findAll().sort((a, b) => a.date.localeCompare(b.date));
    res.json({ success: true, data: holidays });
  },

  addHoliday: (req, res, next) => {
    try {
      const { title, date, description, type = 'gazetted' } = req.body;
      if (!title || !date) {
        return res.status(400).json({ success: false, message: 'Title and date are required for a holiday' });
      }

      const holiday = HolidayRepo.create({
        title,
        date,
        description: description || '',
        type,
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
      });

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'ADD_HOLIDAY',
        module: 'leave',
        referenceId: holiday.id,
        newValue: holiday,
      });

      res.status(201).json({ success: true, message: 'Holiday added successfully', data: holiday });
    } catch (err) {
      next(err);
    }
  },

  removeHoliday: (req, res, next) => {
    try {
      const holiday = HolidayRepo.findById(req.params.id);
      if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });

      HolidayRepo.remove(req.params.id);
      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'REMOVE_HOLIDAY',
        module: 'leave',
        referenceId: req.params.id,
      });

      res.json({ success: true, message: 'Holiday removed successfully' });
    } catch (err) {
      next(err);
    }
  },

  // ─── Leave Types Management ──────────────────────────────────────
  getLeaveTypes: (req, res) => {
    const types = LeaveTypeRepo.findAll();
    res.json({ success: true, data: types });
  },

  addLeaveType: (req, res, next) => {
    try {
      const { name, code, quotaDays, isPaid = true, description } = req.body;
      if (!name || quotaDays === undefined) {
        return res.status(400).json({ success: false, message: 'Name and quota days are required' });
      }

      const cleanCode = (code || name.toLowerCase().replace(/[^a-z0-9]/g, '_')).trim();
      const existing = LeaveTypeRepo.findByCode(cleanCode);
      if (existing) {
        return res.status(409).json({ success: false, message: 'A leave type with this code already exists' });
      }

      const newType = LeaveTypeRepo.create({
        name,
        code: cleanCode,
        quotaDays: Number(quotaDays),
        isPaid: Boolean(isPaid),
        description: description || '',
        createdAt: new Date().toISOString(),
      });

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'ADD_LEAVE_TYPE',
        module: 'leave',
        referenceId: newType.id,
        newValue: newType,
      });

      res.status(201).json({ success: true, message: 'Leave type created successfully', data: newType });
    } catch (err) {
      next(err);
    }
  },

  updateLeaveType: (req, res, next) => {
    try {
      const type = LeaveTypeRepo.findById(req.params.id);
      if (!type) return res.status(404).json({ success: false, message: 'Leave type not found' });

      const { name, quotaDays, isPaid, description } = req.body;
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (quotaDays !== undefined) updateData.quotaDays = Number(quotaDays);
      if (isPaid !== undefined) updateData.isPaid = Boolean(isPaid);
      if (description !== undefined) updateData.description = description;

      const updated = LeaveTypeRepo.update(req.params.id, updateData);
      res.json({ success: true, message: 'Leave type updated', data: updated });
    } catch (err) {
      next(err);
    }
  },

  removeLeaveType: (req, res, next) => {
    try {
      const type = LeaveTypeRepo.findById(req.params.id);
      if (!type) return res.status(404).json({ success: false, message: 'Leave type not found' });

      LeaveTypeRepo.remove(req.params.id);
      res.json({ success: true, message: 'Leave type removed' });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = leaveController;
