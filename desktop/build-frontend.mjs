// Copies the web page in ../app into ./dist for the desktop app.
// In the app, the page may talk only to the app itself. The app's Rust side
// makes the Planning Center requests, so the page needs no network access.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(here, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "examples"), { recursive: true });
for (const f of ["index.html", "app.css", "core.js", "app.js"]) {
  cpSync(join(root, "app", f), join(dist, f));
}
// How-to pictures and videos; the page hides any that are missing.
if (existsSync(join(root, "app", "media"))) {
  cpSync(join(root, "app", "media"), join(dist, "media"), { recursive: true });
}
cpSync(join(root, "examples", "sample_songs_export.csv"), join(dist, "examples", "sample_songs_export.csv"));

const page = join(dist, "index.html");
const html = readFileSync(page, "utf8");
const desktop = html.replace(
  "connect-src 'self' https://api.planningcenteronline.com",
  "connect-src 'self' ipc: http://ipc.localhost");
if (desktop === html) throw new Error("Couldn't find the connect-src rule in app/index.html");
writeFileSync(page, desktop);
console.log("Desktop page ready in", dist);
