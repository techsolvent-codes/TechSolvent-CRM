const { ChatGroupRepo, ChatMemberRepo, ChatMessageRepo, DirectConversationRepo, ChatReactionRepo, EmployeeRepo } = require('../repositories');
const { auditLog } = require('../utils/auditLog');
const { notify } = require('../utils/notificationService');

const chatController = {
  // ─── Groups ──────────────────────────────────────────────────────
  getGroups: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    const isSysAdmin = ['super_admin', 'admin'].includes(req.user.role);
    if (!emp && !isSysAdmin) return res.json({ success: true, data: [] });

    const memberships = emp ? ChatMemberRepo.findByEmployee(emp.id) : [];
    const groupIds = memberships.map((m) => m.groupId);

    // System Admins see all active groups; regular employees see groups they belong to or announcement groups
    let groups;
    if (isSysAdmin) {
      groups = ChatGroupRepo.findAll().filter((g) => g.status !== 'archived');
    } else {
      groups = ChatGroupRepo.findAll().filter((g) => (groupIds.includes(g.id) || g.type === 'announcement') && g.status !== 'archived');
    }

    // Attach unread count, last message, and memberRole to each group
    const enriched = groups.map((g) => {
      const membership = memberships.find((m) => m.groupId === g.id);
      const messages = ChatMessageRepo.findByGroup(g.id);
      const lastMessage = messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const unread = membership?.lastReadAt 
        ? messages.filter((m) => m.senderId !== emp?.id && m.createdAt > membership.lastReadAt).length 
        : (membership ? messages.filter((m) => m.senderId !== emp?.id).length : 0);
      const memberRole = membership?.role || (isSysAdmin ? 'admin' : 'member');
      return { ...g, lastMessage, unreadCount: unread, memberRole };
    });
    res.json({ success: true, data: enriched });
  },

  createGroup: (req, res, next) => {
    try {
      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: 'Only administrators can create channels/groups' });
      }
      const { name, description, type, members, groupAdminId, groupAdmins } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Group name required' });
      let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const group = ChatGroupRepo.create({
        name,
        description,
        type: type || 'custom',
        status: 'active',
        createdBy: emp?.id,
        createdByName: req.user.name,
      });

      const addedMemberIds = new Set();

      // Add creator as admin
      if (emp?.id) {
        ChatMemberRepo.create({ groupId: group.id, employeeId: emp.id, role: 'admin', joinedAt: new Date().toISOString() });
        addedMemberIds.add(emp.id);
      }

      // Collect designated admin employee IDs
      const designatedAdminIds = new Set();
      if (groupAdminId) designatedAdminIds.add(groupAdminId);
      if (Array.isArray(groupAdmins)) groupAdmins.forEach((id) => designatedAdminIds.add(id));

      // Add designated group admin(s)
      designatedAdminIds.forEach((adminEmpId) => {
        if (!addedMemberIds.has(adminEmpId)) {
          ChatMemberRepo.create({ groupId: group.id, employeeId: adminEmpId, role: 'admin', joinedAt: new Date().toISOString() });
          addedMemberIds.add(adminEmpId);
        }
      });

      // Add initial members
      if (Array.isArray(members) && members.length) {
        members.forEach((memberItem) => {
          const memberId = typeof memberItem === 'object' ? memberItem.employeeId : memberItem;
          const role = typeof memberItem === 'object' && memberItem.role ? memberItem.role : (designatedAdminIds.has(memberId) ? 'admin' : 'member');
          if (memberId && !addedMemberIds.has(memberId)) {
            ChatMemberRepo.create({ groupId: group.id, employeeId: memberId, role, joinedAt: new Date().toISOString() });
            addedMemberIds.add(memberId);
          }
        });
      }

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'CREATE_CHAT_GROUP', module: 'chat', referenceId: group.id });
      res.status(201).json({ success: true, data: group });
    } catch (err) { next(err); }
  },

  getGroupMessages: (req, res) => {
    const messages = ChatMessageRepo.findByGroup(req.params.groupId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const reactions = require('../repositories').ChatReactionRepo;
    const enriched = messages.map((m) => ({ ...m, reactions: reactions.findByMessage(m.id) }));

    // Update last read
    const emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    const membership = emp ? ChatMemberRepo.findMembership(req.params.groupId, emp.id) : null;
    if (membership) ChatMemberRepo.update(membership.id, { lastReadAt: new Date().toISOString() });

    res.json({ success: true, data: enriched });
  },

  sendGroupMessage: (req, res, next) => {
    try {
      const emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const { message, messageType = 'text', parentMessageId } = req.body;
      if (!message && !req.file) return res.status(400).json({ success: false, message: 'Message or file required' });

      // If user is not yet a member in this group, join them automatically
      if (emp) {
        const existingMembership = ChatMemberRepo.findMembership(req.params.groupId, emp.id);
        if (!existingMembership) {
          const isSysAdmin = ['super_admin', 'admin'].includes(req.user.role);
          ChatMemberRepo.create({
            groupId: req.params.groupId,
            employeeId: emp.id,
            role: isSysAdmin ? 'admin' : 'member',
            joinedAt: new Date().toISOString(),
          });
        }
      }

      const msg = ChatMessageRepo.create({
        groupId: req.params.groupId,
        senderId: emp?.id,
        senderName: req.user.name,
        senderPhoto: emp?.profilePhoto,
        message,
        messageType,
        parentMessageId: parentMessageId || null,
        fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
        fileName: req.file?.originalname,
      });

      // Emit via Socket.IO to the active channel room
      if (global._io) global._io.to(`group:${req.params.groupId}`).emit('chat:message', msg);

      // Notify other channel members (real-time unread badge update + Web Push)
      const group = ChatGroupRepo.findById(req.params.groupId);
      const members = ChatMemberRepo.findByGroup(req.params.groupId);
      members.forEach((m) => {
        if (m.employeeId === emp?.id) return; // Don't notify sender
        const memberEmp = EmployeeRepo.findById(m.employeeId);
        if (memberEmp && memberEmp.userId) {
          if (global._io) {
            global._io.to(`user:${memberEmp.userId}`).emit('chat:unread_update', {
              groupId: req.params.groupId,
              type: 'group',
              msg,
            });
          }

          notify({
            userId: memberEmp.userId,
            title: `#${group?.name || 'Group Chat'} · ${req.user.name}`,
            message: msg.message || (msg.fileName ? `📎 Attachment: ${msg.fileName}` : 'New message'),
            type: 'chat',
            link: '/chat',
            referenceId: req.params.groupId,
            referenceType: 'chat_group',
          }).catch(() => {});
        }
      });

      res.status(201).json({ success: true, data: msg });
    } catch (err) { next(err); }
  },

  editMessage: (req, res, next) => {
    try {
      const msg = ChatMessageRepo.findById(req.params.messageId);
      if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
      const emp = EmployeeRepo.findByUserId(req.user.id);
      if (msg.senderId !== emp?.id && req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Cannot edit others messages' });
      const updated = ChatMessageRepo.update(req.params.messageId, { message: req.body.message, editedAt: new Date().toISOString() });
      if (global._io) global._io.to(`group:${msg.groupId}`).emit('chat:message_edited', updated);
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },

  deleteMessage: (req, res, next) => {
    try {
      const msg = ChatMessageRepo.findById(req.params.messageId);
      if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
      const emp = EmployeeRepo.findByUserId(req.user.id);
      if (msg.senderId !== emp?.id && req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Cannot delete others messages' });
      const updated = ChatMessageRepo.update(req.params.messageId, { deletedAt: new Date().toISOString(), message: '[Message deleted]' });
      if (global._io) global._io.to(`group:${msg.groupId}`).emit('chat:message_deleted', { messageId: msg.id, groupId: msg.groupId });
      res.json({ success: true, message: 'Message deleted' });
    } catch (err) { next(err); }
  },

  reactToMessage: (req, res, next) => {
    try {
      const emp = EmployeeRepo.findByUserId(req.user.id);
      const { reaction } = req.body;
      const result = ChatReactionRepo.toggle(req.params.messageId, emp?.id, reaction);
      const msg = ChatMessageRepo.findById(req.params.messageId);
      if (global._io && msg) global._io.to(`group:${msg.groupId}`).emit('chat:reaction', { messageId: msg.id, ...result });
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },

  getGroupMembers: (req, res, next) => {
    try {
      const memberships = ChatMemberRepo.findByGroup(req.params.groupId);
      const employees = EmployeeRepo.findAll();
      const enriched = memberships.map((m) => {
        const emp = employees.find((e) => e.id === m.employeeId);
        return {
          ...m,
          employeeName: emp?.name || 'Unknown Member',
          employeeEmail: emp?.email,
          employeeDesignation: emp?.designation,
          employeeDepartment: emp?.department,
          employeePhoto: emp?.profilePhoto,
        };
      });
      res.json({ success: true, data: enriched });
    } catch (err) { next(err); }
  },

  addGroupMember: (req, res, next) => {
    try {
      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      const requesterEmp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const requesterMembership = requesterEmp ? ChatMemberRepo.findMembership(req.params.groupId, requesterEmp.id) : null;
      const isChannelAdmin = requesterMembership?.role === 'admin';

      if (!isAdmin && !isChannelAdmin) {
        return res.status(403).json({ success: false, message: 'Only channel or system administrators can add members' });
      }

      const { employeeId, role = 'member' } = req.body;
      if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID is required' });
      const existing = ChatMemberRepo.findMembership(req.params.groupId, employeeId);
      if (existing) return res.status(409).json({ success: false, message: 'Employee is already a member of this channel' });
      
      const member = ChatMemberRepo.create({ 
        groupId: req.params.groupId, 
        employeeId, 
        role: role === 'admin' ? 'admin' : 'member', 
        joinedAt: new Date().toISOString() 
      });

      const emp = EmployeeRepo.findById(employeeId);
      const enriched = {
        ...member,
        employeeName: emp?.name || 'Unknown Member',
        employeeEmail: emp?.email,
        employeeDesignation: emp?.designation,
        employeeDepartment: emp?.department,
        employeePhoto: emp?.profilePhoto,
      };

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'ADD_CHAT_MEMBER', module: 'chat', referenceId: req.params.groupId });

      if (global._io) {
        global._io.to(`group:${req.params.groupId}`).emit('chat:member_added', { groupId: req.params.groupId, member: enriched });
      }

      res.status(201).json({ success: true, message: 'Member added successfully', data: enriched });
    } catch (err) { next(err); }
  },

  updateGroupMemberRole: (req, res, next) => {
    try {
      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      const requesterEmp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const requesterMembership = requesterEmp ? ChatMemberRepo.findMembership(req.params.groupId, requesterEmp.id) : null;
      const isChannelAdmin = requesterMembership?.role === 'admin';

      if (!isAdmin && !isChannelAdmin) {
        return res.status(403).json({ success: false, message: 'Only channel or system administrators can change member roles' });
      }

      const { role } = req.body;
      if (!role || !['admin', 'member'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Valid role (admin or member) is required' });
      }
      const membership = ChatMemberRepo.findMembership(req.params.groupId, req.params.employeeId);
      if (!membership) return res.status(404).json({ success: false, message: 'Member not found in channel' });
      
      const updated = ChatMemberRepo.update(membership.id, { role });
      const emp = EmployeeRepo.findById(req.params.employeeId);
      const enriched = {
        ...updated,
        employeeName: emp?.name,
        employeeEmail: emp?.email,
        employeeDesignation: emp?.designation,
        employeeDepartment: emp?.department,
      };

      auditLog({ userId: req.user.id, userName: req.user.name, action: 'UPDATE_CHAT_MEMBER_ROLE', module: 'chat', referenceId: req.params.groupId });

      if (global._io) {
        global._io.to(`group:${req.params.groupId}`).emit('chat:member_updated', { groupId: req.params.groupId, member: enriched });
      }

      res.json({ success: true, message: `Member role updated to ${role}`, data: enriched });
    } catch (err) { next(err); }
  },

  removeGroupMember: (req, res, next) => {
    try {
      const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
      const requesterEmp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const requesterMembership = requesterEmp ? ChatMemberRepo.findMembership(req.params.groupId, requesterEmp.id) : null;
      const isChannelAdmin = requesterMembership?.role === 'admin';

      if (!isAdmin && !isChannelAdmin) {
        return res.status(403).json({ success: false, message: 'Only channel or system administrators can remove members' });
      }

      const membership = ChatMemberRepo.findMembership(req.params.groupId, req.params.employeeId);
      if (!membership) return res.status(404).json({ success: false, message: 'Member not found in channel' });
      
      ChatMemberRepo.remove(membership.id);
      auditLog({ userId: req.user.id, userName: req.user.name, action: 'REMOVE_CHAT_MEMBER', module: 'chat', referenceId: req.params.groupId });

      if (global._io) {
        global._io.to(`group:${req.params.groupId}`).emit('chat:member_removed', { groupId: req.params.groupId, employeeId: req.params.employeeId });
      }

      res.json({ success: true, message: 'Member removed from channel' });
    } catch (err) { next(err); }
  },

  // ─── Direct Messages ─────────────────────────────────────────────
  getDirectConversations: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    if (!emp) return res.json({ success: true, data: [] });
    const conversations = DirectConversationRepo.findAll().filter((c) => c.members?.includes(emp.id));
    const employees = EmployeeRepo.findAll();
    const enriched = conversations.map((c) => {
      const otherId = c.members.find((m) => m !== emp.id);
      const other = employees.find((e) => e.id === otherId);
      const messages = ChatMessageRepo.findByConversation(c.id);
      const lastMessage = messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const myLastRead = c.lastReadBy?.[emp.id];
      const unreadCount = messages.filter((m) => m.senderId !== emp.id && (!myLastRead || m.createdAt > myLastRead)).length;
      return { ...c, otherEmployee: other, lastMessage, unreadCount };
    });
    res.json({ success: true, data: enriched });
  },

  getOrCreateDM: (req, res, next) => {
    try {
      let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      if (!emp) {
        emp = EmployeeRepo.create({
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email,
          designation: req.user.role === 'super_admin' ? 'Super Administrator' : 'Employee',
          department: 'Management',
          status: 'active',
          employmentType: 'full_time'
        });
      }
      const { employeeId } = req.params;
      const targetEmp = EmployeeRepo.findById(employeeId);
      if (!targetEmp) return res.status(404).json({ success: false, message: 'Target employee not found' });

      let conversation = DirectConversationRepo.findBetween(emp.id, employeeId);
      if (!conversation) {
        conversation = DirectConversationRepo.create({ members: [emp.id, employeeId], lastReadBy: {} });
      }
      res.json({ success: true, data: { ...conversation, otherEmployee: targetEmp } });
    } catch (err) { next(err); }
  },

  getDMMessages: (req, res) => {
    const messages = ChatMessageRepo.findByConversation(req.params.conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const reactions = require('../repositories').ChatReactionRepo;
    const enriched = messages.map((m) => ({ ...m, reactions: reactions.findByMessage(m.id) }));

    // Auto mark DM as read for current user
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    if (emp) {
      const conv = DirectConversationRepo.findById(req.params.conversationId);
      if (conv) {
        const lastReadBy = conv.lastReadBy || {};
        lastReadBy[emp.id] = new Date().toISOString();
        DirectConversationRepo.update(conv.id, { lastReadBy });
      }
    }

    res.json({ success: true, data: enriched });
  },

  markDMRead: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    if (emp) {
      const conv = DirectConversationRepo.findById(req.params.conversationId);
      if (conv) {
        const lastReadBy = conv.lastReadBy || {};
        lastReadBy[emp.id] = new Date().toISOString();
        DirectConversationRepo.update(conv.id, { lastReadBy });
      }
    }
    res.json({ success: true, message: 'DM marked as read' });
  },

  markGroupRead: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    if (emp) {
      const membership = ChatMemberRepo.findMembership(req.params.groupId, emp.id);
      if (membership) {
        ChatMemberRepo.update(membership.id, { lastReadAt: new Date().toISOString() });
      }
    }
    res.json({ success: true, message: 'Group marked as read' });
  },

  getUnreadCount: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    if (!emp) return res.json({ success: true, data: { total: 0, groups: 0, dms: 0, groupCounts: {}, dmCounts: {} } });

    // Group unread counts
    const isSysAdmin = ['super_admin', 'admin'].includes(req.user.role);
    const memberships = ChatMemberRepo.findByEmployee(emp.id);
    const groupIds = memberships.map((m) => m.groupId);
    let groups = isSysAdmin
      ? ChatGroupRepo.findAll().filter((g) => g.status !== 'archived')
      : ChatGroupRepo.findAll().filter((g) => (groupIds.includes(g.id) || g.type === 'announcement') && g.status !== 'archived');

    const groupCounts = {};
    let groupsUnread = 0;
    groups.forEach((g) => {
      const membership = memberships.find((m) => m.groupId === g.id);
      const messages = ChatMessageRepo.findByGroup(g.id);
      const unread = membership?.lastReadAt
        ? messages.filter((m) => m.senderId !== emp.id && m.createdAt > membership.lastReadAt).length
        : (membership ? messages.filter((m) => m.senderId !== emp.id).length : 0);
      groupCounts[g.id] = unread;
      groupsUnread += unread;
    });

    // DM unread counts
    const conversations = DirectConversationRepo.findAll().filter((c) => c.members?.includes(emp.id));
    const dmCounts = {};
    let dmsUnread = 0;
    conversations.forEach((c) => {
      const messages = ChatMessageRepo.findByConversation(c.id);
      const myLastRead = c.lastReadBy?.[emp.id];
      const unread = messages.filter((m) => m.senderId !== emp.id && (!myLastRead || m.createdAt > myLastRead)).length;
      dmCounts[c.id] = unread;
      dmsUnread += unread;
    });

    res.json({
      success: true,
      data: {
        total: groupsUnread + dmsUnread,
        groups: groupsUnread,
        dms: dmsUnread,
        groupCounts,
        dmCounts,
      },
    });
  },

  sendDMMessage: (req, res, next) => {
    try {
      let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
      const conversation = DirectConversationRepo.findById(req.params.conversationId);
      if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

      // Automatically update sender's own lastReadBy so sender doesn't have unread
      const lastReadBy = conversation.lastReadBy || {};
      if (emp?.id) lastReadBy[emp.id] = new Date().toISOString();
      DirectConversationRepo.update(conversation.id, { lastReadBy });

      const msg = ChatMessageRepo.create({
        conversationId: req.params.conversationId,
        senderId: emp?.id,
        senderName: req.user.name,
        senderPhoto: emp?.profilePhoto,
        message: req.body.message,
        messageType: req.body.messageType || 'text',
      });

      if (global._io) {
        conversation.members?.forEach((memberId) => {
          const memberEmp = EmployeeRepo.findById(memberId);
          if (memberEmp && memberEmp.userId) {
            // Live DM message
            global._io.to(`user:${memberEmp.userId}`).emit('chat:dm', {
              ...msg,
              otherEmployee: emp,
            });

            // If recipient, dispatch unread notification and Web Push
            if (memberId !== emp?.id) {
              global._io.to(`user:${memberEmp.userId}`).emit('chat:unread_update', {
                conversationId: conversation.id,
                type: 'dm',
                msg,
              });

              notify({
                userId: memberEmp.userId,
                title: `💬 ${req.user.name}`,
                message: msg.message || 'Sent a message',
                type: 'chat',
                link: '/chat',
                referenceId: conversation.id,
                referenceType: 'chat_dm',
              }).catch(() => {});
            }
          }
        });
      }
      res.status(201).json({ success: true, data: msg });
    } catch (err) { next(err); }
  },

  getAllEmployeesForDM: (req, res) => {
    let emp = EmployeeRepo.findByUserId(req.user.id) || EmployeeRepo.findWhere('employees', (e) => e.email?.toLowerCase() === req.user.email?.toLowerCase())[0];
    const employees = EmployeeRepo.findAll().filter((e) => !e.archived && e.id !== emp?.id && e.status === 'active');
    res.json({ success: true, data: employees });
  },
};

module.exports = chatController;
