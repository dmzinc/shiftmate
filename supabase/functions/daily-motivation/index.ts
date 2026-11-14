import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function similarity(a: string, b: string) {
  const aa = new Set(normalise(a).split(" ").filter(Boolean));
  const bb = new Set(normalise(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter(x => bb.has(x)).length;
  return intersection / (aa.size + bb.size - intersection);
}
async function hash(s: string) {
  const bytes = new TextEncoder().encode(normalise(s));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function localDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);
  if (!openAiKey) return json({ error: "Motivation generation is not configured yet" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData.user;
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin.from("profiles")
    .select("full_name,profession,timezone").eq("id", user.id).maybeSingle();
  const tz = profile?.timezone || "Europe/London";
  let date: string;
  try { date = localDate(tz); } catch { date = localDate("Europe/London"); }

  const { data: existing } = await admin.from("daily_motivations")
    .select("id,quote,theme,local_date,created_at")
    .eq("user_id", user.id).eq("local_date", date).maybeSingle();
  if (existing) return json({ motivation: existing, cached: true });

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_daily_motivation_generation",
    { p_user_id: user.id, p_local_date: date },
  );
  if (claimError || claimed !== true) {
    const { data: raced } = await admin.from("daily_motivations")
      .select("id,quote,theme,local_date,created_at")
      .eq("user_id", user.id).eq("local_date", date).maybeSingle();
    if (raced) return json({ motivation: raced, cached: true });
    return json({ error: "Today's motivation could not be generated. Please try again later." }, 429);
  }

  const { data: shifts } = await admin.from("shifts")
    .select("shift_date,shift_type,start_time,end_time,ward,rotation_id")
    .eq("user_id", user.id).eq("archived", false)
    .gte("shift_date", date).order("shift_date", { ascending: true }).limit(3);
  const rotationIds = [...new Set((shifts || []).map(s => s.rotation_id).filter(Boolean))];
  let specialty = "";
  if (rotationIds.length) {
    const { data: rotation } = await admin.from("rotations")
      .select("specialty,grade").eq("id", rotationIds[0]).eq("user_id", user.id).maybeSingle();
    if (rotation) specialty = [rotation.specialty, rotation.grade].filter(Boolean).join(", ");
  }

  const recentCutoff = new Date(Date.now() - 365 * 86400000).toISOString();
  const { data: history } = await admin.from("daily_motivations")
    .select("quote").eq("user_id", user.id)
    .gte("created_at", recentCutoff).order("created_at", { ascending: false }).limit(400);
  const previous = (history || []).map(x => x.quote).filter(Boolean);
  const displayName = (profile?.full_name || user.user_metadata?.full_name || "").split(/\s+/)[0];

  const prompt = `Write ONE original motivational line for a healthcare professional using concise, natural, emotionally intelligent language.
Maximum 22 words. No hashtags, emojis, quotation marks, clichés, fake quotations, famous-person attributions, medical advice, guilt, or toxic positivity.
Personalise gently using only this context: first name ${displayName || "not supplied"}; profession ${profile?.profession || "healthcare professional"}; specialty/grade ${specialty || "not supplied"}; upcoming work pattern ${(shifts || []).map(s => s.shift_type + " on " + s.shift_date).join("; ") || "no upcoming shifts supplied"}.
Do not mention private shift details, wards, patient information, or dates. Focus on encouragement, confidence, purpose, resilience, rest, or professional growth.
Avoid close paraphrases of these previously used messages: ${previous.slice(0, 100).join(" | ")}
Return JSON only: {"quote":"...","theme":"one of confidence,resilience,purpose,self-care,growth,encouragement"}.`;

  let accepted: { quote: string; theme: string } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 1.05,
        max_tokens: 90,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You write original, brief, compassionate motivational messages. Follow the requested JSON schema exactly." },
          { role: "user", content: prompt + (attempt ? "\nThe previous candidate was too similar to an earlier message. Create a substantially different thought and wording." : "") },
        ],
      }),
    });
    if (!ai.ok) return json({ error: "Motivation service is temporarily unavailable" }, 502);
    const payload = await ai.json();
    let candidate: any;
    try { candidate = JSON.parse(payload.choices?.[0]?.message?.content || "{}"); } catch { continue; }
    const quote = String(candidate.quote || "").trim().replace(/^["']|["']$/g, "");
    if (quote.length < 25 || quote.length > 220 || quote.split(/\s+/).length > 22) continue;
    const duplicate = previous.some(old => normalise(old) === normalise(quote) || similarity(old, quote) >= 0.62);
    if (!duplicate) accepted = {
      quote,
      theme: ["confidence", "resilience", "purpose", "self-care", "growth", "encouragement"].includes(candidate.theme) ? candidate.theme : "encouragement",
    };
    if (accepted) break;
  }
  if (!accepted) return json({ error: "We couldn't create a sufficiently fresh message today. Please try again tomorrow." }, 503);

  const quoteHash = await hash(accepted.quote);
  const { data: saved, error: saveError } = await admin.from("daily_motivations").insert({
    user_id: user.id, local_date: date, quote: accepted.quote,
    theme: accepted.theme, quote_hash: quoteHash, model: "gpt-4o-mini",
  }).select("id,quote,theme,local_date,created_at").single();

  if (saveError) {
    const { data: raced } = await admin.from("daily_motivations")
      .select("id,quote,theme,local_date,created_at")
      .eq("user_id", user.id).eq("local_date", date).maybeSingle();
    if (raced) return json({ motivation: raced, cached: true });
    return json({ error: "Could not save today's message" }, 500);
  }
  return json({ motivation: saved, cached: false });
});
