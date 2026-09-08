const { createClient } = require("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
function awkward(title) {
  const t = (title || "").toLowerCase().replace(/\s+/g, " ").trim();
  const words = t.split(" ");
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 2) return "repeat:" + words[i];
  }
  if (/consult strategy consult/.test(t)) return "consult strategy consult";
  if (/\bconsult\b.*\bconsult\b/.test(t)) return "consultx2";
  if (/\b(review review|strategy strategy|assessment assessment|visa visa)\b/.test(t)) return "dup phrase";
  for (let i = 0; i < words.length - 3; i++) {
    const a = words[i] + " " + words[i + 1];
    const b = words[i + 2] + " " + words[i + 3];
    if (a === b && a.length > 5) return "bigram:" + a;
  }
  return null;
}
(async () => {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("gigs").select("id, slug, title, status, provider_id").range(from, from + 999);
    if (error) { console.error(JSON.stringify(error)); process.exit(1); }
    all = all.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const byStatus = {};
  for (const g of all) byStatus[g.status] = (byStatus[g.status] || 0) + 1;
  console.log(JSON.stringify({ total: all.length, byStatus }));
  const bad = all.filter((g) => awkward(g.title)).map((g) => ({
    reason: awkward(g.title),
    status: g.status,
    title: g.title,
    slug: g.slug,
    id: g.id,
  }));
  console.log(JSON.stringify({ awkwardCount: bad.length, bad }, null, 2));
})();
