#!/usr/bin/env node
// 生成项目骨架：把本技能自带的 templates/ 复制到项目根。零依赖。
// 只创建缺失的文件，绝不覆盖已存在的（用户已有的 AGENTS.md / docs / scripts 优先）。
// 单一宿主 DSH：只生成 AGENTS.md + .agents/，不生成任何镜像副本。
// 项目根 = 当前工作目录向上最近的 .git 祖先；没有 .git 就用当前工作目录。
// 可用 --root <目录> 显式指定项目根；--dry-run 只预览不写入；--help 显示用法。
// 用法：node scaffold.mjs [--root <项目根>] [--dry-run] [--help]

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

function rejectUnsafePath(root, target) {
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    console.error(`拒绝写入项目根之外：${target}`);
    process.exit(1);
  }
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        console.error(`拒绝写入符号链接路径：${relative(root, current)}`);
        process.exit(1);
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
}

// 项目根本身不能是符号链接：rejectUnsafePath 只检查根内部的组件，若 --root（或推断
// 出的根）本身是链接，写入会整体落到链接目标——实测会让 12 个骨架文件出现在用户
// 以为的"项目根"之外。拒绝而不是跟随，与仓库内符号链接的处理方式一致。
// 只检查根节点自身，不检查祖先路径：macOS 的 /tmp → /private/tmp 这类平台常态若
// 一并拒绝会大量误伤；祖先链接按系统语义跟随，写入仍物理落在用户指定的真实目录内。
function rejectSymlinkRoot(root) {
  try {
    if (lstatSync(root).isSymbolicLink()) {
      console.error(`拒绝把符号链接作为项目根：${root}（确需此目录，请用 --root 指向链接目标的真实路径）`);
      process.exit(1);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return; // 根尚不存在，mkdirSync 会创建它
    throw error;
  }
}

if (!existsSync(TEMPLATES)) {
  console.error(`找不到模板目录：${TEMPLATES}`);
  process.exit(1);
}

const root = projectRoot(EXPLICIT_ROOT);
if (!EXPLICIT_ROOT && resolve(root) !== resolve(process.cwd())) {
  console.warn(`注意：项目根推断为 ${root}（cwd 之上存在 .git）。若非预期，用 --root 显式指定。`);
}
rejectSymlinkRoot(root);
const created = [];
const skipped = [];
const templateFiles = collect(TEMPLATES);

// 威胁模型：路径与符号链接检查是防止"仓库内被放了链接"或"--root 传错/被换成链接"
// 的最佳努力防线（对本地单用户场景足够），不是对抗并发修改的安全边界——检查与写入
// 之间存在极窄的 TOCTOU 窗口；跨平台的原子方案（openat/AT_SYMLINK_NOFOLLOW 等）代价
// 过高，明确不承诺。实际覆盖的行为边界由 tests/context-scripts.test.mjs 验证。
// 写入前先完整预检，避免遇到符号链接时留下半套骨架。
for (const rel of templateFiles) rejectUnsafePath(root, join(root, rel));

for (const rel of templateFiles) {
  const dst = join(root, rel);
  if (existsSync(dst)) { skipped.push(rel); continue; }
  if (DRY_RUN) { created.push(rel); continue; }
  mkdirSync(dirname(dst), { recursive: true });
  rejectUnsafePath(root, dst);
  writeFileSync(dst, readFileSync(join(TEMPLATES, rel)), { flag: "wx" });
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
