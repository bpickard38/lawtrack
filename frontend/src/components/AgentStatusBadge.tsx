import { useEffect, useState } from 'react';
import { getAgentKeyStatus } from '../api';

interface AgentStatusBadgeProps {
  onClick: () => void;
}

type Status = 'loading' | 'not_connected' | 'connected' | 'offline';

interface CurrentActivity {
  label: string;
  startedAt: string;
}

function formatElapsed(startedAt: string, now: number): string {
  const started = new Date(startedAt).getTime();
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function AgentStatusBadge({ onClick }: AgentStatusBadgeProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    function refresh() {
      getAgentKeyStatus()
        .then((s) => {
          if (cancelled) return;
          setDeviceName(s.device_name);
          setStatus(s.has_key ? 'connected' : 'not_connected');
          setCurrentActivity(
            s.current_activity_label && s.current_activity_started_at
              ? { label: s.current_activity_label, startedAt: s.current_activity_started_at }
              : null
          );
        })
        .catch(() => {
          // A failed fetch here almost always means the backend itself is
          // unreachable, not that there's genuinely no agent paired - those
          // are different problems and telling them apart matters (a global
          // ConnectionBanner also surfaces the server-down case separately).
          if (!cancelled) {
            setStatus('offline');
            setCurrentActivity(null);
          }
        });
    }

    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Ticking elapsed timer, only needs to run while there's a live activity to show.
  useEffect(() => {
    if (!currentActivity) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [currentActivity]);

  if (status === 'loading') return null;

  const label =
    status === 'connected' && currentActivity ? `${deviceName || 'Agent'} · ${currentActivity.label} (${formatElapsed(currentActivity.startedAt, now)})` :
    status === 'connected' ? `${deviceName || 'Agent'} connected` :
    status === 'offline' ? "Can't reach server" :
    'Agent not connected';

  const dotClass =
    status === 'connected' && currentActivity ? 'agent-status-dot-active' :
    status === 'connected' ? 'agent-status-dot-on' :
    status === 'offline' ? 'agent-status-dot-stale' :
    'agent-status-dot-off';

  return (
    <button
      type="button"
      className="agent-status-badge"
      onClick={onClick}
      title="View desktop agent connection details"
    >
      <span className={`agent-status-dot ${dotClass}`} />
      {label}
    </button>
  );
}
