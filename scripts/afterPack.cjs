const fs = require("fs/promises");
const path = require("path");

module.exports = async function afterPack(ctx) {
  const appDir = ctx.appOutDir;

  // 1) Keep only en-US locale
  try {
    const loc = path.join(appDir, "locales");
    const keep = new Set(["en-US.pak"]);
    for (const f of await fs.readdir(loc)) {
      if (!keep.has(f)) await fs.rm(path.join(loc, f), { force: true });
    }
  } catch {
    // locales folder may not exist in some builds
  }

  // 2) Remove SwiftShader software GL fallback
  //    Cuts ~7–10 MB but on rare systems without GPU you lose rendering.
  // await fs.rm(path.join(appDir, 'swiftshader'), { recursive: true, force: true });

  // 3) Remove PDF viewer
  await fs.rm(path.join(appDir, "pdf_viewer_resources.pak"), { force: true });
  await fs.rm(path.join(appDir, "resources", "pdf.dll"), { force: true });
};
