import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../auth/api';
import './NotificationBell.css';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifs = async () => {
    try {
      const res = await api.getNotifications(20);
      setNotifications(res.items || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Ignore background errors
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 25000); // 25s auto-poll
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) fetchNotifs();
  };

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotification = async (id, e) => {
    e.stopPropagation();
    try {
      const target = notifications.find(n => n._id === id);
      // Optimistic delete
      setNotifications(prev => prev.filter(n => n._id !== id));
      if (target && !target.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      await api.deleteNotification(id);
    } catch (err) {
      console.error('Delete notification error:', err);
      fetchNotifs(); // Rollback if error
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    try {
      setNotifications([]);
      setUnreadCount(0);
      await api.clearAllNotifications();
    } catch (err) {
      console.error('Clear all notifications error:', err);
      fetchNotifs();
    }
  };

  const formatTime = dateStr => {
    if (!dateStr) return '';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={handleToggle}
        title="Notifications & Academic Alerts"
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <h4>
              <span>⚡</span> Alerts & Updates
            </h4>
            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-read-btn"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                >
                  Mark read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="notif-clear-btn"
                  onClick={handleClearAll}
                  title="Delete all notifications"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map(item => (
                <div
                  key={item._id}
                  className={`notif-item ${!item.isRead ? 'unread' : ''}`}
                  onClick={e => !item.isRead && handleMarkAsRead(item._id, e)}
                >
                  <div className="notif-icon">{getIcon(item.type)}</div>
                  <div className="notif-content">
                    <div className="notif-title">{item.title}</div>
                    <div className="notif-msg">{item.message}</div>
                    <div className="notif-time">{formatTime(item.createdAt)}</div>
                  </div>
                  <button
                    type="button"
                    className="notif-delete-btn"
                    onClick={e => handleDeleteNotification(item._id, e)}
                    title="Delete notification"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="notif-dropdown-footer">
            <Link to="/student/notifications" onClick={() => setIsOpen(false)}>
              Manage all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
