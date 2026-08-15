#!/usr/bin/env node
// 上下文文件体检。零依赖，只做确定性检查。
// 能被脚本判定的事就不要写成让模型自己判断的散文。
// 用法：node scripts/audit-context.mjs

import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// AGENTS.md 每次对话都全量加载，字节上限是保持精简的自律标杆，超出就该往 docs/ 搬。
// 取值与 250 行的硬上限同量级：中文约每行 50 字节，250 行≈12.5 KiB。定得更高（如 32 KiB）
// 时行数上限总会先触发，字节门禁就成了永不执行的死分支。
const AGENTS_BYTE_CAP = 12 * 1024;
const AGENTS_BYTE_LABEL = `${AGENTS_BYTE_CAP / 1024} KiB`;
const AGENTS_LINE_TARGET = 150;
const SKILL_BODY_LINE_CAP = 500;
const STALE_DAYS = 60;

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage",
  ".next", ".venv", "venv", "__pycache__", ".pytest_cache", "target", "vendor",
  "templates",
]);

// Windows 上的编辑器和 PowerShell 常写出带 BOM 的 UTF-8，不剥掉会让 ^--- 匹配不上 frontmatter
const read = (p) => readFileSync(p, "utf8").replace(/^\uFEFF/, "");

const errors = [];
const warnings = [];
const pending = [];
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
const mdFiles = allFiles.filter((f) => f.endsWith(".md"));

// ---------------------------------------------------------------- AGENTS.md

const agentsFiles = allFiles.filter((f) => /(^|[\\/])AGENTS(\.override)?\.md$/.test(f));

if (!agentsFiles.some((f) => rel(f) === "AGENTS.md")) {
  err("根目录缺少 AGENTS.md，宿主将没有任何项目级指令");
} else {
  const root = join(ROOT, "AGENTS.md");
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
// 把它们算进来会让计数永远归不了零，从而毁掉「零占位符 = 初始化完成」这个信号。
const isPlaceholderHost = (f) => {
  const r = rel(f);
  return r === "AGENTS.md" || r.startsWith("docs/") || r.startsWith(".agents/evals/");
};

const markerRe = /TODO\(init\)/g;
let markerTotal = 0;
for (const f of mdFiles.filter(isPlaceholderHost)) {
  const hits = (read(f).match(markerRe) || []).length;
  if (hits > 0) {
    markerTotal += hits;
    pending.push(`${rel(f)}：${hits} 处`);
  }
}
if (markerTotal > 0) {
  pending.unshift(`共 ${markerTotal} 处占位符未填充，运行 /init 继续访谈`);
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

// AGENTS.md 与 AGENTS.override.md 都属于上下文；子目录里的 override 也应算，别当成代码文件
const isContext = (f) => {
  const r = rel(f);
  return /(^|[\\/])AGENTS(\.override)?\.md$/.test(r) || r.startsWith("docs/") || r.startsWith(".agents/");
};
const codeFiles = allFiles.filter((f) => !isContext(f) && !rel(f).startsWith("scripts/"));
const newestCode = codeFiles.length > 0
  ? codeFiles.reduce((a, b) => (statSync(a).mtimeMs > statSync(b).mtimeMs ? a : b))
  : null;

if (newestCode && existsSync(join(ROOT, "AGENTS.md"))) {
  const gapDays = (statSync(newestCode).mtimeMs - statSync(join(ROOT, "AGENTS.md")).mtimeMs) / 86_400_000;
  if (gapDays > STALE_DAYS) {
    warn(`代码比 AGENTS.md 新 ${Math.round(gapDays)} 天（最近改动：${rel(newestCode)}），走一遍 /maintain-context`);
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
  const topDocs = readdirSync(docsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(docsDir, e.name));
  for (const d of topDocs) {
    if (!linkedTargets.has(d)) {
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
    // 长得一样，就是这个框架最讨厌的"安静地说谎"。收件箱的 mtime 恰好是闭环最后一次转动的时间
    // ——写入和清空都会更新它——所以不需要额外的状态文件就能把两种含义分开。
    const idleDays = (statSync(newestCode).mtimeMs - statSync(inboxPath).mtimeMs) / 86_400_000;
    if (idleDays > STALE_DAYS) {
      warn(`代码比学习收件箱新 ${Math.round(idleDays)} 天且收件箱是空的，/ship-change 的复盘蒸馏可能一直被跳过`);
    }
  }
}

// AGENTS.md 里用 `/某技能` 或 `$某技能` 引用了技能，但技能目录不存在。
// 只认反引号包起来的 `$名` / `/名`，避免把 `docs/roadmap.md` 这类路径误判成技能名。
if (existsSync(join(ROOT, "AGENTS.md"))) {
  const referenced = new Set(
    [...stripFences(read(join(ROOT, "AGENTS.md"))).matchAll(/`[/$]([a-z][a-z0-9-]{2,})`/g)].map((m) => m[1])
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

console.log("上下文文件体检");
console.log("=".repeat(40));

section(`ERROR (${errors.length})  必须修`, errors);
section(`WARN (${warnings.length})  逐条判断`, warnings);
section(`TODO (${markerTotal})  等待 init 填充`, pending);
section("INFO", notes);

console.log(
  `\n结论：${errors.length} 个 error、${warnings.length} 个 warning、${markerTotal} 处占位符。`
);

if (errors.length > 0) {
  console.log("先把 error 全部修掉，再逐条判断 warning。");
  process.exit(1);
}
if (markerTotal > 0) {
  console.log("模板尚未初始化完成，运行 /init 继续。");
  process.exit(1);
}
