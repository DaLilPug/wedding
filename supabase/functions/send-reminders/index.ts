// send-reminders: called daily by pg_cron. Sends any due, unsent
// reminders to the right audience via Resend, then marks them sent.
// All secrets come from function env: CRON_SECRET, RESEND_API_KEY,
// FROM_EMAIL, REPLY_TO (plus the platform-provided SUPABASE_* vars).
import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await sb.from("reminders").select("*").is("sent_at", null).lte("send_on", today);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results = [];
  for (const r of due ?? []) {
    let q = sb.from("guests").select("email,attending").not("email", "is", null);
    if (r.audience === "attending") q = q.eq("attending", true);
    if (r.audience === "declined") q = q.eq("attending", false);
    if (r.audience === "not_responded") q = q.is("attending", null);
    const { data: guests, error: gerr } = await q;
    if (gerr) { results.push({ id: r.id, error: gerr.message }); continue; }

    const emails = [...new Set((guests ?? []).map((g) => (g.email || "").trim().toLowerCase()).filter(Boolean))];
    const from = Deno.env.get("FROM_EMAIL") || "Austin & Ana <hello@sabellawedding.com>";
    const replyTo = Deno.env.get("REPLY_TO") || "austinsabella@gmail.com";
    const payload = emails.map((to) => ({ from, to: [to], reply_to: replyTo, subject: r.subject, html: renderHtml(r.body) }));

    let sent = 0;
    const errs: string[] = [];
    for (let i = 0; i < payload.length; i += 100) {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload.slice(i, i + 100)),
      });
      if (res.ok) sent += payload.slice(i, i + 100).length;
      else errs.push(await res.text());
    }
    if (sent > 0 || payload.length === 0) {
      await sb.from("reminders").update({ sent_at: new Date().toISOString(), sent_count: sent }).eq("id", r.id);
    }
    results.push({ id: r.id, subject: r.subject, recipients: emails.length, sent, errs });
  }
  return new Response(JSON.stringify({ ran: today, due: (due ?? []).length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
