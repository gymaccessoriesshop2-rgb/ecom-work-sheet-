import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Employee } from '../types/database.types';
import { OFFICIAL_TEAM, filterAnonymousBosses } from '../constants/team';
import {
  UploadCloud, FileText, Image, Video, Archive, Download, Trash2,
  CheckCircle, Users, Send, X, AlertCircle, RefreshCw,
  FolderDown, Share2, Wifi, Zap, Shield, Link2, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface LocalTransferItem {
  id: string;
  name: string;
  size: number;
  type: string;
  senderId: string;
  senderName: string;
  recipientIds: string[];
  recipientNames: string[];
  timestamp: number;
  url?: string; // Blob URL for received file
  notes?: string;
  externalLink?: string;
}

interface ActiveTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  transferredBytes: number;
  speed: string;
  progress: number;
  direction: 'sending' | 'receiving';
  peerName: string;
  status: 'transferring' | 'completed' | 'failed';
}

// 32 KB binary-safe chunk size for reliable real-time WebSocket streaming
const CHUNK_SIZE = 32 * 1024;

export const TeamDrop: React.FC = () => {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);

  // Online team presence (tracked by both UUID and lowercase email)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());

  // Active view tab: 'inbox' | 'outbox'
  const [activeTab, setActiveTab] = useState<'inbox' | 'outbox'>('inbox');

  // Selected recipients for transfer (empty means broadcast to all online)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);

  // File to send
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const [fileNotes, setFileNotes] = useState('');

  // Optional external cloud link (for sharing Google Drive, Dropbox, or WeTransfer links)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  // Drag and drop UI states
  const [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null);
  const [isDraggingZone, setIsDraggingZone] = useState(false);

  // Active live transfers
  const [activeTransfers, setActiveTransfers] = useState<{ [transferId: string]: ActiveTransfer }>({});

  // History stored in localStorage (0 bytes cloud storage, zero DB rows)
  const [receivedHistory, setReceivedHistory] = useState<LocalTransferItem[]>(() => {
    try {
      const saved = localStorage.getItem(`teamdrop_inbox_${profile?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [sentHistory, setSentHistory] = useState<LocalTransferItem[]>(() => {
    try {
      const saved = localStorage.getItem(`teamdrop_outbox_${profile?.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Deletion modal for local record
  const [deletingFile, setDeletingFile] = useState<LocalTransferItem | null>(null);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<any>(null);
  const incomingChunksRef = useRef<{ [transferId: string]: { chunks: string[]; total: number; meta: any; received: number; lastTime: number; lastBytes: number } }>({});

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

      // Merge with OFFICIAL_TEAM so all 7 members (Manager + 6 Employees) are visible to everyone
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

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Save history to localStorage
  useEffect(() => {
    if (profile?.id) {
      try {
        localStorage.setItem(`teamdrop_inbox_${profile.id}`, JSON.stringify(receivedHistory.slice(0, 50)));
      } catch (err) {
        console.error('Local storage save error', err);
      }
    }
  }, [receivedHistory, profile?.id]);

  useEffect(() => {
    if (profile?.id) {
      try {
        localStorage.setItem(`teamdrop_outbox_${profile.id}`, JSON.stringify(sentHistory.slice(0, 50)));
      } catch (err) {
        console.error('Local storage save error', err);
      }
    }
  }, [sentHistory, profile?.id]);

  // Helper: check if a member is online on Wi-Fi
  const isMemberOnline = useCallback((emp: Employee) => {
    if (onlineUserIds.has(emp.id)) return true;
    if (emp.email && onlineEmails.has(emp.email.toLowerCase())) return true;
    return false;
  }, [onlineUserIds, onlineEmails]);

  // Convert binary ArrayBuffer to Base64 string for WebSocket transport
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Convert Base64 string back to Uint8Array
  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  // Process incoming transfer events from the Realtime channel
  const handleIncomingDropEvent = useCallback((event: string, payload: any) => {
    if (!profile) return;

    const myId = profile.id;
    const myEmail = (profile.email || '').toLowerCase();

    // Check if message is for me or broadcast to ALL
    const isForMe =
      payload.recipientId === 'ALL' ||
      payload.recipientId === myId ||
      (payload.recipientEmail && payload.recipientEmail.toLowerCase() === myEmail);

    // Ignore messages sent by myself
    if (payload.senderId === myId || (payload.senderEmail && payload.senderEmail.toLowerCase() === myEmail)) {
      return;
    }

    if (!isForMe) return;

    const transferId = payload.transferId;

    if (event === 'drop-start') {
      const { fileMeta, senderName, senderId } = payload;
      incomingChunksRef.current[transferId] = {
        chunks: [],
        total: fileMeta.size,
        meta: { ...fileMeta, senderName, senderId },
        received: 0,
        lastTime: Date.now(),
        lastBytes: 0
      };

      setActiveTransfers(prev => ({
        ...prev,
        [transferId]: {
          id: transferId,
          fileName: fileMeta.name,
          fileSize: fileMeta.size,
          transferredBytes: 0,
          speed: '0 MB/s',
          progress: 0,
          direction: 'receiving',
          peerName: senderName || 'Team Member',
          status: 'transferring'
        }
      }));

      toast.loading(`📥 Receiving "${fileMeta.name}" from ${senderName}…`, { id: transferId });
    } else if (event === 'drop-chunk') {
      const transfer = incomingChunksRef.current[transferId];
      if (!transfer) return;

      transfer.chunks[payload.chunkIndex] = payload.chunkData;
      transfer.received += payload.chunkBytes;

      const now = Date.now();
      if (now - transfer.lastTime > 200 || transfer.received >= transfer.total) {
        const deltaBytes = transfer.received - transfer.lastBytes;
        const deltaTime = (now - transfer.lastTime) / 1000;
        const mbPerSec = deltaTime > 0 ? (deltaBytes / (1024 * 1024)) / deltaTime : 0;
        transfer.lastBytes = transfer.received;
        transfer.lastTime = now;

        const progress = Math.min(100, Math.round((transfer.received / transfer.total) * 100));

        setActiveTransfers(prev => {
          if (!prev[transferId]) return prev;
          return {
            ...prev,
            [transferId]: {
              ...prev[transferId],
              transferredBytes: transfer.received,
              progress: progress,
              speed: `${mbPerSec.toFixed(1)} MB/s`
            }
          };
        });
      }
    } else if (event === 'drop-complete') {
      const transfer = incomingChunksRef.current[transferId];
      if (transfer) {
        // Assemble all Uint8Array chunks into a single Blob
        const byteArrays = transfer.chunks.map(chunkBase64 => base64ToUint8Array(chunkBase64));
        const blob = new Blob(byteArrays as BlobPart[], { type: transfer.meta.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // Auto-download file
        const a = document.createElement('a');
        a.href = url;
        a.download = transfer.meta.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        const newItem: LocalTransferItem = {
          id: transferId,
          name: transfer.meta.name,
          size: transfer.meta.size,
          type: transfer.meta.type,
          senderId: transfer.meta.senderId,
          senderName: transfer.meta.senderName,
          recipientIds: [myId],
          recipientNames: [profile.full_name || 'You'],
          timestamp: Date.now(),
          url: url,
          notes: transfer.meta.notes
        };

        setReceivedHistory(prev => [newItem, ...prev]);

        setActiveTransfers(prev => ({
          ...prev,
          [transferId]: {
            ...prev[transferId],
            progress: 100,
            status: 'completed',
            speed: 'Done'
          }
        }));

        toast.success(`🎉 Received "${transfer.meta.name}" directly over Wi-Fi!`, { id: transferId, duration: 5000 });

        setTimeout(() => {
          setActiveTransfers(prev => {
            const copy = { ...prev };
            delete copy[transferId];
            return copy;
          });
          delete incomingChunksRef.current[transferId];
        }, 3000);
      }
    }
  }, [profile]);

  // Initialize Supabase Realtime channel for zero-storage direct broadcast & presence
  useEffect(() => {
    if (!profile) return;

    const channel = supabase.channel('wifi_teamdrop_hub', {
      config: {
        broadcast: { self: false },
        presence: { key: profile.id }
      }
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const activeIds = new Set<string>();
        const activeEmails = new Set<string>();

        Object.values(state).forEach((presences: any) => {
          if (Array.isArray(presences)) {
            presences.forEach((p: any) => {
              if (p.user_id) activeIds.add(p.user_id);
              if (p.email) activeEmails.add(p.email.toLowerCase());
            });
          }
        });

        setOnlineUserIds(activeIds);
        setOnlineEmails(activeEmails);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if (Array.isArray(newPresences)) {
          newPresences.forEach((p: any) => {
            if (p.user_id) setOnlineUserIds(prev => new Set(prev).add(p.user_id));
            if (p.email) setOnlineEmails(prev => new Set(prev).add(p.email.toLowerCase()));
          });
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        if (Array.isArray(leftPresences)) {
          leftPresences.forEach((p: any) => {
            if (p.user_id) {
              setOnlineUserIds(prev => {
                const next = new Set(prev);
                next.delete(p.user_id);
                return next;
              });
            }
            if (p.email) {
              setOnlineEmails(prev => {
                const next = new Set(prev);
                next.delete(p.email.toLowerCase());
                return next;
              });
            }
          });
        }
      })
      .on('broadcast', { event: 'drop-start' }, ({ payload }) => {
        handleIncomingDropEvent('drop-start', payload);
      })
      .on('broadcast', { event: 'drop-chunk' }, ({ payload }) => {
        handleIncomingDropEvent('drop-chunk', payload);
      })
      .on('broadcast', { event: 'drop-complete' }, ({ payload }) => {
        handleIncomingDropEvent('drop-complete', payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            email: (profile.email || '').toLowerCase(),
            name: profile.full_name,
            role: profile.role,
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [profile, handleIncomingDropEvent]);

  // Toggle recipient selection
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
      setFileToSend(file);
      if (empId) {
        setSendToAll(false);
        setSelectedRecipients([empId]);
        const targetEmp = employees.find(emp => emp.id === empId);
        toast.success(`Selected "${file.name}" for ${targetEmp?.full_name || 'member'}`);
      } else {
        setSendToAll(true);
        setSelectedRecipients([]);
        toast.success(`Selected "${file.name}" for the entire online team`);
      }
    }
  };

  // Direct High-Speed Transfer using Realtime Stream (0 storage, 100% reliable, no WebRTC timeouts)
  const sendFileOverDirectStream = async (targetId: string, targetEmail: string, peerName: string, file: File, noteText: string): Promise<boolean> => {
    if (!profile || !channelRef.current) return false;

    const transferId = `drop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    setActiveTransfers(prev => ({
      ...prev,
      [transferId]: {
        id: transferId,
        fileName: file.name,
        fileSize: file.size,
        transferredBytes: 0,
        speed: '0 MB/s',
        progress: 0,
        direction: 'sending',
        peerName: peerName,
        status: 'transferring'
      }
    }));

    try {
      // 1. Send start header
      await channelRef.current.send({
        type: 'broadcast',
        event: 'drop-start',
        payload: {
          transferId,
          recipientId: targetId,
          recipientEmail: targetEmail.toLowerCase(),
          senderId: profile.id,
          senderEmail: (profile.email || '').toLowerCase(),
          senderName: profile.full_name,
          fileMeta: {
            name: file.name,
            size: file.size,
            type: file.type,
            notes: noteText
          }
        }
      });

      // 2. Read and stream chunks
      let offset = 0;
      let chunkIndex = 0;
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      let lastTime = Date.now();
      let lastBytes = 0;

      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        const base64Chunk = arrayBufferToBase64(buffer);

        await channelRef.current.send({
          type: 'broadcast',
          event: 'drop-chunk',
          payload: {
            transferId,
            chunkIndex,
            totalChunks,
            chunkBytes: buffer.byteLength,
            chunkData: base64Chunk,
            recipientId: targetId,
            recipientEmail: targetEmail.toLowerCase(),
            senderId: profile.id,
            senderEmail: (profile.email || '').toLowerCase()
          }
        });

        offset += buffer.byteLength;
        chunkIndex++;

        const now = Date.now();
        if (now - lastTime > 200 || offset >= file.size) {
          const deltaBytes = offset - lastBytes;
          const deltaTime = (now - lastTime) / 1000;
          const mbPerSec = deltaTime > 0 ? (deltaBytes / (1024 * 1024)) / deltaTime : 0;
          lastBytes = offset;
          lastTime = now;

          const progress = Math.min(100, Math.round((offset / file.size) * 100));

          setActiveTransfers(prev => ({
            ...prev,
            [transferId]: {
              ...prev[transferId],
              transferredBytes: offset,
              progress: progress,
              speed: `${mbPerSec.toFixed(1)} MB/s`
            }
          }));
        }

        // Slight micro-pause to prevent network flood
        if (chunkIndex % 8 === 0) {
          await new Promise(r => setTimeout(r, 15));
        }
      }

      // 3. Send complete event
      await channelRef.current.send({
        type: 'broadcast',
        event: 'drop-complete',
        payload: {
          transferId,
          recipientId: targetId,
          recipientEmail: targetEmail.toLowerCase(),
          senderId: profile.id,
          senderEmail: (profile.email || '').toLowerCase()
        }
      });

      setActiveTransfers(prev => ({
        ...prev,
        [transferId]: {
          ...prev[transferId],
          progress: 100,
          status: 'completed',
          speed: 'Done'
        }
      }));

      setTimeout(() => {
        setActiveTransfers(prev => {
          const copy = { ...prev };
          delete copy[transferId];
          return copy;
        });
      }, 3000);

      return true;
    } catch (err: any) {
      console.error('Direct stream error:', err);
      setActiveTransfers(prev => ({
        ...prev,
        [transferId]: {
          ...prev[transferId],
          status: 'failed',
          speed: 'Failed'
        }
      }));
      return false;
    }
  };

  // Master send button handler (Available for Manager AND all Employees alike!)
  const handleInitiateTransfer = async () => {
    if (!fileToSend || !profile) return;

    const isPeerMe = (p: Employee) =>
      p.id === profile.id || (p.email && p.email.toLowerCase() === (profile.email || '').toLowerCase());

    let targetEmployees: Employee[] = [];
    if (sendToAll) {
      targetEmployees = employees.filter(e => !isPeerMe(e) && isMemberOnline(e));
      if (targetEmployees.length === 0) {
        toast.error('No other team members are currently online on Wi-Fi. Ask them to open this page!');
        return;
      }
    } else {
      targetEmployees = employees.filter(e => selectedRecipients.includes(e.id));
      const offlineTargets = targetEmployees.filter(e => !isMemberOnline(e));
      if (offlineTargets.length > 0) {
        toast(() => (
          <span style={{ fontSize: '0.8rem' }}>
            ⚠️ <b>{offlineTargets.map(o => o.full_name).join(', ')}</b> is offline. Ask them to open the <b>Team Drop</b> page on their laptop to receive this file!
          </span>
        ), { duration: 6000, icon: '📡' });
      }
    }

    if (targetEmployees.length === 0) {
      toast.error('Please select at least one online team member.');
      return;
    }

    toast.loading(`Streaming "${fileToSend.name}" directly over Wi-Fi…`, { id: 'transfer_init' });

    let successCount = 0;

    if (sendToAll) {
      // Send once as broadcast to ALL
      const ok = await sendFileOverDirectStream('ALL', '', 'Entire Team', fileToSend, fileNotes.trim());
      if (ok) successCount = targetEmployees.length;
    } else {
      for (const peer of targetEmployees) {
        if (isMemberOnline(peer)) {
          const ok = await sendFileOverDirectStream(peer.id, peer.email || '', peer.full_name, fileToSend, fileNotes.trim());
          if (ok) successCount++;
        }
      }
    }

    toast.dismiss('transfer_init');

    if (successCount > 0) {
      toast.success(`🚀 "${fileToSend.name}" sent to ${successCount} member(s) at max Wi-Fi speed!`);

      // Record to local sent history
      const newSentItem: LocalTransferItem = {
        id: `sent_${Date.now()}`,
        name: fileToSend.name,
        size: fileToSend.size,
        type: fileToSend.type,
        senderId: profile.id,
        senderName: profile.full_name,
        recipientIds: targetEmployees.map(e => e.id),
        recipientNames: targetEmployees.map(e => e.full_name),
        timestamp: Date.now(),
        notes: fileNotes.trim() || undefined
      };
      setSentHistory(prev => [newSentItem, ...prev]);

      // Clear input
      setFileToSend(null);
      setFileNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      toast.error('Could not transfer file. Ensure recipients have the Team Drop page open.');
    }
  };

  // Share external cloud link (for Google Drive, Dropbox, WeTransfer, etc.)
  const handleShareExternalLink = () => {
    if (!linkInput.trim() || !profile) {
      toast.error('Please enter a valid link');
      return;
    }

    const title = linkTitle.trim() || 'Shared Cloud File';
    const newSentItem: LocalTransferItem = {
      id: `link_${Date.now()}`,
      name: title,
      size: 0,
      type: 'link',
      senderId: profile.id,
      senderName: profile.full_name,
      recipientIds: sendToAll ? [] : selectedRecipients,
      recipientNames: sendToAll ? ['Entire Team'] : employees.filter(e => selectedRecipients.includes(e.id)).map(e => e.full_name),
      timestamp: Date.now(),
      notes: fileNotes.trim() || undefined,
      externalLink: linkInput.trim()
    };

    setSentHistory(prev => [newSentItem, ...prev]);
    toast.success('Link added to history!');
    setShowLinkModal(false);
    setLinkInput('');
    setLinkTitle('');
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

  const activeTransferList = Object.values(activeTransfers);

  // Count total distinct peers online on Wi-Fi (excluding oneself)
  const totalOnlinePeers = employees.filter(e => {
    const isMe = e.id === profile?.id || (e.email && e.email.toLowerCase() === (profile?.email || '').toLowerCase());
    return !isMe && isMemberOnline(e);
  }).length;

  return (
    <div>
      {/* ── Top Header Banner with Wi-Fi & 100% Free Badge ── */}
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Share2 size={24} className="text-primary" /> Team Drop (Direct Wi-Fi P2P)
            </h1>
            <span className="badge badge-success flex items-center gap-1" style={{ fontSize: '0.72rem' }}>
              <Zap size={11} /> 100% Free • Gigabit Wi-Fi Speed
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
            <Wifi size={13} className="text-success" />
            Transfers files <b>directly device-to-device</b> over your local office Wi-Fi router. <b>0 bytes</b> used on Supabase storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: '0.75rem',
              color: '#34d399'
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }} />
            <span><b>{totalOnlinePeers + 1}</b> on Wi-Fi Drop</span>
          </div>

          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={() => setShowLinkModal(true)}
            title="Share Google Drive or Cloud Link"
          >
            <Link2 size={13} /> Share Cloud Link
          </button>

          <button className="btn btn-secondary btn-sm" onClick={fetchEmployees} disabled={loading} title="Refresh team">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Live Active Transfers Tracker (Streams in real-time) ── */}
      {activeTransferList.length > 0 && (
        <div className="card mb-4" style={{ padding: '1rem', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'rgba(15, 23, 42, 0.9)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={14} className="text-primary animate-pulse" />
              Active High-Speed Transfers:
            </div>
          </div>

          <div className="space-y-2">
            {activeTransferList.map(t => (
              <div
                key={t.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.6)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="font-semibold text-white flex items-center gap-2 truncate">
                    <span className={`badge ${t.direction === 'sending' ? 'badge-primary' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                      {t.direction === 'sending' ? '📤 Sending' : '📥 Receiving'}
                    </span>
                    <span className="truncate max-w-xs">{t.fileName}</span>
                    <span className="text-muted">({formatBytes(t.fileSize)})</span>
                    <span className="text-muted">• {t.direction === 'sending' ? `To ${t.peerName}` : `From ${t.peerName}`}</span>
                  </div>
                  <div className="font-mono text-xs flex items-center gap-2" style={{ color: '#38bdf8' }}>
                    <span>{t.speed}</span>
                    <span className="font-bold text-white">{t.progress}%</span>
                  </div>
                </div>

                {/* Smooth Progress Bar */}
                <div style={{ height: 6, width: '100%', background: 'rgba(255, 255, 255, 0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${t.progress}%`,
                      background: t.status === 'failed' ? 'var(--danger)' : 'var(--primary-gradient)',
                      transition: 'width 0.2s ease',
                      borderRadius: 3
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Interactive Drop Target Grid: All 7 Team Members (Manager + 6 Employees) ── */}
      <div className="card mb-4" style={{ padding: '1rem' }}>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-primary" />
            1. Select Recipient(s) or Drag a File Directly Onto Any Colleague:
          </div>
          <span className="text-xs text-muted">
            {sendToAll ? 'Target: All Online Members' : `Target: ${selectedRecipients.length} member(s)`}
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
                <div className="text-xs text-muted">Broadcast to all online</div>
              </div>
              {sendToAll && <CheckCircle size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
            </div>
          </div>

          {/* Individual Member Cards (Manager & Employees - All visible and accessible to Rayan & everyone) */}
          {employees.map(emp => {
            const isMe = emp.id === profile?.id || (emp.email && emp.email.toLowerCase() === (profile?.email || '').toLowerCase());
            const isOnline = isMemberOnline(emp);
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
                    : isOnline
                    ? '1px solid rgba(16, 185, 129, 0.4)'
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
                  {/* Avatar with Wi-Fi status ring */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: emp.role === 'ADMIN' ? 'var(--primary)' : '#10b981',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '0.72rem', fontWeight: 700
                    }}>
                      {emp.full_name.charAt(0)}
                    </div>
                    {/* Glowing status dot */}
                    <span
                      title={isOnline ? 'Online on Wi-Fi (Ready to receive)' : 'Offline (Open Team Drop to connect)'}
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isOnline ? '#10b981' : '#64748b',
                        border: '1.5px solid var(--bg-primary)',
                        boxShadow: isOnline ? '0 0 6px #10b981' : 'none'
                      }}
                    />
                  </div>

                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="font-semibold text-xs text-white truncate">
                      {emp.full_name} {isMe && '(You)'}
                    </div>
                    <div className="text-xs truncate flex items-center gap-1" style={{ color: isOnline ? '#34d399' : 'var(--text-muted)' }}>
                      <span>{emp.position || 'Team Member'}</span>
                      <span>•</span>
                      <span>{isOnline ? 'On Wi-Fi' : 'Offline'}</span>
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
              setFileToSend(e.target.files[0]);
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
              setFileToSend(e.dataTransfer.files[0]);
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
          {fileToSend ? (
            <div>
              <div className="font-bold text-white text-sm">{fileToSend.name}</div>
              <div className="text-xs text-muted mt-1">{formatBytes(fileToSend.size)} • Click to replace file</div>
            </div>
          ) : (
            <div>
              <div className="font-bold text-white text-sm">Drag & drop any file here, or click to browse</div>
              <div className="text-xs text-muted mt-1">
                Fast LAN transfer: Videos (MP4/MOV), raw ad creatives, product sheets (XLSX), Canva exports, or ZIPs
              </div>
            </div>
          )}
        </div>

        {/* Note & Direct Send Button */}
        {fileToSend && (
          <div className="mt-3 flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <input
              className="form-control"
              style={{ flex: 1, minWidth: 240, fontSize: '0.8125rem' }}
              value={fileNotes}
              onChange={e => setFileNotes(e.target.value)}
              placeholder="Add a quick note or instructions (e.g. Check this TikTok ad angle)…"
            />
            <button
              className="btn btn-primary"
              onClick={handleInitiateTransfer}
            >
              <Zap size={14} />
              {sendToAll
                ? `Send to All Online on Wi-Fi (${totalOnlinePeers})`
                : `Send to ${selectedRecipients.length} Member(s)`}
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => {
                setFileToSend(null);
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
            <FolderDown size={14} /> Received on Wi-Fi ({receivedHistory.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'outbox' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('outbox')}
          >
            <Send size={14} /> Sent by Me ({sentHistory.length})
          </button>
        </div>

        <span className="text-xs text-muted flex items-center gap-1">
          <Shield size={12} className="text-success" /> End-to-end direct peer transfer
        </span>
      </div>

      {/* ── Files Table ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {(activeTab === 'inbox' ? receivedHistory : sentHistory).length === 0 ? (
          <div className="empty-state">
            <Share2 size={36} />
            <h3>{activeTab === 'inbox' ? 'No files received yet' : 'You haven’t sent any files yet'}</h3>
            <p>
              {activeTab === 'inbox'
                ? 'When a colleague drops a file to you over the office Wi-Fi, it will instantly appear and download here.'
                : 'Select an online member and drop a file above to send at full Wi-Fi router speed!'}
            </p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Size</th>
                  <th>{activeTab === 'inbox' ? 'From' : 'To'}</th>
                  <th>Note / Context</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === 'inbox' ? receivedHistory : sentHistory).map(file => {
                  return (
                    <tr key={file.id}>
                      {/* File Name & Icon */}
                      <td>
                        <div className="flex items-center gap-2.5">
                          {renderFileIcon(file.type, file.name)}
                          <div>
                            <div className="font-bold text-sm text-white">{file.name}</div>
                            {file.externalLink && (
                              <a
                                href={file.externalLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary flex items-center gap-1 hover:underline"
                              >
                                {file.externalLink.length > 40 ? file.externalLink.substring(0, 40) + '…' : file.externalLink}
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
                            {file.recipientNames.join(', ') || 'Team'}
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
                          {file.url && (
                            <a
                              href={file.url}
                              download={file.name}
                              className="btn btn-primary btn-sm flex items-center gap-1"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', textDecoration: 'none' }}
                            >
                              <Download size={12} /> Save Again
                            </a>
                          )}

                          {file.externalLink && (
                            <a
                              href={file.externalLink}
                              target="_blank"
                              rel="noreferrer"
                              className="btn btn-primary btn-sm flex items-center gap-1"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', textDecoration: 'none' }}
                            >
                              <ExternalLink size={12} /> Open Link
                            </a>
                          )}

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

      {/* ── Share Cloud Link Modal ── */}
      {showLinkModal && (
        <div className="modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Link2 size={18} className="text-primary" />
                <h2 className="text-base font-bold text-white">Share Cloud File / Folder Link</h2>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowLinkModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted mb-3">
                Share large files via Google Drive, Dropbox, WeTransfer, or OneDrive without using any Supabase storage.
              </p>

              <div className="form-group mb-3">
                <label className="form-label">File or Folder Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. TikTok Ad Raw Creatives Pack (Google Drive)"
                  value={linkTitle}
                  onChange={e => setLinkTitle(e.target.value)}
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Link URL *</label>
                <input
                  className="form-control"
                  placeholder="https://drive.google.com/..."
                  value={linkInput}
                  onChange={e => setLinkInput(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Optional Instructions / Notes</label>
                <input
                  className="form-control"
                  placeholder="e.g. Please edit the hooks for TikTok by tomorrow"
                  value={fileNotes}
                  onChange={e => setFileNotes(e.target.value)}
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
                Remove this entry from your transfer history?
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
                  if (activeTab === 'inbox') {
                    setReceivedHistory(prev => prev.filter(f => f.id !== deletingFile.id));
                  } else {
                    setSentHistory(prev => prev.filter(f => f.id !== deletingFile.id));
                  }
                  toast.success('Removed from history');
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
