import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Shield, Eye, User, Lock, CheckCircle, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export const Settings: React.FC = () => {
  const { profile, refreshProfile } = useAuth();
  const role = profile?.role;

  const [phone, setPhone] = useState(profile?.phone || '');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: fullName,
          phone: phone || null,
        })
        .eq('id', profile.id);

      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Account & Settings</h1>
        <p className="text-muted text-sm">Manage your profile information and account security.</p>
      </div>

      {/* Role Banner */}
      <div className="card mb-6" style={{ background: 'var(--bg-secondary)', borderLeft: '4px solid var(--primary)' }}>
        <div className="flex items-center gap-4">
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: role === 'BOSS' ? 'rgba(99, 102, 241, 0.2)' : role === 'ADMIN' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: role === 'BOSS' ? 'var(--info)' : role === 'ADMIN' ? 'var(--primary)' : 'var(--success)',
            flexShrink: 0
          }}>
            {role === 'BOSS' ? <Eye size={24} /> : role === 'ADMIN' ? <Shield size={24} /> : <User size={24} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg">{profile?.full_name}</h2>
              <span className={`badge ${role === 'BOSS' ? 'badge-info' : role === 'ADMIN' ? 'badge-primary' : 'badge-success'}`}>
                {role === 'BOSS' ? 'Boss (View-Only Observer)' : role === 'ADMIN' ? 'Administrator' : 'Employee'}
              </span>
            </div>
            <p className="text-sm text-muted mt-1">
              {role === 'BOSS'
                ? 'Executive overview access. You have full visibility into all company tasks, employee activity, and monthly reports without task assignment permissions.'
                : role === 'ADMIN'
                ? 'Full system administrative access. You can manage employees, assign tasks, review monthly reports, and manage categories.'
                : 'Team member account. You can view assigned tasks, create personal tasks, log daily activities, and submit monthly reports.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Details Form */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} className="text-primary" />
            <h2 className="font-semibold">Personal Details</h2>
          </div>
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label className="form-label">Employee ID</label>
              <input className="form-control" value={profile?.employee_id || ''} disabled style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-control" value={profile?.email || ''} disabled style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Position / Title</label>
              <input className="form-control" value={profile?.position || ''} disabled style={{ opacity: 0.7 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-control"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                className="form-control"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 234 567 890"
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={savingProfile}>
              <Save size={16} /> {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        {/* Security & Password */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} className="text-primary" />
            <h2 className="font-semibold">Security & Password</h2>
          </div>
          <form onSubmit={handleUpdatePassword}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-control"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-control"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>
            <div className="card mb-4" style={{ background: 'var(--bg-primary)', padding: '0.875rem' }}>
              <div className="text-xs text-muted flex items-start gap-2">
                <CheckCircle size={14} className="text-success" style={{ marginTop: 2, flexShrink: 0 }} />
                <span>Password should be strong and unique to protect company activity and reporting records.</span>
              </div>
            </div>
            <button type="submit" className="btn btn-secondary w-full" disabled={changingPass}>
              <Lock size={16} /> {changingPass ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
