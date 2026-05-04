import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import "./Profile.css";
import { FormEvent, useState } from "react";
import Spinner from "./components/Spinner";
import { Link } from "react-router";

interface ProfileData {
  id: number;
  username: string;
  email: string;
  discordId: string;
  avatarUrl: string;
  youtube: string;
  twitch: string;
  steamId: string;
  altName: string;
  obsSecretCode: string;
  roles: string[];
}

interface ProfileStats {
  publicCreated: number;
  privateCreated: number;
  publicPlayedIn: number;
  privatePlayedIn: number;
  trophiesLogged: number;
  bestScore: number;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#c66',
  moderator: '#6ac',
  trusted: '#6c6',
};

export default function Profile() {
  const { isPending, error, data } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth/profile').then(res => res.json()),
  });

  const { data: stats } = useQuery<ProfileStats>({
    queryKey: ['profile-stats'],
    queryFn: () => fetch('/api/auth/profile/stats').then(res => res.json()),
  });

  const queryClient = useQueryClient();
  const regenObsCode = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/profile/obs-code', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate code');
      return (await res.json()) as { obsSecretCode: string };
    },
    onSuccess: (resp) => {
      queryClient.setQueryData<ProfileData>(['profile'], (old) =>
        old ? { ...old, obsSecretCode: resp.obsSecretCode } : old);
    },
  });

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const response = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const problem = await response.json();
        throw new Error(problem.detail);
      }
      return response.json();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formObject = Object.fromEntries(formData.entries());
    mutation.mutate(formObject as any);
  };

  if (isPending) return <section className="loading"><Spinner color="#fcce03" /></section>;
  if (error) return <section className="alert error">An error has occurred: {error.message}</section>;

  const isAdmin = data.id === 1 || (data.roles ?? []).includes('admin');
  const isMod = (data.roles ?? []).includes('moderator');

  return (
    <section id="profile-page">
      <div className="profile-header">
        <img className="profile-avatar" src={data.avatarUrl} alt="Avatar" />
        <div className="profile-identity">
          <h3>{data.username}</h3>
          <div className="profile-meta">
            <span className="discord-id">{data.discordId}</span>
          </div>
          <div className="profile-roles">
            {(data.roles ?? []).map(r => (
              <span key={r} className="role-badge" style={{ background: ROLE_COLORS[r] || '#888' }}>{r}</span>
            ))}
          </div>
        </div>
        <a className="logout-btn" href="/api/auth/logout">
          <svg viewBox="0 0 256 199" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M216.856 16.597A208.5 208.5 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046q-29.538-4.442-58.533 0c-1.832-4.4-4.55-9.933-6.846-14.046a207.8 207.8 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161 161 0 0 0 79.735 175.3a136.4 136.4 0 0 1-21.846-10.632a109 109 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a132 132 0 0 0 5.355 4.237a136 136 0 0 1-21.886 10.653c4.006 8.02 8.638 15.67 13.873 22.848c21.142-6.58 42.646-16.637 64.815-33.213c5.316-56.288-9.08-105.09-38.056-148.36M85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2s23.236 11.804 23.015 26.2c.02 14.375-10.148 26.18-23.015 26.18m85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2c0 14.375-10.148 26.18-23.015 26.18" />
          </svg>
          Logout
        </a>
      </div>

      <div className="profile-grid">
        <form className="profile-card" onSubmit={handleSubmit}>
          <h3>Account</h3>
          {mutation.isSuccess && (
            <div className="alert success" onClick={() => mutation.reset()}>✅ Profile updated</div>
          )}
          {mutation.isError && (
            <div className="alert error" onClick={() => mutation.reset()}>⛔ {mutation.error.message}</div>
          )}
          {mutation.isPending && (
            <div className="alert">Updating profile...</div>
          )}
          <fieldset>
            <label htmlFor="username">Username <small>visible to everyone</small></label>
            <input required type="text" id="username" name="username" defaultValue={data.username} />
          </fieldset>
          <fieldset>
            <label htmlFor="youtube">YouTube channel</label>
            <input type="text" id="youtube" name="youtube" defaultValue={data.youtube} placeholder="https://youtube.com/@yourchannel" />
          </fieldset>
          <fieldset>
            <label htmlFor="twitch">Twitch channel</label>
            <input type="text" id="twitch" name="twitch" defaultValue={data.twitch} placeholder="https://twitch.tv/yourchannel" />
          </fieldset>
          <button type="submit">Update profile</button>
        </form>

        <div className="profile-card">
          <h3>Tools & Links</h3>
          <ul className="tool-list">
            <li>
              <Link to="/auth/obs">
                <img width="24" height="24" src="https://obsproject.com/assets/images/new_icon_small-r.png" alt="" />
                <span>OBS browser sources</span>
                <small>On screen info to make your viewers happy</small>
              </Link>
              <ObsCodeRow
                code={data.obsSecretCode}
                onRegenerate={() => regenObsCode.mutate()}
                isRegenerating={regenObsCode.isPending}
              />
            </li>
            {(isAdmin || isMod) && (
              <li className="tool-section-label">Admin</li>
            )}
            {isAdmin && (
              <li>
                <Link to="/auth/feedback">
                  <span className="tool-icon" aria-hidden="true">💬</span>
                  <span>Feedback inbox</span>
                  <small>Review submissions from users</small>
                </Link>
              </li>
            )}
            {isAdmin && (
              <li>
                <Link to="/auth/users">
                  <span className="tool-icon" aria-hidden="true">👥</span>
                  <span>Users</span>
                  <small>Manage user accounts</small>
                </Link>
              </li>
            )}
            {isAdmin && (
              <li>
                <Link to="/auth/private-events">
                  <span className="tool-icon" aria-hidden="true">🔒</span>
                  <span>Private events</span>
                  <small>See every private event and its password</small>
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="profile-card">
        <h3>My stats</h3>
        {!stats ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="stats-grid">
            <StatTile label="Public events created" value={stats.publicCreated} />
            <StatTile label="Private events created" value={stats.privateCreated} />
            <StatTile label="Public events played" value={stats.publicPlayedIn} />
            <StatTile label="Private events played" value={stats.privatePlayedIn} />
            <StatTile label="Trophies logged" value={stats.trophiesLogged} />
            <StatTile label="Hunt PB" value={stats.bestScore} />
          </div>
        )}
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-tile">
      <div className="stat-value">{value.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function ObsCodeRow({
  code,
  onRegenerate,
  isRegenerating,
}: {
  code: string;
  onRegenerate: () => void;
  isRegenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const needsChange = code === 'CHANGEME';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleRegenerate = () => {
    if (!needsChange) {
      const ok = window.confirm('Regenerate OBS code? Any browser sources using the old code will stop working until updated.');
      if (!ok) return;
    }
    onRegenerate();
  };

  return (
    <div className="obs-code-row">
      {needsChange && (
        <div className="obs-code-warning" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>You need to change this before using OBS sources.</span>
        </div>
      )}
      <div className="obs-code-controls">
        <input
          type="text"
          readOnly
          className={needsChange ? 'obs-code-input warn' : 'obs-code-input'}
          value={code}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="ghost" onClick={handleCopy} disabled={!code || needsChange}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="ghost" onClick={handleRegenerate} disabled={isRegenerating}>
          {isRegenerating ? '…' : '↻ Regenerate'}
        </button>
      </div>
    </div>
  );
}
