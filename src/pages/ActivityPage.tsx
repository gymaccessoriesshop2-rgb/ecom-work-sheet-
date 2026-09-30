import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ActivityLog } from '../types/database.types';
import { useAuth } from '../contexts/AuthContext';
import { Activity, Search } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const ActivityPage: React.FC = () => {
  const { profile } = useAuth();
  const isViewer = profile?.role === 'ADMIN' || profile?.role === 'BOSS';

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        let query = supabase.from('activity_logs').select('*, user:employees(full_name)').order('created_at', { ascending: false }).limit(100);
        if (!isViewer) {
          query = query.eq('user_id', profile!.id);
        }
        const { data, error } = await query;
        if (error) throw error;
        setLogs((data || []) as ActivityLog[]);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    if (profile) fetch();
  }, [profile, isViewer]);

  const filtered = logs.filter(l => l.description.toLowerCase().includes(search.toLowerCase()) || (l as any).user?.full_name?.toLowerCase().includes(search.toLowerCase()));

  const actionIcon = (action: string) => {
    if (action.includes('TASK')) return '📋';
    if (action.includes('REPORT')) return '📄';
    if (action.includes('EMPLOYEE')) return '👤';
    return '⚡';
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{isViewer ? 'All Activity' : 'My Activity'}</h1>
        <p className="text-muted text-sm">Complete history of actions.</p>
      </div>

      <div className="card mb-4" style={{ padding: '0.75rem' }}>
        <div className="search-box" style={{ maxWidth: 400 }}>
          <Search size={16} />
          <input placeholder="Search activity…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Activity size={40} />
            <h3>No activity yet</h3>
            <p>Actions will appear here as they happen.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((log, i) => (
              <div key={log.id} className="flex items-center gap-3" style={{ padding: '0.75rem 0', borderBottom: i < filtered.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{actionIcon(log.action)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-sm">
                    <span className="font-medium">{(log as any).user?.full_name || 'System'}</span>{' '}
                    {log.description}
                  </p>
                  <p className="text-xs text-muted mt-1">{log.action.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs text-muted" style={{ flexShrink: 0 }}>{format(new Date(log.created_at), 'MMM d, HH:mm')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
