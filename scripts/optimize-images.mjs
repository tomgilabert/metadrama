// scripts/optimize-images.mjs
// Post-build: optimiza imágenes de public/uploads/ con sharp.
// Genera variantes AVIF + WebP en múltiples anchos y reescribe el HTML
// para servirlas con <picture> + srcset responsive.
//
// Preserva el workflow de Decap CMS (imágenes en public/uploads/, referencias
// absolutas /uploads/x.png en Markdown). No toca los archivos fuente.

import sharp from "sharp";
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const UPLOADS = join(DIST, "uploads");

// Anchos responsive. Si la imagen original es más pequeña, no se amplía.
const WIDTHS = [480, 768, 1024, 1600];
const QUALITY = { avif: 55, webp: 72 };
const AVIF_EFFORT = 0; // 0=rápido, 4=equilibrado, 8=máxima compresión
const SKIP_EXT = new Set([".pdf", ".svg", ".gif"]);
const CONCURRENCY = 6; // imágenes procesadas en paralelo
// sizes hint: coincide con --max-width del CSS (740px) y full-width en móvil.
const SIZES = "(max-width: 768px) 100vw, 740px";

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

// hash simple para nombre de variante determinista
function variantName(originalBase, w, fmt) {
  return `${originalBase}-${w}w.${fmt}`;
}

async function optimizeImage(file) {
  const ext = extname(file).toLowerCase();
  if (SKIP_EXT.has(ext)) return null;

  const base = basename(file, ext);
  const dir = dirname(file);
  const srcUrl = `/uploads/${base}${ext}`;

  try {
    const buf = await readFile(file);
    const img = sharp(buf, { animated: true });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;

    const ow = meta.width;
    const oh = meta.height;

    // Anchos a generar (sin ampliar)
    const targetWidths = [...new Set([...WIDTHS, ow])]
      .filter((w) => w <= ow)
      .sort((a, b) => a - b);

    const variants = [];

    for (const w of targetWidths) {
      for (const fmt of ["avif", "webp"]) {
        const outFile = join(dir, variantName(base, w, fmt));

        // cache simple: saltar si ya existe y es más reciente que el original
        if (existsSync(outFile)) {
          const [srcStat, outStat] = await Promise.all([
            stat(file),
            stat(outFile),
          ]);
          if (outStat.mtimeMs >= srcStat.mtimeMs) {
            variants.push({ w, fmt, url: `/uploads/${variantName(base, w, fmt)}` });
            continue;
          }
        }

        await img
          .clone()
          .resize({ width: w, withoutEnlargement: true })
          .toFormat(fmt, {
            quality: QUALITY[fmt],
            ...(fmt === "avif" ? { effort: AVIF_EFFORT } : {}),
          })
          .toFile(outFile);

        variants.push({ w, fmt, url: `/uploads/${variantName(base, w, fmt)}` });
      }
    }

    return { srcUrl, ow, oh, origExt: ext, variants };
  } catch (e) {
    console.warn(`  ! ${relative(ROOT, file)}: ${e.message}`);
    return null;
  }
}

function buildPicture(info, altText, extraAttrs) {
  const { srcUrl, ow, oh, variants } = info;

  const avifSet = variants
    .filter((v) => v.fmt === "avif")
    .map((v) => `${v.url} ${v.w}w`)
    .join(", ");
  const webpSet = variants
    .filter((v) => v.fmt === "webp")
    .map((v) => `${v.url} ${v.w}w`)
    .join(", ");

  const sources = [];
  if (avifSet) {
    sources.push(
      `<source type="image/avif" srcset="${avifSet}" sizes="${SIZES}">`,
    );
  }
  if (webpSet) {
    sources.push(
      `<source type="image/webp" srcset="${webpSet}" sizes="${SIZES}">`,
    );
  }

  return `<picture>${sources.join("")}<img src="${srcUrl}" width="${ow}" height="${oh}" loading="lazy" decoding="async" sizes="${SIZES}"${extraAttrs ? " " + extraAttrs : ""}${altText ? ` alt="${altText}"` : ""}></picture>`;
}

async function rewriteHtml(file, imageMap) {
  let html = await readFile(file, "utf8");
  let changed = false;

  // Captura <img src="/uploads/..."> con atributos opcionales (incl. alt)
  const imgRegex =
    /<img\s+([^>]*?)src="(\/uploads\/[^"]+)"([^>]*)?\/?>/g;

  html = html.replace(imgRegex, (match, before, src, after) => {
    const info = imageMap.get(src);
    if (!info) return match;

    // Extraer alt del original
    const altMatch = (before + " " + (after || "")).match(/\balt="([^"]*)"/);
    const alt = altMatch ? altMatch[1] : "";

    // Conservar class/style si los había
    const cls = (before + " " + (after || "")).match(/\bclass="([^"]*)"/);
    const style = (before + " " + (after || "")).match(/\bstyle="([^"]*)"/);
    let extra = "";
    if (cls) extra += `class="${cls[1]}" `;
    if (style) extra += `style="${style[1]}" `;

    changed = true;
    return buildPicture(info, alt, extra.trim());
  });

  if (changed) {
    await writeFile(file, html, "utf8");
    return true;
  }
  return false;
}

async function main() {
  if (!existsSync(UPLOADS)) {
    console.log("[optimize] dist/uploads/ no existe, nada que hacer.");
    return;
  }

  console.log("[optimize] Escaneando imágenes en dist/uploads/...");
  const files = (await walk(UPLOADS)).filter((f) => {
    const ext = extname(f).toLowerCase();
    return !SKIP_EXT.has(ext);
  });
  console.log(`[optimize] ${files.length} imágenes candidatas.`);

  const imageMap = new Map();
  let totalOrigSize = 0;
  let totalOptSize = 0;

  // Pre-calcular tamaños originales
  for (const f of files) {
    const srcStat = await stat(f);
    totalOrigSize += srcStat.size;
  }

  // Procesar en paralelo con límite de concurrencia
  const queue = [...files];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      if (!f) break;
      const info = await optimizeImage(f);
      if (info) {
        imageMap.set(info.srcUrl, info);
        const dir = dirname(f);
        for (const v of info.variants) {
          const vFile = join(dir, basename(v.url));
          if (existsSync(vFile)) {
            totalOptSize += (await stat(vFile)).size;
          }
        }
      }
      done++;
      if (done % 10 === 0 || done === files.length) {
        process.stdout.write(`\r[optimize] ${done}/${files.length} imágenes...`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write("\n");
  console.log(`[optimize] ${imageMap.size} imágenes procesadas.`);
  console.log(
    `[optimize] Tamaño original total: ${(totalOrigSize / 1024 / 1024).toFixed(2)} MB`,
  );
  console.log(
    `[optimize] Tamaño variantes optimizadas: ${(totalOptSize / 1024 / 1024).toFixed(2)} MB`,
  );

  // Reescribir HTML
  console.log("[optimize] Reescribiendo HTML con <picture>...");
  const htmlFiles = (await walk(DIST)).filter((f) => f.endsWith(".html"));
  let htmlChanged = 0;
  for (const h of htmlFiles) {
    const did = await rewriteHtml(h, imageMap);
    if (did) htmlChanged++;
  }
  console.log(
    `[optimize] ${htmlChanged}/${htmlFiles.length} archivos HTML actualizados.`,
  );

  console.log("[optimize] ✓ Listo.");
}

main().catch((e) => {
  console.error("[optimize] ERROR:", e);
  process.exit(1);
});
