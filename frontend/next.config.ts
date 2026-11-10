import type { NextConfig } from "next";

// خادم التطوير يكتب ملفاته المؤقتة (كاش Turbopack + خرائط الشيفرة) في نفس مجلد
// المخرجات الإنتاجية "dist" — وهو المجلد الذي ينسخه Capacitor داخل ملف APK،
// فيتضخّم حجم التطبيق من ‎4.5MB إلى ‎35MB بلا فائدة. لذلك نفصل مخرجات
// التطوير في ".next-dev" ونُبقي "dist" للإنتاج فقط.
const isDevServer =
  process.env.NODE_ENV === "development" ||
  process.argv.includes("dev") ||
  process.env.NEXT_DIST_DIR === "dev";

const nextConfig: NextConfig = {
  output: "export",
  distDir: isDevServer ? ".next-dev" : "dist",
  allowedDevOrigins: ["localhost", "10.157.62.187"],
};

export default nextConfig;
