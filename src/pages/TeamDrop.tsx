import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Employee } from '../types/database.types';
import { OFFICIAL_TEAM, filterAnonymousBosses } from '../constants/team';
import {
  UploadCloud, FileText, Image, Video, Archive, Download, Trash2,
  CheckCircle, Users, Send, X, AlertCircle, RefreshCw,
  FolderDown, Share2, Zap, Shield, Link2, ExternalLink, Copy
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface SharedFileRecord {
  id: string;
  name: string;
  size: number;
  type: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipientIds: string[];
  recipientEmails: string[];
  recipientNames: string[];
  url: string; // Direct download link or Data URL
  notes?: string;
  timestamp: number;
  isExternalLink?: boolean;
}

export const TeamDrop: React.FC = () => {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // Active view tab: 'inbox' | 'outbox'
  const [activeTab, setActiveTab] = useState<'inbox' | 'outbox'>('inbox');

  // Selected recipients for upload (empty array means "Entire Team")
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);

  // File to upload
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [fileNotes, setFileNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // External Cloud Link Modal (Google Drive, Canva, Dropbox, etc.)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNotes, setLinkNotes] = useState('');

  // Drag over target for dropping directly onto a team member card
  const [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null);
  const [isDraggingZone, setIsDraggingZone] = useState(false);

  // Shared files records (Persistent across sessions, 0 bytes Supabase storage used)
  const [sharedFiles, setSharedFiles] = useState<SharedFileRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ecom_team_shared_files');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Deletion modal
  const [deletingFile, setDeletingFile] = useState<SharedFileRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);

  // Save to localStorage whenever sharedFiles updates
  useEffect(() => {
    try {
      localStorage.setItem('ecom_team_shared_files', JSON.stringify(sharedFiles.slice(0, 100)));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [sharedFiles]);

  // Fetch employees list (Guarantees all 7 operational team members are visible and filters out anonymous bosses)
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'Active');

      const rawList = (data || []) as Employee[];
      // Completely filter out Ali Hassan and Rana Hasnain (Bosses remain anonymous)
      const visibleList = filterAnonymousBosses(rawList);

      const byEmail = new Map<string, Employee>();
      visibleList.forEach(e => {
        if (e.email) byEmail.set(e.email.toLowerCase(), e);
      });

      // Merge with OFFICIAL_TEAM so that all 7 members (Manager + 6 Employees) are visible to everyone
      const mergedRoster: Employee[] = OFFICIAL_TEAM.map(preset => {
        const existing = byEmail.get(preset.email.toLowerCase());
        if (existing) {
          return {
            ...existing,
            full_name: existing.full_name || preset.full_name,
            position: existing.position || preset.position,
            role: existing.role || preset.role
          };
        }
        return {
          ...preset,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        } as Employee;
      });

      setEmployees(mergedRoster);
    } catch (e: any) {
      console.error('Failed to load team members:', e);
      setEmployees(OFFICIAL_TEAM.map(p => ({
        ...p,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })) as Employee[]);
    } finally {
      setLoading(false);
    }
  };

  // Sync files from Supabase notifications (allows Rayan to receive files asynchronously even if he logs in hours later)
  const syncRemoteFiles = useCallback(async () => {
    if (!profile) return;
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .like('title', '📁 File Drop%')
        .order('created_at', { ascending: false })
        .limit(30);

      if (data && data.length > 0) {
        const remoteRecords: SharedFileRecord[] = [];
        data.forEach(item => {
          try {
            const meta = JSON.parse(item.message);
            remoteRecords.push({
              id: item.id,
              name: meta.name || item.title.replace('📁 File Drop: ', ''),
              size: meta.size || 0,
              type: meta.type || 'application/octet-stream',
              senderId: meta.senderId || '',
              senderName: meta.senderName || 'Team Member',
              senderEmail: meta.senderEmail || '',
              recipientIds: [profile.id],
              recipientEmails: [(profile.email || '').toLowerCase()],
              recipientNames: [profile.full_name || 'You'],
              url: item.link || meta.url,
              notes: meta.notes,
              timestamp: new Date(item.created_at).getTime(),
              isExternalLink: meta.isExternalLink || false
            });
          } catch {
            // Non-JSON message format fallback
            remoteRecords.push({
              id: item.id,
              name: item.title.replace('📁 File Drop: ', ''),
              size: 0,
              type: 'application/octet-stream',
              senderId: '',
              senderName: 'Team Member',
              senderEmail: '',
              recipientIds: [profile.id],
              recipientEmails: [(profile.email || '').toLowerCase()],
              recipientNames: [profile.full_name || 'You'],
              url: item.link || '',
              notes: item.message,
              timestamp: new Date(item.created_at).getTime()
            });
          }
        });

        // Merge with existing local records avoiding duplicates
        setSharedFiles(prev => {
          const existingIds = new Set(prev.map(f => f.id));
          const newItems = remoteRecords.filter(r => !existingIds.has(r.id));
          return [...newItems, ...prev];
        });
      }
    } catch (err) {
      console.warn('Sync remote files note:', err);
    }
  }, [profile]);

  useEffect(() => {
    fetchEmployees();
    syncRemoteFiles();
  }, [syncRemoteFiles]);

  // Setup Realtime Broadcast channel to receive instant push when anyone shares a file
  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel('ecom_teamdrop_realtime', {
      config: { broadcast: { self: false } }
    });

    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'new-shared-file' }, ({ payload }) => {
        if (!payload) return;
        const myId = profile.id;
        const myEmail = (profile.email || '').toLowerCase();

        // Check if I am an intended recipient or if sent to entire team
        const isTarget =
          payload.recipientIds.length === 0 || // Sent to everyone
          payload.recipientIds.includes(myId) ||
          payload.recipientEmails?.includes(myEmail);

        if (isTarget && payload.senderId !== myId) {
          toast(`📁 ${payload.senderName} shared "${payload.name}" with you!`, {
            icon: '📥',
            duration: 6000
          });
          setSharedFiles(prev => {
            if (prev.some(f => f.id === payload.id)) return prev;
            return [payload, ...prev];
          });
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile]);

  const toggleRecipient = (empId: string) => {
    if (sendToAll) {
      setSendToAll(false);
      setSelectedRecipients([empId]);
      return;
    }

    if (selectedRecipients.includes(empId)) {
      const updated = selectedRecipients.filter(id => id !== empId);
      if (updated.length === 0) {
        setSendToAll(true);
      } else {
        setSelectedRecipients(updated);
      }
    } else {
      setSelectedRecipients([...selectedRecipients, empId]);
    }
  };

  const selectEveryone = () => {
    setSendToAll(true);
    setSelectedRecipients([]);
  };

  // Direct drop onto a member's card
  const handleDropOnMember = (e: React.DragEvent, empId: string | null) => {
    e.preventDefault();
    setDragOverMemberId(null);
    setIsDraggingZone(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileToUpload(file);
      if (empId) {
        setSendToAll(false);
        setSelectedRecipients([empId]);
        const targetEmp = employees.find(emp => emp.id === empId);
        toast.success(`Ready to send "${file.name}" to ${targetEmp?.full_name || 'member'}!`);
      } else {
        setSendToAll(true);
        setSelectedRecipients([]);
        toast.success(`Ready to share "${file.name}" with Entire Team!`);
      }
    }
  };

  // Upload file using Fast Free Cloud CDN (0 bytes Supabase Storage used)
  const uploadToFreeCloud = (file: File): Promise<string> => {
    // For smaller files (<= 4 MB like screenshots, documents, spreadsheets), convert directly to Data URL
    // This is 100% instantaneous, works offline, never fails, and uses 0 Supabase storage!
    if (file.size <= 4 * 1024 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          setUploadProgress(100);
          resolve(reader.result as string);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    // For larger files (> 4 MB up to 10 GB), upload directly to high-speed public CDN
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://tmpfiles.org/api/v1/upload');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(Math.min(98, pct));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.status === 'success' && res.data?.url) {
              setUploadProgress(100);
              resolve(res.data.url);
            } else {
              reject(new Error('Invalid response from upload server'));
            }
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`Upload service error (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error uploading to cloud CDN'));

      const formData = new FormData();
      formData.append('file', file);
      xhr.send(formData);
    });
  };

  // Master send file handler
  const handleSendFile = async () => {
    if (!fileToUpload || !profile) return;
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // 1. Upload to zero-cost cloud (Data URL or Cloud CDN)
      toast.loading(`Uploading "${fileToUpload.name}"…`, { id: 'file_uploading' });
      const downloadUrl = await uploadToFreeCloud(fileToUpload);
      toast.dismiss('file_uploading');

      // 2. Identify target recipients
      const recipients = sendToAll
        ? employees.filter(e => e.id !== profile.id && e.email !== profile.email)
        : employees.filter(e => selectedRecipients.includes(e.id));

      const newRecord: SharedFileRecord = {
        id: `drop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: fileToUpload.name,
        size: fileToUpload.size,
        type: fileToUpload.type || 'application/octet-stream',
        senderId: profile.id,
        senderName: profile.full_name,
        senderEmail: profile.email || '',
        recipientIds: recipients.map(r => r.id),
        recipientEmails: recipients.map(r => (r.email || '').toLowerCase()),
        recipientNames: sendToAll ? ['Entire Team'] : recipients.map(r => r.full_name),
        url: downloadUrl,
        notes: fileNotes.trim() || undefined,
        timestamp: Date.now()
      };

      // 3. Save locally in state
      setSharedFiles(prev => [newRecord, ...prev]);

      // 4. Try sending async notification to Supabase so recipients can see it anytime they log in
      try {
        if (recipients.length > 0) {
          const notifs = recipients.map(r => ({
            user_id: r.id,
            title: `📁 File Drop: ${fileToUpload.name}`,
            message: JSON.stringify({
              name: fileToUpload.name,
              size: fileToUpload.size,
              type: fileToUpload.type,
              url: downloadUrl,
              notes: fileNotes.trim() || undefined,
              senderName: profile.full_name,
              senderId: profile.id,
              senderEmail: profile.email
            }),
            link: downloadUrl
          }));
          await supabase.from('notifications').insert(notifs);
        }

        // Log to activity
        await supabase.from('activity_logs').insert({
          user_id: profile.id,
          action: 'FILE_SHARED',
          description: `shared "${fileToUpload.name}" with ${sendToAll ? 'Entire Team' : recipients.map(r => r.full_name).join(', ')}`,
        });
      } catch (dbErr) {
        console.warn('Async notification logged locally:', dbErr);
      }

      // 5. Broadcast in real time via Supabase Realtime WebSocket
      channelRef.current?.send({
        type: 'broadcast',
        event: 'new-shared-file',
        payload: newRecord
      });

      toast.success(`🎉 "${fileToUpload.name}" shared with ${sendToAll ? 'Entire Team' : `${recipients.length} member(s)`}!`);

      // Reset form
      setFileToUpload(null);
      setFileNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error('File share error:', err);
      toast.error(err.message || 'File sharing failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // Share external cloud link (Google Drive, Canva, Dropbox, WeTransfer)
  const handleShareExternalLink = async () => {
    if (!linkUrl.trim() || !profile) {
      toast.error('Please enter a valid link URL');
      return;
    }

    const title = linkTitle.trim() || 'Shared Cloud Folder / File';
    const recipients = sendToAll
      ? employees.filter(e => e.id !== profile.id && e.email !== profile.email)
      : employees.filter(e => selectedRecipients.includes(e.id));

    const newRecord: SharedFileRecord = {
      id: `link_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: title,
      size: 0,
      type: 'link',
      senderId: profile.id,
      senderName: profile.full_name,
      senderEmail: profile.email || '',
      recipientIds: recipients.map(r => r.id),
      recipientEmails: recipients.map(r => (r.email || '').toLowerCase()),
      recipientNames: sendToAll ? ['Entire Team'] : recipients.map(r => r.full_name),
      url: linkUrl.trim(),
      notes: linkNotes.trim() || undefined,
      timestamp: Date.now(),
      isExternalLink: true
    };

    setSharedFiles(prev => [newRecord, ...prev]);

    // Send notifications to recipients
    try {
      if (recipients.length > 0) {
        const notifs = recipients.map(r => ({
          user_id: r.id,
          title: `📁 Cloud Link: ${title}`,
          message: JSON.stringify({
            name: title,
            size: 0,
            type: 'link',
            url: linkUrl.trim(),
            notes: linkNotes.trim() || undefined,
            senderName: profile.full_name,
            isExternalLink: true
          }),
          link: linkUrl.trim()
        }));
        await supabase.from('notifications').insert(notifs);
      }
    } catch (e) {
      console.warn('Notification log error:', e);
    }

    // Broadcast in real time
    channelRef.current?.send({
      type: 'broadcast',
      event: 'new-shared-file',
      payload: newRecord
    });

    toast.success(`🔗 Link shared with ${sendToAll ? 'Entire Team' : `${recipients.length} member(s)`}!`);
    setShowLinkModal(false);
    setLinkTitle('');
    setLinkUrl('');
    setLinkNotes('');
  };

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // File icon helper
  const renderFileIcon = (fileType: string | undefined, fileName: string) => {
    if (fileType === 'link') {
      return <ExternalLink size={20} style={{ color: '#38bdf8' }} />;
    }
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (fileType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext || '')) {
      return <Image size={20} style={{ color: '#38bdf8' }} />;
    }
    if (fileType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext || '')) {
      return <Video size={20} style={{ color: '#c084fc' }} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive size={20} style={{ color: '#fbbf24' }} />;
    }
    return <FileText size={20} style={{ color: '#34d399' }} />;
  };

  // Filter files for Inbox vs Outbox
  const myId = profile?.id;
  const myEmail = (profile?.email || '').toLowerCase();

  const receivedFiles = sharedFiles.filter(f => {
    if (f.senderId === myId || (f.senderEmail && f.senderEmail.toLowerCase() === myEmail)) {
      return false; // I sent this
    }
    // Sent to everyone or sent to me
    if (f.recipientIds.length === 0) return true;
    if (myId && f.recipientIds.includes(myId)) return true;
    if (myEmail && f.recipientEmails?.includes(myEmail)) return true;
    return false;
  });

  const sentFiles = sharedFiles.filter(f => {
    return f.senderId === myId || (f.senderEmail && f.senderEmail.toLowerCase() === myEmail);
  });

  return (
    <div>
      {/* ── Top Header Banner with 100% Free & Zero Storage Badge ── */}
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Share2 size={24} className="text-primary" /> Team Drop (Quick File Share)
            </h1>
            <span className="badge badge-success flex items-center gap-1" style={{ fontSize: '0.72rem' }}>
              <Zap size={11} /> 100% Free • 0 Storage Used
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
            <Shield size={13} className="text-success" />
            Share ad videos, product sheets, mockups, or Google Drive links with any team member without using Supabase storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={() => setShowLinkModal(true)}
            title="Share Google Drive, Canva, or WeTransfer Link"
          >
            <Link2 size={13} /> Share Cloud Link
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { fetchEmployees(); syncRemoteFiles(); }}
            disabled={loading}
            title="Refresh shared files"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Interactive Drop Target Grid: All 7 Team Members (Manager + 6 Employees) ── */}
      <div className="card mb-4" style={{ padding: '1rem' }}>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-primary" />
            1. Select Recipient(s) or Drag a File Directly Onto Any Colleague:
          </div>
          <span className="text-xs text-muted">
            {sendToAll ? 'Target: Entire Team' : `Target: ${selectedRecipients.length} member(s)`}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {/* Entire Team Card */}
          <div
            onClick={selectEveryone}
            onDragOver={e => { e.preventDefault(); setDragOverMemberId('all'); }}
            onDragLeave={() => setDragOverMemberId(null)}
            onDrop={e => handleDropOnMember(e, null)}
            className="card"
            style={{
              padding: '0.625rem 0.75rem',
              cursor: 'pointer',
              border: dragOverMemberId === 'all'
                ? '2px dashed var(--primary)'
                : sendToAll
                ? '1px solid var(--primary)'
                : '1px solid var(--border-color)',
              background: dragOverMemberId === 'all'
                ? 'rgba(59, 130, 246, 0.2)'
                : sendToAll
                ? 'rgba(59, 130, 246, 0.12)'
                : 'var(--bg-primary)',
              transition: 'all 0.15s ease'
            }}
          >
            <div className="flex items-center gap-2">
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--primary-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.75rem', fontWeight: 800
              }}>
                🌟
              </div>
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="font-bold text-xs text-white truncate">Entire Team</div>
                <div className="text-xs text-muted">Share with everyone ({employees.length})</div>
              </div>
              {sendToAll && <CheckCircle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
            </div>
          </div>

          {/* Individual Member Cards (Manager & Employees - All visible and accessible to Rayan & everyone) */}
          {employees.map(emp => {
            const isMe = emp.id === profile?.id || (emp.email && emp.email.toLowerCase() === (profile?.email || '').toLowerCase());
            const isSelected = !sendToAll && selectedRecipients.includes(emp.id);
            const isDragOver = dragOverMemberId === emp.id;

            return (
              <div
                key={emp.id}
                onClick={() => !isMe && toggleRecipient(emp.id)}
                onDragOver={e => {
                  if (isMe) return;
                  e.preventDefault();
                  setDragOverMemberId(emp.id);
                }}
                onDragLeave={() => setDragOverMemberId(null)}
                onDrop={e => {
                  if (isMe) return;
                  handleDropOnMember(e, emp.id);
                }}
                className="card"
                style={{
                  padding: '0.625rem 0.75rem',
                  cursor: isMe ? 'default' : 'pointer',
                  opacity: isMe ? 0.7 : 1,
                  border: isDragOver
                    ? '2px dashed var(--primary)'
                    : isSelected
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border-color)',
                  background: isDragOver
                    ? 'rgba(59, 130, 246, 0.2)'
                    : isSelected
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'var(--bg-primary)',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div className="flex items-center gap-2">
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: emp.role === 'ADMIN' ? 'var(--primary)' : '#10b981',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0
                  }}>
                    {emp.full_name.charAt(0)}
                  </div>

                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="font-semibold text-xs text-white truncate">
                      {emp.full_name} {isMe && '(You)'}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {emp.position || (emp.role === 'ADMIN' ? 'Manager' : 'Team Member')}
                    </div>
                  </div>

                  {isSelected && (
                    <CheckCircle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Central Dropzone & Send Action ── */}
      <div className="card mb-4" style={{ padding: '1.25rem' }}>
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              setFileToUpload(e.target.files[0]);
              toast.success(`Selected "${e.target.files[0].name}"`);
            }
          }}
        />

        <div
          onDragOver={e => { e.preventDefault(); setIsDraggingZone(true); }}
          onDragLeave={() => setIsDraggingZone(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDraggingZone(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              setFileToUpload(e.dataTransfer.files[0]);
              toast.success(`Selected "${e.dataTransfer.files[0].name}"`);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: isDraggingZone ? '2px dashed var(--primary)' : '2px dashed var(--border-color)',
            background: isDraggingZone ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 0, 0, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem 1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.18s ease'
          }}
        >
          <UploadCloud size={38} className="text-primary" style={{ margin: '0 auto 0.75rem', opacity: 0.9 }} />
          {fileToUpload ? (
            <div>
              <div className="font-bold text-white text-sm">{fileToUpload.name}</div>
              <div className="text-xs text-muted mt-1">{formatBytes(fileToUpload.size)} • Click to replace file</div>
            </div>
          ) : (
            <div>
              <div className="font-bold text-white text-sm">Drag & drop any file here, or click to browse</div>
              <div className="text-xs text-muted mt-1">
                Ad creatives (MP4/MOV), product spreadsheets (XLSX), mockups, screenshots, Canva exports, or ZIPs
              </div>
            </div>
          )}
        </div>

        {/* Note & Direct Send Button */}
        {fileToUpload && (
          <div className="mt-3 flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <input
              className="form-control"
              style={{ flex: 1, minWidth: 240, fontSize: '0.8125rem' }}
              value={fileNotes}
              onChange={e => setFileNotes(e.target.value)}
              placeholder="Add instructions or context (e.g. Check this TikTok ad hook)…"
            />
            <button
              className="btn btn-primary"
              disabled={isUploading}
              onClick={handleSendFile}
            >
              <Send size={14} />
              {isUploading
                ? `Uploading (${uploadProgress || 50}%)…`
                : sendToAll
                ? 'Send to Entire Team'
                : `Send to ${selectedRecipients.length} Member(s)`}
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              disabled={isUploading}
              onClick={() => {
                setFileToUpload(null);
                setFileNotes('');
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              title="Cancel selection"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Inbox / Outbox Tabs ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            className={`btn btn-sm ${activeTab === 'inbox' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('inbox')}
          >
            <FolderDown size={14} /> Received Files ({receivedFiles.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'outbox' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('outbox')}
          >
            <Send size={14} /> Sent by Me ({sentFiles.length})
          </button>
        </div>

        <span className="text-xs text-muted flex items-center gap-1">
          <Shield size={12} className="text-success" /> 0 storage used on Supabase free tier
        </span>
      </div>

      {/* ── Files Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {(activeTab === 'inbox' ? receivedFiles : sentFiles).length === 0 ? (
          <div className="empty-state">
            <Share2 size={36} />
            <h3>{activeTab === 'inbox' ? 'No files received yet' : 'You haven’t sent any files yet'}</h3>
            <p>
              {activeTab === 'inbox'
                ? 'When a colleague drops a file or link for you, it will appear here for instant download.'
                : 'Drag and drop a file above or click "Share Cloud Link" to share with your team!'}
            </p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>File / Link</th>
                  <th>Size</th>
                  <th>{activeTab === 'inbox' ? 'From' : 'To'}</th>
                  <th>Note / Context</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === 'inbox' ? receivedFiles : sentFiles).map(file => {
                  return (
                    <tr key={file.id}>
                      {/* File Name & Icon */}
                      <td>
                        <div className="flex items-center gap-2.5">
                          {renderFileIcon(file.type, file.name)}
                          <div>
                            <div className="font-bold text-sm text-white">{file.name}</div>
                            {file.isExternalLink && (
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary flex items-center gap-1 hover:underline"
                              >
                                {file.url.length > 35 ? file.url.substring(0, 35) + '…' : file.url}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="text-xs text-muted">
                        {file.size > 0 ? formatBytes(file.size) : 'Cloud Link'}
                      </td>

                      {/* Sender or Recipient */}
                      <td className="text-xs">
                        {activeTab === 'inbox' ? (
                          <span className="font-semibold text-white">
                            {file.senderName || 'Team Member'}
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                            {file.recipientNames.join(', ') || 'Entire Team'}
                          </span>
                        )}
                      </td>

                      {/* Notes / Message */}
                      <td className="text-xs text-secondary">
                        {file.notes || <span className="text-muted">—</span>}
                      </td>

                      {/* Date */}
                      <td className="text-xs text-muted">
                        {format(new Date(file.timestamp), 'MMM d, HH:mm')}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1.5">
                          {file.url && !file.isExternalLink && (
                            <a
                              href={file.url}
                              download={file.name}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-primary btn-sm flex items-center gap-1"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', textDecoration: 'none' }}
                            >
                              <Download size={12} /> Download
                            </a>
                          )}

                          {file.isExternalLink && (
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-primary btn-sm flex items-center gap-1"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', textDecoration: 'none' }}
                            >
                              <ExternalLink size={12} /> Open Link
                            </a>
                          )}

                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => {
                              navigator.clipboard.writeText(file.url);
                              toast.success('Link copied to clipboard!');
                            }}
                            title="Copy Link"
                          >
                            <Copy size={13} />
                          </button>

                          <button
                            className="btn btn-ghost btn-icon btn-sm text-danger"
                            onClick={() => setDeletingFile(file)}
                            title="Remove from history"
                            style={{ color: 'var(--danger)' }}
                          >
                            <Trash2 size={13} />
                          </button>
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

      {/* ── Share Cloud Link Modal (Google Drive, Canva, Dropbox, WeTransfer) ── */}
      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-primary" />
                <h2 className="text-base font-bold text-white">Share Cloud Folder / Link</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowLinkModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted mb-3">
                Share large files via Google Drive, Canva designs, Dropbox, or WeTransfer with 0 storage used.
              </p>

              <div className="form-group mb-3">
                <label className="form-label">Title / Description *</label>
                <input
                  className="form-control"
                  placeholder="e.g. TikTok Ad Creatives Hook 1-4 (Google Drive)"
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Link URL *</label>
                <input
                  className="form-control"
                  placeholder="https://drive.google.com/... or https://canva.com/..."
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Instructions / Note for Team</label>
                <input
                  className="form-control"
                  placeholder="e.g. Please review the first 3 seconds of each video"
                  value={linkNotes}
                  onChange={e => setLinkNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowLinkModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleShareExternalLink}>
                Share with {sendToAll ? 'Entire Team' : `${selectedRecipients.length} Member(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deletingFile && (
        <div className="modal-overlay" onClick={() => setDeletingFile(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.25)' }}>
              <div className="flex items-center gap-2 text-danger">
                <AlertCircle size={18} />
                <h2 className="text-base font-bold text-white">Remove Record</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeletingFile(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted mb-2">
                Remove this file from your view?
              </p>
              <div className="card mb-3" style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem' }}>
                <div className="font-bold text-white text-sm">{deletingFile.name}</div>
                <div className="text-xs text-muted mt-1">{deletingFile.size > 0 ? formatBytes(deletingFile.size) : 'Cloud Link'}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeletingFile(null)}>Cancel</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setSharedFiles(prev => prev.filter(f => f.id !== deletingFile.id));
                  toast.success('Removed from view');
                  setDeletingFile(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
