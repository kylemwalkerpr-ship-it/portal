#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

config({ path: resolve("/Users/phantomdarne/Documents/GitHub/yousafe-portal/.env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DIR = "/Users/phantomdarne/YouSafe/cos-continuity-2026-09-07/07-gig-catalog-draft";
const local = JSON.parse(readFileSync("/tmp/yousafe-covers/covers-local-manifest.json", "utf8"));

const PRIORITY_ONLY = (process.env.PRIORITY_ONLY || "").split(",").map(s => s.trim()).filter(Boolean);


const SKIP = new Set(["kyle g walker", "mr youssef hammoud", "youssef hammoud"]);
function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

let uploaded = 0, db_updated = 0, failures = [];
const rows = [];

for (let i = 0; i < local.results.length; i++) {
  const r = local.results[i];
  if (SKIP.has(norm(r.provider_name))) continue;
  if (PRIORITY_ONLY.length && !PRIORITY_ONLY.includes(r.gig_id) && !PRIORITY_ONLY.includes(r.provider_id)) continue;
  const filePath = r.local_path;
  if (!existsSync(filePath)) {
    failures.push({ gig_id: r.gig_id, error: "missing local file" });
    continue;
  }
  const buf = readFileSync(filePath);
  const id = randomUUID();
  const name = `${id}-fiverr-style-cover.webp`;
  const path = `${r.provider_id}/${r.gig_id}/${name}`;

  try {
    const up = await sb.storage.from("gig-gallery").upload(path, buf, {
      contentType: "image/webp",
      upsert: true,
    });
    if (up.error) throw new Error(up.error.message);
    const { data: pub } = sb.storage.from("gig-gallery").getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) throw new Error("no public url");
    uploaded++;

    // fetch existing gallery
    const { data: gig, error: ge } = await sb.from("gigs").select("gallery_images,status,is_hidden").eq("id", r.gig_id).single();
    if (ge) throw new Error(ge.message);
    // allow draft+hidden (staged catalog) OR active (live marketplace, e.g. Sai)
    const okDraft = gig.status === "draft" && gig.is_hidden === true;
    const okActive = gig.status === "active";
    if (!okDraft && !okActive) {
      failures.push({ gig_id: r.gig_id, error: `unexpected status ${gig.status} hidden=${gig.is_hidden}` });
      continue;
    }
    let gallery = Array.isArray(gig.gallery_images) ? [...gig.gallery_images] : [];
    // remove prior fiverr-style covers if re-run
    gallery = gallery.filter((img) => {
      const n = (img && (img.name || img.path || img.url)) || "";
      return !String(n).includes("fiverr-style-cover");
    });
    const image = { id, url: publicUrl, path, name, size: buf.length };
    // cover first; keep any remaining yousafe assets after
    const next = [image, ...gallery].slice(0, 3);
    const { error: ue } = await sb.from("gigs").update({
      gallery_images: next,
      cover_image_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", r.gig_id);
    if (ue) {
      // retry without cover_image_url
      if (/cover_image_url/i.test(ue.message || "")) {
        const { error: ue2 } = await sb.from("gigs").update({
          gallery_images: next,
          updated_at: new Date().toISOString(),
        }).eq("id", r.gig_id);
        if (ue2) throw new Error(ue2.message);
      } else {
        throw new Error(ue.message);
      }
    }
    db_updated++;
    rows.push({
      gig_id: r.gig_id,
      provider_id: r.provider_id,
      provider_name: r.provider_name,
      category: r.category,
      title: r.title,
      display_title: r.display_title,
      chip: r.chip,
      monogram: r.monogram,
      stock: r.stock,
      path,
      url: publicUrl,
      size: buf.length,
      status: "ok",
    });
  } catch (e) {
    failures.push({ gig_id: r.gig_id, error: String(e.message || e) });
    rows.push({
      gig_id: r.gig_id,
      provider_id: r.provider_id,
      provider_name: r.provider_name,
      category: r.category,
      title: r.title,
      status: "fail",
      error: String(e.message || e),
    });
  }
  if ((i + 1) % 25 === 0) console.log(`progress ${i + 1}/${local.results.length} uploaded=${uploaded} db=${db_updated} fail=${failures.length}`);
}

const summary = {
  covers_created: local.covers_created,
  uploaded,
  db_updated,
  monogram_fallback_count: local.monogram_fallback_count,
  stock_count: local.stock_count,
  failures,
};

writeFileSync("/tmp/yousafe-covers/upload-summary.json", JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
