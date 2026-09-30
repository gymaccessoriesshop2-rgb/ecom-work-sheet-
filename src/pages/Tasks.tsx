import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Task, Employee, Note } from '../types/database.types';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckSquare, Plus, Search, Edit, Trash2, Clock, X, MessageSquare, Eye, Send,
  CheckCircle, XCircle, AlertCircle, Sparkles, ExternalLink, Download,
  AlertTriangle, ShieldCheck, UserCheck, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, isPast, parseISO } from 'date-fns';

import { ECOM_CATEGORIES, ECOM_PLATFORMS } from '../constants/ecom';

export const Tasks: React.FC = () => {
  const { profile } = useAuth();
  const role = profile?.role;
  const isManager = role === 'ADMIN';
  const isEmployee = role === 'EMPLOYEE';
  const isBoss = role === 'BOSS';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'all' | 'awaiting' | 'approved' | 'in_progress' | 'overdue'>('all');

  // Filters
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [selectedMember, setSelectedMember] = useState('');

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [isSelfReporting, setIsSelfReporting] = useState(false);

  // Deletion Modal
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Rejection modal
  const [rejectingTask, setRejectingTask] = useState<Task | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Notes state for viewing task
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Product Hunting',
    platform: 'Shopify',
    resource_url: '',
    assigned_to: '',
    due_date: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High' | 'Urgent',
    status: 'Pending' as any,
    manager_comment: ''
  });

  const resetForm = () => setForm({
    title: '',
    description: '',
    category: 'Product Hunting',
    platform: 'Shopify',
    resource_url: '',
    assigned_to: '',
    due_date: '',
    priority: 'Medium',
    status: 'Pending',
    manager_comment: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('tasks')
        .select('*, assignee:employees!tasks_assigned_to_fkey(full_name, employee_id, email), creator:employees!tasks_created_by_fkey(full_name)')
        .order('created_at', { ascending: false });

      if (isEmployee) {
        query = query.or(`assigned_to.eq.${profile!.id},created_by.eq.${profile!.id}`);
      }

      const [tasksRes, empRes] = await Promise.all([
        query,
        supabase.from('employees').select('id, full_name, employee_id, role, email').eq('status', 'Active'),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (empRes.error) throw empRes.error;

      setTasks((tasksRes.data || []) as Task[]);
      setEmployees((empRes.data || []) as Employee[]);
    } catch (e: any) {
      toast.error(e.message || 'Error loading worksheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) fetchData();
  }, [profile]);

  const canDeleteTask = (t: Task) => {
    if (isBoss) return false;
    if (isManager) return true;
    return t.created_by === profile?.id || t.assigned_to === profile?.id;
  };

  const openAssignTask = () => {
    if (isBoss) return;
    resetForm();
    setIsSelfReporting(false);
    setEditingTask(null);
    setShowModal(true);
  };

  const openLogCompletedTask = () => {
    resetForm();
    setIsSelfReporting(true);
    setForm(f => ({
      ...f,
      assigned_to: profile!.id,
      status: 'Awaiting Approval',
      due_date: new Date().toISOString().split('T')[0]
    }));
    setEditingTask(null);
    setShowModal(true);
  };

  const openEdit = (task: Task) => {
    if (isBoss) return;
    setEditingTask(task);
    setIsSelfReporting(false);
    setForm({
      title: task.title,
      description: task.description || '',
      category: task.category || 'Product Hunting',
      platform: task.platform || 'Shopify',
      resource_url: task.resource_url || '',
      assigned_to: task.assigned_to || '',
      due_date: task.due_date || '',
      priority: task.priority,
      status: task.status,
      manager_comment: task.manager_comment || ''
    });
    setShowModal(true);
  };

  const openView = async (task: Task) => {
    setViewingTask(task);
    setNewNote('');
    try {
      const { data } = await supabase
        .from('notes')
        .select('*, author:employees(full_name)')
        .eq('task_id', task.id)
        .order('created_at', { ascending: true });
      setNotes((data || []) as Note[]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBoss || !newNote.trim() || !viewingTask || !profile) return;
    setAddingNote(true);
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          task_id: viewingTask.id,
          author_id: profile.id,
          content: newNote.trim(),
        })
        .select('*, author:employees(full_name)')
        .single();

      if (error) throw error;
      setNotes(prev => [...prev, data as Note]);
      setNewNote('');
      toast.success('Note added');
    } catch (err: any) {
      toast.error(err.message || 'Could not post note');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase.from('notes').delete().eq('id', noteId);
      if (error) throw error;
      setNotes(prev => prev.filter(n => n.id !== noteId));
      toast.success('Note removed');
    } catch (err: any) {
      toast.error(err.message || 'Could not delete note');
    }
  };

  const handleSave = async () => {
    if (isBoss) return;
    if (!form.title.trim()) {
      toast.error('Task title is required.');
      return;
    }

    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category || 'Product Hunting',
        platform: form.platform || 'Shopify',
        resource_url: form.resource_url.trim() || null,
        due_date: form.due_date || null,
        priority: form.priority,
      };

      if (editingTask) {
        if (isManager) {
          payload.assigned_to = form.assigned_to || null;
          payload.status = form.status;
          if (form.manager_comment) payload.manager_comment = form.manager_comment;
        }

        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', editingTask.id);
        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: profile!.id,
          action: 'TASK_EDITED',
          description: `updated deliverable "${form.title}"`,
          related_entity_type: 'TASK',
          related_entity_id: editingTask.id,
        });

        toast.success('Task updated successfully!');
      } else {
        const initialStatus = isSelfReporting ? 'Awaiting Approval' : 'Pending';
        const targetAssignee = isSelfReporting ? profile!.id : (form.assigned_to || null);

        payload.assigned_to = targetAssignee;
        payload.created_by = profile!.id;
        payload.status = initialStatus;

        const { data, error } = await supabase
          .from('tasks')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: profile!.id,
          action: isSelfReporting ? 'TASK_SELF_REPORTED' : 'TASK_CREATED',
          description: isSelfReporting
            ? `submitted work: "${form.title}" for approval`
            : `assigned task "${form.title}"`,
          related_entity_type: 'TASK',
          related_entity_id: data.id,
        });

        if (isManager && targetAssignee && targetAssignee !== profile!.id) {
          await supabase.from('notifications').insert({
            user_id: targetAssignee,
            title: 'New Task Assigned',
            message: `Manager assigned: "${form.title}" (${form.category})`,
            link: `/my-tasks`,
          });
        }

        toast.success(isSelfReporting ? 'Deliverable sent to Manager for approval!' : 'Task assigned!');
      }

      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Operation failed');
    }
  };

  const handleApprove = async (task: Task) => {
    if (!isManager) return;
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'Approved', manager_comment: 'Approved by manager' })
        .eq('id', task.id);
      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'TASK_APPROVED',
        description: `approved task "${task.title}"`,
        related_entity_type: 'TASK',
        related_entity_id: task.id,
      });

      if (task.assigned_to) {
        await supabase.from('notifications').insert({
          user_id: task.assigned_to,
          title: 'Deliverable Approved! 🎉',
          message: `Manager approved your task: "${task.title}"`,
          link: '/my-tasks'
        });
      }

      toast.success(`"${task.title}" approved!`);
      if (viewingTask?.id === task.id) {
        setViewingTask({ ...viewingTask, status: 'Approved' });
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to approve');
    }
  };

  const handleRejectSubmit = async () => {
    if (!isManager || !rejectingTask) return;
    try {
      const comment = rejectionReason.trim() || 'Changes required';
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'Rejected', manager_comment: comment })
        .eq('id', rejectingTask.id);
      if (error) throw error;

      await supabase.from('notes').insert({
        task_id: rejectingTask.id,
        author_id: profile!.id,
        content: `Manager Feedback: ${comment}`,
      });

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'TASK_REJECTED',
        description: `requested revision on "${rejectingTask.title}" (${comment})`,
        related_entity_type: 'TASK',
        related_entity_id: rejectingTask.id,
      });

      if (rejectingTask.assigned_to) {
        await supabase.from('notifications').insert({
          user_id: rejectingTask.assigned_to,
          title: 'Revision Needed',
          message: `Manager requested changes on "${rejectingTask.title}": ${comment}`,
          link: '/my-tasks'
        });
      }

      toast.error(`"${rejectingTask.title}" marked as Rejected`);
      setRejectingTask(null);
      setRejectionReason('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject');
    }
  };

  const handleEmployeeMarkDone = async (task: Task) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'Awaiting Approval' })
        .eq('id', task.id);
      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'TASK_SUBMITTED_FOR_APPROVAL',
        description: `completed and submitted "${task.title}" for review`,
        related_entity_type: 'TASK',
        related_entity_id: task.id,
      });

      toast.success('Marked as finished! Sent for manager approval.');
      if (viewingTask?.id === task.id) {
        setViewingTask({ ...viewingTask, status: 'Awaiting Approval' });
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    }
  };

  const confirmDeleteTask = async () => {
    if (!deletingTask || isBoss) return;
    setIsDeleting(true);
    try {
      try {
        await supabase.from('notes').delete().eq('task_id', deletingTask.id);
      } catch (err) {
        console.warn('Note cleanup (handled):', err);
      }

      const { error } = await supabase.from('tasks').delete().eq('id', deletingTask.id);
      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'TASK_DELETED',
        description: `deleted task "${deletingTask.title}"`,
        related_entity_type: 'TASK',
        related_entity_id: deletingTask.id,
      });

      toast.success(`Task "${deletingTask.title}" deleted.`);
      const deletedId = deletingTask.id;
      setDeletingTask(null);

      if (viewingTask?.id === deletedId) setViewingTask(null);
      if (editingTask?.id === deletedId) {
        setEditingTask(null);
        setShowModal(false);
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete task.');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToCSV = () => {
    if (filtered.length === 0) {
      toast.error('No tasks to export.');
      return;
    }

    const headers = ['Task Title', 'Category', 'Platform', 'Assignee', 'Assignee Email', 'Priority', 'Status', 'Due Date', 'Resource Link', 'Manager Feedback', 'Created At'];
    const rows = filtered.map(t => [
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${(t.category || 'Product Hunting').replace(/"/g, '""')}"`,
      `"${(t.platform || 'Shopify').replace(/"/g, '""')}"`,
      `"${((t as any).assignee?.full_name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${((t as any).assignee?.email || '').replace(/"/g, '""')}"`,
      `"${t.priority}"`,
      `"${t.status}"`,
      `"${t.due_date || 'N/A'}"`,
      `"${(t.resource_url || '').replace(/"/g, '""')}"`,
      `"${(t.manager_comment || '').replace(/"/g, '""')}"`,
      `"${format(new Date(t.created_at), 'yyyy-MM-dd HH:mm')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ecom_Worksheet_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Worksheet exported to CSV!');
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case 'Approved':
        return <span className="badge badge-success"><CheckCircle size={11} /> Approved</span>;
      case 'Awaiting Approval':
        return <span className="badge badge-warning"><AlertCircle size={11} /> Awaiting Review</span>;
      case 'Rejected':
        return <span className="badge badge-danger"><XCircle size={11} /> Changes Needed</span>;
      case 'In Progress':
        return <span className="badge badge-info">In Progress</span>;
      default:
        return <span className="badge badge-neutral">To Do</span>;
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'Urgent': return 'badge-danger';
      case 'High': return 'badge-warning';
      case 'Medium': return 'badge-info';
      default: return 'badge-neutral';
    }
  };

  // Filter computation
  const filtered = tasks.filter(t => {
    // Tab filter
    if (activeTab === 'awaiting' && t.status !== 'Awaiting Approval') return false;
    if (activeTab === 'approved' && t.status !== 'Approved') return false;
    if (activeTab === 'in_progress' && t.status !== 'In Progress' && t.status !== 'Pending') return false;
    if (activeTab === 'overdue' && (!t.due_date || !isPast(parseISO(t.due_date)) || t.status === 'Approved')) return false;

    // Search query
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      const matchAssignee = ((t as any).assignee?.full_name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }

    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterCategory && t.category !== filterCategory) return false;
    if (filterPlatform && t.platform !== filterPlatform) return false;
    if (selectedMember && t.assigned_to !== selectedMember) return false;

    return true;
  });

  // KPI Counts
  const totalCount = tasks.length;
  const awaitingCount = tasks.filter(t => t.status === 'Awaiting Approval').length;
  const approvedCount = tasks.filter(t => t.status === 'Approved').length;
  const inProgressCount = tasks.filter(t => t.status === 'In Progress' || t.status === 'Pending').length;
  const overdueCount = tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && t.status !== 'Approved').length;

  const hasActiveFilters = Boolean(search || filterPriority || filterCategory || filterPlatform || selectedMember);

  return (
    <div>
      {/* ── Top Header Bar ── */}
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isEmployee ? 'My Deliverables & Tasks' : 'E-Commerce Worksheet'}
            </h1>
            {isBoss && (
              <span className="badge badge-info flex items-center gap-1 font-semibold">
                <Eye size={12} /> Executive Observer
              </span>
            )}
            {isManager && (
              <span className="badge badge-primary flex items-center gap-1 font-semibold">
                <ShieldCheck size={12} /> Manager Control
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {filtered.length} deliverable{filtered.length !== 1 ? 's' : ''} listed • Ecom WorkSheet operational system
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={fetchData} title="Refresh Worksheet">
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportToCSV} title="Export CSV spreadsheet">
            <Download size={14} /> Export CSV
          </button>
          {isEmployee && (
            <button className="btn btn-primary btn-sm" onClick={openLogCompletedTask}>
              <Sparkles size={14} /> + I Finished a Task
            </button>
          )}
          {isManager && (
            <button className="btn btn-primary btn-sm" onClick={openAssignTask}>
              <Plus size={14} /> Assign Task
            </button>
          )}
        </div>
      </div>

      {/* ── Manager Urgent Review Banner (Dismissible/Highlight) ── */}
      {isManager && awaitingCount > 0 && activeTab !== 'awaiting' && (
        <div
          className="card mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.04))',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            cursor: 'pointer',
            padding: '0.85rem 1.25rem'
          }}
          onClick={() => setActiveTab('awaiting')}
        >
          <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div className="flex items-center gap-2.5">
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--warning)', flexShrink: 0
              }}>
                <AlertCircle size={16} />
              </div>
              <div>
                <span className="font-bold text-white text-sm">
                  {awaitingCount} task deliverable{awaitingCount !== 1 ? 's' : ''} awaiting your review
                </span>
                <span className="text-xs text-muted block">
                  Team members completed these tasks. Click here to inspect and approve or request revisions.
                </span>
              </div>
            </div>
            <span className="btn btn-sm btn-primary" style={{ padding: '0.25rem 0.75rem' }}>
              Review Deliverables →
            </span>
          </div>
        </div>
      )}

      {/* ── Segmented Views Bar (All / Awaiting Review / Approved / In Progress / Overdue) ── */}
      <div className="flex items-center gap-1.5 mb-3" style={{ flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('all')}
        >
          All Tasks <span style={{ opacity: 0.8, marginLeft: 4 }}>({totalCount})</span>
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'awaiting' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('awaiting')}
          style={{
            border: awaitingCount > 0 && activeTab !== 'awaiting' ? '1px solid rgba(245, 158, 11, 0.4)' : undefined,
            color: awaitingCount > 0 && activeTab !== 'awaiting' ? '#fbbf24' : undefined
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: awaitingCount > 0 ? '#fbbf24' : 'currentColor',
            display: 'inline-block'
          }} />
          Awaiting Review ({awaitingCount})
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('approved')}
        >
          <CheckCircle size={12} /> Approved ({approvedCount})
        </button>

        <button
          className={`btn btn-sm ${activeTab === 'in_progress' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('in_progress')}
        >
          In Progress ({inProgressCount})
        </button>

        {overdueCount > 0 && (
          <button
            className={`btn btn-sm ${activeTab === 'overdue' ? 'btn-danger' : 'btn-secondary'}`}
            onClick={() => setActiveTab('overdue')}
            style={{ color: activeTab !== 'overdue' ? 'var(--danger)' : undefined }}
          >
            <Clock size={12} /> Overdue ({overdueCount})
          </button>
        )}
      </div>

      {/* ── Team Member Fast-Pills (Compact & Clean) ── */}
      {!isEmployee && employees.length > 0 && (
        <div className="card mb-3" style={{ padding: '0.5rem 0.85rem' }}>
          <div className="flex items-center gap-1.5" style={{ flexWrap: 'wrap' }}>
            <span className="text-xs text-muted font-bold mr-1 flex items-center gap-1">
              <UserCheck size={12} /> Member:
            </span>
            <button
              className={`btn btn-sm ${!selectedMember ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.15rem 0.55rem', fontSize: '0.72rem', borderRadius: 999 }}
              onClick={() => setSelectedMember('')}
            >
              All Team
            </button>
            {employees.map(emp => {
              const isSelected = selectedMember === emp.id;
              const empCount = tasks.filter(t => t.assigned_to === emp.id).length;
              return (
                <button
                  key={emp.id}
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    padding: '0.15rem 0.55rem',
                    fontSize: '0.72rem',
                    borderRadius: 999,
                    border: isSelected ? 'none' : '1px solid var(--border-color)',
                  }}
                  onClick={() => setSelectedMember(isSelected ? '' : emp.id)}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: isSelected ? '#fff' : 'var(--primary)',
                    color: isSelected ? 'var(--primary)' : '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, marginRight: 4
                  }}>
                    {emp.full_name.charAt(0)}
                  </span>
                  {emp.full_name.split(' ')[0]} <span className="text-muted" style={{ marginLeft: 3 }}>({empCount})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Unified Search & Dropdown Filter Bar ── */}
      <div className="card mb-3" style={{ padding: '0.625rem 0.85rem' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {/* Search Box */}
          <div className="search-box" style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
            <Search size={14} />
            <input
              placeholder="Search deliverables, notes, people…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-white" style={{ padding: 2 }}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Operational Category Filter */}
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 150, padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {ECOM_CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
            ))}
          </select>

          {/* Platform Filter */}
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 140, padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value)}
          >
            <option value="">All Channels</option>
            {ECOM_PLATFORMS.map(p => (
              <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 110, padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Clear Filters Reset */}
          {hasActiveFilters && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              onClick={() => {
                setSearch('');
                setFilterCategory('');
                setFilterPlatform('');
                setFilterPriority('');
                setSelectedMember('');
              }}
            >
              <X size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Deliverables Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3.5rem', textAlign: 'center' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', margin: '0 auto mb-2' }} />
            <p className="text-xs text-muted">Loading worksheet deliverables…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={36} />
            <h3>No deliverables found</h3>
            <p>
              {hasActiveFilters || activeTab !== 'all'
                ? 'Try resetting your view filters or keyword search.'
                : 'No work items logged yet. Click "+ Assign Task" or "+ I Finished a Task" to get started.'}
            </p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Task Deliverable</th>
                  <th>Category</th>
                  <th>Channel</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(task => {
                  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'Approved';
                  const categoryMeta = ECOM_CATEGORIES.find(c => c.id === task.category);
                  const platformMeta = ECOM_PLATFORMS.find(p => p.id === task.platform);
                  const canDelete = canDeleteTask(task);

                  return (
                    <tr
                      key={task.id}
                      style={{
                        background: task.status === 'Awaiting Approval' && isManager
                          ? 'rgba(245, 158, 11, 0.04)'
                          : undefined
                      }}
                    >
                      {/* Deliverable Title & Proof */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="font-bold text-sm text-white hover:underline cursor-pointer tracking-tight"
                            onClick={() => openView(task)}
                            title="Click to view full deliverable details & team notes"
                          >
                            {task.title}
                          </div>

                          {/* Clickable Resource / Drive Link */}
                          {task.resource_url && (
                            <a
                              href={task.resource_url}
                              target="_blank"
                              rel="noreferrer"
                              className="badge badge-info"
                              style={{
                                fontSize: '0.68rem',
                                padding: '0.15rem 0.45rem',
                                textDecoration: 'none',
                                flexShrink: 0
                              }}
                              title={`Open Proof / Deliverable: ${task.resource_url}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={10} /> Proof ↗
                            </a>
                          )}
                        </div>

                        <div className="text-xs text-muted flex items-center gap-1 mt-0.5">
                          <span>by {(task as any).creator?.full_name || 'Team'}</span>
                          {task.manager_comment && (
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: task.status === 'Approved' ? 'var(--success)' : 'var(--danger)',
                                marginLeft: 4
                              }}
                            >
                              • {task.manager_comment}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderColor: categoryMeta?.color ? `${categoryMeta.color}40` : 'var(--border-color)',
                            color: categoryMeta?.color || 'var(--text-primary)',
                            fontSize: '0.7rem'
                          }}
                        >
                          {categoryMeta?.icon || '📁'} {task.category || 'Product Hunting'}
                        </span>
                      </td>

                      {/* Channel / Store Platform */}
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          {platformMeta?.icon || '🛍️'} {task.platform || 'Shopify'}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="text-sm">
                        <div className="flex items-center gap-2">
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', fontWeight: 700, color: '#fff'
                          }}>
                            {(task as any).assignee?.full_name?.charAt(0) || '?'}
                          </div>
                          <span className="font-semibold text-xs text-white">
                            {(task as any).assignee?.full_name || 'Unassigned'}
                          </span>
                        </div>
                      </td>

                      {/* Priority */}
                      <td>
                        <span className={`badge ${priorityColor(task.priority)}`}>{task.priority}</span>
                      </td>

                      {/* Status */}
                      <td>{statusBadge(task.status)}</td>

                      {/* Due Date */}
                      <td className="text-sm">
                        {task.due_date ? (
                          <div className={`flex items-center gap-1 ${isOverdue ? 'text-danger font-bold' : 'text-muted'}`}>
                            <Clock size={11} />
                            <span>{format(new Date(task.due_date), 'MMM d')}</span>
                            {isOverdue && (
                              <span className="badge badge-danger" style={{ fontSize: '0.6rem', padding: '0.05rem 0.25rem' }}>
                                Late
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Manager One-Click Approvals */}
                          {isManager && (
                            <>
                              {task.status !== 'Approved' && (
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleApprove(task)}
                                  title="Approve work"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                >
                                  ✓ Approve
                                </button>
                              )}
                              {task.status !== 'Rejected' && (
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => setRejectingTask(task)}
                                  title="Reject or request revision"
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                >
                                  ✕ Reject
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => openEdit(task)}
                                title="Edit Task"
                              >
                                <Edit size={13} />
                              </button>
                            </>
                          )}

                          {/* Employee Action */}
                          {isEmployee && (
                            <>
                              {(task.status === 'Pending' || task.status === 'In Progress') && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleEmployeeMarkDone(task)}
                                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                >
                                  Mark Done
                                </button>
                              )}
                              {task.status !== 'Approved' && (
                                <button
                                  className="btn btn-ghost btn-icon btn-sm"
                                  onClick={() => openEdit(task)}
                                  title="Edit Deliverable"
                                >
                                  <Edit size={13} />
                                </button>
                              )}
                            </>
                          )}

                          {/* View Details */}
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => openView(task)}
                            title="View Full Deliverable & Discussion"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Delete Task */}
                          {canDelete && (
                            <button
                              className="btn btn-ghost btn-icon btn-sm"
                              onClick={() => setDeletingTask(task)}
                              title="Delete Task"
                              style={{ color: 'var(--danger)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CUSTOM IN-APP DELETE MODAL (No window.confirm!) ── */}
      {deletingTask && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeletingTask(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.25)' }}>
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle size={18} />
                <h2 className="text-base font-bold text-white">Delete Deliverable</h2>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                disabled={isDeleting}
                onClick={() => setDeletingTask(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted mb-2">
                Are you sure you want to permanently delete this task?
              </p>
              <div
                className="card mb-3"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '0.75rem'
                }}
              >
                <div className="font-bold text-white text-sm">{deletingTask.title}</div>
                <div className="text-xs text-muted mt-1">
                  Category: {deletingTask.category || 'General'} • Channel: {deletingTask.platform || 'Shopify'}
                </div>
              </div>
              <p className="text-xs text-muted">
                This item, its attached deliverable proofs, and all discussion comments will be permanently erased.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary btn-sm"
                disabled={isDeleting}
                onClick={() => setDeletingTask(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={isDeleting}
                onClick={confirmDeleteTask}
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection Modal (Manager) ── */}
      {rejectingTask && (
        <div className="modal-overlay" onClick={() => setRejectingTask(null)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-base font-bold text-white">Request Deliverable Revision</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setRejectingTask(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted mb-2">
                Deliverable: <strong className="text-white">{rejectingTask.title}</strong>
              </p>
              <div className="form-group">
                <label className="form-label">Revision Instructions for Team Member *</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g. Please update product mockups and confirm competitor pricing in the Drive folder..."
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setRejectingTask(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={handleRejectSubmit}>Submit Revision Request</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Details & Deliverable Slideover/Modal ── */}
      {viewingTask && (
        <div className="modal-overlay" onClick={() => setViewingTask(null)}>
          <div className="modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="text-lg font-bold text-white">{viewingTask.title}</h2>
                <div className="flex items-center gap-2 mt-1.5" style={{ flexWrap: 'wrap' }}>
                  {statusBadge(viewingTask.status)}
                  <span className={`badge ${priorityColor(viewingTask.priority)}`}>{viewingTask.priority}</span>
                  <span className="badge badge-neutral">{viewingTask.category || 'Product Hunting'}</span>
                  <span className="badge badge-neutral">{viewingTask.platform || 'Shopify'}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewingTask(null)}><X size={18} /></button>
            </div>

            <div className="modal-body">
              {/* Deliverable Proof / Resource Link Card */}
              {viewingTask.resource_url && (
                <div
                  className="mb-4 card"
                  style={{
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    padding: '0.85rem 1rem'
                  }}
                >
                  <div className="flex items-center justify-between" style={{ gap: '0.75rem' }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ExternalLink size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white">Deliverable / Resource URL:</div>
                        <div className="text-xs text-muted truncate" style={{ wordBreak: 'break-all' }}>
                          {viewingTask.resource_url}
                        </div>
                      </div>
                    </div>
                    <a
                      href={viewingTask.resource_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm btn-primary"
                      style={{ textDecoration: 'none', flexShrink: 0 }}
                    >
                      Open Link ↗
                    </a>
                  </div>
                </div>
              )}

              {/* Task Details / Description */}
              {viewingTask.description && (
                <div className="mb-4">
                  <div className="text-xs text-muted mb-1 font-bold">DELIVERABLE NOTES & INSTRUCTIONS</div>
                  <div className="card" style={{ background: 'var(--bg-primary)', padding: '0.75rem', fontSize: '0.8125rem' }}>
                    {viewingTask.description}
                  </div>
                </div>
              )}

              {/* Manager Feedback Note */}
              {viewingTask.manager_comment && (
                <div
                  className="mb-4 card"
                  style={{
                    background: viewingTask.status === 'Approved' ? 'var(--success-bg)' : 'var(--danger-bg)',
                    border: `1px solid ${viewingTask.status === 'Approved' ? 'var(--success-border)' : 'var(--danger-border)'}`,
                    padding: '0.75rem'
                  }}
                >
                  <div className="text-xs font-bold mb-1" style={{ color: viewingTask.status === 'Approved' ? 'var(--success)' : 'var(--danger)' }}>
                    MANAGER FEEDBACK:
                  </div>
                  <p className="text-xs text-white">{viewingTask.manager_comment}</p>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs card" style={{ padding: '0.625rem 0.85rem', background: 'var(--bg-primary)' }}>
                <div>
                  <span className="text-muted block font-medium">Assignee:</span>
                  <span className="font-semibold text-white">{(viewingTask as any).assignee?.full_name || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-muted block font-medium">Created By:</span>
                  <span className="font-semibold text-white">{(viewingTask as any).creator?.full_name || 'Team'}</span>
                </div>
                <div>
                  <span className="text-muted block font-medium">Due Date:</span>
                  <span className="font-semibold text-white">{viewingTask.due_date || 'No date set'}</span>
                </div>
                <div>
                  <span className="text-muted block font-medium">Created:</span>
                  <span className="font-semibold text-white">{format(new Date(viewingTask.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>

              {/* Discussion & Team Updates */}
              <div className="border-t border-color pt-3" style={{ borderColor: 'var(--border-color)' }}>
                <div className="flex items-center gap-1.5 mb-2.5 text-xs font-bold text-muted uppercase tracking-wider">
                  <MessageSquare size={13} className="text-primary" />
                  <span>Discussion & Updates ({notes.length})</span>
                </div>

                <div className="flex flex-col gap-2 mb-3" style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {notes.length === 0 ? (
                    <p className="text-xs text-muted italic">No discussion yet. Leave an update or question below.</p>
                  ) : (
                    notes.map(n => {
                      const canDeleteNote = n.author_id === profile?.id || isManager;
                      return (
                        <div key={n.id} className="card" style={{ background: 'var(--bg-primary)', padding: '0.55rem 0.75rem' }}>
                          <div className="flex items-center justify-between text-xs text-muted mb-1">
                            <span className="font-bold text-white">{(n as any).author?.full_name || 'Team Member'}</span>
                            <div className="flex items-center gap-2">
                              <span>{format(new Date(n.created_at), 'MMM d, HH:mm')}</span>
                              {canDeleteNote && (
                                <button
                                  className="btn btn-ghost btn-icon btn-sm"
                                  onClick={() => handleDeleteNote(n.id)}
                                  title="Delete Note"
                                  style={{ padding: 2, height: 18, width: 18, color: 'var(--danger)' }}
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-secondary">{n.content}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {!isBoss ? (
                  <form onSubmit={handleAddNote} className="flex gap-2">
                    <input
                      className="form-control"
                      style={{ fontSize: '0.8125rem', padding: '0.45rem 0.75rem' }}
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      placeholder="Post a comment or link update…"
                      disabled={addingNote}
                    />
                    <button type="submit" className="btn btn-primary btn-sm" disabled={addingNote || !newNote.trim()}>
                      <Send size={13} />
                    </button>
                  </form>
                ) : (
                  <p className="text-xs text-muted italic">Boss view is read-only.</p>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="modal-footer flex items-center justify-between">
              <div>
                {canDeleteTask(viewingTask) && (
                  <button
                    className="btn btn-danger btn-sm flex items-center gap-1"
                    onClick={() => setDeletingTask(viewingTask)}
                  >
                    <Trash2 size={13} /> Delete Task
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isManager && viewingTask.status !== 'Approved' && (
                  <button className="btn btn-success btn-sm" onClick={() => handleApprove(viewingTask)}>
                    ✓ Approve Work
                  </button>
                )}
                {isManager && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const t = viewingTask;
                      setViewingTask(null);
                      openEdit(t);
                    }}
                  >
                    <Edit size={13} /> Edit
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setViewingTask(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign / Edit / Self-Report Modal ── */}
      {showModal && !isBoss && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {isSelfReporting
                  ? 'Log Completed Work'
                  : editingTask
                  ? 'Edit Deliverable'
                  : 'Assign Task to Team Member'}
              </h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Task Title */}
              <div className="form-group">
                <label className="form-label">
                  {isSelfReporting ? 'What did you complete? *' : 'Task Title *'}
                </label>
                <input
                  className="form-control"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder={isSelfReporting ? 'e.g. Researched 5 winning winter products' : 'e.g. Create TikTok UGC ad angles for product X'}
                  autoFocus
                />
              </div>

              {/* Category & Store Platform */}
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-control"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  >
                    {ECOM_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Store / Channel *</label>
                  <select
                    className="form-control"
                    value={form.platform}
                    onChange={e => setForm({ ...form, platform: e.target.value })}
                  >
                    {ECOM_PLATFORMS.map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resource / Drive Link */}
              <div className="form-group">
                <label className="form-label">Deliverable / Resource URL (Drive, Sheet, Loom)</label>
                <input
                  className="form-control"
                  type="url"
                  value={form.resource_url}
                  onChange={e => setForm({ ...form, resource_url: e.target.value })}
                  placeholder="https://drive.google.com/... or Google Sheet link"
                />
              </div>

              {/* Details / Description */}
              <div className="form-group">
                <label className="form-label">Description & Context</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Context, supplier links, ROAS, margins, or notes…"
                />
              </div>

              {/* Assignee, Priority & Due Date */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {!isSelfReporting && isManager && (
                  <div className="form-group">
                    <label className="form-label">Assign To</label>
                    <select
                      className="form-control"
                      value={form.assigned_to}
                      onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                    >
                      <option value="">Select member…</option>
                      {employees.filter(e => e.role === 'EMPLOYEE').map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-control"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value as any })}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{isSelfReporting ? 'Date Finished' : 'Due Date'}</label>
                  <input
                    className="form-control"
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Status and Manager Feedback (Manager only) */}
              {editingTask && isManager && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-control"
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Awaiting Approval">Awaiting Approval</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Manager Feedback</label>
                    <input
                      className="form-control"
                      value={form.manager_comment}
                      onChange={e => setForm({ ...form, manager_comment: e.target.value })}
                      placeholder="e.g. Approved, great margins"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer flex items-center justify-between">
              <div>
                {editingTask && canDeleteTask(editingTask) && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      const t = editingTask;
                      setShowModal(false);
                      setDeletingTask(t);
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSave}>
                  {isSelfReporting ? 'Submit for Approval' : editingTask ? 'Save Changes' : 'Assign Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
