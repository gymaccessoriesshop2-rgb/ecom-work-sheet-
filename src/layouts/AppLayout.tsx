import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Notification } from '../types/database.types';
import {
  LayoutDashboard, Users, CheckSquare, FileText, Activity,
  Settings, LogOut, Bell, Search, Menu, X, Eye, Check, ShoppingBag, Share2
} from 'lucide-react';
import { format } from 'date-fns';

export const AppLayout: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Notifications
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const role = profile?.role;

  const adminNav = [
    { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/employees', icon: <Users size={18} />, label: 'Employees' },
    { to: '/tasks', icon: <CheckSquare size={18} />, label: 'Tasks' },
    { to: '/drop', icon: <Share2 size={18} />, label: 'Team Drop' },
    { to: '/reports', icon: <FileText size={18} />, label: 'Reports' },
    { to: '/activity', icon: <Activity size={18} />, label: 'Activity' },
    { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
  ];

  const bossNav = [
    { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/employees', icon: <Users size={18} />, label: 'Employees' },
    { to: '/tasks', icon: <CheckSquare size={18} />, label: 'Tasks' },
    { to: '/drop', icon: <Share2 size={18} />, label: 'Team Drop' },
    { to: '/reports', icon: <FileText size={18} />, label: 'Reports' },
    { to: '/activity', icon: <Activity size={18} />, label: 'Activity' },
    { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
  ];

  const empNav = [
    { to: '/', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { to: '/my-tasks', icon: <CheckSquare size={18} />, label: 'My Tasks' },
    { to: '/drop', icon: <Share2 size={18} />, label: 'Team Drop' },
    { to: '/my-reports', icon: <FileText size={18} />, label: 'My Reports' },
    { to: '/my-activity', icon: <Activity size={18} />, label: 'My Activity' },
    { to: '/settings', icon: <Settings size={18} />, label: 'Settings' },
  ];

  const navLinks = role === 'ADMIN' ? adminNav : role === 'BOSS' ? bossNav : empNav;

  // Fetch notifications
  useEffect(() => {
    if (!profile) return;
    const fetchNotifs = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(10);
        setNotifications((data || []) as Notification[]);
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    };
    fetchNotifs();
  }, [profile]);

  // Click outside to close notifications
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllRead = async () => {
    if (!profile) return;
    try {
      await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    const dest = role === 'EMPLOYEE' ? '/my-tasks' : '/tasks';
    navigate(dest);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="app-layout">
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 45, backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon"><ShoppingBag size={18} /></div>
          <span>Ecom WorkSheet</span>
          <button
            onClick={() => setMobileOpen(false)}
            style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
            className="mobile-close"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">Main Menu</div>
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }}
            onClick={() => navigate('/settings')}
            title="View Profile Settings"
          >
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: role === 'BOSS' ? 'var(--info)' : role === 'ADMIN' ? 'var(--primary)' : 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '0.8125rem',
              fontWeight: 600,
              flexShrink: 0
            }}>
              {profile?.full_name?.charAt(0) || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-sm font-semibold text-white truncate">{profile?.full_name}</div>
              <div className="text-xs text-muted truncate">
                {role === 'BOSS' ? 'Boss (Observer)' : role === 'ADMIN' ? 'Manager' : profile?.position || 'Team Member'}
              </div>
            </div>
          </div>
          <button onClick={handleSignOut} className="nav-item w-full mt-2" style={{ color: 'var(--danger)' }}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} style={{ color: 'var(--text-muted)' }} className="mobile-only">
              <Menu size={22} />
            </button>
            <form onSubmit={handleSearchSubmit} className="search-box hide-mobile" style={{ width: 280 }}>
              <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                placeholder="Search tasks, reports…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </form>
          </div>

          <div className="flex items-center gap-3" ref={notifRef} style={{ position: 'relative' }}>
            {role === 'BOSS' && (
              <div className="badge badge-info flex items-center gap-1">
                <Eye size={12} /> Observer (View Only)
              </div>
            )}

            {/* Notification Bell */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ position: 'relative', color: 'var(--text-secondary)', padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}
              title="Notifications"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--danger)'
                }} />
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="card shadow-lg" style={{
                position: 'absolute',
                right: 0,
                top: 45,
                width: 320,
                zIndex: 50,
                padding: '0.75rem',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary)'
              }}>
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-color" style={{ borderColor: 'var(--border-color)' }}>
                  <span className="font-semibold text-sm">Notifications</span>
                  {unreadCount > 0 && (
                    <button className="text-xs text-primary flex items-center gap-1" onClick={markAllRead}>
                      <Check size={12} /> Mark all read
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        style={{
                          padding: '0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: '0.25rem',
                          background: n.read ? 'transparent' : 'rgba(59, 130, 246, 0.08)',
                          fontSize: '0.8125rem'
                        }}
                      >
                        <div className="font-medium text-white">{n.title}</div>
                        <div className="text-muted text-xs mt-0.5">{n.message}</div>
                        <div className="text-xs text-muted mt-1" style={{ opacity: 0.6 }}>
                          {format(new Date(n.created_at), 'MMM d, HH:mm')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
