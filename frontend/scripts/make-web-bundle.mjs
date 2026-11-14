/**
 * يبني حزمة تحديث الويب (OTA) التي يحمّلها تطبيق الجوال تلقائياً.
 *
 *   npm run bundle
 *
 * المخرجات:
 *   backend/updates/web-<version>.zip   حزمة الويب (index.html في الجذر)
 *   backend/updates/latest.json         بيان آخر نسخة (version/file/checksum/size)
 *
 * يعتمد على zlib فقط لكتابة ملف ZIP قياسياً (بلا مكتبات خارجية)، لأن
 * CapacitorUpdater يفكّ الضغط بـ ZipInputStream ويتطلب مسارات UNIX ووجود
 * index.html في جذر الحزمة.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(frontendDir, "..");
const distDir = join(frontendDir, "dist");
const updatesDir = join(repoRoot, "backend", "updates");
const KEEP_BUNDLES = 3;

// ---------- CRC32 (مطلوب في صيغة ZIP) ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- جمع الملفات ----------
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === "dev") continue; // مخرجات خادم التطوير لا تُنشر
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, files);
    else files.push({ full, rel: relative(distDir, full).split(sep).join("/") });
  }
  return files;
}

// ---------- كتابة ZIP ----------
const DOS_TIME = 0;
const DOS_DATE = 33; // 1980-01-01 — ثابت ليكون الناتج قابلاً للتكرار

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.rel, "utf8");
    const raw = readFileSync(entry.full);
    const compressed = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // أسماء UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0x81a40000 >>> 0, 38); // external attrs (0644)
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, end]);
}

// ---------- التنفيذ ----------
const versionFile = join(repoRoot, "VERSION.txt");
if (!existsSync(versionFile)) {
  console.error("❌ لم يُعثر على VERSION.txt في جذر المشروع");
  process.exit(1);
}
const version = readFileSync(versionFile, "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`❌ رقم نسخة غير صالح في VERSION.txt: "${version}" (المطلوب مثل 1.0.12)`);
  process.exit(1);
}

if (!existsSync(join(distDir, "index.html"))) {
  console.error("❌ مجلد dist غير موجود أو ناقص — شغّل `npm run build` أولاً.");
  process.exit(1);
}

const files = walk(distDir).sort((a, b) => (a.rel < b.rel ? -1 : 1));
if (!files.some((f) => f.rel === "index.html")) {
  console.error("❌ يجب أن تحتوي الحزمة index.html في الجذر.");
  process.exit(1);
}

const zip = buildZip(files);
const checksum = createHash("sha256").update(zip).digest("hex");
const filename = `web-${version}.zip`;

mkdirSync(updatesDir, { recursive: true });
writeFileSync(join(updatesDir, filename), zip);

const manifest = {
  version,
  file: filename,
  checksum,
  size: zip.length,
  files: files.length,
  built_at: new Date().toISOString(),
};
writeFileSync(join(updatesDir, "latest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

// إبقاء آخر نسخ محدودة فقط (مع عدم حذف الحزمة الحالية أبداً)
const bundles = readdirSync(updatesDir)
  .filter((n) => /^web-.*\.zip$/.test(n))
  .sort()
  .reverse();
for (const old of bundles.slice(KEEP_BUNDLES)) {
  if (old === filename) continue;
  rmSync(join(updatesDir, old), { force: true });
  console.log(`🗑️  حُذفت حزمة قديمة: ${old}`);
}

console.log(`✅ حزمة التحديث: ${filename}`);
console.log(`   الملفات: ${files.length} · الحجم: ${(zip.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`   SHA-256: ${checksum}`);
console.log(`   البيان: backend/updates/latest.json (version ${version})`);
