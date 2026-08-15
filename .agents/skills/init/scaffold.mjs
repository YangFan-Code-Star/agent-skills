#!/usr/bin/env node
// 生成项目骨架：把本技能自带的 templates/ 复制到项目根。零依赖。
// 只创建缺失的文件，绝不覆盖已存在的（用户已有的 AGENTS.md / docs / scripts 优先）。
// 单一宿主 DSH：只生成 AGENTS.md + .agents/，不生成任何镜像副本。
// 项目根 = 当前工作目录向上最近的 .git 祖先；没有 .git 就用当前工作目录。
// 可用 --root <目录> 显式指定项目根；--dry-run 只预览不写入；--help 显示用法。
// 用法：node scaffold.mjs [--root <项目根>] [--dry-run] [--help]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

const USAGE = `用法：node scaffold.mjs [--root <项目根>] [--dry-run] [--help]

  --root <目录>   显式指定项目根（默认：最近的 .git 祖先，没有则用当前目录）
  --dry-run       只预览将新建/跳过哪些文件，不写入
  --help          显示本帮助`;

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const KNOWN_FLAGS = new Set(["--root", "--dry-run", "--help", "-h"]);
// 校验参数：--root 的值是合法参数，不能当成未知 flag 拒绝；缺值时也在这里报错
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--root") {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("-")) {
      console.error(`--root 需要一个目录参数\n${USAGE}`);
      process.exit(2);
    }
    i++; // 跳过 --root 的值
    continue;
  }
  if (!KNOWN_FLAGS.has(a)) {
    console.error(`未知参数：${a}\n${USAGE}`);
    process.exit(2);
  }
}

const flagValue = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("-")) {
    console.error(`${flag} 需要一个目录参数\n${USAGE}`);
    process.exit(2);
  }
  return v;
};
const DRY_RUN = argv.includes("--dry-run");
const EXPLICIT_ROOT = flagValue("--root");

function projectRoot(explicit) {
  if (explicit) return resolve(explicit);
  let dir = resolve(process.cwd());
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(process.cwd());
    dir = parent;
  }
}

// 递归收集 templates/ 下的所有相对路径（含点文件）。
function collect(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) collect(full, base, out);
    else out.push(relative(base, full));
  }
  return out;
}

if (!existsSync(TEMPLATES)) {
  console.error(`找不到模板目录：${TEMPLATES}`);
  process.exit(1);
}

const root = projectRoot(EXPLICIT_ROOT);
if (!EXPLICIT_ROOT && resolve(root) !== resolve(process.cwd())) {
  console.warn(`注意：项目根推断为 ${root}（cwd 之上存在 .git）。若非预期，用 --root 显式指定。`);
}
const created = [];
const skipped = [];

for (const rel of collect(TEMPLATES)) {
  const dst = join(root, rel);
  if (existsSync(dst)) { skipped.push(rel); continue; }
  if (DRY_RUN) { created.push(rel); continue; }
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, readFileSync(join(TEMPLATES, rel)));
  created.push(rel);
}

console.log(`项目根：${root}`);
console.log(`模板源：${TEMPLATES}`);
if (DRY_RUN) console.log("\n[dry-run] 预览，未写入任何文件");
console.log(`\n${DRY_RUN ? "将新建" : "新建"} ${created.length} 个文件：`);
for (const f of created.sort()) console.log(`  + ${f}`);
if (skipped.length) {
  console.log(`\n跳过 ${skipped.length} 个已存在文件：`);
  for (const f of skipped.sort()) console.log(`  - ${f}`);
}
