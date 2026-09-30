import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MonthlyReport } from '../types/database.types';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Search, Plus, X, Send, MessageSquare, Eye, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const Reports: React.FC = () => {
  const { profile } = useAuth();
  const role = profile?.role;
  const canReview = role === 'ADMIN';
  const isEmployee = role === 'EMPLOYEE';
  const isBoss = role === 'BOSS';

  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showView, setShowView] = useState<MonthlyReport | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Deletion modal state
  const [deletingReport, setDeletingReport] = useState<MonthlyReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const now = new Date();
  const [form, setForm] = useState({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    monthly_summary: '',
    achievements: '',
    challenges: '',
    important_notes: '',
    pending_work: '',
    next_month_plan: '',
    additional_notes: ''
  });
  const [feedback, setFeedback] = useState('');

  const fetchReports = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('monthly_reports')
        .select('*, employee:employees(full_name, employee_id, position)')
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (isEmployee) {
        query = query.eq('employee_id', profile!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReports((data || []) as MonthlyReport[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile) fetchReports();
  }, [profile]);

  const filtered = reports.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false;
    if (search) {
      const term = search.toLowerCase();
      const empName = (r as any).employee?.full_name?.toLowerCase() || '';
      const monthName = MONTHS[r.month - 1].toLowerCase();
      if (!empName.includes(term) && !monthName.includes(term)) return false;
    }
    return true;
  });

  const openCreate = () => {
    if (isBoss) return;
    setForm({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      monthly_summary: '',
      achievements: '',
      challenges: '',
      important_notes: '',
      pending_work: '',
      next_month_plan: '',
      additional_notes: ''
    });
    setShowModal(true);
  };

  const handleSubmitReport = async () => {
    if (isBoss) return;
    if (!form.monthly_summary.trim()) {
      toast.error('Monthly summary is required.');
      return;
    }
    try {
      // Calculate current task statistics automatically
      const [assignedRes, completedRes, pendingRes, overdueRes, activityRes] = await Promise.all([
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', profile!.id),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', profile!.id).eq('status', 'Completed'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', profile!.id).eq('status', 'Pending'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assigned_to', profile!.id).eq('status', 'Overdue'),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('user_id', profile!.id),
      ]);

      const tasksAssigned = assignedRes.count || 0;
      const tasksCompleted = completedRes.count || 0;
      const tasksPending = pendingRes.count || 0;
      const tasksOverdue = overdueRes.count || 0;
      const completionRate = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100 * 10) / 10 : 0;

      const { data, error } = await supabase.from('monthly_reports').upsert({
        employee_id: profile!.id,
        month: form.month,
        year: form.year,
        status: 'Submitted',
        monthly_summary: form.monthly_summary,
        achievements: form.achievements || null,
        challenges: form.challenges || null,
        important_notes: form.important_notes || null,
        pending_work: form.pending_work || null,
        next_month_plan: form.next_month_plan || null,
        additional_notes: form.additional_notes || null,
        tasks_assigned: tasksAssigned,
        tasks_completed: tasksCompleted,
        tasks_pending: tasksPending,
        tasks_overdue: tasksOverdue,
        completion_rate: completionRate,
        activity_records: activityRes.count || 0,
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'employee_id,month,year' }).select().single();

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'REPORT_SUBMITTED',
        description: `submitted ${MONTHS[form.month - 1]} ${form.year} monthly report`,
        related_entity_type: 'REPORT',
        related_entity_id: data.id,
      });

      toast.success('Monthly report submitted successfully!');
      setShowModal(false);
      fetchReports();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReview = async (report: MonthlyReport, newStatus: 'Reviewed' | 'Needs Revision') => {
    if (!canReview) return;
    try {
      const { error } = await supabase.from('monthly_reports').update({
        status: newStatus,
        admin_feedback: feedback || report.admin_feedback,
      }).eq('id', report.id);

      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: newStatus === 'Reviewed' ? 'REPORT_REVIEWED' : 'REPORT_REVISION_REQUESTED',
        description: `${newStatus === 'Reviewed' ? 'approved' : 'requested revision for'} ${MONTHS[report.month - 1]} ${report.year} report`,
        related_entity_type: 'REPORT',
        related_entity_id: report.id,
      });

      await supabase.from('notifications').insert({
        user_id: report.employee_id,
        title: newStatus === 'Reviewed' ? 'Report Approved' : 'Report Needs Revision',
        message: `Your ${MONTHS[report.month - 1]} ${report.year} report has been ${newStatus === 'Reviewed' ? 'reviewed & approved' : 'sent back with revision feedback'}.`,
        link: '/my-reports',
      });

      toast.success(`Report marked as ${newStatus}`);
      setShowView(null);
      fetchReports();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const confirmDeleteReport = async () => {
    if (!deletingReport || isBoss) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('monthly_reports').delete().eq('id', deletingReport.id);
      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'REPORT_DELETED',
        description: `deleted ${MONTHS[deletingReport.month - 1]} ${deletingReport.year} monthly report`,
        related_entity_type: 'REPORT',
        related_entity_id: deletingReport.id,
      });

      toast.success('Report deleted.');
      setDeletingReport(null);
      if (showView?.id === deletingReport.id) setShowView(null);
      fetchReports();
    } catch (err: any) {
      toast.error(err.message || 'Could not delete report.');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'Reviewed': return 'badge-success';
      case 'Submitted': return 'badge-info';
      case 'Needs Revision': return 'badge-danger';
      default: return 'badge-warning';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{isEmployee ? 'My Monthly Reports' : 'All Monthly Reports'}</h1>
            {isBoss && <span className="badge badge-info"><Eye size={12} style={{ marginRight: 4 }} /> View Only</span>}
          </div>
          <p className="text-muted text-sm">{filtered.length} report{filtered.length !== 1 ? 's' : ''} found</p>
        </div>
        {!isBoss && isEmployee && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Submit Monthly Report
          </button>
        )}
      </div>

      <div className="card mb-4" style={{ padding: '0.75rem' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 200, maxWidth: 350 }}>
            <Search size={16} />
            <input placeholder="Search by name or month…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 'auto', minWidth: 150 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Status</option>
            <option>Draft</option>
            <option>Submitted</option>
            <option>Reviewed</option>
            <option>Needs Revision</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <FileText size={40} />
            <h3>No reports found</h3>
            <p>{search || filterStatus ? 'Try adjusting your search criteria.' : 'No monthly reports have been filed yet.'}</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  {!isEmployee && <th>Employee</th>}
                  <th>Tasks Done</th>
                  <th>Completion</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="text-sm font-semibold">{MONTHS[r.month - 1]} {r.year}</div>
                      <div className="text-xs text-muted">ID: {r.id.slice(0, 8)}</div>
                    </td>
                    {!isEmployee && (
                      <td>
                        <div className="text-sm font-medium">{(r as any).employee?.full_name || '—'}</div>
                        <div className="text-xs text-muted">{(r as any).employee?.position || (r as any).employee?.employee_id || ''}</div>
                      </td>
                    )}
                    <td>
                      <div className="text-sm">
                        <span className="font-semibold text-white">{r.tasks_completed}</span> / {r.tasks_assigned}
                      </div>
                      <div className="text-xs text-muted">{r.tasks_pending} pending · {r.tasks_overdue} overdue</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div style={{ width: 60, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(r.completion_rate, 100)}%`,
                            height: '100%',
                            background: r.completion_rate >= 80 ? 'var(--success)' : r.completion_rate >= 50 ? 'var(--warning)' : 'var(--danger)',
                            borderRadius: 3
                          }} />
                        </div>
                        <span className="text-xs text-muted">{r.completion_rate}%</span>
                      </div>
                    </td>
                    <td><span className={`badge ${statusColor(r.status)}`}>{r.status}</span></td>
                    <td className="text-sm text-muted">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowView(r); setFeedback(r.admin_feedback || ''); }}>
                          <Eye size={13} style={{ marginRight: 4 }} /> View
                        </button>
                        {(canReview || r.employee_id === profile?.id) && !isBoss && (
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setDeletingReport(r)}
                            title="Delete Report"
                            style={{ color: 'var(--danger)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Submit Report Modal ── */}
      {showModal && !isBoss && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Submit Monthly Report</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Month</label>
                  <select className="form-control" value={form.month} onChange={e => setForm({...form, month: parseInt(e.target.value)})}>
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <input className="form-control" type="number" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value)})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Summary *</label>
                <textarea className="form-control" value={form.monthly_summary} onChange={e => setForm({...form, monthly_summary: e.target.value})} placeholder="Key projects and work completed this month…" />
              </div>
              <div className="form-group">
                <label className="form-label">Key Achievements</label>
                <textarea className="form-control" value={form.achievements} onChange={e => setForm({...form, achievements: e.target.value})} placeholder="What milestones did you accomplish?" />
              </div>
              <div className="form-group">
                <label className="form-label">Challenges & Blockers</label>
                <textarea className="form-control" value={form.challenges} onChange={e => setForm({...form, challenges: e.target.value})} placeholder="What obstacles or issues occurred?" />
              </div>
              <div className="form-group">
                <label className="form-label">Pending Work</label>
                <textarea className="form-control" value={form.pending_work} onChange={e => setForm({...form, pending_work: e.target.value})} placeholder="Tasks carrying over into next month…" />
              </div>
              <div className="form-group">
                <label className="form-label">Next Month Plan</label>
                <textarea className="form-control" value={form.next_month_plan} onChange={e => setForm({...form, next_month_plan: e.target.value})} placeholder="Target goals and deliverables for next month…" />
              </div>
              <div className="form-group">
                <label className="form-label">Additional Notes</label>
                <textarea className="form-control" value={form.additional_notes} onChange={e => setForm({...form, additional_notes: e.target.value})} placeholder="Any extra information for your manager…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmitReport}><Send size={16} /> Submit Report</button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Report Modal ── */}
      {showView && (
        <div className="modal-overlay" onClick={() => setShowView(null)}>
          <div className="modal-content" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{MONTHS[showView.month - 1]} {showView.year} Report</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowView(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {!isEmployee && (
                <div className="flex items-center gap-3 mb-4" style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {(showView as any).employee?.full_name?.charAt(0) || 'E'}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{(showView as any).employee?.full_name}</div>
                    <div className="text-xs text-muted">{(showView as any).employee?.employee_id} · {(showView as any).employee?.position}</div>
                  </div>
                  <span className={`badge ${statusColor(showView.status)} ml-auto`}>{showView.status}</span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div className="font-bold">{showView.tasks_assigned}</div>
                  <div className="text-xs text-muted">Assigned</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div className="font-bold" style={{ color: 'var(--success)' }}>{showView.tasks_completed}</div>
                  <div className="text-xs text-muted">Completed</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div className="font-bold" style={{ color: 'var(--warning)' }}>{showView.tasks_pending}</div>
                  <div className="text-xs text-muted">Pending</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                  <div className="font-bold" style={{ color: 'var(--danger)' }}>{showView.tasks_overdue}</div>
                  <div className="text-xs text-muted">Overdue</div>
                </div>
              </div>
              <div style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                <span className="text-sm font-medium">Completion Rate: </span>
                <span className="font-bold" style={{ color: showView.completion_rate >= 80 ? 'var(--success)' : showView.completion_rate >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                  {showView.completion_rate}%
                </span>
              </div>

              {[
                { label: 'Monthly Summary', val: showView.monthly_summary },
                { label: 'Key Achievements', val: showView.achievements },
                { label: 'Challenges', val: showView.challenges },
                { label: 'Pending Work', val: showView.pending_work },
                { label: 'Next Month Plan', val: showView.next_month_plan },
                { label: 'Additional Notes', val: showView.additional_notes }
              ].map(s => s.val ? (
                <div key={s.label} className="mb-4">
                  <h4 className="text-xs font-semibold text-muted mb-1" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</h4>
                  <p className="text-sm card" style={{ background: 'var(--bg-primary)', padding: '0.75rem', whiteSpace: 'pre-wrap' }}>{s.val}</p>
                </div>
              ) : null)}

              {showView.admin_feedback && (
                <div className="mb-4" style={{ padding: '0.75rem', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--info)' }}>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--info)' }}>ADMIN REVIEW FEEDBACK</h4>
                  <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{showView.admin_feedback}</p>
                </div>
              )}

              {canReview && showView.status === 'Submitted' && (
                <div className="mt-4 border-t border-color pt-4" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="form-group">
                    <label className="form-label"><MessageSquare size={14} style={{ display: 'inline', marginRight: 4 }} />Manager Feedback</label>
                    <textarea className="form-control" value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Provide feedback or instructions before approving…" />
                  </div>
                  <div className="flex gap-3">
                    <button className="btn btn-success" onClick={() => handleReview(showView, 'Reviewed')}>✓ Approve Report</button>
                    <button className="btn btn-danger" onClick={() => handleReview(showView, 'Needs Revision')}>↩ Request Revision</button>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-color flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
                {(canReview || showView.employee_id === profile?.id) && !isBoss ? (
                  <button
                    className="btn btn-danger btn-sm flex items-center gap-1"
                    onClick={() => {
                      const rep = showView;
                      setShowView(null);
                      setDeletingReport(rep);
                    }}
                  >
                    <Trash2 size={13} /> Delete Report
                  </button>
                ) : <div />}
                <button className="btn btn-secondary btn-sm" onClick={() => setShowView(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Delete Confirmation Modal ── */}
      {deletingReport && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeletingReport(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle size={20} />
                <h2 className="text-base font-bold text-white">Delete Report</h2>
              </div>
              <button className="btn btn-ghost btn-icon" disabled={isDeleting} onClick={() => setDeletingReport(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted mb-2">
                Are you sure you want to permanently delete the monthly report for:
              </p>
              <div
                className="card mb-3"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '0.75rem'
                }}
              >
                <div className="font-semibold text-white text-sm">
                  {MONTHS[deletingReport.month - 1]} {deletingReport.year}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  Tasks Completed: {deletingReport.tasks_completed}/{deletingReport.tasks_assigned} • Status: {deletingReport.status}
                </div>
              </div>
              <p className="text-xs text-muted">
                This record and its analytics will be permanently removed.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" disabled={isDeleting} onClick={() => setDeletingReport(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={isDeleting} onClick={confirmDeleteReport}>
                {isDeleting ? 'Deleting…' : 'Yes, Delete Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
