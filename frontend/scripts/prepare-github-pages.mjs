import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve("out");
const basePath = "/turkiye";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(entryPath);
      continue;
    }

    if (!entry.name.endsWith(".css")) continue;

    const source = await readFile(entryPath, "utf8");
    const rewritten = source.replace(
      /url\((['"]?)(\/(?:fonts|images)\/)/g,
      (_match, quote, assetPath) => `url(${quote}${basePath}${assetPath}`,
    );

    if (rewritten !== source) {
      await writeFile(entryPath, rewritten);
    }
  }
}

await walk(outputDirectory);
