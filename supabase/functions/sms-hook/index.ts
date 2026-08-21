// sms-hook: the other half of texting. Twilio posts here for two reasons.
//
//   1. A guest replied. We log it, honour STOP, and forward the message to
//      Austin by email so replies land somewhere he already reads.
//   2. A delivery receipt. Carriers can accept a message and then quietly drop
//      it, so we write the final carrier status onto the matching sms_log row.
//      "sent" means Twilio handed it off. "delivered" means it arrived.
//
// Twilio does not authenticate its webhooks, so the URL carries the shared
// secret: .../sms-hook?s=<CRON_SECRET>. Configure it in the Twilio console
// under the number's Messaging settings, and as the StatusCallback (which
// send-reminders sets automatically when PUBLIC_FUNCTIONS_URL is present).
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) || "";

const OPT_OUT = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"];
const OPT_IN = ["start", "unstop", "yes"];

const digits = (s: string) => String(s || "").replace(/[^0-9]/g, "");
const last10 = (s: string) => digits(s).slice(-10);

async function forward(subject: string, text: string) {
  const key = env("RESEND_API_KEY");
  const to = env("REPLY_TO") || "austinsabella@gmail.com";
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("FROM_EMAIL") || "Austin & Ana <hello@sabellawedding.com>",
      to: [to],
      subject,
      text,
    }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!env("CRON_SECRET") || url.searchParams.get("s") !== env("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const form = new URLSearchParams(await req.text());
  const twiml = { "Content-Type": "text/xml" };
  const empty = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

  /* ---- delivery receipt ---- */
  const status = form.get("MessageStatus") || form.get("SmsStatus");
  const sid = form.get("MessageSid") || form.get("SmsSid");
  if (status && sid && !form.get("Body")) {
    const errCode = form.get("ErrorCode");
    await sb.from("sms_log")
      .update({ status, error: errCode ? `carrier error ${errCode}` : null })
      .eq("provider_sid", sid);

    // Undelivered is the failure mode that looks like success. Say so out loud.
    if (status === "undelivered" || status === "failed") {
      const { data } = await sb.from("sms_log").select("phone,greeting").eq("provider_sid", sid).maybeSingle();
      await forward(
        "Wedding text NOT delivered",
        `A text did not reach its recipient.\n\n` +
        `To: ${data?.greeting || "unknown"} (${data?.phone || "unknown"})\n` +
        `Status: ${status}${errCode ? ` (carrier error ${errCode})` : ""}\n\n` +
        `Worth reaching them another way.`,
      );
    }
    return new Response(empty, { headers: twiml });
  }

  /* ---- inbound reply ---- */
  const from = form.get("From") || "";
  const body = (form.get("Body") || "").trim();
  if (!from) return new Response(empty, { headers: twiml });

  const word = body.toLowerCase().replace(/[^a-z]/g, "");
  const isOptOut = OPT_OUT.includes(word);
  const isOptIn = OPT_IN.includes(word);

  // Match on the last ten digits so formatting differences do not matter.
  const { data: guests } = await sb.from("guests").select("id,full_name,phone").not("phone", "is", null);
  const match = (guests ?? []).filter((g) => last10(g.phone || "") === last10(from));
  const names = match.map((g) => g.full_name).join(", ");

  if (isOptOut || isOptIn) {
    for (const g of match) {
      await sb.from("guests").update({ sms_opt_out: isOptOut }).eq("id", g.id);
    }
  }

  await sb.from("sms_inbound").insert({
    from_phone: from,
    body,
    is_opt_out: isOptOut,
    guest_name: names || null,
    forwarded: true,
  });

  await forward(
    isOptOut
      ? `Wedding texts: ${names || from} opted out`
      : `Wedding text reply from ${names || from}`,
    `${names ? names + " " : ""}(${from}) wrote:\n\n${body || "(no text)"}\n\n` +
      (isOptOut
        ? `They have been marked opted out and will not get any further texts.\n`
        : `Reply from your own phone, or from the Twilio console.\n`),
  );

  // Twilio auto-replies to STOP itself, so we stay quiet and send nothing back.
  return new Response(empty, { headers: twiml });
});
