import { useEffect, useRef, useState } from 'react';

/**
 * Host-only: listen for intel-dashboard socket events.
 * Uses a ref-based listener so it survives socketRef.current changes
 * (the socket object is stable once connected but socketRef itself is a ref).
 */
export function useIntelDashboard(socketRef, isHost) {
  const [participants, setParticipants] = useState([]);
  const listenerRef = useRef(null);

  useEffect(() => {
    if (!isHost) {
      setParticipants([]);
      return;
    }

    // Poll until socket is available (it may not be connected yet when this runs)
    let interval = null;

    function attach(socket) {
      if (listenerRef.current) return; // already attached
      const onDashboard = (payload) => {
        const list = Array.isArray(payload?.participants) ? payload.participants : [];
        if (list.length === 0 && !payload?.participants) return;
        setParticipants(list);
      };
      socket.on('intel-dashboard', onDashboard);
      listenerRef.current = { socket, onDashboard };
    }

    function detach() {
      if (listenerRef.current) {
        listenerRef.current.socket.off('intel-dashboard', listenerRef.current.onDashboard);
        listenerRef.current = null;
      }
    }

    function tryAttach() {
      const socket = socketRef?.current;
      if (socket) {
        attach(socket);
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    }

    tryAttach();
    if (!listenerRef.current) {
      interval = setInterval(tryAttach, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
      detach();
    };
  }, [isHost, socketRef]);

  return participants;
}
