import React, { useState, useEffect } from 'react';
import { api } from '../../auth/api';
import './StudentNotifications.css';

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, UNREAD, MARKS, ATTENDANCE
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState(null);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.getNotifications(50);
      setNotifications(res.items || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setFeedback({ type: 'error', text: 'Failed to load notifications.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setFeedback({ type: 'success', text: 'All notifications marked as read.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      setNotifications(prev => prev.filter(n => n._id !== id));
      await api.deleteNotification(id);
      setFeedback({ type: 'success', text: 'Notification deleted.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error('Delete error:', err);
      loadNotifications();
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm('Are you sure you want to delete all notifications?')) return;
    try {
      setNotifications([]);
      await api.clearAllNotifications();
      setFeedback({ type: 'success', text: 'All notifications cleared.' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error('Clear error:', err);
      loadNotifications();
    }
  };

  const getIcon = type => {
    switch (type) {
      case 'MARKS_UPDATED':
        return '📝';
      case 'ATTENDANCE_CRITICAL':
        return '🚨';
      case 'ATTENDANCE_WARNING':
        return '⚠️';
      case 'ACADEMIC_ALERT':
        return '📊';
      default:
        return '🔔';
    }
  };

  const formatTime = dateStr => {
    if (!dateStr) return '';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredNotifs = notifications.filter(item => {
    if (filter === 'UNREAD' && item.isRead) return false;
    if (filter === 'MARKS' && item.type !== 'MARKS_UPDATED') return false;
    if (filter === 'ATTENDANCE' && !item.type?.includes('ATTENDANCE')) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchMsg = item.message?.toLowerCase().includes(q);
      return matchTitle || matchMsg;
    }
    return true;
  });

  const unreadTotal = notifications.filter(n => !n.isRead).length;

  return (
    <div className="student-notifications-page">
      <div className="notif-page-header">
        <div>
          <h2>🔔 Notifications & Academic Alerts</h2>
          <p>Instant notifications for marks published by professors, attendance trends, and exam eligibility alerts.</p>
        </div>
        <div className="notif-page-actions">
          {unreadTotal > 0 && (
            <button type="button" className="btn btn-secondary" onClick={handleMarkAllRead}>
              ✓ Mark All as Read ({unreadTotal})
            </button>
          )}
          {notifications.length > 0 && (
            <button type="button" className="btn btn-danger-outline" onClick={handleClearAll}>
              🗑️ Delete All Notifications
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className={`notif-toast-banner ${feedback.type}`}>
          {feedback.type === 'success' ? '✅' : '⚠️'} {feedback.text}
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <div className="notif-controls-bar">
        <div className="notif-filter-tabs">
          <button
            type="button"
            className={`notif-tab ${filter === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            className={`notif-tab ${filter === 'UNREAD' ? 'active' : ''}`}
            onClick={() => setFilter('UNREAD')}
          >
            Unread ({unreadTotal})
          </button>
          <button
            type="button"
            className={`notif-tab ${filter === 'MARKS' ? 'active' : ''}`}
            onClick={() => setFilter('MARKS')}
          >
            Marks Updates
          </button>
          <button
            type="button"
            className={`notif-tab ${filter === 'ATTENDANCE' ? 'active' : ''}`}
            onClick={() => setFilter('ATTENDANCE')}
          >
            Attendance Alerts
          </button>
        </div>

        <div className="notif-search-box">
          <input
            type="text"
            placeholder="Search alerts by title or content..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="notif-loading">Loading alerts...</div>
      ) : filteredNotifs.length === 0 ? (
        <div className="notif-empty-card">
          <span className="empty-icon">📭</span>
          <h4>No notifications found</h4>
          <p>{searchTerm || filter !== 'ALL' ? 'Try changing your filter or search query.' : 'You are all caught up with your academic updates.'}</p>
        </div>
      ) : (
        <div className="notif-cards-list">
          {filteredNotifs.map(item => (
            <div
              key={item._id}
              className={`notif-card ${!item.isRead ? 'unread' : ''}`}
              onClick={() => !item.isRead && handleMarkAsRead(item._id)}
            >
              <div className="notif-card-icon">{getIcon(item.type)}</div>
              <div className="notif-card-body">
                <div className="notif-card-top">
                  <h4 className="notif-card-title">{item.title}</h4>
                  <span className="notif-card-time">{formatTime(item.createdAt)}</span>
                </div>
                <p className="notif-card-message">{item.message}</p>
                <div className="notif-card-footer">
                  <span className={`notif-type-tag ${item.type?.toLowerCase()}`}>
                    {item.type?.replace(/_/g, ' ') || 'SYSTEM'}
                  </span>
                  {!item.isRead && <span className="notif-unread-dot">New Alert</span>}
                </div>
              </div>
              <div className="notif-card-actions">
                <button
                  type="button"
                  className="btn-delete-notif"
                  onClick={e => handleDelete(item._id, e)}
                  title="Delete this notification"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
