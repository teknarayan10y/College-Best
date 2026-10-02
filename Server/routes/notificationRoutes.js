const express = require('express');
const requireAuth = require('../middleware/auth');
const {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearAllNotifications
} = require('../controller/notificationController');

const router = express.Router();
router.use(requireAuth);

router.get('/', getMyNotifications);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/clear-all', clearAllNotifications);
router.delete('/:id', deleteNotification);

module.exports = router;
