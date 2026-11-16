/**
 * 2026-11-16: cloud sync (Pro) — each church gets its own private databases on the hosted
 * CouchDB, and the app syncs with them through /couch (couchProxy.ts).
 *
 *    GET  /api/cloud/status      { available, entitled, provisioned, locked }
 *    POST /api/cloud/provision   creates the databases (first time) → { dbs: { songs, … } }
 *
 * Databases: "wtpc-<id>-<kind>", id = first 32 hex of sha256(account name), kind = songs,
 * bibles, presentations, media, lineups. Only that account may read / write them (_security).
 *
 * The plan is enforced by CouchDB itself, not by the app: when an account stops being Pro,
 * reconcile() takes its name out of the databases' _security ("locked" — admin only), and puts
 * it back when it is Pro again. Nothing is deleted, so a church that renews finds its data.
 * reconcile runs when a payment arrives, when a plan ends (billingServer.ts) and every hour
 * for all cloud accounts (catches roles changed by hand in Fauxton).
 *
 * A record per account lives in "wtp_billing": { _id: "cloud:<account>", id, locked }.
 * Needs the CouchDB admin login, so this only works on the hosted server.
 */
import express, { Express } from "express";
import crypto from "crypto";
import { couchEnv, sameOrigin } from "./serverCouch";

export const CLOUD_KINDS = ["songs", "bibles", "presentations", "media", "lineups"] as const;
const BILLING_DB = "wtp_billing";
const RECONCILE_MS = 60 * 60 * 1000;

interface CloudRecord {
  _id: string;
  _rev?: string;
  type: "cloud";
  account: string;
  id: string;
  locked: boolean;
  createdAt: string;
}

const cloudId = (account: string) => crypto.createHash("sha256").update(account).digest("hex").slice(0, 32);
const dbName = (id: string, kind: string) => `wtpc-${id}-${kind}`;
const dbsOf = (id: string) => Object.fromEntries(CLOUD_KINDS.map((k) => [k, dbName(id, k)])) as Record<(typeof CLOUD_KINDS)[number], string>;

/** Returns `reconcile`, for billingServer to call when a plan starts or ends. */
export function registerCloudRoutes(app: Express): { reconcile: (account: string) => Promise<void> } {
  const env = couchEnv();
  const { couch, hasAdmin, getUser, sessionOf } = env;
  const json = express.json({ limit: "4kb" });
  const recordPath = (account: string) => `/${BILLING_DB}/${encodeURIComponent(`cloud:${account}`)}`;

  /** Pro by role (paid, or given by hand). */
  const isPro = (roles: string[] | undefined) => !!roles?.includes("plan:pro");
  /** Read from the user doc itself: the roles in a session can lag a moment behind a payment (CouchDB caches them). */
  const proNow = async (account: string) => isPro((await getUser(account))?.roles);

  async function getRecord(account: string): Promise<CloudRecord | null> {
    const r = await couch(recordPath(account));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`CouchDB ${BILLING_DB}: HTTP ${r.status}`);
    return (await r.json()) as CloudRecord;
  }

  /**
   * Who may open the databases. NEVER an empty members list: in CouchDB that means "everyone".
   * Locked = only server admins.
   */
  async function setAccess(rec: CloudRecord, open: boolean): Promise<void> {
    const security = { admins: { names: [], roles: ["_admin"] }, members: { names: open ? [rec.account] : [], roles: ["_admin"] } };
    for (const kind of CLOUD_KINDS) {
      const r = await couch(`/${dbName(rec.id, kind)}/_security`, { method: "PUT", body: JSON.stringify(security) });
      if (!r.ok) throw new Error(`CouchDB _security ${kind}: HTTP ${r.status}`);
    }
  }

  async function reconcile(account: string): Promise<void> {
    if (!hasAdmin) return;
    try {
      const rec = await getRecord(account);
      if (!rec) return; // never used cloud sync
      const entitled = isPro((await getUser(account))?.roles);
      if (entitled !== rec.locked) return; // already as it should be
      await setAccess(rec, entitled);
      await couch(recordPath(account), { method: "PUT", body: JSON.stringify({ ...rec, locked: !entitled }) });
      console.log(`[cloud] ${entitled ? "unlocked" : "locked"}: ${account}`);
    } catch (err) {
      console.error(`[cloud] reconcile ${account}:`, (err as Error).message);
    }
  }

  if (!hasAdmin) {
    app.get("/api/cloud/status", (_req, res) => res.json({ available: false, entitled: false, provisioned: false, locked: false }));
    app.post("/api/cloud/provision", (_req, res) => res.status(503).json({ error: "Walang cloud sync sa server na ito." }));
    return { reconcile };
  }

  couch(`/${BILLING_DB}`, { method: "PUT" }).catch(() => undefined); // 412 = already there

  app.get("/api/cloud/status", async (req, res) => {
    try {
      const who = await sessionOf(req);
      if (!who) return res.status(401).json({ error: "Mag-login muna." });
      const rec = await getRecord(who.name);
      res.json({ available: true, entitled: who.roles.includes("_admin") || (await proNow(who.name)), provisioned: !!rec, locked: !!rec?.locked });
    } catch (err) {
      console.error("[cloud] status:", (err as Error).message);
      res.status(502).json({ error: "Hindi mabasa ang cloud sync ngayon." });
    }
  });

  app.post("/api/cloud/provision", json, async (req, res) => {
    try {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Hindi pinapayagan." });
      const who = await sessionOf(req);
      if (!who) return res.status(401).json({ error: "Mag-login muna." });
      // A server admin can open every database anyway; everyone else needs the Pro role.
      const admin = who.roles.includes("_admin");
      if (!admin && !(await proNow(who.name))) return res.status(402).json({ error: "Para sa Pro plan ang cloud sync." });

      const id = cloudId(who.name);
      let rec = await getRecord(who.name);
      if (!rec || rec.locked) {
        for (const kind of CLOUD_KINDS) {
          const r = await couch(`/${dbName(id, kind)}`, { method: "PUT" });
          if (!r.ok && r.status !== 412) throw new Error(`CouchDB create ${kind}: HTTP ${r.status}`);
        }
        const next: CloudRecord = { ...(rec ?? { _id: `cloud:${who.name}`, type: "cloud", account: who.name, id, createdAt: new Date().toISOString() }), locked: false };
        // Access first, record second: a half-done run is simply repeated by the next click.
        await setAccess(next, true);
        const pr = await couch(recordPath(who.name), { method: "PUT", body: JSON.stringify(next) });
        if (!pr.ok && pr.status !== 409) throw new Error(`CouchDB ${BILLING_DB}: HTTP ${pr.status}`);
        if (!rec) console.log(`[cloud] databases created: ${who.name} (${id})`);
        rec = next;
      }
      res.json({ dbs: dbsOf(rec.id) });
    } catch (err) {
      console.error("[cloud] provision:", (err as Error).message);
      res.status(502).json({ error: "Hindi na-setup ang cloud sync ngayon. Subukan ulit mamaya." });
    }
  });

  async function reconcileAll(): Promise<void> {
    try {
      const r = await couch(`/${BILLING_DB}/_find`, { method: "POST", body: JSON.stringify({ selector: { type: "cloud" }, fields: ["account"], limit: 5000 }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const d of ((await r.json()) as { docs?: Array<{ account?: string }> }).docs || []) if (d.account) await reconcile(d.account);
    } catch (err) {
      console.error("[cloud] reconcile all:", (err as Error).message);
    }
  }
  setTimeout(reconcileAll, 20_000).unref();
  setInterval(reconcileAll, RECONCILE_MS).unref();

  return { reconcile };
}
