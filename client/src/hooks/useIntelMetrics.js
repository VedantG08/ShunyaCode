import { useEffect, useRef, useCallback } from 'react';
import { detectFace, resultToEmotionData } from '../intel/faceIntel.js';

/** Throttle: emit at most this often to the server (ms). */
const SEND_INTERVAL_MS = 100;

/**
 * Runs the face-intel pipeline on the local video stream and emits
 * `intel-metrics` over the socket.
 *
 * Processes every frame: each requestAnimationFrame tick runs face detection
 * when the previous run has finished (no fixed interval). MediaPipe timestamp
 * advances by real elapsed time for correct temporal behavior. Send to server
 * is throttled to SEND_INTERVAL_MS to avoid flooding.
 *
 * Runs for ALL participants (including host). Server routes intel-dashboard
 * to the room creator.
 */
export function useIntelMetrics({ enabled, localStreamRef, socketRef }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const lastSendRef = useRef(0);
  const lastDetectTimeRef = useRef(0);
  const timestampRef = useRef(0);
  const runningRef = useRef(false);
  const processingRef = useRef(false);

  const stop = useCallback(() => {
    runningRef.current = false;
    processingRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    let startInterval = null;

    function start() {
      const stream = localStreamRef?.current;
      const socket = socketRef?.current;
      if (!stream || !socket) return false;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      videoRef.current = video;
      runningRef.current = true;
      lastDetectTimeRef.current = performance.now();
      timestampRef.current = 0;

      video.play().catch(() => {});

      function tick() {
        if (!runningRef.current) return;
        const v = videoRef.current;
        const sock = socketRef?.current;
        if (!v || v.readyState < 2 || !sock) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        if (processingRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const now = performance.now();
        const elapsed = now - lastDetectTimeRef.current;
        lastDetectTimeRef.current = now;
        timestampRef.current += elapsed;

        processingRef.current = true;
        detectFace(v, timestampRef.current)
          .then((result) => {
            if (!result || !runningRef.current) return;
            const iso = new Date().toISOString().slice(0, 19) + 'Z';
            const emotionData = resultToEmotionData(result, iso);
            const wall = Date.now();
            if (wall - lastSendRef.current >= SEND_INTERVAL_MS) {
              lastSendRef.current = wall;
              sock.emit('intel-metrics', { emotion_data: emotionData });
            }
          })
          .catch(() => {})
          .finally(() => {
            processingRef.current = false;
            if (runningRef.current) {
              rafRef.current = requestAnimationFrame(tick);
            }
          });
      }

      rafRef.current = requestAnimationFrame(tick);
      return true;
    }

    if (!start()) {
      startInterval = setInterval(() => {
        if (start()) clearInterval(startInterval);
      }, 300);
    }

    return () => {
      if (startInterval) clearInterval(startInterval);
      stop();
    };
  }, [enabled, localStreamRef, socketRef, stop]);

  return { stop };
}
