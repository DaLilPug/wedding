// send-reminders: sends any due, unsent reminders to the right audience and
// marks them sent. Email goes out through Resend, texts through Twilio, and a
// single reminder row can do both, so the invite blast and every later nudge
// come from the same sender.
//
// Called three ways:
//   1. pg_cron, daily, with the x-cron-secret header. Sends everything due.
//   2. The admin dashboard, with a signed-in admin's bearer token, to send one
//      reminder immediately, preview its audience, or fire a single test.
//   3. Nothing else. Anything unauthenticated gets a 403.
//
// Body (all optional):
//   { reminder_id, dry_run, test_to, channels }
//   reminder_id  send just this one, ignoring its send_on date
//   dry_run      resolve the audience and return it, send nothing
//   test_to      send only to this phone or email, leave the reminder unsent
//   channels     ["sms"] or ["email"] to send only one half of a "both"
//
// Secrets from function env: CRON_SECRET, RESEND_API_KEY, FROM_EMAIL, REPLY_TO,
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID
// or TWILIO_FROM. Optional: SMS_FOOTER, PUBLIC_FUNCTIONS_URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) || "";

/* ---------- email ---------- */

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function renderHtml(body: string) {
  const paras = String(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html><body style="margin:0;padding:0;background:#FCF9F5">
  <div style="max-width:560px;margin:0 auto;padding:40px 28px;font-family:Georgia,serif;color:#30374A;font-size:16px;line-height:1.7">
    <p style="text-align:center;font-size:13px;letter-spacing:.25em;color:#78643A;margin:0 0 6px">AUSTIN &amp; ANA</p>
    <p style="text-align:center;font-size:12px;letter-spacing:.18em;color:#68708A;margin:0 0 30px">APRIL 23, 2027 &middot; PROMONTORY POINT &middot; CHICAGO</p>
    ${paras}
    <p style="margin:26px 0 0"><a href="https://sabellawedding.com" style="color:#78643A">sabellawedding.com</a></p>
  </div></body>`;
}

/* ---------- text ---------- */

// {{first}} and {{name}} both become the greeting the database built for that
// number: the guest's first name, plus anyone in their party without a phone.
function fill(template: string, greeting: string) {
  return String(template).replace(/\{\{\s*(first|name|greeting)\s*\}\}/gi, greeting);
}

function withFooter(body: string) {
  const footer = env("SMS_FOOTER").trim();
  if (!footer) return body;
  if (/\bstop\b/i.test(body)) return body;      // already says it
  return body.replace(/\s+$/, "") + " " + footer;
}

// GSM-7 vs UCS-2 matters for cost: one emoji pushes the whole message to
// 70-character segments. Report it so nobody is surprised by the bill.
function segments(body: string) {
  let unicode = false;
  for (const ch of body) if ((ch.codePointAt(0) || 0) > 255) { unicode = true; break; }
  const single = unicode ? 70 : 160;
  const per = unicode ? 67 : 153;
  return body.length <= single ? 1 : Math.ceil(body.length / per);
}

async function sendSms(to: string, body: string) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const service = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_FROM");
  if (!sid || !token || (!service && !from)) {
    return { ok: false, error: "Twilio is not configured yet (missing TWILIO_* env vars)" };
  }

  const form = new URLSearchParams({ To: to, Body: body });
  if (service) form.set("MessagingServiceSid", service);
  else form.set("From", from);

  // Ask Twilio to tell us what the carrier actually did with it.
  const base = env("PUBLIC_FUNCTIONS_URL");
  if (base && env("CRON_SECRET")) {
    form.set("StatusCallback", `${base.replace(/\/$/, "")}/sms-hook?s=${encodeURIComponent(env("CRON_SECRET"))}`);
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: `${json.code ?? res.status}: ${json.message ?? "send failed"}` };
  }
  return { ok: true, sid: json.sid as string, status: json.status as string };
}

/* ---------- auth ---------- */

async function authorize(req: Request, sb: ReturnType<typeof createClient>) {
  if (env("CRON_SECRET") && req.headers.get("x-cron-secret") === env("CRON_SECRET")) {
    return { ok: true, who: "cron" };
  }
  const auth = req.headers.get("Authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // The anon key is public, so a bare anon token must never count as an admin.
  if (!jwt || jwt === env("SUPABASE_ANON_KEY")) return { ok: false, who: "" };
  const { data, error } = await sb.auth.getUser(jwt);
  const email = data?.user?.email;
  if (error || !email) return { ok: false, who: "" };
  const { data: row } = await sb.from("admins").select("email").ilike("email", email).maybeSingle();
  return row ? { ok: true, who: email } : { ok: false, who: "" };
}

/* ---------- main ---------- */

Deno.serve(async (req) => {
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const who = await authorize(req, sb);
  if (!who.ok) return new Response("forbidden", { status: 403, headers: cors });

  const opts = await req.json().catch(() => ({}));
  const dryRun = !!opts.dry_run;
  const testTo = String(opts.test_to || "").trim();
  const only: string[] | null = Array.isArray(opts.channels) && opts.channels.length ? opts.channels : null;

  const today = new Date().toISOString().slice(0, 10);
  let q = sb.from("reminders").select("*").is("sent_at", null);
  if (opts.reminder_id) q = q.eq("id", opts.reminder_id);
  else q = q.lte("send_on", today);
  const { data: due, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  const results: unknown[] = [];

  for (const r of due ?? []) {
    const channel = r.channel || "email";
    const doEmail = (channel === "email" || channel === "both") && (!only || only.includes("email"));
    const doSms = (channel === "sms" || channel === "both") && (!only || only.includes("sms"));
    const out: Record<string, unknown> = { id: r.id, channel };

    /* ----- email ----- */
    if (doEmail) {
      let gq = sb.from("guests").select("full_name,email,attending").not("email", "is", null);
      if (r.audience === "attending") gq = gq.eq("attending", true);
      if (r.audience === "declined") gq = gq.eq("attending", false);
      if (r.audience === "not_responded") gq = gq.is("attending", null);
      const { data: guests, error: gerr } = await gq;
      if (gerr) {
        out.email = { error: gerr.message };
      } else {
        const seen = new Set<string>();
        let list = (guests ?? [])
          .map((g) => ({ to: (g.email || "").trim().toLowerCase(), first: String(g.full_name || "").split(" ")[0] }))
          .filter((g) => g.to && !seen.has(g.to) && seen.add(g.to));
        if (testTo) list = testTo.includes("@") ? [{ to: testTo, first: "Test" }] : [];

        if (dryRun) {
          out.email = { recipients: list.length, sample: list.slice(0, 5).map((g) => g.to) };
        } else {
          const from = env("FROM_EMAIL") || "Austin & Ana <hello@sabellawedding.com>";
          const replyTo = env("REPLY_TO") || "austinsabella@gmail.com";
          const payload = list.map((g) => ({
            from,
            to: [g.to],
            reply_to: replyTo,
            subject: fill(r.subject || "", g.first),
            html: renderHtml(fill(r.body || "", g.first)),
          }));
          let sent = 0;
          const errs: string[] = [];
          for (let i = 0; i < payload.length; i += 100) {
            const chunk = payload.slice(i, i + 100);
            const res = await fetch("https://api.resend.com/emails/batch", {
              method: "POST",
              headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
              body: JSON.stringify(chunk),
            });
            if (res.ok) sent += chunk.length;
            else errs.push(await res.text());
          }
          out.email = { recipients: list.length, sent, errs };
        }
      }
    }

    /* ----- text ----- */
    if (doSms) {
      const { data: aud, error: aerr } = await sb.rpc("sms_audience", { p_audience: r.audience || "all" });
      if (aerr) {
        out.sms = { error: aerr.message };
      } else {
        let list = (aud ?? []) as { phone: string; greeting: string }[];
        if (testTo) list = testTo.includes("@") ? [] : [{ phone: testTo, greeting: "Test" }];

        const preview = withFooter(fill(r.sms_body || "", list[0]?.greeting || "Friend"));
        if (dryRun) {
          out.sms = {
            recipients: list.length,
            segments_each: segments(preview),
            chars: preview.length,
            preview,
            sample: list.slice(0, 5).map((g) => `${g.greeting} ${g.phone.slice(-4)}`),
          };
        } else {
          let sent = 0;
          const errs: string[] = [];
          for (const g of list) {
            const body = withFooter(fill(r.sms_body || "", g.greeting));
            const res = await sendSms(g.phone, body);
            await sb.from("sms_log").insert({
              reminder_id: testTo ? null : r.id,
              phone: g.phone,
              greeting: g.greeting,
              body,
              provider_sid: res.ok ? res.sid : null,
              status: res.ok ? res.status : "error",
              error: res.ok ? null : res.error,
            });
            if (res.ok) sent += 1;
            else if (errs.length < 5) errs.push(`${g.phone.slice(-4)}: ${res.error}`);
            // Gentle pace: new senders get throttled, and a burst looks worse
            // to carrier filters than a steady trickle.
            if (list.length > 1) await new Promise((r) => setTimeout(r, 250));
          }
          out.sms = { recipients: list.length, sent, failed: list.length - sent, errs };
        }
      }
    }

    // A test or a preview never marks the reminder as done.
    if (!dryRun && !testTo) {
      const emailSent = (out.email as { sent?: number } | undefined)?.sent ?? 0;
      const smsSent = (out.sms as { sent?: number } | undefined)?.sent ?? 0;
      if (emailSent > 0 || smsSent > 0) {
        await sb.from("reminders").update({
          sent_at: new Date().toISOString(),
          sent_count: emailSent,
          sms_sent_count: smsSent,
        }).eq("id", r.id);
        out.marked_sent = true;
      }
    }
    results.push(out);
  }

  return new Response(JSON.stringify({
    ran: today, by: who.who, dry_run: dryRun, test_to: testTo || null,
    due: (due ?? []).length, results,
  }), { headers: { ...cors, "Content-Type": "application/json" } });
});
