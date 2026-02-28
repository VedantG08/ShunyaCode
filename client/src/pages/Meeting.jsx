import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import MeetingRoom from '../components/MeetingRoom';
import MeetingRoomSFU from '../components/MeetingRoomSFU';

function buildRoomOptions(searchParams) {
  const create = searchParams.get('create') === '1';
  const sfu = searchParams.get('sfu') === '1';
  if (!create) {
    return {
      create: false,
      password: searchParams.get('password') || null,
      sfu,
    };
  }
  const scheduled = searchParams.get('scheduled');
  const expiry = searchParams.get('expiry');
  return {
    create: true,
    password: searchParams.get('password') || null,
    scheduledAt: scheduled || null,
    expiryMinutes: expiry != null ? Number(expiry) : 30,
    waitingRoom: searchParams.get('waiting') === '1',
    sfu,
  };
}

export default function Meeting() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const userName = searchParams.get('name') || 'Guest';
  const navigate = useNavigate();
  const roomOptions = useMemo(() => buildRoomOptions(searchParams), [searchParams]);
  const isSFU = roomOptions?.sfu;

  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    if (isSFU) return undefined;
    let stream = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch (e) {
        setMediaError(e?.message || 'Camera/microphone access denied');
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [isSFU]);

  const handleLeave = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    navigate('/', { replace: true });
  };

  if (isSFU) {
    return (
      <MeetingRoomSFU
        roomId={roomId}
        userName={userName}
        roomOptions={roomOptions}
        onLeave={() => navigate('/', { replace: true })}
      />
    );
  }

  if (mediaError) {
    return (
      <div className="meeting-fallback">
        <p>{mediaError}</p>
        <button type="button" onClick={() => navigate('/')}>Back</button>
        <style>{`.meeting-fallback { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; }
.meeting-fallback button { padding: 10px 20px; background: var(--accent); color: white; border-radius: 8px; font-weight: 600; }
.meeting-fallback button:hover { background: var(--accent-hover); }`}</style>
      </div>
    );
  }

  if (!localStream) {
    return (
      <div className="meeting-fallback">
        <p>Starting camera and microphone…</p>
        <style>{`.meeting-fallback { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; }`}</style>
      </div>
    );
  }

  return (
    <MeetingRoom
      roomId={roomId}
      userName={userName}
      roomOptions={roomOptions}
      localStream={localStream}
      localStreamRef={localStreamRef}
      onLeave={handleLeave}
    />
  );
}
