const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// Helper to create notifications internally from any controller
async function createNotification({ recipientId, senderId = null, type = 'SYSTEM', title, message, courseId = null, metadata = {} }) {
  try {
    if (!recipientId) return null;
    const notif = new Notification({
      recipientId,
      senderId,
      type,
      title,
      message,
      courseId,
      metadata
    });
    await notif.save();
    return notif;
  } catch (err) {
    console.error('[Notification] Error creating notification:', err);
    return null;
  }
}

// GET /api/notifications - Get current user's notifications
async function getMyNotifications(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const limit = parseInt(req.query.limit) || 20;

    const [items, unreadCount] = await Promise.all([
      Notification.find({ recipientId: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipientId: userId, isRead: false })
    ]);

    return res.json({ items, unreadCount });
  } catch (err) {
    console.error('getMyNotifications error:', err);
    return res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
  }
}

// PATCH /api/notifications/:id/read - Mark one notification as read
async function markNotificationAsRead(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const item = await Notification.findOneAndUpdate(
      { _id: id, recipientId: userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.json({ message: 'Notification marked as read', item });
  } catch (err) {
    console.error('markNotificationAsRead error:', err);
    return res.status(500).json({ message: 'Failed to update notification', error: err.message });
  }
}

// PATCH /api/notifications/read-all - Mark all as read
async function markAllNotificationsAsRead(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    await Notification.updateMany(
      { recipientId: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('markAllNotificationsAsRead error:', err);
    return res.status(500).json({ message: 'Failed to update notifications', error: err.message });
  }
}

// DELETE /api/notifications/:id - Delete one notification
async function deleteNotification(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const item = await Notification.findOneAndDelete({ _id: id, recipientId: userId });

    if (!item) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.json({ message: 'Notification deleted successfully', id });
  } catch (err) {
    console.error('deleteNotification error:', err);
    return res.status(500).json({ message: 'Failed to delete notification', error: err.message });
  }
}

// DELETE /api/notifications/clear-all - Delete all notifications for user
async function clearAllNotifications(req, res) {
  try {
    const userId = req.user?.id || req.user?._id;
    const result = await Notification.deleteMany({ recipientId: userId });

    return res.json({ message: 'All notifications cleared successfully', deletedCount: result.deletedCount });
  } catch (err) {
    console.error('clearAllNotifications error:', err);
    return res.status(500).json({ message: 'Failed to clear notifications', error: err.message });
  }
}

module.exports = {
  createNotification,
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications
};
