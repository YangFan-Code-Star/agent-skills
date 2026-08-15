#!/usr/bin/env node
// 上下文文件体检。零依赖，只做确定性检查。
// 能被脚本判定的事就不要写成让模型自己判断的散文。
// 用法：node scripts/audit-context.mjs [--root <项目根>] [--help]
// 默认 ROOT 由脚本自身位置推导（scripts/..）；--root 供框架仓库自检等场景覆盖。

import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// 生成物带版本号：scaffold 原样复制本文件，项目里的这一份不会随框架自动更新。
// 想升级：node <技能目录>/scaffold.mjs --update-framework
const CONTEXT_DEV_VERSION = "0.3.0";

const USAGE = `用法：node scripts/audit-context.mjs [--root <项目根>] [--help]

  --root <目录>  显式指定体检的根目录（默认：脚本所在位置的上一级）
  --help         显示本帮助`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const KNOWN_FLAGS = new Set(["--root", "--help", "-h"]);
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
const rootFlagIdx = argv.indexOf("--root");
const ROOT = rootFlagIdx === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), "..")
  : resolve(argv[rootFlagIdx + 1]);

// AGENTS.md 每次对话都全量加载，字节上限是保持精简的自律标杆，超出就该往 docs/ 搬。
// 行数是主尺（根目录一份 AGENTS.md），字节是备尺（根目录所有 AGENTS 文件合计），
// 抓"行数不多但每行很密"的写作。17 KiB 的标定逻辑见 README「设计取舍」；
// 备尺对稀疏散文保持沉默是设计意图，不是需要修的死分支。
const AGENTS_BYTE_CAP = 17 * 1024;
const AGENTS_BYTE_LABEL = `${AGENTS_BYTE_CAP / 1024} KiB`;
const AGENTS_LINE_TARGET = 150;
const SKILL_BODY_LINE_CAP = 500;
const STALE_DAYS = 60;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage",
  ".next", ".venv", "venv", "__pycache__", ".pytest_cache", "target", "vendor",
]);

// Windows 上的编辑器和 PowerShell 常写出带 BOM 的 UTF-8，不剥掉会让 ^--- 匹配不上 frontmatter
const read = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "");

// 技能自带的 templates/ 里，AGENTS.md 以 .tmpl 后缀存放（宿主会递归注入所有 AGENTS.md，
// 模板那份满是 TODO(init)，不能让它污染真实项目）。体检要把它当 markdown / 当 AGENTS 看待，
// 否则以 templates/ 为根自检时会误报"根目录缺少 AGENTS.md"。
const isMarkdown = (f) => f.endsWith(".md") || f.endsWith(".md.tmpl");
const AGENTS_RE = /(^|[\\/])AGENTS(\.override)?\.md(\.tmpl)?$/;

const errors = [];
const warnings = [];
const notes = [];

const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const rel = (p) => relative(ROOT, p).split(sep).join("/");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".agents" && e.name !== ".gitignore") continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(ROOT);
const mdFiles = allFiles.filter(isMarkdown);

// ---------------------------------------------------------------- AGENTS.md

const agentsFiles = allFiles.filter((f) => AGENTS_RE.test(f));
const rootAgents = agentsFiles.find((f) => rel(f) === "AGENTS.md" || rel(f) === "AGENTS.md.tmpl");

if (!rootAgents) {
  err("根目录缺少 AGENTS.md，宿主将没有任何项目级指令");
} else {
  const root = rootAgents;
  const text = read(root);
  const lines = text.split(/\r?\n/).length;
  if (lines > 250) err(`AGENTS.md ${lines} 行，严重超标（目标 ${AGENTS_LINE_TARGET} 行），必须往 docs/ 搬`);
  else if (lines > AGENTS_LINE_TARGET) warn(`AGENTS.md ${lines} 行，超过 ${AGENTS_LINE_TARGET} 行目标，考虑往 docs/ 搬`);

  // 只累计根目录的 AGENTS.md / AGENTS.override.md，子目录的 override 只在 cwd 落在那个目录时加载。
  const totalBytes = agentsFiles
    .filter((f) => dirname(rel(f)) === ".")
    .reduce((n, f) => n + statSync(f).size, 0);
  const pct = Math.round((totalBytes / AGENTS_BYTE_CAP) * 100);
  if (totalBytes > AGENTS_BYTE_CAP) {
    err(`AGENTS.md 合计 ${totalBytes} 字节，超过 ${AGENTS_BYTE_CAP} 字节自律上限，应往 docs/ 搬`);
  } else if (pct > 75) {
    warn(`所有 AGENTS.md 合计 ${totalBytes} 字节，已用掉 ${AGENTS_BYTE_LABEL} 自律预算的 ${pct}%`);
  } else {
    notes.push(`AGENTS.md 合计 ${totalBytes} 字节，占 ${AGENTS_BYTE_LABEL} 自律预算的 ${pct}%`);
  }
}

// ------------------------------------------------------- TODO(init) 残留

// 只扫真正会放占位符的地方。技能文档和 README 会大量「提到」这个标记本身，
// 把它们算进来会让计数永远归不了零。TODO(init) 现在是 warning 而非硬错误：
// 完整初始化要求归零；轻量初始化会有意保留「轻量初始化未覆盖」的 TODO(init)，
// 由 /ship-change 按需补齐——但必须一直出现在 warning 里，不能被忘记。
// 轻量欠账单独计数：它和「完整初始化还没做完」是两种状态，混在一起会让真正的
// TODO 永远被黄灯淹没，也让轻量档用户无法一眼看出欠账还剩多少。
const isPlaceholderHost = (f) => {
  const r = rel(f);
  return r === "AGENTS.md" || r === "AGENTS.md.tmpl" || r.startsWith("docs/") || r.startsWith(".agents/evals/");
};

const markerRe = /TODO\(init\)/g;
const liteMarkerRe = /TODO\(init\): 轻量初始化未覆盖/g;
let markerTotal = 0;
let liteMarkerTotal = 0;
for (const f of mdFiles.filter(isPlaceholderHost)) {
  const text = read(f);
  const hits = (text.match(markerRe) || []).length;
  const liteHits = (text.match(liteMarkerRe) || []).length;
  if (hits > 0) {
    markerTotal += hits;
    liteMarkerTotal += liteHits;
    if (liteHits === hits) {
      warn(`TODO(init) 轻量欠账：${rel(f)}：${hits} 处（由 /ship-change 按需补齐）`);
    } else if (liteHits > 0) {
      warn(`TODO(init) 残留：${rel(f)}：${hits} 处（其中轻量欠账 ${liteHits} 处）`);
    } else {
      warn(`TODO(init) 残留：${rel(f)}：${hits} 处`);
    }
  }
}
if (markerTotal > 0) {
  if (liteMarkerTotal === markerTotal) {
    warn(`共 ${markerTotal} 处 TODO(init) 为轻量初始化欠账（由 /ship-change 按需补齐）`);
  } else {
    const liteNote = liteMarkerTotal > 0 ? `；其中轻量欠账 ${liteMarkerTotal} 处，由 /ship-change 按需补齐` : "";
    warn(`共 ${markerTotal} 处 TODO(init) 未填充（完整初始化应归零${liteNote}）`);
  }
}

// ------------------------------------------------------------------ 链接有效性

// 代码块里的链接是示例，不该当成真链接检查。
// 两个层次分开：技能引用按惯例写成 `$name`，剥掉行内代码会让那个检查空转。
const stripFences = (text) => text.replace(/^```[\s\S]*?^```/gm, "");
const stripCode = (text) => stripFences(text).replace(/`[^`\n]*`/g, "");

const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const f of mdFiles) {
  const text = stripCode(read(f));
  for (const m of text.matchAll(linkRe)) {
    const target = m[1];
    if (/^([a-z]+:|#|\/\/)/i.test(target)) continue;
    // 解码失败（如链接里带非法 % 转义）只跳过这一条，不能让它弄崩整个体检
    let clean;
    try {
      clean = decodeURI(target.split("#")[0]);
    } catch {
      continue;
    }
    if (!clean) continue;
    if (!existsSync(resolve(dirname(f), clean))) {
      err(`${rel(f)} 链接指向不存在的路径：${target}`);
    }
  }
}

// ---------------------------------------------------------------------- 技能

const skillsDir = join(ROOT, ".agents", "skills");
const skillDirs = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
if (!existsSync(skillsDir)) {
  warn("没有 .agents/skills/ 目录，宿主不会加载任何项目级技能（技能也可能装在宿主的全局技能目录）");
} else {
  if (skillDirs.length === 0) warn(".agents/skills/ 是空的");

  for (const name of skillDirs) {
    const file = join(skillsDir, name, "SKILL.md");
    if (!existsSync(file)) {
      err(`.agents/skills/${name}/ 缺少 SKILL.md，这个技能不会被加载`);
      continue;
    }
    const text = read(file);
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) {
      err(`${rel(file)} 缺少 YAML frontmatter，必须含 name 和 description`);
      continue;
    }
    const body = text.slice(fm[0].length);
    const declaredName = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const description = fm[1].match(/^description:\s*([\s\S]*?)(?=\r?\n[a-zA-Z_-]+:|(?![\s\S]))/m)?.[1]?.trim();

    if (!declaredName) err(`${rel(file)} frontmatter 缺少 name`);
    else if (declaredName !== name) err(`${rel(file)} 的 name «${declaredName}» 与目录名 «${name}» 不一致`);

    if (!description) {
      err(`${rel(file)} frontmatter 缺少 description，宿主将永远不会触发这个技能`);
    } else if (description.length < 40) {
      warn(`${rel(file)} 的 description 只有 ${description.length} 字，模型可能判断不出何时该用它`);
    }

    const bodyLines = body.split(/\r?\n/).length;
    if (bodyLines > SKILL_BODY_LINE_CAP) {
      warn(`${rel(file)} 正文 ${bodyLines} 行，超过 ${SKILL_BODY_LINE_CAP} 行，考虑拆到 references/`);
    }
  }
}

// ------------------------------------------------------------------ .gitignore

const gitignorePath = join(ROOT, ".gitignore");
if (!existsSync(gitignorePath)) {
  warn("缺少 .gitignore");
} else {
  const giLines = read(gitignorePath).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ignored = (p) => giLines.some((l) => [p, `${p}/`, `/${p}`, `/${p}/`].includes(l));

  for (const p of [".env", "node_modules"]) {
    if (!ignored(p)) warn(`.gitignore 里没有忽略 ${p}`);
  }

  // 只对仓库里真实存在的产物报警，避免对用不上的技术栈刷屏。
  // 「生成的代码」是最常漏的一类——它看起来像源码，但不该提交。
  const ARTIFACTS = [
    "node_modules", ".next", "dist", "build", "out", "coverage", "target",
    "__pycache__", ".venv", "venv", ".pytest_cache", "src/generated", "next-env.d.ts",
  ];
  for (const a of ARTIFACTS) {
    if (existsSync(join(ROOT, a)) && !ignored(a)) {
      warn(`${a} 存在但没被 .gitignore 忽略——构建产物和生成的代码不该进仓库`);
    }
  }
}

// ------------------------------------------------------------------ 文档时效性

// 时间基准用 git 提交时间，不用 mtime：git 不保存 mtime，克隆 / CI / 换机器之后所有文件的
// mtime 都是同一个 checkout 时间，两个时效性检查会永久静默通过——正是本框架最忌讳的
// "安静地说谎"，还偏偏发生在专门抓它的检查里。没有 git、文件未跟踪或有未提交改动时才回退
// 到 mtime（未提交的写入 git log 看不见，纯 git 会把刚转过的闭环误报成"从没转"）。
const gitOut = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const HAS_GIT = gitOut(["rev-parse", "--is-inside-work-tree"]) === "true";

const mtimeOf = (p) => statSync(p).mtimeMs;

// tracked & clean → 提交时间；dirty / untracked / 无 git → mtime。
function lastChangeMs(p) {
  if (!HAS_GIT) return mtimeOf(p);
  const spec = rel(p);
  const dirty = gitOut(["status", "--porcelain", "--", spec]);
  if (dirty === null || dirty !== "") return mtimeOf(p);
  const ts = gitOut(["log", "-1", "--format=%ct", "--", spec]);
  return ts ? Number(ts) * 1000 : mtimeOf(p);
}

// AGENTS.md 与 AGENTS.override.md 都属于上下文；子目录里的 override 也应算，别当成代码文件
const isContext = (f) => {
  const r = rel(f);
  return AGENTS_RE.test(r) || r.startsWith("docs/") || r.startsWith(".agents/");
};
// scripts/ 不再整体排除：自动化脚本项目的业务代码常放在 scripts/ 里，整体排除会漏报。
// 只排除框架自己复制过去的 audit-context.mjs——它的改动不能代表业务代码在演进。
const CONTEXT_EXCLUDES = ["AGENTS.md", "AGENTS.md.tmpl", "AGENTS.override.md", "docs", ".agents", "scripts/audit-context.mjs"];

// 「最近改动的项目文件」用一次 git 调用拿到，避免对每个文件各起一个子进程。
function newestCodeByGit() {
  const out = gitOut([
    "log", "-1", "--format=%ct", "--name-only",
    "--", ".", ...CONTEXT_EXCLUDES.map((p) => `:(exclude)${p}`),
  ]);
  if (!out) return null;
  const [head, ...rest] = out.split(/\r?\n/).filter(Boolean);
  const path = rest[0];
  if (!path) return null;
  return { ms: Number(head) * 1000, label: path };
}

const isCodeFile = (f) => !isContext(f) && rel(f) !== "scripts/audit-context.mjs";
const codeFiles = allFiles.filter(isCodeFile);

// 有 git 时，git log 只看得见已提交且干净的代码；dirty/untracked 的代码文件必须回退到
// mtime，否则「旧 AGENTS + 未跟踪的新 main.js」会静默漏报——这又是专门抓说谎的检查在说谎。
// 用一次 git status -uall 拿到所有 dirty/untracked 路径，避免对每个文件各起一个子进程。
function newestDirtyCodeByMtime() {
  const out = gitOut(["status", "--porcelain", "-uall"]);
  if (!out) return null;
  let newest = null;
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const raw = line.slice(3).trim();
    if (!raw || raw.endsWith("/")) continue;
    const p = raw.replace(/^"(.*)"$/, "$1");
    const abs = resolve(ROOT, p);
    if (!existsSync(abs) || !isCodeFile(abs)) continue;
    const ms = mtimeOf(abs);
    if (!newest || ms > newest.ms) newest = { ms, label: rel(abs) };
  }
  return newest;
}

const newestCodeByMtime = codeFiles.length > 0
  ? codeFiles.reduce((a, b) => (mtimeOf(a) > mtimeOf(b) ? a : b))
  : null;
const newestCodeByMtimeLabeled = newestCodeByMtime && { ms: mtimeOf(newestCodeByMtime), label: rel(newestCodeByMtime) };

const newestGit = HAS_GIT ? newestCodeByGit() : null;
const newestDirty = HAS_GIT ? newestDirtyCodeByMtime() : null;
const newestCode = HAS_GIT
  ? (newestGit && newestDirty
      ? (newestGit.ms >= newestDirty.ms ? newestGit : newestDirty)
      : (newestGit || newestDirty))
  : newestCodeByMtimeLabeled;

if (newestCode && rootAgents) {
  const gapDays = (newestCode.ms - lastChangeMs(rootAgents)) / 86_400_000;
  if (gapDays > STALE_DAYS) {
    warn(`项目文件比 AGENTS.md 新 ${Math.round(gapDays)} 天（最近改动：${newestCode.label}），走一遍 /maintain-context`);
  }
}

// -------------------------------------------------------------- 孤儿文档检查

const docsDir = join(ROOT, "docs");
if (existsSync(docsDir)) {
  const linkedTargets = new Set();
  for (const f of mdFiles) {
    for (const m of stripCode(read(f)).matchAll(linkRe)) {
      const t = m[1];
      if (/^([a-z]+:|#|\/\/)/i.test(t)) continue;
      // 解码失败（如链接里带非法 % 转义）只跳过这一条，不弄崩整个体检
      let decoded;
      try {
        decoded = decodeURI(t.split("#")[0]);
      } catch {
        continue;
      }
      linkedTargets.add(resolve(dirname(f), decoded));
    }
  }
  // 子目录也要查——ADR「只增不改、越攒越多」，最容易变成没人链接得到的孤儿。
  // 但可达性判定到目录为止：链接到 `docs/decisions/` 就等于宣告了整个目录，里面每份 ADR
  // 不必各有一条链接。这样脚手架自带的两份种子（template.md、0001-*.md）天然不算孤儿，
  // 不需要在检查里硬编码文件名放行，而 `docs/notes/` 这类没人提过的目录仍会被抓出来。
  const docsMd = mdFiles.filter((f) => rel(f).startsWith("docs/"));
  for (const d of docsMd) {
    if (linkedTargets.has(d)) continue;
    let dir = dirname(d);
    let reachable = false;
    while (dir !== docsDir && dir.startsWith(docsDir)) {
      if (linkedTargets.has(dir)) { reachable = true; break; }
      dir = dirname(dir);
    }
    if (!reachable) {
      warn(`${rel(d)} 没有被任何文档链接到，agent 不会知道它存在——在 AGENTS.md 的文档地图里加一行`);
    }
  }
}

// ------------------------------------------------------------------ 学习收件箱

// 收件箱是队列（合并后清空），是「agent 越用越懂」的唯一落点。这里只做存在性与积压检查。
const inboxPath = join(ROOT, "docs", "learning-inbox.md");

if (!existsSync(inboxPath)) {
  warn("缺少 docs/learning-inbox.md，/ship-change 的复盘蒸馏没有落点");
} else {
  const entryRe = /^### \d{4}-\d{2}-\d{2} /gm;
  const inboxEntries = (stripFences(read(inboxPath)).match(entryRe) || []).length;
  if (inboxEntries > 0) {
    if (inboxEntries >= 10) warn(`学习收件箱积压 ${inboxEntries} 条候选，跑 /maintain-context 合并`);
    else notes.push(`学习收件箱有 ${inboxEntries} 条待合并候选，跑 /maintain-context`);
  } else if (newestCode) {
    // 空收件箱有两种含义：刚合并完（健康），或蒸馏环节从没执行过（闭环没转）。这两种在输出里
    // 长得一样，就是这个框架最讨厌的"安静地说谎"。收件箱最后一次变动的时间恰好是闭环最后一次
    // 转动的时间——写入和清空都会更新它——所以不需要额外的状态文件就能把两种含义分开。
    const idleDays = (newestCode.ms - lastChangeMs(inboxPath)) / 86_400_000;
    if (idleDays > STALE_DAYS) {
      warn(`项目文件比学习收件箱新 ${Math.round(idleDays)} 天且收件箱是空的，/ship-change 的复盘蒸馏可能一直被跳过`);
    }
  }
}

// AGENTS.md 里用 `/某技能` 或 `$某技能` 引用了技能，但技能目录不存在。
// 只认反引号包起来的 `$名` / `/名`，避免把 `docs/roadmap.md` 这类路径误判成技能名。
if (rootAgents) {
  const referenced = new Set(
    [...stripFences(read(rootAgents)).matchAll(/`[/$]([a-z][a-z0-9-]{2,})`/g)].map((m) => m[1])
  );
  // 技能目录不存在时（技能可能装在宿主的全局技能目录），不按引用逐条报 error——缺目录已由上面的 warning 覆盖；
  // 目录存在才严格判定引用齐全，此时缺技能才是真实的安装不完整。
  if (existsSync(skillsDir)) {
    for (const name of referenced) {
      if (!existsSync(join(ROOT, ".agents", "skills", name))) {
        err(`AGENTS.md 引用了技能 /${name}，但 .agents/skills/${name}/ 不存在`);
      }
    }
  }
  // 反向：技能存在但没登记进「可用技能」表。description 触发的技能仍能被宿主发现，
  // 但表格是 agent 盘点能力时的唯一入口，漏登记等于"没人知道它存在"。
  for (const name of skillDirs) {
    if (!referenced.has(name)) {
      warn(`技能 /${name} 存在，但没登记进 AGENTS.md「可用技能」表`);
    }
  }
}

// ------------------------------------------------------------------------ 输出

const section = (title, items) => {
  if (items.length === 0) return;
  console.log(`\n${title}`);
  for (const i of items) console.log(`  - ${i}`);
};

console.log(`上下文文件体检（context-dev v${CONTEXT_DEV_VERSION}）`);
console.log("=".repeat(40));

section(`ERROR (${errors.length})  必须修`, errors);
section(`WARN (${warnings.length})  逐条判断`, warnings);
section("INFO", notes);

console.log(
  `\n结论：${errors.length} 个 error、${warnings.length} 个 warning。`
);

if (errors.length > 0) {
  console.log("先把 error 全部修掉，再逐条判断 warning。");
  process.exit(1);
}
