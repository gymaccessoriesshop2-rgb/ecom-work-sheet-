import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Employee } from '../types/database.types';
import { useAuth } from '../contexts/AuthContext';
import { Users, Plus, Search, Edit, Trash2, Shield, Eye, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export const Employees: React.FC = () => {
  const { profile } = useAuth();
  const role = profile?.role;
  const isManager = role === 'ADMIN';
  const isBoss = role === 'BOSS';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);

  // Deletion modal state
  const [deletingEmp, setDeletingEmp] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    employee_id: '',
    position: '',
    joining_date: '',
    phone: '',
    role: 'EMPLOYEE' as string,
    password: ''
  });

  const resetForm = () => setForm({
    full_name: '',
    email: '',
    employee_id: '',
    position: '',
    joining_date: new Date().toISOString().split('T')[0],
    phone: '',
    role: 'EMPLOYEE',
    password: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmployees((data || []) as Employee[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = employees.filter(e => {
    const matchSearch =
      e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      e.position.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterRole && e.role !== filterRole) return false;
    return true;
  });

  const openCreate = () => {
    if (!isManager) return;
    resetForm();
    setEditingEmp(null);
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    if (!isManager) return;
    setEditingEmp(emp);
    setForm({
      full_name: emp.full_name,
      email: emp.email,
      employee_id: emp.employee_id,
      position: emp.position,
      joining_date: emp.joining_date,
      phone: emp.phone || '',
      role: emp.role,
      password: ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!isManager) return;
    if (!form.full_name || !form.email) {
      toast.error('Please enter name and email.');
      return;
    }

    try {
      if (editingEmp) {
        const { error } = await supabase.from('employees').update({
          full_name: form.full_name,
          employee_id: form.employee_id || editingEmp.employee_id,
          position: form.position || 'Team Member',
          joining_date: form.joining_date,
          phone: form.phone || null,
          role: form.role,
        }).eq('id', editingEmp.id);
        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: profile!.id,
          action: 'EMPLOYEE_EDITED',
          description: `updated team member ${form.full_name} (${form.role})`,
          related_entity_type: 'EMPLOYEE',
          related_entity_id: editingEmp.id,
        });

        toast.success('Team member updated!');
      } else {
        if (!form.password || form.password.length < 6) {
          toast.error('Password must be at least 6 characters.');
          return;
        }

        const prefix = form.role === 'ADMIN' ? 'MGR' : form.role === 'BOSS' ? 'BOSS' : 'EMP';
        const empId = form.employee_id || `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.full_name,
              role: form.role,
              employee_id: empId,
              position: form.position || (form.role === 'BOSS' ? 'Boss' : form.role === 'ADMIN' ? 'Manager' : 'Team Member'),
            }
          },
        });
        if (authError) throw authError;
        if (!authData.user) throw new Error('Failed to register user.');

        // Insert profile
        const { error: empError } = await supabase.from('employees').upsert({
          id: authData.user.id,
          full_name: form.full_name,
          email: form.email,
          employee_id: empId,
          position: form.position || (form.role === 'BOSS' ? 'Boss' : form.role === 'ADMIN' ? 'Manager' : 'Team Member'),
          joining_date: form.joining_date || new Date().toISOString().split('T')[0],
          phone: form.phone || null,
          role: form.role,
          status: 'Active',
        }, { onConflict: 'id' });

        if (empError) throw empError;

        await supabase.from('activity_logs').insert({
          user_id: profile!.id,
          action: 'EMPLOYEE_CREATED',
          description: `added new ${form.role.toLowerCase()}: ${form.full_name}`,
          related_entity_type: 'EMPLOYEE',
          related_entity_id: authData.user.id,
        });

        toast.success(`Account created for ${form.full_name}!`);
      }
      setShowModal(false);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Operation failed.');
    }
  };

  const handleDelete = (emp: Employee) => {
    if (!isManager) return;
    if (emp.id === profile?.id) {
      toast.error('You cannot delete your own account.');
      return;
    }
    setDeletingEmp(emp);
  };

  const confirmDeleteEmp = async () => {
    if (!deletingEmp || !isManager) return;
    setIsDeleting(true);
    try {
      // 1. Unassign tasks or nullify references to avoid foreign key errors
      try {
        await supabase.from('tasks').update({ assigned_to: null }).eq('assigned_to', deletingEmp.id);
        await supabase.from('monthly_reports').delete().eq('employee_id', deletingEmp.id);
        await supabase.from('activity_logs').delete().eq('user_id', deletingEmp.id);
        await supabase.from('notifications').delete().eq('user_id', deletingEmp.id);
      } catch (cleanErr) {
        console.warn('Cleanup error (handled):', cleanErr);
      }

      // 2. Delete employee record
      const { error } = await supabase.from('employees').delete().eq('id', deletingEmp.id);
      if (error) throw error;

      await supabase.from('activity_logs').insert({
        user_id: profile!.id,
        action: 'EMPLOYEE_DELETED',
        description: `removed team member "${deletingEmp.full_name}"`,
        related_entity_type: 'EMPLOYEE',
        related_entity_id: deletingEmp.id,
      });

      toast.success(`"${deletingEmp.full_name}" has been removed from the team.`);
      setDeletingEmp(null);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Failed to remove member. Check Supabase permissions.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async (emp: Employee) => {
    if (!isManager) return;
    const newStatus = emp.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const { error } = await supabase.from('employees').update({ status: newStatus }).eq('id', emp.id);
      if (error) throw error;
      toast.success(`${emp.full_name} is now ${newStatus}`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Team Members</h1>
            {isBoss && <span className="badge badge-info"><Eye size={12} style={{ marginRight: 4 }} /> View Only</span>}
          </div>
          <p className="text-muted text-sm">{filtered.length} member{filtered.length !== 1 ? 's' : ''} in your team</p>
        </div>
        {isManager && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Team Member
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="card mb-4" style={{ padding: '0.75rem' }}>
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="search-box" style={{ flex: 1, minWidth: 220, maxWidth: 380 }}>
            <Search size={16} />
            <input placeholder="Search members by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 'auto', minWidth: 150 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
            <option value="">All Roles</option>
            <option value="EMPLOYEE">Employees</option>
            <option value="ADMIN">Manager (Admin)</option>
            <option value="BOSS">Boss (View Only)</option>
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
            <Users size={40} />
            <h3>No team members found</h3>
            <p>Add your team members to get started.</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Team Member</th>
                  <th>Role</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th>Joined</th>
                  {isManager && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => (
                  <tr key={emp.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: emp.role === 'BOSS' ? 'var(--info)' : emp.role === 'ADMIN' ? 'var(--primary)' : 'var(--success)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {emp.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{emp.full_name}</div>
                          <div className="text-xs text-muted">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {emp.role === 'ADMIN' && <Shield size={12} style={{ color: 'var(--primary)' }} />}
                        {emp.role === 'BOSS' && <Eye size={12} style={{ color: 'var(--info)' }} />}
                        <span className={`badge ${emp.role === 'BOSS' ? 'badge-info' : emp.role === 'ADMIN' ? 'badge-primary' : 'badge-neutral'}`}>
                          {emp.role === 'BOSS' ? 'Boss' : emp.role === 'ADMIN' ? 'Manager' : 'Employee'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-white">{emp.position || 'Team Member'}</div>
                    </td>
                    <td>
                      {isManager ? (
                        <button
                          className={`badge ${emp.status === 'Active' ? 'badge-success' : 'badge-neutral'}`}
                          onClick={() => handleToggleStatus(emp)}
                          style={{ cursor: 'pointer' }}
                          title="Click to toggle status"
                        >
                          {emp.status}
                        </button>
                      ) : (
                        <span className={`badge ${emp.status === 'Active' ? 'badge-success' : 'badge-neutral'}`}>
                          {emp.status}
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-muted">
                      {emp.joining_date ? format(new Date(emp.joining_date), 'MMM d, yyyy') : '—'}
                    </td>
                    {isManager && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1">
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(emp)} title="Edit Member">
                            <Edit size={15} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDelete(emp)}
                            title="Remove Member"
                            style={{ color: 'var(--danger)' }}
                            disabled={emp.id === profile?.id}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit Member Modal ── */}
      {showModal && isManager && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEmp ? 'Edit Member' : 'Add Team Member'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input
                  className="form-control"
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                  placeholder="e.g. Sarah Jenkins"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  className="form-control"
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="sarah@company.com"
                  disabled={!!editingEmp}
                />
              </div>

              {!editingEmp && (
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input
                    className="form-control"
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">System Role *</label>
                  <select
                    className="form-control"
                    value={form.role}
                    onChange={e => setForm({
                      ...form,
                      role: e.target.value,
                      position: form.position || (e.target.value === 'BOSS' ? 'Boss' : e.target.value === 'ADMIN' ? 'Manager' : 'Team Member')
                    })}
                  >
                    <option value="EMPLOYEE">Employee (Does tasks)</option>
                    <option value="ADMIN">Manager (Assigns & Approves)</option>
                    <option value="BOSS">Boss (Views only)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Role Title / Position</label>
                  <input
                    className="form-control"
                    value={form.position}
                    onChange={e => setForm({ ...form, position: e.target.value })}
                    placeholder="e.g. Frontend Developer"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingEmp ? 'Save Changes' : 'Create Member Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Delete Confirmation Modal ── */}
      {deletingEmp && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeletingEmp(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle size={20} />
                <h2 className="text-base font-bold text-white">Remove Team Member</h2>
              </div>
              <button
                className="btn btn-ghost btn-icon"
                disabled={isDeleting}
                onClick={() => setDeletingEmp(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted mb-2">
                Are you sure you want to remove this team member?
              </p>
              <div
                className="card mb-3"
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '0.75rem'
                }}
              >
                <div className="font-semibold text-white text-sm">{deletingEmp.full_name}</div>
                <div className="text-xs text-muted mt-0.5">{deletingEmp.email} • {deletingEmp.position}</div>
              </div>
              <p className="text-xs text-muted">
                Their assigned tasks will become unassigned, and their profile will be removed.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                disabled={isDeleting}
                onClick={() => setDeletingEmp(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={isDeleting}
                onClick={confirmDeleteEmp}
              >
                {isDeleting ? 'Removing…' : 'Yes, Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
