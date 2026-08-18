#!/usr/bin/env node
// 生成轻量骨架：把本包自带的 templates/ 复制到项目根。零依赖。
// 只创建缺失的文件，绝不覆盖已存在的（用户已有的 AGENTS.md / docs / .gitignore 优先）。
// 项目根 = 当前工作目录向上最近的 .git 祖先；没有 .git 就用当前工作目录。
// 可用 --root <目录> 显式指定项目根；--dry-run 只预览不写入；--help 显示用法。
// 用法：node scaffold.mjs [--root <项目根>] [--dry-run] [--help]

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CONTEXT_DEV_VERSION = "0.3.0";

const TEMPLATES = resolve(dirname(fileURLToPath(import.meta.url)), "templates");

// 模板里的 AGENTS.md 带 .tmpl 后缀存放，复制到项目根时剥掉。
// 原因与完整版相同：宿主会递归发现所有 AGENTS.md 并全量注入，模板那份满是
// TODO(init)、开头写着"这个仓库还没初始化"，不能让它污染本仓库的每一轮对话。
const TEMPLATE_SUFFIX = ".tmpl";
const stripTemplateSuffix = (rel) =>
  rel.endsWith(TEMPLATE_SUFFIX) ? rel.slice(0, -TEMPLATE_SUFFIX.length) : rel;

const USAGE = `用法：node scaffold.mjs [--root <项目根>] [--dry-run] [--help]

  --root <目录>  显式指定项目根（默认：最近的 .git 祖先，没有则用当前目录）
  --dry-run      只预览将新建/跳过哪些文件，不写入
  --help         显示本帮助`;

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const KNOWN_FLAGS = new Set(["--root", "--dry-run", "--help", "-h"]);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--root") {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("-")) {
      console.error(`--root 需要一个目录参数\n${USAGE}`);
      process.exit(2);
    }
    i++;
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

// 与完整版同一威胁模型：拒绝项目根本身是符号链接，避免骨架落到用户以为的根之外。
// 祖先路径的符号链接按系统语义跟随（macOS /tmp → /private/tmp 是平台常态）。
function rejectSymlinkRoot(root) {
  try {
    if (lstatSync(root).isSymbolicLink()) {
      console.error(`拒绝把符号链接作为项目根：${root}（确需此目录，请用 --root 指向链接目标的真实路径）`);
      process.exit(1);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
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
const templateFiles = collect(TEMPLATES).map((src) => ({ src, dst: stripTemplateSuffix(src) }));

// 写入前先完整预检，避免遇到符号链接时留下半套骨架。
for (const { dst } of templateFiles) rejectUnsafePath(root, join(root, dst));

for (const { src, dst: rel } of templateFiles) {
  const dst = join(root, rel);
  if (existsSync(dst)) { skipped.push(rel); continue; }
  if (DRY_RUN) { created.push(rel); continue; }
  mkdirSync(dirname(dst), { recursive: true });
  rejectUnsafePath(root, dst);
  writeFileSync(dst, readFileSync(join(TEMPLATES, src)), { flag: "wx" });
  created.push(rel);
}

console.log(`context-dev lite v${CONTEXT_DEV_VERSION}`);
console.log(`项目根：${root}`);
console.log(`模板源：${TEMPLATES}`);
if (DRY_RUN) console.log("\n[dry-run] 预览，未写入任何文件");
console.log(`\n${DRY_RUN ? "将新建" : "新建"} ${created.length} 个文件：`);
for (const f of created.sort()) console.log(`  + ${f}`);
if (skipped.length) {
  console.log(`\n跳过 ${skipped.length} 个已存在文件：`);
  for (const f of skipped.sort()) console.log(`  - ${f}`);
}

const hasSkill = (name) => existsSync(join(root, ".agents", "skills", name, "SKILL.md"));
if (!hasSkill("init") || !hasSkill("maintain")) {
  console.warn(
    "\n目标项目还没挂载轻量技能（init / maintain）。" +
    "若技能已装在宿主全局目录，可忽略本提示；否则先按 lite/README.md 的安装步骤复制技能，否则宿主不会触发 /init。"
  );
}
