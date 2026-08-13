import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Full-width banner shown on every authenticated screen when the backend
 * itself is unreachable - as opposed to any single feature (like the agent
 * status badge) silently misreporting itself as broken when the real
 * problem is "can't reach the server at all." */
export default function ConnectionBanner() {
  const [isDown, setIsDown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(`${API_BASE}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled) setIsDown(!r.ok);
      } catch {
        if (!cancelled) setIsDown(true);
      }
    }

    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!isDown) return null;

  return (
    <div className="connection-banner" role="alert">
      Can't reach the LawTrack server — retrying…
    </div>
  );
}
