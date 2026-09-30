import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Users, CheckSquare, Clock, Activity, TrendingUp, Shield, Eye, Plus, Sparkles,
  CheckCircle, AlertCircle, ArrowUpRight, ShoppingBag
} from 'lucide-react';
import { format } from 'date-fns';
import type { ActivityLog } from '../types/database.types';

interface MemberWorkload {
  id: string;
  full_name: string;
  position: string;
  total: number;
  awaiting: number;
  approved: number;
  inProgress: number;
}

export const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;
  const isManager = role === 'ADMIN';
  const isEmployee = role === 'EMPLOYEE';
  const isBoss = role === 'BOSS';
  const isViewer = isManager || isBoss;

  const [stats, setStats] = useState({
    totalTeam: 0,
    awaitingApproval: 0,
    approved: 0,
    inProgress: 0,
    pending: 0,
    rejected: 0,
  });
  const [teamWorkload, setTeamWorkload] = useState<MemberWorkload[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        if (isViewer) {
          const [teamRes, tasksRes, activityRes] = await Promise.all([
            supabase.from('employees').select('id, full_name, position, role').eq('status', 'Active'),
            supabase.from('tasks').select('id, status, assigned_to'),
            supabase.from('activity_logs').select('*, user:employees(full_name)').order('created_at', { ascending: false }).limit(8),
          ]);

          const allEmployees = teamRes.data || [];
          const tasks = tasksRes.data || [];

          setStats({
            totalTeam: allEmployees.length,
            awaitingApproval: tasks.filter(t => t.status === 'Awaiting Approval').length,
            approved: tasks.filter(t => t.status === 'Approved').length,
            inProgress: tasks.filter(t => t.status === 'In Progress').length,
            pending: tasks.filter(t => t.status === 'Pending').length,
            rejected: tasks.filter(t => t.status === 'Rejected').length,
          });

          // Compute workload breakdown for all active team members
          const employeesOnly = allEmployees.filter(e => e.role === 'EMPLOYEE');
          const workload: MemberWorkload[] = employeesOnly.map(emp => {
            const empTasks = tasks.filter(t => t.assigned_to === emp.id);
            return {
              id: emp.id,
              full_name: emp.full_name,
              position: emp.position || 'Team Member',
              total: empTasks.length,
              awaiting: empTasks.filter(t => t.status === 'Awaiting Approval').length,
              approved: empTasks.filter(t => t.status === 'Approved').length,
              inProgress: empTasks.filter(t => t.status === 'In Progress' || t.status === 'Pending').length,
            };
          });
          setTeamWorkload(workload);

          setRecentActivity((activityRes.data || []) as ActivityLog[]);
        } else {
          const [tasksRes, activityRes] = await Promise.all([
            supabase.from('tasks').select('status').or(`assigned_to.eq.${profile.id},created_by.eq.${profile.id}`),
            supabase.from('activity_logs').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(6),
          ]);
          const tasks = tasksRes.data || [];
          setStats({
            totalTeam: 0,
            awaitingApproval: tasks.filter(t => t.status === 'Awaiting Approval').length,
            approved: tasks.filter(t => t.status === 'Approved').length,
            inProgress: tasks.filter(t => t.status === 'In Progress').length,
            pending: tasks.filter(t => t.status === 'Pending').length,
            rejected: tasks.filter(t => t.status === 'Rejected').length,
          });
          setRecentActivity((activityRes.data || []) as ActivityLog[]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, isViewer]);

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="card skeleton" style={{ height: 90 }} />)}
      </div>
    );
  }

  return (
    <div>
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold">
              {isBoss
                ? 'Executive Oversight (Boss View)'
                : isManager
                ? 'Manager Workspace'
                : `Hello, ${profile?.full_name?.split(' ')[0] || 'Team Member'}!`}
            </h1>
            {isBoss && (
              <span className="badge badge-info flex items-center gap-1">
                <Eye size={12} /> Executive Observer
              </span>
            )}
            {isManager && (
              <span className="badge badge-primary flex items-center gap-1">
                <Shield size={12} /> Manager Control
              </span>
            )}
          </div>
          <p className="text-muted text-sm">
            {isBoss
              ? 'Real-time performance tracking for all 6 team members and manager approvals.'
              : isManager
              ? 'Assign e-commerce tasks and review/approve team deliverables.'
              : 'Track your assigned work and submit completed deliverables for manager review.'}
          </p>
        </div>

        {/* Quick Action Button */}
        <div className="flex items-center gap-2">
          {isEmployee && (
            <button className="btn btn-primary" onClick={() => navigate('/my-tasks')}>
              <Sparkles size={16} /> + I Finished a Task
            </button>
          )}
          {isManager && (
            <>
              <button className="btn btn-secondary" onClick={() => navigate('/employees')}>
                <Users size={16} /> Team
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/tasks')}>
                <Plus size={16} /> Assign Task
              </button>
            </>
          )}
          {isBoss && (
            <button className="btn btn-primary" onClick={() => navigate('/tasks')}>
              <Eye size={16} /> View All Worksheet Tasks
            </button>
          )}
        </div>
      </div>

      {/* Manager Urgent Approval Banner */}
      {isManager && stats.awaitingApproval > 0 && (
        <div
          className="card mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.05))',
            border: '1px solid var(--warning)',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/tasks')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{stats.awaitingApproval} task{stats.awaitingApproval !== 1 ? 's' : ''} awaiting your review</h3>
                <p className="text-xs text-muted">Click here to inspect submitted deliverables and approve or reject.</p>
              </div>
            </div>
            <button className="btn btn-sm btn-primary">Review Work Now →</button>
          </div>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {isViewer && (
          <div
            className="card stat-card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/employees')}
          >
            <div className="stat-icon blue"><Users size={20} /></div>
            <div>
              <div className="stat-value">{stats.totalTeam}</div>
              <div className="stat-label">Active Team Size</div>
            </div>
          </div>
        )}

        <div
          className="card stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(isViewer ? '/tasks' : '/my-tasks')}
        >
          <div className="stat-icon amber"><AlertCircle size={20} /></div>
          <div>
            <div className="stat-value">{stats.awaitingApproval}</div>
            <div className="stat-label">Awaiting Approval</div>
          </div>
        </div>

        <div
          className="card stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(isViewer ? '/tasks' : '/my-tasks')}
        >
          <div className="stat-icon green"><CheckCircle size={20} /></div>
          <div>
            <div className="stat-value">{stats.approved}</div>
            <div className="stat-label">Approved Work</div>
          </div>
        </div>

        <div
          className="card stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(isViewer ? '/tasks' : '/my-tasks')}
        >
          <div className="stat-icon purple"><TrendingUp size={20} /></div>
          <div>
            <div className="stat-value">{stats.inProgress}</div>
            <div className="stat-label">In Progress</div>
          </div>
        </div>

        <div
          className="card stat-card"
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(isViewer ? '/tasks' : '/my-tasks')}
        >
          <div className="stat-icon red"><Clock size={20} /></div>
          <div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">Pending / To Do</div>
          </div>
        </div>
      </div>

      {/* ── Team Workload & Deliverable Matrix (Boss & Manager View) ── */}
      {isViewer && teamWorkload.length > 0 && (
        <div className="card mb-6" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-2">
              <ShoppingBag size={18} className="text-primary" />
              <h2 className="font-semibold text-white">Team Workload & Output Breakdown</h2>
            </div>
            <span className="text-xs text-muted">All 6 Active Employees</span>
          </div>

          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Role / Focus</th>
                  <th>Total Tasks</th>
                  <th>In Progress</th>
                  <th>Awaiting Review</th>
                  <th>Approved Work</th>
                  <th style={{ textAlign: 'right' }}>Worksheet</th>
                </tr>
              </thead>
              <tbody>
                {teamWorkload.map(emp => {
                  const completionRate = emp.total > 0 ? Math.round((emp.approved / emp.total) * 100) : 0;
                  return (
                    <tr key={emp.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: '0.75rem'
                          }}>
                            {emp.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-white">{emp.full_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-muted">{emp.position}</td>
                      <td>
                        <span className="font-bold text-white text-sm">{emp.total}</span>
                      </td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{emp.inProgress} active</span>
                      </td>
                      <td>
                        {emp.awaiting > 0 ? (
                          <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                            {emp.awaiting} review
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                            {emp.approved} done
                          </span>
                          <span className="text-xs text-muted">({completionRate}%)</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => navigate('/tasks')}
                        >
                          View Tasks <ArrowUpRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity Feed */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            <h2 className="font-semibold">{isViewer ? 'Latest Team Updates' : 'My Recent Updates'}</h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(isViewer ? '/activity' : '/my-activity')}
          >
            All Activity →
          </button>
        </div>
        {recentActivity.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={36} />
            <h3>No task updates yet</h3>
            <p>Team members' completed tasks and approvals will show here in real time.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentActivity.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3"
                style={{ padding: '0.625rem 0', borderBottom: '1px solid var(--border-color)' }}
              >
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: a.action.includes('APPROV') ? 'var(--success)' : a.action.includes('REJECT') ? 'var(--danger)' : a.action.includes('DELET') ? 'var(--danger)' : 'var(--primary)',
                  flexShrink: 0
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-sm">
                    <span className="font-semibold text-white">{(a as any).user?.full_name || 'Member'}</span>{' '}
                    {a.description}
                  </p>
                </div>
                <span className="text-xs text-muted" style={{ flexShrink: 0 }}>
                  {format(new Date(a.created_at), 'MMM d, HH:mm')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
