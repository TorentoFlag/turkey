import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputs = path.join(root, "public/images/home-canvas");
await mkdir(outputs, { recursive: true });

const canvasSources = [
  "istanbul-fog.jpg",
  "perge-ruins.jpg",
  "kas-coast.jpg",
  "cappadocia-dawn.jpg",
  "istanbul-modern.jpg",
  "ankara-alley.jpg",
  "spice-bazaar.jpg",
  "bosphorus-ferry.jpg",
  "aegean-bodrum.jpg",
  "travertine-texture.jpg",
];

const hotelSources = [
  "bodrum-amanruya.avif",
  "cappadocia-cave-hotel.avif",
  "istanbul-legacy-hotel.avif",
];

for (const file of canvasSources) {
  await sharp(path.join(root, "public/images", file))
    .resize({ width: 1800, height: 1200, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(outputs, file.replace(/\.jpg$/, ".webp")));
}

for (const file of hotelSources) {
  await sharp(path.join(root, "public/images/home-sources", file))
    .resize({ width: 1800, height: 1200, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(outputs, file.replace(/\.avif$/, ".webp")));
}

for (const name of ["arrival-kit", "bosphorus-kit"]) {
  await sharp(path.join(root, `public/images/home-kits/${name}-source.png`))
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(path.join(root, `public/images/home-kits/${name}.webp`));
}
