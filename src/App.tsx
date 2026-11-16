import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, LogOut, RefreshCw, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  DEFAULT_BACKEND_URL,
  LOCAL_BACKEND_URL,
  fetchSeederConversations,
  loginAdminOnly,
  seedConversationData,
  verifyAdminSession,
  type AdminSession,
  type SeederConversation,
  type SeederMember,
} from './api';

const STORAGE_URL_KEY = 'ally_seeder_backend_url';
const STORAGE_SESSION_KEY = 'ally_seeder_admin_session';

interface DisplayMember {
  userId: string;
  userName: string;
  anonymousName: string;
}

function resolveMembershipNames(conv: SeederConversation): DisplayMember[] {
  const members: SeederMember[] = [];
  if (conv.userA) members.push(conv.userA);
  if (conv.userB && conv.userB.userId !== conv.userA?.userId) members.push(conv.userB);
  for (const m of conv.members ?? []) {
    if (!members.some((existing) => existing.userId === m.userId)) {
      members.push(m);
    }
  }

  return members.map((m, idx) => {
    const userName = m.fullName || m.username || `User ${idx + 1}`;
    let anonymousName = m.anonymousHandle || '';
    if (!anonymousName && conv.match) {
      if (conv.match.userAId === m.userId && conv.match.userAAlias) {
        anonymousName = conv.match.userAAlias;
      } else if (conv.match.userBId === m.userId && conv.match.userBAlias) {
        anonymousName = conv.match.userBAlias;
      }
    }
    if (!anonymousName) {
      anonymousName = conv.match?.userAAlias && idx === 0
        ? conv.match.userAAlias
        : conv.match?.userBAlias && idx === 1
          ? conv.match.userBAlias
          : 'Anonymous';
    }
    return {
      userId: m.userId,
      userName,
      anonymousName,
    };
  });
}

export default function App() {
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_URL_KEY) || DEFAULT_BACKEND_URL;
  });
  const [session, setSession] = useState<AdminSession | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION_KEY);
      return raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
      return null;
    }
  });
  const [checkingSession, setCheckingSession] = useState<boolean>(Boolean(session));

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Conversations & Seeder form state
  const [conversations, setConversations] = useState<SeederConversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pointsInput, setPointsInput] = useState('0');
  const [daysStreakInput, setDaysStreakInput] = useState('0');
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedFeedback, setSeedFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    setSession(null);
    setConversations([]);
    setSelectedId(null);
    setSeedFeedback(null);
  }, []);

  const loadConversations = useCallback(async (url: string, token: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      const items = await fetchSeederConversations(url, token);
      setConversations(items);
      setSelectedId((prev) => {
        if (prev && items.some((c) => c.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        handleLogout();
        setLoginError('Admin session expired. Sign in again.');
        return;
      }
      setListError(err?.message || 'Failed to load conversations');
    } finally {
      setLoadingList(false);
    }
  }, [handleLogout]);

  // Verify saved admin token on startup
  useEffect(() => {
    if (!session) {
      setCheckingSession(false);
      return;
    }
    let cancelled = false;
    verifyAdminSession(backendUrl, session.token)
      .then(() => {
        if (!cancelled) {
          setCheckingSession(false);
          void loadConversations(backendUrl, session.token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          handleLogout();
          setCheckingSession(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Sync the two inputs when switching selected conversation
  useEffect(() => {
    if (!selectedConversation) return;
    const pts = selectedConversation.match?.matchPoints ?? 0;
    const streak = selectedConversation.match?.dayStreak ?? selectedConversation.dayStreak ?? 0;
    setPointsInput(String(pts));
    setDaysStreakInput(String(streak));
    setSeedFeedback(null);
  }, [selectedConversation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setLoginError('Enter admin email and password.');
      return;
    }
    setLoginBusy(true);
    setLoginError(null);
    try {
      localStorage.setItem(STORAGE_URL_KEY, backendUrl.trim());
      const adminSession = await loginAdminOnly(backendUrl, email, password);
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(adminSession));
      setSession(adminSession);
      setPassword('');
      await loadConversations(backendUrl, adminSession.token);
    } catch (err: any) {
      setLoginError(err?.message || 'Admin login failed');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSeedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !selectedConversation) return;

    const points = Number(pointsInput);
    const dayStreak = Number(daysStreakInput);

    if (Number.isNaN(points) || points < 0) {
      setSeedFeedback({ type: 'err', text: 'Points must be 0 or higher.' });
      return;
    }
    if (Number.isNaN(dayStreak) || dayStreak < 0) {
      setSeedFeedback({ type: 'err', text: 'Days streak must be 0 or higher.' });
      return;
    }

    setSeedBusy(true);
    setSeedFeedback(null);
    try {
      const res = await seedConversationData(backendUrl, session.token, {
        conversationId: selectedConversation.id,
        points: Math.round(points),
        dayStreak: Math.round(dayStreak),
      });
      setSeedFeedback({
        type: 'ok',
        text: res.message || `Seeded ${res.points} points & ${res.dayStreak} days streak.`,
      });
      await loadConversations(backendUrl, session.token);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403) {
        handleLogout();
        return;
      }
      setSeedFeedback({ type: 'err', text: err?.message || 'Failed to seed data' });
    } finally {
      setSeedBusy(false);
    }
  };

  if (checkingSession) {
    return (
      <div style={styles.centeredScreen}>
        <div style={styles.mutedText}>Verifying admin session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.centeredScreen}>
        <form onSubmit={handleLogin} style={styles.loginCard}>
          <div style={styles.loginHeader}>
            <div style={styles.badgeIcon}>
              <ShieldCheck size={20} color="#22c55e" />
            </div>
            <div>
              <h1 style={styles.title}>Conversation Seeder</h1>
              <p style={styles.subtitle}>Admin-only access · Centralized Backend</p>
            </div>
          </div>

          <label style={styles.fieldLabel}>
            Backend URL
            <input
              type="url"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder={DEFAULT_BACKEND_URL}
              style={styles.input}
              required
            />
          </label>
          <div style={styles.presetRow}>
            <button
              type="button"
              onClick={() => setBackendUrl(DEFAULT_BACKEND_URL)}
              style={backendUrl === DEFAULT_BACKEND_URL ? styles.presetActive : styles.presetBtn}
            >
              Production
            </button>
            <button
              type="button"
              onClick={() => setBackendUrl(LOCAL_BACKEND_URL)}
              style={backendUrl === LOCAL_BACKEND_URL ? styles.presetActive : styles.presetBtn}
            >
              Localhost :3001
            </button>
          </div>

          <label style={styles.fieldLabel}>
            Admin Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@chmsu.edu.ph"
              style={styles.input}
              autoFocus
              required
            />
          </label>

          <label style={styles.fieldLabel}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              required
            />
          </label>

          {loginError && (
            <div style={styles.errorBox}>
              <AlertCircle size={15} />
              <span>{loginError}</span>
            </div>
          )}

          <button type="submit" disabled={loginBusy} style={styles.primaryBtn}>
            <Lock size={15} />
            <span>{loginBusy ? 'Signing in...' : 'Sign In as Admin'}</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      {/* Top Bar */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <ShieldCheck size={18} color="#22c55e" />
          <span style={styles.headerTitle}>ALLY-JIS Conversation Seeder</span>
          <span style={styles.headerPill}>{session.role}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.backendTag}>{backendUrl}</span>
          <button
            type="button"
            onClick={() => loadConversations(backendUrl, session.token)}
            disabled={loadingList}
            style={styles.iconBtn}
            title="Refresh conversations"
          >
            <RefreshCw size={15} className={loadingList ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button type="button" onClick={handleLogout} style={styles.iconBtn}>
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main style={styles.mainGrid}>
        {/* Conversation List: ONLY User Names & Anonymous Names of Members */}
        <section style={styles.listPane}>
          <div style={styles.paneHeader}>
            <h2 style={styles.paneTitle}>Membership Conversations</h2>
            <span style={styles.countText}>{conversations.length}</span>
          </div>

          {listError && (
            <div style={{ ...styles.errorBox, margin: '12px' }}>
              <AlertCircle size={15} />
              <span>{listError}</span>
            </div>
          )}

          <div style={styles.listScroll}>
            {loadingList && conversations.length === 0 ? (
              <div style={styles.emptyText}>Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div style={styles.emptyText}>No conversations found.</div>
            ) : (
              conversations.map((conv) => {
                const members = resolveMembershipNames(conv);
                const isSelected = conv.id === selectedId;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedId(conv.id)}
                    style={{
                      ...styles.convRow,
                      ...(isSelected ? styles.convRowSelected : {}),
                    }}
                  >
                    {members.length === 0 ? (
                      <span style={styles.memberName}>Unnamed Conversation</span>
                    ) : (
                      members.map((m) => (
                        <div key={m.userId} style={styles.memberLine}>
                          <span style={styles.memberName}>{m.userName}</span>
                          <span style={styles.memberAnon}>{m.anonymousName}</span>
                        </div>
                      ))
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Seeder Form: 2 Inputs (Points + Days Streak) + 1 CTA (Seed Data) */}
        <section style={styles.detailPane}>
          {!selectedConversation ? (
            <div style={styles.emptyText}>Select a conversation from the list.</div>
          ) : (
            <form onSubmit={handleSeedSubmit} style={styles.seedForm}>
              <div style={styles.selectedMembersBox}>
                {resolveMembershipNames(selectedConversation).map((m) => (
                  <div key={m.userId} style={styles.selectedMemberRow}>
                    <span style={styles.selectedName}>{m.userName}</span>
                    <span style={styles.selectedAnon}>{m.anonymousName}</span>
                  </div>
                ))}
              </div>

              <label style={styles.fieldLabel}>
                Point
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={pointsInput}
                  onChange={(e) => setPointsInput(e.target.value)}
                  style={styles.input}
                  required
                />
              </label>

              <label style={styles.fieldLabel}>
                Days Streak
                <input
                  type="number"
                  min={0}
                  max={3650}
                  step={1}
                  value={daysStreakInput}
                  onChange={(e) => setDaysStreakInput(e.target.value)}
                  style={styles.input}
                  required
                />
              </label>

              {seedFeedback && (
                <div
                  style={
                    seedFeedback.type === 'ok' ? styles.successBox : styles.errorBox
                  }
                >
                  {seedFeedback.type === 'ok' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <AlertCircle size={15} />
                  )}
                  <span>{seedFeedback.text}</span>
                </div>
              )}

              <button type="submit" disabled={seedBusy} style={styles.primaryBtn}>
                <span>{seedBusy ? 'Seeding...' : 'Seed Data'}</span>
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  centeredScreen: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  loginHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.14)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: 12,
    color: 'var(--muted)',
  },
  presetRow: {
    display: 'flex',
    gap: 8,
    marginTop: -6,
  },
  presetBtn: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--muted)',
    fontSize: 12,
    cursor: 'pointer',
  },
  presetActive: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid var(--accent)',
    background: 'rgba(34, 197, 94, 0.14)',
    color: '#86efac',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  appShell: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: 56,
    padding: '0 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--panel)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 15,
  },
  headerPill: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 999,
    background: 'rgba(34, 197, 94, 0.16)',
    color: '#86efac',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  backendTag: {
    fontSize: 11,
    color: 'var(--muted)',
    marginRight: 4,
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--panel-alt)',
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  mainGrid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '1.15fr 1fr',
  },
  listPane: {
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  paneHeader: {
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paneTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--muted)',
  },
  countText: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--muted)',
  },
  listScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  convRow: {
    width: '100%',
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--panel)',
    color: 'var(--text)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  convRowSelected: {
    borderColor: 'var(--accent)',
    background: 'rgba(34, 197, 94, 0.1)',
  },
  memberLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  memberName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: 'var(--text)',
  },
  memberAnon: {
    fontSize: 12,
    fontWeight: 500,
    color: '#86efac',
  },
  detailPane: {
    padding: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedForm: {
    width: '100%',
    maxWidth: 360,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  selectedMembersBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingBottom: 12,
    borderBottom: '1px solid var(--border)',
  },
  selectedMemberRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  selectedName: {
    fontSize: 14,
    fontWeight: 700,
  },
  selectedAnon: {
    fontSize: 12,
    color: '#86efac',
    fontWeight: 600,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--muted)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 14,
    outline: 'none',
  },
  primaryBtn: {
    marginTop: 4,
    padding: '11px 16px',
    borderRadius: 10,
    border: 'none',
    background: 'var(--accent-strong)',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fca5a5',
    fontSize: 12.5,
  },
  successBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 12px',
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.35)',
    color: '#86efac',
    fontSize: 12.5,
  },
  emptyText: {
    color: 'var(--muted)',
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
  },
  mutedText: {
    color: 'var(--muted)',
    fontSize: 13,
  },
};

