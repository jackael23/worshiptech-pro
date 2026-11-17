/**
 * 2026-11-17 (Jarvis): Team sync panel (Songs tab) — one shared song library for the worship
 * team, through a Google login and Firebase (lib/teamSync.ts). Songs only.
 * Hidden until src/lib/firebaseConfig.ts is filled in.
 * Nothing from Firebase is downloaded until this panel is opened or Team sync was left on.
 */
import React, { useEffect, useState } from "react";
import { LogIn, LogOut, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  TEAM_LIMITS,
  TeamSyncState,
  cleanEmail,
  createTeam,
  disableTeamSync,
  enableTeamSync,
  isTeamOwner,
  isTeamSyncAvailable,
  loginGoogle,
  logoutGoogle,
  openTeamSync,
  ownsATeam,
  saveMembers,
  useTeamStatus,
} from "../lib/teamSync";
import { useTeamSettings } from "../lib/teamSyncSettings";
import type { TeamInfo } from "../lib/teamSyncCore";

const STATE_LABEL: Record<TeamSyncState, string> = {
  off: "Team: off",
  loading: "Team: sandali…",
  login: "Team: mag-login",
  connecting: "Team: kumokonekta…",
  syncing: "Team: nagsi-sync…",
  synced: "Team: synced",
  offline: "Team: offline",
  error: "Team: error",
};

const STATE_DOT: Record<TeamSyncState, string> = {
  off: "bg-fg-subtle",
  loading: "bg-fg-subtle",
  login: "bg-warn",
  connecting: "bg-warn",
  syncing: "bg-accent",
  synced: "bg-ok",
  offline: "bg-warn",
  error: "bg-live",
};

export const TeamSyncPanel: React.FC = () => {
  const status = useTeamStatus();
  const settings = useTeamSettings();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [newMember, setNewMember] = useState("");

  useEffect(() => {
    if (open) void openTeamSync();
  }, [open]);

  if (!isTeamSyncAvailable()) return null;

  // Left on, but nobody is logged in to Google (yet): say so on the chip.
  const shownState: TeamSyncState = settings.enabled && status.state === "off" ? "login" : status.state;
  const on = settings.enabled;
  const team: TeamInfo | null = on ? status.team : null;
  const lastSync = status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : null;

  const run = async (job: () => Promise<{ ok: boolean; error?: string } | void>, okText?: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await job();
      if (r && !r.ok) setMsg(r.error || "Hindi natuloy.");
      else if (okText) setMsg(okText);
    } finally {
      setBusy(false);
    }
  };

  const turnOn = (t: TeamInfo) => {
    const text =
      `Isasama sa team na "${t.name}" ang lahat ng kanta sa browser na ito, at ida-download dito ang mga kanta ng team. ` +
      "Makikita at mae-edit ng lahat ng member ang mga kantang ito. Habang naka-on ito, hindi isasama ng CouchDB sync ang kanta. Ituloy?";
    if (!window.confirm(text)) return;
    void run(() => enableTeamSync(t), "Naka-on ang Team sync.");
  };

  const turnOff = () => {
    disableTeamSync();
    setMsg("Naka-off ang Team sync. Naka-save pa rin ang mga kanta sa browser na ito at sa team.");
  };

  const addMember = () => {
    if (!team) return;
    const e = cleanEmail(newMember);
    if (!e) return setMsg("Mali ang email. Ilagay ang buong Gmail address.");
    if (team.memberEmails.includes(e)) return setMsg("Kasali na ang email na iyan.");
    if (team.memberEmails.length >= TEAM_LIMITS.MAX_MEMBERS) return setMsg(`Hanggang ${TEAM_LIMITS.MAX_MEMBERS} member lang ang isang team.`);
    void run(async () => {
      const r = await saveMembers(team, [...team.memberEmails, e]);
      if (r.ok) setNewMember("");
      return r;
    }, `Naidagdag si ${e}. Mag-login siya gamit ang Google sa app at i-on ang Team sync.`);
  };

  const removeMember = (email: string) => {
    if (!team) return;
    if (!window.confirm(`Alisin si ${email} sa team? Maiiwan sa browser niya ang mga kantang na-download na niya.`)) return;
    void run(() => saveMembers(team, team.memberEmails.filter((m) => m !== email)), `Naalis si ${email}.`);
  };

  const owner = isTeamOwner(team);
  const inputCls = "input w-full text-xs";

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tap-target inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-fg-muted"
        title={status.message || (lastSync ? `Huling sync: ${lastSync}` : "Team sync: iisang song library para sa team")}
        data-testid="team-status"
        aria-expanded={open}
      >
        <Users className="w-3.5 h-3.5" />
        <span className={`w-2 h-2 rounded-full ${STATE_DOT[shownState]}`} />
        {STATE_LABEL[shownState]}
        {on && status.pending > 0 ? <span className="text-fg-subtle"> · {status.pending} hindi pa naipapadala</span> : null}
        {shownState === "synced" && lastSync ? <span className="text-fg-subtle"> · {lastSync}</span> : null}
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 rounded-lg border border-line bg-surface-2 space-y-2" data-testid="team-panel">
          <div className="flex items-center justify-between">
            <strong className="text-fg">Team sync (kanta lang)</strong>
            <button type="button" onClick={() => setOpen(false)} className="tap-target p-1 text-fg-subtle hover:text-fg" aria-label="Isara">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-fg-subtle">
            Iisang song library para sa buong team, gamit ang Google account. Laging naka-save muna sa browser na ito ang mga kanta, kaya gumagana kahit walang internet; sumasabay ito sa team kapag may
            internet na.
          </p>

          {!status.email ? (
            <button type="button" onClick={() => void run(loginGoogle)} disabled={busy || status.state === "loading"} className="btn btn-primary btn-sm" data-testid="team-login">
              <LogIn className="w-3.5 h-3.5" /> {busy ? "Sandali…" : "Login gamit ang Google"}
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-muted">
                  Naka-login: <strong className="text-fg break-all" data-testid="team-user">{status.email}</strong>
                </span>
                <button type="button" onClick={() => void run(logoutGoogle)} disabled={busy} className="btn btn-secondary btn-sm" data-testid="team-logout">
                  <LogOut className="w-3.5 h-3.5" /> Logout
                </button>
              </div>

              {on ? (
                <div className="space-y-1.5 rounded-md border border-line p-2" data-testid="team-on">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-fg-muted">
                      Team: <strong className="text-fg">{team?.name || settings.teamName}</strong>
                    </span>
                    <button type="button" onClick={turnOff} className="btn btn-secondary btn-sm" data-testid="team-off">
                      I-off
                    </button>
                  </div>
                  {status.pending > 0 && (
                    <p className="text-fg-muted" data-testid="team-pending">
                      {status.pending} pagbabago ang hindi pa naipapadala. Ligtas ito sa browser na ito at ipapadala pagbalik ng internet.
                    </p>
                  )}
                  {team && team.memberEmails.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-fg-muted">
                        Members ({team.memberEmails.length}/{TEAM_LIMITS.MAX_MEMBERS})
                      </div>
                      <ul className="space-y-0.5" data-testid="team-members">
                        {team.memberEmails.map((m) => (
                          <li key={m} className="flex items-center gap-1.5">
                            <span className="text-fg break-all">{m}</span>
                            {m === team.ownerEmail && <span className="text-fg-subtle">(may-ari)</span>}
                            {owner && m !== team.ownerEmail && (
                              <button type="button" onClick={() => removeMember(m)} disabled={busy} className="tap-target p-1 text-fg-subtle hover:text-live" aria-label={`Alisin si ${m}`} title="Alisin sa team">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {owner ? (
                        <div className="flex gap-1.5">
                          <input
                            className={inputCls}
                            type="email"
                            value={newMember}
                            onChange={(e) => setNewMember(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !busy && addMember()}
                            placeholder="Gmail ng kasama (hal. juan@gmail.com)"
                            aria-label="Gmail ng bagong member"
                            data-testid="team-member-input"
                          />
                          <button type="button" onClick={addMember} disabled={busy} className="btn btn-primary btn-sm shrink-0" data-testid="team-member-add">
                            <UserPlus className="w-3.5 h-3.5" /> Idagdag
                          </button>
                        </div>
                      ) : (
                        <p className="text-fg-subtle">Ang may-ari ng team ang nagdadagdag at nag-aalis ng members.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 rounded-md border border-line p-2" data-testid="team-choose">
                  {status.teams.length > 0 ? (
                    <ul className="space-y-1">
                      {status.teams.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-fg-muted">
                            <strong className="text-fg">{t.name}</strong> · {t.memberEmails.length} member
                          </span>
                          <button type="button" onClick={() => turnOn(t)} disabled={busy} className="btn btn-primary btn-sm" data-testid="team-on-btn">
                            <Users className="w-3.5 h-3.5" /> I-on ang sync
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-fg-subtle">Hindi ka pa kasali sa kahit anong team. Ibigay ang Gmail mo sa may-ari ng team para maidagdag ka, o gumawa ng sarili mong team.</p>
                  )}
                  {!ownsATeam() && (
                    <div className="flex gap-1.5">
                      <input
                        className={inputCls}
                        value={teamName}
                        maxLength={TEAM_LIMITS.MAX_NAME}
                        onChange={(e) => setTeamName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !busy && void run(() => createTeam(teamName), "Nagawa ang team. I-on ang sync para magsimula.")}
                        placeholder="Pangalan ng team (hal. pangalan ng church)"
                        aria-label="Pangalan ng bagong team"
                        data-testid="team-name-input"
                      />
                      <button type="button" onClick={() => void run(() => createTeam(teamName), "Nagawa ang team. I-on ang sync para magsimula.")} disabled={busy} className="btn btn-secondary btn-sm shrink-0" data-testid="team-create">
                        Gumawa ng team
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {status.message && <p className="text-warn-text" data-testid="team-error">{status.message}</p>}
          {msg && <p role="status" className="text-fg" data-testid="team-msg">{msg}</p>}
        </div>
      )}
    </div>
  );
};
