import { describe, it, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CLI_ROOT = join(import.meta.dir, "..", "..");
const PKG_PATH = join(CLI_ROOT, "package.json");

describe("cli/package.json — criterion 2", () => {
  const pkgExists = existsSync(PKG_PATH);

  it("cli/package.json exists", () => {
    expect(pkgExists).toBe(true);
  });

  if (!pkgExists) return;

  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8")) as Record<string, any>;

  it('declares name "dynos-work-cli"', () => {
    expect(pkg.name).toBe("dynos-work-cli");
  });

  it('declares type "module"', () => {
    expect(pkg.type).toBe("module");
  });

  it('declares bin entry {"dynos-work-cli": "./dist/index.js"}', () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["dynos-work-cli"]).toBe("./dist/index.js");
  });

  it("declares a build script using bun build src/index.ts --outdir dist --target node", () => {
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.build).toContain("bun build");
    expect(pkg.scripts.build).toContain("src/index.ts");
    expect(pkg.scripts.build).toContain("--outdir dist");
    expect(pkg.scripts.build).toContain("--target node");
  });

  it.each(["commander", "chalk", "ora", "prompts"])(
    "declares runtime dependency %s",
    (dep) => {
      expect(pkg.dependencies).toBeDefined();
      expect(pkg.dependencies[dep]).toBeDefined();
    },
  );

  it.each(["@types/bun", "@types/node", "@types/prompts", "typescript"])(
    "declares devDependency %s",
    (dep) => {
      expect(pkg.devDependencies).toBeDefined();
      expect(pkg.devDependencies[dep]).toBeDefined();
    },
  );

  it('files field ships "dist" and "assets"', () => {
    expect(Array.isArray(pkg.files)).toBe(true);
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("assets");
  });
});
