import fs from "fs";
import path from "path";

const root = process.cwd();
const pages = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full);
      continue;
    }
    if (!ent.name.endsWith(".mdx")) continue;

    const rel = path.relative(root, full).replace(/\\/g, "/");
    const raw = fs.readFileSync(full, "utf8");
    let title = rel.replace(/\.mdx$/, "");
    let description = "";
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const body = fm ? raw.slice(fm[0].length) : raw;

    if (fm) {
      const t = fm[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const d = fm[1].match(/^description:\s*["']?(.+?)["']?\s*$/m);
      if (t) title = t[1].replace(/["']/g, "");
      if (d) description = d[1].replace(/["']/g, "");
    }

    const headings = [...body.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) =>
      m[1].replace(/[#*`]/g, "").trim(),
    );

    const text = body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[#>*_`|\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    let href = `/${rel.replace(/\.mdx$/, "")}`;
    if (href.endsWith("/index")) href = href.slice(0, -6) || "/";
    if (href === "/index") href = "/";

    pages.push({ title, description, headings, text, href, path: rel });
  }
}

walk(root);
pages.sort((a, b) => a.href.localeCompare(b.href));

const payload = {
  generatedAt: new Date().toISOString(),
  pages,
};

// Mintlify serves .js from the content dir; raw .json often 404s.
const js = `window.__RECONAI_SEARCH_INDEX__ = ${JSON.stringify(payload)};\n`;
fs.writeFileSync(path.join(root, "search-data.js"), js, "utf8");

// Keep JSON around for tooling / inspection.
fs.writeFileSync(
  path.join(root, "search-index.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(`indexed ${pages.length} pages → search-data.js`);
