const { EnquiryRepo, UserRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notifyMany } = require('../utils/notificationService');

const enquiryController = {
  // Public endpoint for submitting an enquiry from landing page
  create: async (req, res, next) => {
    try {
      const { name, email, phone, company, teamSize, planInterested, modules, message } = req.body;

      if (!name || (!email && !phone)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide your name and at least an email or phone number.',
        });
      }

      const enquiry = EnquiryRepo.create({
        name: name.trim(),
        email: email ? email.trim() : '',
        phone: phone ? phone.trim() : '',
        company: company ? company.trim() : 'Independent / Undisclosed',
        teamSize: teamSize || '1-10',
        planInterested: planInterested || 'Growth Pro',
        modules: Array.isArray(modules) ? modules : (modules ? [modules] : []),
        message: message ? message.trim() : '',
        status: 'new',
        adminNotes: '',
        createdAt: new Date().toISOString(),
      });

      // Find all admins to notify them in-app
      try {
        const admins = UserRepo.findAll().filter((u) => ['super_admin', 'admin'].includes(u.role));
        const adminIds = admins.map((a) => a.id);
        if (adminIds.length > 0) {
          await notifyMany(adminIds, {
            title: 'New Product Enquiry Received',
            message: `${enquiry.name} from ${enquiry.company} submitted a new product enquiry.`,
            type: 'info',
            link: '/dashboard',
            referenceId: enquiry.id,
            referenceType: 'enquiry',
          });
        }
      } catch (notifyErr) {
        console.warn('Could not notify admins:', notifyErr.message);
      }

      // Audit log entry
      try {
        auditLog({
          userId: 'SYSTEM',
          userName: 'Public Visitor',
          action: 'SUBMIT_ENQUIRY',
          module: 'enquiries',
          referenceId: enquiry.id,
          newValue: enquiry,
        });
      } catch {}

      res.status(201).json({
        success: true,
        message: 'Your enquiry has been received successfully. Our team will contact you shortly!',
        data: enquiry,
      });
    } catch (err) {
      next(err);
    }
  },

  // Admin-only endpoint: Get all enquiries
  getAll: (req, res) => {
    try {
      const { status, search: q } = req.query;
      let enquiries = EnquiryRepo.findAll();

      if (status && status !== 'all') {
        enquiries = enquiries.filter((e) => e.status === status);
      }

      if (q) {
        const query = q.toLowerCase();
        enquiries = enquiries.filter((e) =>
          [e.name, e.email, e.phone, e.company, e.message].some((val) =>
            val?.toLowerCase().includes(query)
          )
        );
      }

      // Sort newest first
      enquiries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      res.json({
        success: true,
        data: enquiries,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // Admin-only endpoint: Update enquiry status or notes
  update: (req, res, next) => {
    try {
      const enquiry = EnquiryRepo.findById(req.params.id);
      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry not found' });
      }

      const { status, adminNotes } = req.body;
      const updated = EnquiryRepo.update(enquiry.id, {
        ...(status ? { status } : {}),
        ...(adminNotes !== undefined ? { adminNotes } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.name,
      });

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'UPDATE_ENQUIRY',
        module: 'enquiries',
        referenceId: enquiry.id,
        oldValue: enquiry,
        newValue: updated,
      });

      res.json({
        success: true,
        message: 'Enquiry updated successfully',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  },

  // Admin-only endpoint: Delete enquiry
  remove: (req, res, next) => {
    try {
      const enquiry = EnquiryRepo.findById(req.params.id);
      if (!enquiry) {
        return res.status(404).json({ success: false, message: 'Enquiry not found' });
      }

      EnquiryRepo.remove(enquiry.id);

      auditLog({
        userId: req.user.id,
        userName: req.user.name,
        action: 'DELETE_ENQUIRY',
        module: 'enquiries',
        referenceId: enquiry.id,
      });

      res.json({
        success: true,
        message: 'Enquiry deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = enquiryController;
