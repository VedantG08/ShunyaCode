import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useMeeting(roomId, userName, localStreamRef, roomOptions = null) {
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [isHost, setIsHost] = useState(false);
  const [pendingParticipants, setPendingParticipants] = useState([]);
  const [notStartedAt, setNotStartedAt] = useState(null);
  const [handRaised, setHandRaised] = useState(new Map());
  const [reactions, setReactions] = useState([]);
  const [spotlightId, setSpotlightId] = useState(null);
  const [audioMutedByHost, setAudioMutedByHost] = useState(false);
  const [myId, setMyId] = useState(null);
  const reactionsTimeoutRef = useRef(null);

  const addRemoteStream = useCallback((peerId, stream) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.set(peerId, stream);
      return next;
    });
  }, []);

  const removeRemoteStream = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!roomId || !userName) return;

    const socket = io(window.location.origin, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const opts = roomOptions;

    socket.on('connect_error', () => {
      setError('Could not connect to the server. Start it from the project: run "npm run dev" in the server folder (server runs on port 3001).');
      setStatus(null);
    });

    socket.on('error', (e) => {
      setError(e?.message || 'Error');
      setStatus(null);
    });

    socket.on('wrong-password', () => {
      setStatus('password-required');
      setError(null);
    });

    socket.on('meeting-not-started', ({ scheduledAt }) => {
      setNotStartedAt(scheduledAt);
      setStatus('not-started');
      setError(null);
    });

    socket.on('waiting-for-host', () => {
      setStatus('waiting');
      setError(null);
    });

    socket.on('rejected', () => {
      setStatus('rejected');
      setError(null);
    });

    socket.on('room-joined', ({ participants: list, isHost: host, myId: id }) => {
      setParticipants(list);
      setIsHost(Boolean(host));
      if (id) setMyId(id);
      setStatus('joined');
      setError(null);
      setPendingParticipants([]);
    });

    socket.on('admitted', ({ participants: list, myId: id }) => {
      setParticipants(list);
      setIsHost(false);
      if (id) setMyId(id);
      setStatus('joined');
      setError(null);
    });

    socket.on('pending-join', ({ id: peerId, userName: name }) => {
      setPendingParticipants((prev) => [...prev.filter((p) => p.id !== peerId), { id: peerId, userName: name }]);
    });

    socket.on('pending-left', (peerId) => {
      setPendingParticipants((prev) => prev.filter((p) => p.id !== peerId));
    });

    socket.on('participant-joined', async ({ id: peerId, userName: name }) => {
      setParticipants((prev) => [...prev.filter((p) => p.id !== peerId), { id: peerId, userName: name }]);
      setPendingParticipants((prev) => prev.filter((p) => p.id !== peerId));
      const localStream = localStreamRef?.current;
      if (!localStream) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      pc.ontrack = (e) => {
        if (e.streams?.[0]) addRemoteStream(peerId, e.streams[0]);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', peerId, e.candidate);
      };
      peersRef.current.set(peerId, pc);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', peerId, offer);
      } catch (err) {
        console.error('createOffer failed', err);
      }
    });

    socket.on('offer', async (fromId, sdp) => {
      const localStream = localStreamRef?.current;
      let pc = peersRef.current.get(fromId);
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        if (localStream) localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        pc.ontrack = (e) => {
          if (e.streams?.[0]) addRemoteStream(fromId, e.streams[0]);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit('ice-candidate', fromId, e.candidate);
        };
        peersRef.current.set(fromId, pc);
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', fromId, answer);
      } catch (err) {
        console.error('handle offer failed', err);
      }
    });

    socket.on('answer', async (fromId, sdp) => {
      const pc = peersRef.current.get(fromId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error('setRemoteDescription answer failed', err);
        }
      }
    });

    socket.on('ice-candidate', async (fromId, candidate) => {
      const pc = peersRef.current.get(fromId);
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('addIceCandidate failed', err);
        }
      }
    });

    socket.on('participant-left', (peerId) => {
      removeRemoteStream(peerId);
      setParticipants((prev) => prev.filter((p) => p.id !== peerId));
      setHandRaised((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
      setSpotlightId((prev) => (prev === peerId ? null : prev));
    });

    socket.on('chat-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('mute-audio', () => {
      localStreamRef?.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
      setAudioMutedByHost(true);
    });

    socket.on('mute-audio-request', () => {
      localStreamRef?.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
      setAudioMutedByHost(true);
    });

    socket.on('kicked', () => {
      socket.disconnect();
      setStatus('kicked');
    });

    socket.on('meeting-ended', () => {
      socket.disconnect();
      setStatus('ended');
    });

    socket.on('participant-hand-raised', ({ id: peerId, raised }) => {
      setHandRaised((prev) => {
        const next = new Map(prev);
        if (raised) next.set(peerId, true);
        else next.delete(peerId);
        return next;
      });
    });

    socket.on('reaction', ({ fromId, userName, type }) => {
      const item = { fromId, userName, type, ts: Date.now() };
      setReactions((prev) => [...prev.slice(-4), item]);
      if (reactionsTimeoutRef.current) clearTimeout(reactionsTimeoutRef.current);
      reactionsTimeoutRef.current = setTimeout(() => {
        setReactions((prev) => prev.filter((r) => Date.now() - r.ts < 4000));
      }, 4000);
    });

    socket.on('spotlight-changed', (peerId) => {
      setSpotlightId(peerId || null);
    });

    const performJoin = (password = null) => {
      setError(null);
      setStatus('connecting');
      if (opts?.create) {
        socket.emit('join-room', roomId, userName, {
          isCreator: true,
          roomOptions: {
            password: opts.password || null,
            scheduledAt: opts.scheduledAt || null,
            expiryMinutes: opts.expiryMinutes,
            waitingRoom: opts.waitingRoom,
          },
        });
      } else {
        socket.emit('join-room', roomId, userName, { password: password || '' });
      }
    };

    socket.on('connect', () => {
      performJoin(opts?.password ?? null);
    });

    if (socket.connected) {
      performJoin(opts?.password ?? null);
    }

    return () => {
      if (reactionsTimeoutRef.current) clearTimeout(reactionsTimeoutRef.current);
      socket.disconnect();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [roomId, userName, roomOptions, addRemoteStream, removeRemoteStream, localStreamRef]);

  const joinWithPassword = useCallback((password) => {
    if (socketRef.current?.connected) {
      setError(null);
      setStatus('connecting');
      socketRef.current.emit('join-room', roomId, userName, { password: password || '' });
    }
  }, [roomId, userName]);

  const sendMessage = useCallback((text) => {
    if (socketRef.current?.connected) socketRef.current.emit('chat-message', text);
  }, []);

  const replaceVideoTrack = useCallback((track) => {
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(track);
    });
  }, []);

  const admit = useCallback((peerId) => {
    if (socketRef.current?.connected) socketRef.current.emit('admit', peerId);
  }, []);

  const reject = useCallback((peerId) => {
    if (socketRef.current?.connected) socketRef.current.emit('reject', peerId);
  }, []);

  const muteAll = useCallback(() => {
    if (socketRef.current?.connected) socketRef.current.emit('mute-all');
  }, []);

  const requestMutePeer = useCallback((peerId) => {
    if (socketRef.current?.connected) socketRef.current.emit('mute-peer', peerId);
  }, []);

  const kick = useCallback((peerId) => {
    if (socketRef.current?.connected) socketRef.current.emit('kick', peerId);
  }, []);

  const endMeeting = useCallback(() => {
    if (socketRef.current?.connected) socketRef.current.emit('end-meeting');
  }, []);

  const setRaiseHand = useCallback((raised) => {
    if (socketRef.current?.connected) socketRef.current.emit('raise-hand', raised);
  }, []);

  const sendReaction = useCallback((type) => {
    if (socketRef.current?.connected) socketRef.current.emit('reaction', type);
  }, []);

  const setSpotlight = useCallback((peerId) => {
    if (socketRef.current?.connected) socketRef.current.emit('spotlight', peerId || null);
  }, []);

  const clearAudioMutedByHost = useCallback(() => setAudioMutedByHost(false), []);

  return {
    participants,
    remoteStreams,
    messages,
    error,
    status,
    isHost,
    pendingParticipants,
    notStartedAt,
    handRaised,
    reactions,
    spotlightId,
    audioMutedByHost,
    myId,
    socketRef,
    joinWithPassword,
    admit,
    reject,
    sendMessage,
    replaceVideoTrack,
    muteAll,
    requestMutePeer,
    kick,
    endMeeting,
    setRaiseHand,
    sendReaction,
    setSpotlight,
    clearAudioMutedByHost,
  };
}
