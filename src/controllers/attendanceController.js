const { AttendanceRepo, EmployeeRepo, HolidayRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function calcWorkingHours(loginTime, logoutTime, breakDuration = 0) {
  if (!loginTime || !logoutTime) return 0;
  const start = new Date(loginTime);
  const end = new Date(logoutTime);
  const diffMs = end - start - breakDuration * 60 * 1000;
  return Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
}

function getEmployeeMap() {
  const employees = EmployeeRepo.findAll();
  const map = {};
  for (const emp of employees) {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || 'Employee';
    map[emp.id] = {
      ...emp,
      fullName,
    };
  }
  return { employees, map };
}

const attendanceController = {
  checkIn: (req, res, next) => {
    try {
      const employee = EmployeeRepo.findByUserId(req.user.id);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

      const today = getTodayDate();
      const existing = AttendanceRepo.findByEmployeeAndDate(employee.id, today);
      if (existing && existing.loginTime) {
        return res.status(409).json({ success: false, message: 'Already checked in today' });
      }

      const loginTime = new Date().toISOString();
      const LATE_THRESHOLD_HOUR = 9; // 9 AM
      const loginHour = new Date(loginTime).getHours();
      const isLate = loginHour >= LATE_THRESHOLD_HOUR + 1; // allow till 10AM

      const record = existing
        ? AttendanceRepo.update(existing.id, { loginTime, status: isLate ? 'late' : 'present' })
        : AttendanceRepo.create({
            employeeId: employee.id,
            employeeName: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.name,
            date: today,
            loginTime,
            status: isLate ? 'late' : 'present',
            breakDuration: 0,
            workingHours: 0,
            breaks: []
          });

      res.json({ success: true, message: 'Checked in successfully', data: record });
    } catch (err) { next(err); }
  },

  checkOut: (req, res, next) => {
    try {
      const employee = EmployeeRepo.findByUserId(req.user.id);
      if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

      const today = getTodayDate();
      const record = AttendanceRepo.findByEmployeeAndDate(employee.id, today);
      if (!record || !record.loginTime) return res.status(400).json({ success: false, message: 'No check-in found for today' });
      if (record.logoutTime) return res.status(409).json({ success: false, message: 'Already checked out' });

      const logoutTime = new Date().toISOString();
      const workingHours = calcWorkingHours(record.loginTime, logoutTime, record.breakDuration);
      const isEarlyLogout = workingHours < 8;

      const updated = AttendanceRepo.update(record.id, {
        logoutTime,
        workingHours,
        overtime: Math.max(0, workingHours - 8),
        status: record.status === 'late' ? 'late' : isEarlyLogout ? 'early_logout' : 'present'
      });
      res.json({ success: true, message: 'Checked out successfully', data: updated });
    } catch (err) { next(err); }
  },

  startBreak: (req, res, next) => {
    try {
      const employee = EmployeeRepo.findByUserId(req.user.id);
      const today = getTodayDate();
      const record = AttendanceRepo.findByEmployeeAndDate(employee.id, today);
      if (!record) return res.status(400).json({ success: false, message: 'No check-in found' });

      const breaks = record.breaks || [];
      const activeBreak = breaks.find((b) => !b.end);
      if (activeBreak) return res.status(409).json({ success: false, message: 'Break already in progress' });

      breaks.push({ start: new Date().toISOString(), end: null });
      const updated = AttendanceRepo.update(record.id, { breaks });
      res.json({ success: true, message: 'Break started', data: updated });
    } catch (err) { next(err); }
  },

  endBreak: (req, res, next) => {
    try {
      const employee = EmployeeRepo.findByUserId(req.user.id);
      const today = getTodayDate();
      const record = AttendanceRepo.findByEmployeeAndDate(employee.id, today);
      if (!record) return res.status(400).json({ success: false, message: 'No check-in found' });

      const breaks = record.breaks || [];
      const activeIdx = breaks.findIndex((b) => !b.end);
      if (activeIdx === -1) return res.status(400).json({ success: false, message: 'No active break' });

      breaks[activeIdx].end = new Date().toISOString();
      const breakMs = new Date(breaks[activeIdx].end) - new Date(breaks[activeIdx].start);
      const totalBreakMin = (record.breakDuration || 0) + Math.round(breakMs / 60000);
      const updated = AttendanceRepo.update(record.id, { breaks, breakDuration: totalBreakMin });
      res.json({ success: true, message: 'Break ended', data: updated });
    } catch (err) { next(err); }
  },

  getAll: (req, res) => {
    const { employeeId, date, startDate, endDate, month } = req.query;
    let records = AttendanceRepo.findAll();
    const { map } = getEmployeeMap();

    // Enrich with employee profile
    records = records.map((r) => {
      const emp = map[r.employeeId];
      return {
        ...r,
        employeeName: r.employeeName || emp?.fullName || 'Employee',
        employeeEmail: emp?.email || '',
        department: emp?.department || 'General',
        designation: emp?.designation || '',
        avatar: emp?.profilePhoto || null,
      };
    });

    if (employeeId) records = records.filter((r) => r.employeeId === employeeId);
    if (date) records = records.filter((r) => r.date === date);
    if (startDate) records = records.filter((r) => r.date >= startDate);
    if (endDate) records = records.filter((r) => r.date <= endDate);
    if (month) records = records.filter((r) => r.date.startsWith(month));

    records.sort((a, b) => b.date.localeCompare(a.date));
    res.json({ success: true, data: records });
  },

  getMyAttendance: (req, res) => {
    const employee = EmployeeRepo.findByUserId(req.user.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const records = AttendanceRepo.findByEmployee(employee.id).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ success: true, data: records });
  },

  correct: (req, res, next) => {
    try {
      const record = AttendanceRepo.findById(req.params.id);
      if (!record) return res.status(404).json({ success: false, message: 'Attendance record not found' });
      const { loginTime, logoutTime, status, workingHours: manualHours, reason } = req.body;
      const computedHours = manualHours !== undefined ? Number(manualHours) : calcWorkingHours(loginTime || record.loginTime, logoutTime || record.logoutTime, record.breakDuration);
      const corrections = record.corrections || [];
      corrections.push({
        correctedBy: req.user.id,
        reason: reason || 'Admin correction',
        at: new Date().toISOString(),
        oldLogin: record.loginTime,
        oldLogout: record.logoutTime,
        oldStatus: record.status,
      });

      const updated = AttendanceRepo.update(req.params.id, {
        loginTime: loginTime !== undefined ? loginTime : record.loginTime,
        logoutTime: logoutTime !== undefined ? logoutTime : record.logoutTime,
        status: status || record.status,
        workingHours: computedHours,
        corrections,
      });
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CORRECT_ATTENDANCE', module: 'attendance', referenceId: record.id });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  // ─── Reporting Endpoint (Daily, Weekly, Monthly) ───────────────────
  getReport: (req, res) => {
    const { type = 'daily', date, month, weekStart, employeeId } = req.query;
    const { employees, map } = getEmployeeMap();
    const allAttendance = AttendanceRepo.findAll();
    const holidays = HolidayRepo ? HolidayRepo.findAll() : [];
    const holidayMap = {};
    holidays.forEach((h) => { holidayMap[h.date] = h; });

    const activeEmployees = employees.filter((e) => e.status !== 'inactive' && e.status !== 'terminated');
    const targetEmployees = employeeId ? activeEmployees.filter((e) => e.id === employeeId) : activeEmployees;

    if (type === 'daily') {
      const targetDate = date || getTodayDate();
      const holidayInfo = holidayMap[targetDate] || null;

      const recordsForDate = allAttendance.filter((r) => r.date === targetDate);
      const recMap = {};
      recordsForDate.forEach((r) => { recMap[r.employeeId] = r; });

      const employeeStatusList = targetEmployees.map((emp) => {
        const att = recMap[emp.id];
        let status = 'absent';
        if (att) {
          status = att.status; // 'present', 'late', 'on_leave', 'half_day', etc.
        } else if (holidayInfo) {
          status = 'holiday';
        }

        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department || 'General',
          designation: emp.designation || '',
          email: emp.email,
          status,
          loginTime: att?.loginTime || null,
          logoutTime: att?.logoutTime || null,
          workingHours: att?.workingHours || 0,
          breakDuration: att?.breakDuration || 0,
          leaveType: att?.leaveType || null,
          notes: att?.notes || (holidayInfo ? holidayInfo.name : null),
          recordId: att?.id || null,
        };
      });

      const summary = {
        date: targetDate,
        totalEmployees: targetEmployees.length,
        present: employeeStatusList.filter((e) => ['present', 'early_logout'].includes(e.status)).length,
        late: employeeStatusList.filter((e) => e.status === 'late').length,
        onLeave: employeeStatusList.filter((e) => e.status === 'on_leave').length,
        halfDay: employeeStatusList.filter((e) => e.status === 'half_day').length,
        holiday: holidayInfo ? targetEmployees.length : 0,
        absent: employeeStatusList.filter((e) => e.status === 'absent').length,
        holidayInfo,
      };

      return res.json({ success: true, data: { type: 'daily', summary, details: employeeStatusList } });
    }

    if (type === 'weekly') {
      // 7-day range starting at weekStart (or current week Monday)
      let startDateStr = weekStart;
      if (!startDateStr) {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diffToMon);
        startDateStr = mon.toISOString().split('T')[0];
      }

      // Generate 7 days
      const days = [];
      const d = new Date(startDateStr);
      for (let i = 0; i < 7; i++) {
        const dayStr = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        days.push({ date: dayStr, dayName, isHoliday: Boolean(holidayMap[dayStr]), holiday: holidayMap[dayStr] || null });
        d.setDate(d.getDate() + 1);
      }
      const endDateStr = days[6].date;

      const weekAttendance = allAttendance.filter((r) => r.date >= startDateStr && r.date <= endDateStr);

      const employeeRows = targetEmployees.map((emp) => {
        const empAtt = weekAttendance.filter((r) => r.employeeId === emp.id);
        const dayStatus = {};
        let totalHours = 0;
        let presentCount = 0;
        let leaveCount = 0;
        let lateCount = 0;

        days.forEach((day) => {
          const att = empAtt.find((r) => r.date === day.date);
          let status = 'absent';
          let hours = 0;
          if (att) {
            status = att.status;
            hours = att.workingHours || 0;
            if (['present', 'late', 'early_logout'].includes(status)) presentCount++;
            if (status === 'late') lateCount++;
            if (status === 'on_leave') leaveCount++;
            if (status === 'half_day') { presentCount += 0.5; leaveCount += 0.5; }
          } else if (day.isHoliday) {
            status = 'holiday';
          }
          totalHours += hours;
          dayStatus[day.date] = {
            status,
            hours,
            loginTime: att?.loginTime || null,
            logoutTime: att?.logoutTime || null,
            leaveType: att?.leaveType || null,
          };
        });

        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department || 'General',
          days: dayStatus,
          totalHours: Math.round(totalHours * 10) / 10,
          presentCount,
          lateCount,
          leaveCount,
        };
      });

      return res.json({
        success: true,
        data: {
          type: 'weekly',
          startDate: startDateStr,
          endDate: endDateStr,
          days,
          details: employeeRows,
          totalEmployees: targetEmployees.length,
        },
      });
    }

    if (type === 'monthly') {
      const targetMonth = month || getTodayDate().substring(0, 7); // 'YYYY-MM'
      const monthAttendance = allAttendance.filter((r) => r.date.startsWith(targetMonth));

      // Calculate days in month
      const [yearStr, mStr] = targetMonth.split('-');
      const year = parseInt(yearStr, 10);
      const m = parseInt(mStr, 10);
      const daysInMonth = new Date(year, m, 0).getDate();

      const employeeRows = targetEmployees.map((emp) => {
        const empAtt = monthAttendance.filter((r) => r.employeeId === emp.id);
        let presentDays = 0;
        let lateDays = 0;
        let leaveDays = 0;
        let halfDays = 0;
        let totalHours = 0;

        empAtt.forEach((a) => {
          if (a.status === 'present' || a.status === 'early_logout') presentDays++;
          else if (a.status === 'late') { presentDays++; lateDays++; }
          else if (a.status === 'on_leave') leaveDays++;
          else if (a.status === 'half_day') { halfDays++; presentDays += 0.5; leaveDays += 0.5; }
          totalHours += a.workingHours || 0;
        });

        const avgHours = presentDays > 0 ? Math.round((totalHours / presentDays) * 10) / 10 : 0;

        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department || 'General',
          designation: emp.designation || '',
          email: emp.email,
          presentDays,
          lateDays,
          leaveDays,
          halfDays,
          totalHours: Math.round(totalHours * 10) / 10,
          avgHours,
        };
      });

      const totalWorkingDays = daysInMonth;
      return res.json({
        success: true,
        data: {
          type: 'monthly',
          month: targetMonth,
          daysInMonth,
          totalEmployees: targetEmployees.length,
          details: employeeRows,
        },
      });
    }

    res.status(400).json({ success: false, message: 'Invalid report type' });
  },
};

module.exports = attendanceController;

