/**
 * 2026-11-16: subscriptions paid through PayMongo (GCash, card, …) — PREPAID: the church buys
 * 1 month or 1 year at a time; nothing renews by itself (GCash cannot be charged again
 * automatically, and a prepaid plan cannot surprise a church with a charge).
 *
 *    GET  /api/billing/plans      prices + whether paying works on this server
 *    GET  /api/billing/status     the logged-in account's plan and end date
 *    POST /api/billing/checkout   { plan, period } → { url } of PayMongo's hosted checkout page
 *    POST /api/billing/confirm    re-checks the account's unpaid orders (used when coming back
 *                                 from the checkout page, in case the webhook is late or not set up)
 *    POST /api/billing/webhook    called by PayMongo when a checkout is paid
 *
 * How a payment becomes a plan:
 *  1. checkout: a PayMongo Checkout Session is created and an ORDER doc is saved in CouchDB
 *     ("wtp_billing", admin-only): which account, which plan, how many months, how much.
 *  2. webhook / confirm: the session is fetched again FROM PAYMONGO with our secret key, and only
 *     what PayMongo answers there is believed (paid? how much?). The webhook body is used only to
 *     find session ids, so its exact shape — and a forged webhook — cannot grant anything.
 *  3. the account's _users doc gets the role "plan:<plan>" and `subscription.expiresAt`
 *     (see src/lib/entitlements.ts). The order id is remembered on the user doc, so the same
 *     payment arriving twice (webhook retry + confirm) extends the plan only once.
 *  4. every hour, plans whose end date (+ GRACE_DAYS) has passed lose the role.
 *     Roles given by hand in Fauxton (no `subscription` on the doc) are never touched.
 *
 * Who is asking: these routes read the CouchDB session cookie (AuthSession) that the browser
 * sends along, and ask CouchDB whose it is. So the app and CouchDB must share a cookie —
 * same host on a laptop; in the cloud, same site with CouchDB's `cookie_domain` set.
 *
 * .env: PAYMONGO_SECRET_KEY (sk_test_… / sk_live_…), PAYMONGO_WEBHOOK_SECRET (whsk_…, optional),
 *       PAYMONGO_METHODS (default "gcash,card"), APP_URL (where PayMongo sends people back),
 *       BILLING_URL (on a laptop install: the hosted site where paying works),
 *       plus the CouchDB admin login from authServer.ts.
 * This needs a server PayMongo can reach, i.e. the hosted one — not the church laptop.
 */
import express, { Express, Request, Response } from "express";
import crypto from "crypto";

// Prices in pesos. A year costs 10 months (2 months free). Pro is not sold until cloud sync exists.
const PLANS = [
  { id: "basic", name: "Basic", monthly: 299, available: true },
  { id: "pro", name: "Pro", monthly: 699, available: false },
] as const;
type PlanId = (typeof PLANS)[number]["id"];
const YEAR_PAYS_FOR = 10;
const PERIODS = { month: 1, year: 12 } as const;
type Period = keyof typeof PERIODS;

const GRACE_DAYS = 3; // a plan that ended on Saturday still works on Sunday morning
const BILLING_DB = "wtp_billing";
const RL = { CHECKOUT_WINDOW_MS: 60 * 60 * 1000, CHECKOUT_MAX: 10, TIMEOUT_MS: 15000, SWEEP_MS: 60 * 60 * 1000, SIGNATURE_MAX_AGE_S: 5 * 60 };
const CS_ID_RE = /\bcs_[A-Za-z0-9]{6,64}\b/g;
const CS_ID_ONE = /^cs_[A-Za-z0-9]{6,64}$/;

interface Subscription {
  plan: PlanId;
  expiresAt: string;
  updatedAt: string;
  /** Checkout sessions already counted (newest last) — makes applying a payment safe to repeat. */
  orders: string[];
  ended?: boolean;
}
interface UserDoc {
  _id: string;
  _rev: string;
  name: string;
  roles?: string[];
  subscription?: Subscription;
  [k: string]: unknown;
}
interface OrderDoc {
  _id: string;
  _rev?: string;
  type: "order";
  account: string;
  plan: PlanId;
  months: number;
  /** centavos */
  amount: number;
  status: "pending" | "paid";
  createdAt: string;
  paidAt?: string;
}

const isPlanRole = (r: string) => r.startsWith("plan:");

/** Same day N months later (Jan 31 + 1 month = last day of February). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * PayMongo's header: "t=<unix seconds>,te=<test signature>,li=<live signature>"; the signature is
 * HMAC-SHA256 of "<t>.<raw body>" with the webhook's secret key.
 */
export function validSignature(header: string, rawBody: Buffer, secret: string, nowMs = Date.now()): boolean {
  const parts = new Map(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = parts.get("t") || "";
  if (!/^\d{1,12}$/.test(t) || Math.abs(nowMs / 1000 - Number(t)) > RL.SIGNATURE_MAX_AGE_S) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  return [parts.get("te"), parts.get("li")].some((sig) => {
    if (!sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
    return crypto.timingSafeEqual(expected, Buffer.from(sig, "hex"));
  });
}

/** Register BEFORE express.json(): the webhook needs the body exactly as it was sent. */
export function registerBillingRoutes(app: Express) {
  const couchUrl = (process.env.COUCHDB_URL || "http://localhost:5984").replace(/\/+$/, "");
  const adminAuth = `Basic ${Buffer.from(`${process.env.COUCHDB_ADMIN_USER || ""}:${process.env.COUCHDB_ADMIN_PASSWORD || ""}`).toString("base64")}`;
  const hasAdmin = !!process.env.COUCHDB_ADMIN_USER && !!process.env.COUCHDB_ADMIN_PASSWORD;
  const secretKey = process.env.PAYMONGO_SECRET_KEY || "";
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET || "";
  const apiUrl = (process.env.PAYMONGO_API_URL || "https://api.paymongo.com/v1").replace(/\/+$/, "");
  const methods = (process.env.PAYMONGO_METHODS || "gcash,card").split(",").map((m) => m.trim()).filter(Boolean);
  const billingUrl = /^https?:\/\//.test(process.env.BILLING_URL || "") ? process.env.BILLING_URL!.replace(/\/+$/, "") : null;
  const enabled = !!secretKey && hasAdmin;
  const json = express.json({ limit: "8kb" });

  const publicPlans = PLANS.map((p) => ({ ...p, yearly: p.monthly * YEAR_PAYS_FOR }));

  // ---------------------------------------------------------------- CouchDB (admin) + PayMongo

  const couch = (path: string, init: RequestInit = {}) =>
    fetch(`${couchUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: adminAuth, ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(RL.TIMEOUT_MS),
    });
  const userPath = (name: string) => `/_users/${encodeURIComponent(`org.couchdb.user:${name}`)}`;
  const orderPath = (csId: string) => `/${BILLING_DB}/${encodeURIComponent(`order:${csId}`)}`;

  const paymongo = (path: string, init: RequestInit = {}) =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
      signal: AbortSignal.timeout(RL.TIMEOUT_MS),
    });

  /** Whose CouchDB session cookie came with this request (null = nobody). */
  async function accountOf(req: Request): Promise<string | null> {
    const m = /(?:^|;\s*)AuthSession=([^;]+)/.exec(String(req.headers.cookie || ""));
    if (!m) return null;
    try {
      const r = await fetch(`${couchUrl}/_session`, { headers: { Cookie: `AuthSession=${m[1]}` }, signal: AbortSignal.timeout(RL.TIMEOUT_MS) });
      const j = (await r.json()) as { userCtx?: { name?: unknown } };
      return typeof j.userCtx?.name === "string" && j.userCtx.name ? j.userCtx.name : null;
    } catch {
      return null;
    }
  }

  /** Cookie-authenticated POSTs: refuse pages of other sites (their Origin is not ours). */
  function sameOrigin(req: Request): boolean {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(String(origin)).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function getUser(name: string): Promise<UserDoc | null> {
    const r = await couch(userPath(name));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`CouchDB _users: HTTP ${r.status}`);
    return (await r.json()) as UserDoc;
  }

  // ---------------------------------------------------------------- plan on the user doc

  /** Removes the plan of a subscription whose end date (+ grace) has passed. Returns the doc as it is now. */
  async function endIfOver(user: UserDoc): Promise<UserDoc> {
    const sub = user.subscription;
    if (!sub || sub.ended || Date.parse(sub.expiresAt) + GRACE_DAYS * 86400_000 > Date.now()) return user;
    const next: UserDoc = { ...user, roles: (user.roles || []).filter((r) => !isPlanRole(r)), subscription: { ...sub, ended: true, updatedAt: new Date().toISOString() } };
    const r = await couch(userPath(user.name), { method: "PUT", body: JSON.stringify(next) });
    if (!r.ok) return user; // changed meanwhile (e.g. a payment just arrived): the next check sees it
    console.log(`[billing] plan ended: ${user.name} (${sub.plan}, until ${sub.expiresAt})`);
    return { ...next, _rev: ((await r.json()) as { rev: string }).rev };
  }

  /** Adds the paid months to the account. Safe to call again for the same order. */
  async function applyOrder(csId: string, order: OrderDoc): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const user = await getUser(order.account);
      if (!user) throw new Error(`account not found: ${order.account}`);
      const sub = user.subscription;
      if (sub?.orders?.includes(csId)) return;
      const now = new Date();
      // Paying early adds to the time left (same plan); otherwise the period starts today.
      const running = sub && !sub.ended && sub.plan === order.plan && Date.parse(sub.expiresAt) > now.getTime();
      const expiresAt = addMonths(running ? new Date(sub.expiresAt) : now, order.months).toISOString();
      const next: UserDoc = {
        ...user,
        roles: [...(user.roles || []).filter((r) => !isPlanRole(r)), `plan:${order.plan}`],
        subscription: { plan: order.plan, expiresAt, updatedAt: now.toISOString(), orders: [...(sub?.orders || []), csId].slice(-50) },
      };
      const r = await couch(userPath(order.account), { method: "PUT", body: JSON.stringify(next) });
      if (r.ok) {
        console.log(`[billing] paid: ${order.account} → ${order.plan} +${order.months} mo, until ${expiresAt} (${csId})`);
        return;
      }
      if (r.status !== 409) throw new Error(`CouchDB _users: HTTP ${r.status}`);
    }
    throw new Error("user doc kept changing");
  }

  /** Asks PayMongo about one of OUR checkout sessions and, when it is paid, gives the plan. */
  async function settle(csId: string): Promise<"paid" | "pending" | "unknown"> {
    const or = await couch(orderPath(csId));
    if (or.status === 404) return "unknown"; // not a session this server created
    if (!or.ok) throw new Error(`CouchDB ${BILLING_DB}: HTTP ${or.status}`);
    const order = (await or.json()) as OrderDoc;
    if (order.status !== "paid") {
      const pr = await paymongo(`/checkout_sessions/${encodeURIComponent(csId)}`);
      if (!pr.ok) throw new Error(`PayMongo checkout_sessions: HTTP ${pr.status}`);
      const session = (await pr.json()) as { data?: { id?: string; attributes?: { payments?: Array<{ attributes?: { status?: string; amount?: number } }>; payment_intent?: { attributes?: { status?: string; amount?: number } } } } };
      const a = session.data?.attributes;
      const payment = (Array.isArray(a?.payments) ? a.payments : []).find((p) => p?.attributes?.status === "paid");
      const amount = payment?.attributes?.amount ?? (a?.payment_intent?.attributes?.status === "succeeded" ? a.payment_intent.attributes.amount : undefined);
      if (session.data?.id !== csId || amount === undefined) return "pending";
      if (amount < order.amount) {
        console.error(`[billing] ${csId}: paid ${amount} but the order is ${order.amount} — not applied`);
        return "pending";
      }
    }
    await applyOrder(csId, order);
    if (order.status !== "paid") {
      // Bookkeeping only; the plan is already on the account.
      await couch(orderPath(csId), { method: "PUT", body: JSON.stringify({ ...order, status: "paid", paidAt: new Date().toISOString() }) }).catch(() => undefined);
    }
    return "paid";
  }

  async function statusOf(account: string) {
    let user = await getUser(account);
    if (user) user = await endIfOver(user);
    const sub = user?.subscription;
    const role = (user?.roles || []).find(isPlanRole);
    return { account, plan: role ? role.slice(5) : "free", expiresAt: sub && !sub.ended ? sub.expiresAt : null, graceDays: GRACE_DAYS };
  }

  // ---------------------------------------------------------------- routes

  app.get("/api/billing/plans", (_req, res) => {
    res.json({ enabled, billingUrl: enabled ? null : billingUrl, plans: publicPlans, methods: enabled ? methods : [] });
  });

  if (!enabled) {
    const off = (_req: Request, res: Response) => res.status(503).json({ error: "Hindi naka-setup ang online na bayad sa server na ito." });
    app.get("/api/billing/status", off);
    app.post(["/api/billing/checkout", "/api/billing/confirm", "/api/billing/webhook"], off);
    return;
  }

  // The orders database (admin-only by default in CouchDB 3). 412 = already there.
  couch(`/${BILLING_DB}`, { method: "PUT" }).then(
    (r) => r.ok || r.status === 412 || console.error(`[billing] could not create ${BILLING_DB}: HTTP ${r.status}`),
    (e) => console.error(`[billing] CouchDB not reachable: ${(e as Error).message}`),
  );

  app.get("/api/billing/status", async (req, res) => {
    try {
      const account = await accountOf(req);
      if (!account) return res.status(401).json({ error: "Mag-login muna." });
      res.json(await statusOf(account));
    } catch (err) {
      console.error("[billing] status:", (err as Error).message);
      res.status(502).json({ error: "Hindi mabasa ang plan ngayon." });
    }
  });

  const checkoutTries = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/billing/checkout", json, async (req, res) => {
    try {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Hindi pinapayagan." });
      const account = await accountOf(req);
      if (!account) return res.status(401).json({ error: "Mag-login muna." });
      const plan = PLANS.find((p) => p.id === req.body?.plan && p.available);
      const period = (Object.keys(PERIODS) as Period[]).find((p) => p === req.body?.period);
      if (!plan || !period) return res.status(400).json({ error: "Hindi available ang plan na iyon." });

      const now = Date.now();
      let b = checkoutTries.get(account);
      if (!b || now >= b.resetAt) checkoutTries.set(account, (b = { count: 0, resetAt: now + RL.CHECKOUT_WINDOW_MS }));
      if (++b.count > RL.CHECKOUT_MAX) return res.status(429).json({ error: "Sobrang daming subok. Subukan ulit mamaya." });

      const months = PERIODS[period];
      const amount = (period === "year" ? plan.monthly * YEAR_PAYS_FOR : plan.monthly) * 100; // centavos
      const appUrl = /^https?:\/\//.test(process.env.APP_URL || "") ? process.env.APP_URL!.replace(/\/+$/, "") : `${req.protocol}://${req.get("host")}`;
      const label = `WorshipTech-Pro ${plan.name} — ${period === "year" ? "1 taon" : "1 buwan"}`;
      const pr = await paymongo("/checkout_sessions", {
        method: "POST",
        body: JSON.stringify({
          data: {
            attributes: {
              line_items: [{ currency: "PHP", amount, name: label, quantity: 1 }],
              payment_method_types: methods,
              description: label,
              reference_number: `wtp-${now.toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
              send_email_receipt: account.includes("@"),
              ...(account.includes("@") ? { billing: { email: account } } : {}),
              success_url: `${appUrl}/?billing=success`,
              cancel_url: `${appUrl}/?billing=cancel`,
            },
          },
        }),
      });
      const pj = (await pr.json().catch(() => null)) as { data?: { id?: string; attributes?: { checkout_url?: string } }; errors?: unknown } | null;
      const csId = pj?.data?.id;
      const url = pj?.data?.attributes?.checkout_url;
      if (!pr.ok || typeof csId !== "string" || !CS_ID_ONE.test(csId) || typeof url !== "string" || !/^https?:\/\//.test(url)) {
        console.error(`[billing] checkout: PayMongo HTTP ${pr.status}`, JSON.stringify(pj?.errors ?? pj)?.slice(0, 500));
        return res.status(502).json({ error: "Hindi mabuksan ang bayaran ngayon. Subukan ulit mamaya." });
      }
      const order: OrderDoc = { _id: `order:${csId}`, type: "order", account, plan: plan.id, months, amount, status: "pending", createdAt: new Date(now).toISOString() };
      const sr = await couch(orderPath(csId), { method: "PUT", body: JSON.stringify(order) });
      if (!sr.ok) throw new Error(`CouchDB ${BILLING_DB}: HTTP ${sr.status}`); // no order = a payment could not be matched, so no link is given out
      res.json({ url });
    } catch (err) {
      console.error("[billing] checkout:", (err as Error).message);
      res.status(502).json({ error: "Hindi mabuksan ang bayaran ngayon. Subukan ulit mamaya." });
    }
  });

  app.post("/api/billing/confirm", json, async (req, res) => {
    try {
      if (!sameOrigin(req)) return res.status(403).json({ error: "Hindi pinapayagan." });
      const account = await accountOf(req);
      if (!account) return res.status(401).json({ error: "Mag-login muna." });
      const fr = await couch(`/${BILLING_DB}/_find`, { method: "POST", body: JSON.stringify({ selector: { type: "order", account, status: "pending" }, limit: 20 }) });
      const docs = fr.ok ? ((await fr.json()) as { docs?: OrderDoc[] }).docs || [] : [];
      // newest first; a few are enough (abandoned checkouts stay "pending" forever)
      const recent = docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
      let paid = 0;
      for (const o of recent) if ((await settle(o._id.slice("order:".length))) === "paid") paid++;
      res.json({ ...(await statusOf(account)), newlyPaid: paid });
    } catch (err) {
      console.error("[billing] confirm:", (err as Error).message);
      res.status(502).json({ error: "Hindi ma-check ang bayad ngayon. Subukan ulit mamaya." });
    }
  });

  if (!webhookSecret) console.warn("[billing] PAYMONGO_WEBHOOK_SECRET is not set: webhook signatures are not checked (payments are still verified with PayMongo's API).");
  app.post("/api/billing/webhook", express.raw({ type: () => true, limit: "1mb" }), async (req, res) => {
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (webhookSecret && !validSignature(String(req.headers["paymongo-signature"] || ""), raw, webhookSecret)) {
      console.warn("[billing] webhook: bad signature — ignored");
      return res.status(401).json({ error: "bad signature" });
    }
    try {
      const ids = [...new Set(raw.toString("utf8").match(CS_ID_RE) || [])].slice(0, 5);
      for (const id of ids) await settle(id);
      res.json({ ok: true });
    } catch (err) {
      // Not 2xx, so PayMongo sends it again later.
      console.error("[billing] webhook:", (err as Error).message);
      res.status(500).json({ error: "try again" });
    }
  });

  // ---------------------------------------------------------------- hourly: end plans that ran out

  async function sweep(): Promise<void> {
    try {
      const r = await couch(`/_users/_find`, { method: "POST", body: JSON.stringify({ selector: { "subscription.expiresAt": { $lt: new Date(Date.now() - GRACE_DAYS * 86400_000).toISOString() } }, limit: 500 }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      for (const u of ((await r.json()) as { docs?: UserDoc[] }).docs || []) await endIfOver(u);
    } catch (err) {
      console.error("[billing] sweep:", (err as Error).message);
    }
  }
  setTimeout(sweep, 10_000).unref();
  setInterval(sweep, RL.SWEEP_MS).unref();
}
