import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Employee } from '../types/database.types';
import {
  UploadCloud, FileText, Image, Video, Archive, Download, Trash2,
  CheckCircle, Users, Send, X, AlertCircle, RefreshCw,
  FolderDown, Share2, Wifi, Zap, Shield
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
  url?: string; // Blob object URL for received files
  notes?: string;
}

interface ActiveTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  transferredBytes: number;
  speed: string; // e.g. "42.5 MB/s"
  progress: number; // 0 - 100
  direction: 'sending' | 'receiving';
  peerName: string;
  status: 'connecting' | 'transferring' | 'completed' | 'failed';
}

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks for optimal LAN streaming

export const TeamDrop: React.FC = () => {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Online peer IDs discovered via zero-cost Supabase Realtime presence
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  // Active view tab: 'inbox' | 'outbox'
  const [activeTab, setActiveTab] = useState<'inbox' | 'outbox'>('inbox');

  // Selected recipients for transfer (empty means all online)
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);

  // File to send
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const [fileNotes, setFileNotes] = useState('');

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
  const peerConnectionsRef = useRef<{ [peerId: string]: RTCPeerConnection }>({});
  const dataChannelsRef = useRef<{ [peerId: string]: RTCDataChannel }>({});
  const incomingChunksRef = useRef<{ [transferKey: string]: { chunks: ArrayBuffer[]; total: number; meta: any } }>({});

  // Fetch employees list
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, position, role, email')
        .eq('status', 'Active');
      if (error) throw error;
      setEmployees((data || []) as Employee[]);
    } catch (e: any) {
      console.error('Failed to load team members:', e);
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

  // Clean WebRTC peer connection
  const closePeer = useCallback((peerId: string) => {
    if (dataChannelsRef.current[peerId]) {
      try { dataChannelsRef.current[peerId].close(); } catch {}
      delete dataChannelsRef.current[peerId];
    }
    if (peerConnectionsRef.current[peerId]) {
      try { peerConnectionsRef.current[peerId].close(); } catch {}
      delete peerConnectionsRef.current[peerId];
    }
  }, []);

  // Create an RTCPeerConnection configured for local LAN ICE exchange
  const createPeerConnection = useCallback((peerId: string) => {
    closePeer(peerId);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current && profile) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'p2p-signal',
          payload: {
            targetUserId: peerId,
            senderUserId: profile.id,
            signalType: 'candidate',
            candidate: event.candidate
          }
        });
      }
    };

    peerConnectionsRef.current[peerId] = pc;
    return pc;
  }, [closePeer, profile]);

  // Handle incoming data channel setup on Receiver side
  const setupReceiverChannel = useCallback((channel: RTCDataChannel, senderId: string) => {
    channel.binaryType = 'arraybuffer';
    let currentTransferKey = '';
    let currentMeta: any = null;
    let receivedBytes = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    channel.onmessage = (event) => {
      // String message = metadata or control
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'START_FILE') {
            currentMeta = msg.fileMeta;
            currentTransferKey = `${senderId}_${currentMeta.name}_${Date.now()}`;
            incomingChunksRef.current[currentTransferKey] = {
              chunks: [],
              total: currentMeta.size,
              meta: currentMeta
            };
            receivedBytes = 0;
            lastTime = Date.now();
            lastBytes = 0;

            setActiveTransfers(prev => ({
              ...prev,
              [currentTransferKey]: {
                id: currentTransferKey,
                fileName: currentMeta.name,
                fileSize: currentMeta.size,
                transferredBytes: 0,
                speed: '0 MB/s',
                progress: 0,
                direction: 'receiving',
                peerName: currentMeta.senderName || 'Team Member',
                status: 'transferring'
              }
            }));
            toast.loading(`Receiving "${currentMeta.name}" directly over Wi-Fi…`, { id: currentTransferKey });
          } else if (msg.type === 'END_FILE') {
            const transfer = incomingChunksRef.current[currentTransferKey];
            if (transfer) {
              const blob = new Blob(transfer.chunks, { type: transfer.meta.type || 'application/octet-stream' });
              const url = URL.createObjectURL(blob);

              // Auto-trigger browser download
              const a = document.createElement('a');
              a.href = url;
              a.download = transfer.meta.name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              const newItem: LocalTransferItem = {
                id: currentTransferKey,
                name: transfer.meta.name,
                size: transfer.meta.size,
                type: transfer.meta.type,
                senderId: senderId,
                senderName: transfer.meta.senderName,
                recipientIds: [profile?.id || ''],
                recipientNames: [profile?.full_name || 'You'],
                timestamp: Date.now(),
                url: url,
                notes: transfer.meta.notes
              };

              setReceivedHistory(prev => [newItem, ...prev]);

              setActiveTransfers(prev => ({
                ...prev,
                [currentTransferKey]: {
                  ...prev[currentTransferKey],
                  progress: 100,
                  status: 'completed',
                  speed: 'Done'
                }
              }));

              toast.success(`🎉 Received "${transfer.meta.name}" at max Wi-Fi speed!`, { id: currentTransferKey, duration: 5000 });

              // Remove from active transfers after 4s
              setTimeout(() => {
                setActiveTransfers(prev => {
                  const copy = { ...prev };
                  delete copy[currentTransferKey];
                  return copy;
                });
                delete incomingChunksRef.current[currentTransferKey];
              }, 4000);
            }
          }
        } catch (e) {
          console.error('Error handling string control signal:', e);
        }
        return;
      }

      // Binary chunk
      if (event.data instanceof ArrayBuffer && currentTransferKey) {
        const transfer = incomingChunksRef.current[currentTransferKey];
        if (!transfer) return;

        transfer.chunks.push(event.data);
        receivedBytes += event.data.byteLength;

        const now = Date.now();
        // Update stats every 250ms
        if (now - lastTime > 250 || receivedBytes >= transfer.total) {
          const deltaBytes = receivedBytes - lastBytes;
          const deltaTime = (now - lastTime) / 1000;
          const mbPerSec = deltaTime > 0 ? (deltaBytes / (1024 * 1024)) / deltaTime : 0;
          lastBytes = receivedBytes;
          lastTime = now;

          const progress = Math.min(100, Math.round((receivedBytes / transfer.total) * 100));

          setActiveTransfers(prev => {
            if (!prev[currentTransferKey]) return prev;
            return {
              ...prev,
              [currentTransferKey]: {
                ...prev[currentTransferKey],
                transferredBytes: receivedBytes,
                progress: progress,
                speed: `${mbPerSec.toFixed(1)} MB/s`
              }
            };
          });
        }
      }
    };
  }, [profile]);

  // Handle incoming signaling messages
  const handleSignal = useCallback(async (payload: any) => {
    if (!profile || payload.targetUserId !== profile.id) return;

    const { senderUserId, signalType, sdp, candidate } = payload;

    try {
      if (signalType === 'offer') {
        const pc = createPeerConnection(senderUserId);

        pc.ondatachannel = (e) => {
          dataChannelsRef.current[senderUserId] = e.channel;
          setupReceiverChannel(e.channel, senderUserId);
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'p2p-signal',
          payload: {
            targetUserId: senderUserId,
            senderUserId: profile.id,
            signalType: 'answer',
            sdp: answer
          }
        });
      } else if (signalType === 'answer') {
        const pc = peerConnectionsRef.current[senderUserId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
      } else if (signalType === 'candidate') {
        const pc = peerConnectionsRef.current[senderUserId];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    } catch (err) {
      console.error('Signal handling failed:', err);
    }
  }, [profile, createPeerConnection, setupReceiverChannel]);

  // Initialize Supabase Realtime channel for zero-storage LAN presence & signaling
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
        Object.keys(state).forEach(key => activeIds.add(key));
        setOnlineUserIds(activeIds);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineUserIds(prev => new Set(prev).add(key));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        closePeer(key);
      })
      .on('broadcast', { event: 'p2p-signal' }, ({ payload }) => {
        handleSignal(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: profile.id,
            name: profile.full_name,
            role: profile.role,
            online_at: new Date().toISOString()
          });
        }
      });

    return () => {
      channel.unsubscribe();
      Object.keys(peerConnectionsRef.current).forEach(closePeer);
    };
  }, [profile, handleSignal, closePeer]);

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

  // Stream a file to a specific peer over WebRTC DataChannel
  const sendFileToPeer = async (peer: Employee, file: File, noteText: string): Promise<boolean> => {
    if (!profile) return false;

    const transferId = `send_${peer.id}_${Date.now()}`;

    // Add active transfer state
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
        peerName: peer.full_name,
        status: 'connecting'
      }
    }));

    return new Promise(async (resolve) => {
      try {
        const pc = createPeerConnection(peer.id);
        const dataChannel = pc.createDataChannel('fileTransfer', { ordered: true });
        dataChannel.binaryType = 'arraybuffer';
        dataChannelsRef.current[peer.id] = dataChannel;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send signaling offer to recipient
        channelRef.current?.send({
          type: 'broadcast',
          event: 'p2p-signal',
          payload: {
            targetUserId: peer.id,
            senderUserId: profile.id,
            signalType: 'offer',
            sdp: offer,
            fileMeta: {
              name: file.name,
              size: file.size,
              type: file.type,
              senderName: profile.full_name,
              notes: noteText
            }
          }
        });

        // Timeout if peer doesn't connect within 15 seconds
        const timeout = setTimeout(() => {
          setActiveTransfers(prev => ({
            ...prev,
            [transferId]: {
              ...prev[transferId],
              status: 'failed',
              speed: 'Timeout'
            }
          }));
          toast.error(`Connection to ${peer.full_name} timed out. Ensure their browser is on the Team Drop page.`);
          closePeer(peer.id);
          resolve(false);
        }, 15000);

        dataChannel.onopen = async () => {
          clearTimeout(timeout);

          setActiveTransfers(prev => ({
            ...prev,
            [transferId]: {
              ...prev[transferId],
              status: 'transferring'
            }
          }));

          // 1. Send file metadata header
          dataChannel.send(JSON.stringify({
            type: 'START_FILE',
            fileMeta: {
              name: file.name,
              size: file.size,
              type: file.type,
              senderName: profile.full_name,
              notes: noteText
            }
          }));

          // 2. Stream file in 64 KB binary chunks with backpressure control
          let offset = 0;
          let lastTime = Date.now();
          let lastBytes = 0;

          const readAndSendChunk = async () => {
            while (offset < file.size) {
              // Pause if data channel buffer is clogged (> 8MB)
              if (dataChannel.bufferedAmount > 8 * 1024 * 1024) {
                await new Promise(r => setTimeout(r, 20));
                continue;
              }

              const slice = file.slice(offset, offset + CHUNK_SIZE);
              const buffer = await slice.arrayBuffer();
              dataChannel.send(buffer);
              offset += buffer.byteLength;

              const now = Date.now();
              if (now - lastTime > 250 || offset >= file.size) {
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
            }

            // 3. Send end of file signal
            dataChannel.send(JSON.stringify({ type: 'END_FILE' }));

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
              closePeer(peer.id);
            }, 3000);

            resolve(true);
          };

          readAndSendChunk();
        };

        dataChannel.onerror = (err) => {
          clearTimeout(timeout);
          console.error('Data channel error:', err);
          setActiveTransfers(prev => ({
            ...prev,
            [transferId]: {
              ...prev[transferId],
              status: 'failed',
              speed: 'Error'
            }
          }));
          closePeer(peer.id);
          resolve(false);
        };
      } catch (e: any) {
        console.error('P2P sender setup error:', e);
        resolve(false);
      }
    });
  };

  // Handle master send action
  const handleInitiateTransfer = async () => {
    if (!fileToSend || !profile) return;

    // Determine target peers
    let targetEmployees: Employee[] = [];
    if (sendToAll) {
      targetEmployees = employees.filter(e => e.id !== profile.id && onlineUserIds.has(e.id));
      if (targetEmployees.length === 0) {
        toast.error('No other team members are currently online on Wi-Fi. Ask them to open this page!');
        return;
      }
    } else {
      targetEmployees = employees.filter(e => selectedRecipients.includes(e.id));
      const offlineTargets = targetEmployees.filter(e => !onlineUserIds.has(e.id));
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

    toast.loading(`Starting Wi-Fi P2P transfer of "${fileToSend.name}"…`, { id: 'transfer_init' });

    let successCount = 0;
    for (const peer of targetEmployees) {
      if (onlineUserIds.has(peer.id)) {
        const ok = await sendFileToPeer(peer, fileToSend, fileNotes.trim());
        if (ok) successCount++;
      }
    }

    toast.dismiss('transfer_init');

    if (successCount > 0) {
      toast.success(`🚀 "${fileToSend.name}" transferred to ${successCount} member(s) at gigabit Wi-Fi speed!`);

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
      toast.error('Direct Wi-Fi transfer could not connect. Ensure target recipient is on this page.');
    }
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
            <span><b>{onlineUserIds.size}</b> on Wi-Fi Drop</span>
          </div>

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

      {/* ── Interactive Drop Target Grid: All Team Members with Real-Time Wi-Fi Indicator ── */}
      <div className="card mb-4" style={{ padding: '1rem' }}>
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-primary" />
            1. Select Recipient(s) or Drag a File Directly Onto a Card:
          </div>
          <span className="text-xs text-muted">
            {sendToAll ? 'Target: All Online Members' : `Target: ${selectedRecipients.length} member(s)`}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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

          {/* Individual Member Cards */}
          {employees.map(emp => {
            const isMe = emp.id === profile?.id;
            const isOnline = onlineUserIds.has(emp.id);
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
                  opacity: isMe ? 0.6 : 1,
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
                      background: emp.role === 'ADMIN' ? 'var(--primary)' : emp.role === 'BOSS' ? 'var(--info)' : '#10b981',
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
                    <div className="text-xs truncate" style={{ color: isOnline ? '#34d399' : 'var(--text-muted)' }}>
                      {isOnline ? '🟢 On Wi-Fi' : '⚪ Offline'}
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
                ? `Send to All Online on Wi-Fi (${onlineUserIds.size > 1 ? onlineUserIds.size - 1 : 0})`
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
                          </div>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="text-xs text-muted">
                        {formatBytes(file.size)}
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
                <div className="text-xs text-muted mt-1">{formatBytes(deletingFile.size)}</div>
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
