// scaffold.mjs 与 audit-context.mjs 的冒烟测试。零依赖：node:test + child_process。
// 运行：node --test（或 node --test tests/context-scripts.test.mjs）
// 覆盖：骨架生成与幂等、.tmpl 后缀剥离、--dry-run、--update-framework 的覆盖边界、
//       符号链接边界（含 --root 本身为符号链接）、参数校验、--help、
//       audit 在初始化前 / 装完技能后的状态、时效性检查用 git 提交时间而非 mtime、
//       孤儿文档检查递归 docs/ 子目录、框架仓库自身的体检目标。

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const SCAFFOLD = join(REPO, ".agents", "skills", "init", "scaffold.mjs");
const TEMPLATE_AUDIT = join(REPO, ".agents", "skills", "init", "templates", "scripts", "audit-context.mjs");
const SKILL_NAMES = ["init", "product-design", "ship-change", "record-decision", "maintain-context"];
const SKELETON_FILES = [
  "AGENTS.md",
  ".gitignore",
  "scripts/audit-context.mjs",
  "docs/goals.md",
  "docs/architecture.md",
  "docs/glossary.md",
  "docs/roadmap.md",
  "docs/troubleshooting.md",
  "docs/learning-inbox.md",
  "docs/decisions/template.md",
  ".agents/evals/behavior-cases.md",
];

const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: "utf8", ...opts });
const git = (args, opts = {}) => spawnSync("git", args, { encoding: "utf8", ...opts });
const freshDir = () => mkdtempSync(join(tmpdir(), "ctx-scripts-test-"));
const withDir = (fn) => {
  const dir = freshDir();
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const scaffoldProject = (dir) => {
  git(["init", "-q"], { cwd: dir });
  const r = node([SCAFFOLD, "--root", dir]);
  assert.equal(r.status, 0, r.stderr);
  return r;
};

// 模拟 GitHub Template：把仓库所有已跟踪文件复制到新目录，不带 .git 历史。
const copyRepoTracked = (dest) => {
  const files = git(["ls-files"], { cwd: REPO }).stdout.trim().split(/\r?\n/).filter(Boolean);
  for (const f of files) {
    const dst = join(dest, f);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(REPO, f), dst);
  }
};

// 以指定日期提交，用来构造"git 提交时间差很大、但 mtime 全都一样"的场景
const commitAt = (dir, isoDate, message) => {
  git(["add", "-A"], { cwd: dir });
  const r = git(
    ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message],
    { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate } },
  );
  assert.equal(r.status, 0, r.stderr);
};

const auditIn = (dir) => node([join(dir, "scripts", "audit-context.mjs")], { cwd: dir });

test("scaffold 在空 git 仓库生成完整骨架，重跑幂等，且能自动定位项目根", () =>
  withDir((dir) => {
    const first = scaffoldProject(dir);
    assert.match(first.stdout, /新建 12 个文件/);
    for (const f of SKELETON_FILES) {
      assert.ok(existsSync(join(dir, f)), `缺少 ${f}`);
    }

    // 不带 --root，从仓库内部运行：应通过最近的 .git 祖先定位到同一目录
    const implicit = node([SCAFFOLD], { cwd: dir });
    assert.equal(implicit.status, 0, implicit.stderr);
    assert.ok(implicit.stdout.includes(`项目根：${dir}`), implicit.stdout);

    const second = node([SCAFFOLD, "--root", dir]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /新建 0 个文件/);
    assert.match(second.stdout, /跳过 12 个已存在文件/);
  }));

test("模板里的 AGENTS.md.tmpl 落到项目根时剥掉后缀，项目里不残留 .tmpl", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    assert.ok(existsSync(join(dir, "AGENTS.md")));
    assert.equal(existsSync(join(dir, "AGENTS.md.tmpl")), false);
    // 宿主递归发现 AGENTS.md，模板那份必须在框架仓库里带后缀存放，不能被注入
    assert.equal(existsSync(join(REPO, ".agents", "skills", "init", "templates", "AGENTS.md")), false);
    assert.ok(existsSync(join(REPO, ".agents", "skills", "init", "templates", "AGENTS.md.tmpl")));
  }));

test("GitHub Template 主路径：框架 AGENTS.md 在双标记命中时被受控替换", () =>
  withDir((dir) => {
    const project = join(dir, "project");
    mkdirSync(project);
    copyRepoTracked(project);
    // 复制出来的是框架维护者手册，不能直接作为项目手册
    assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /这是框架本身的仓库/);

    const r = node([SCAFFOLD, "--root", project]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /替换 1 个模板复制残留文件/);

    const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
    assert.doesNotMatch(agents, /这是框架本身的仓库/);
    assert.match(agents, /这个仓库还没初始化/);
    assert.match(agents, /TODO\(init\): 项目名/);
  }));

test("用户自己的 AGENTS.md（无 FRAMEWORK-AGENTS 标记）绝不覆盖", () =>
  withDir((dir) => {
    const project = join(dir, "project");
    mkdirSync(project);
    copyRepoTracked(project);
    writeFileSync(join(project, "AGENTS.md"), "# 用户自己的手册\n");

    const r = node([SCAFFOLD, "--root", project]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(project, "AGENTS.md"), "utf8"), "# 用户自己的手册\n");
    assert.match(r.stdout, /跳过 2 个已存在文件/); // AGENTS.md 与 .gitignore
  }));

test("框架 AGENTS.md 仅在 README 仍带 FRAMEWORK-README 标记时才替换", () =>
  withDir((dir) => {
    const project = join(dir, "project");
    mkdirSync(project);
    copyRepoTracked(project);
    writeFileSync(join(project, "README.md"), "# 用户自己的 README\n");

    const r = node([SCAFFOLD, "--root", project]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /这是框架本身的仓库/);
    assert.match(r.stdout, /跳过 2 个已存在文件/);
  }));

test("--update-framework 覆盖 scripts/，但不动用户内容（AGENTS.md、evals、docs）", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    const audit = join(dir, "scripts", "audit-context.mjs");
    const agents = join(dir, "AGENTS.md");
    const evals = join(dir, ".agents", "evals", "behavior-cases.md");
    for (const f of [audit, agents, evals]) writeFileSync(f, "用户改过的内容\n");

    const r = node([SCAFFOLD, "--root", dir, "--update-framework"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /已升级 1 个框架文件/);
    assert.match(r.stdout, /\^ scripts[/\\]audit-context\.mjs/);

    assert.notEqual(readFileSync(audit, "utf8"), "用户改过的内容\n");
    // init 阶段 3 会把用户访谈得到的红线逐条写进 behavior-cases.md，覆盖它等于删用户内容
    assert.equal(readFileSync(evals, "utf8"), "用户改过的内容\n");
    assert.equal(readFileSync(agents, "utf8"), "用户改过的内容\n");
  }));

test("不带 --update-framework 时，已存在的 scripts/ 不被覆盖", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    const audit = join(dir, "scripts", "audit-context.mjs");
    writeFileSync(audit, "用户改过的内容\n");
    const r = node([SCAFFOLD, "--root", dir]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(audit, "utf8"), "用户改过的内容\n");
  }));

test("--dry-run 只预览不写入", () =>
  withDir((dir) => {
    const r = node([SCAFFOLD, "--root", dir, "--dry-run"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[dry-run\] 预览，未写入任何文件/);
    assert.equal(readdirSync(dir).length, 0);
  }));

test("拒绝沿项目内的目录符号链接写到项目根之外", () =>
  withDir((dir) => {
    const project = join(dir, "project");
    const outside = join(dir, "outside");
    mkdirSync(project);
    mkdirSync(outside);
    symlinkSync(outside, join(project, "docs"), process.platform === "win32" ? "junction" : "dir");

    const r = node([SCAFFOLD, "--root", project]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /拒绝写入符号链接路径：docs/);
    assert.equal(readdirSync(outside).length, 0);
  }));

test(
  "拒绝写入指向项目根之外的文件符号链接",
  { skip: process.platform === "win32" ? "Windows 普通用户无法稳定创建文件符号链接" : false },
  () => withDir((dir) => {
    const project = join(dir, "project");
    const outside = join(dir, "outside");
    mkdirSync(project);
    mkdirSync(outside);
    symlinkSync(join(outside, "AGENTS.md"), join(project, "AGENTS.md"), "file");

    const r = node([SCAFFOLD, "--root", project]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /拒绝写入符号链接路径：AGENTS\.md/);
    assert.equal(existsSync(join(outside, "AGENTS.md")), false);
  }),
);

test("拒绝把 --root 本身为符号链接的项目根（不写入链接目标）", () =>
  withDir((dir) => {
    const link = join(dir, "project");
    const outside = join(dir, "outside");
    mkdirSync(outside);
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    const r = node([SCAFFOLD, "--root", link]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /拒绝把符号链接作为项目根：/);
    assert.equal(readdirSync(outside).length, 0);

    // dry-run 同样拒绝：预览也不该宣称要沿链接根写入
    const dry = node([SCAFFOLD, "--root", link, "--dry-run"]);
    assert.equal(dry.status, 1);
    assert.match(dry.stderr, /拒绝把符号链接作为项目根：/);
    assert.equal(readdirSync(outside).length, 0);
  }));

test("--root 缺值时报用法错误，而不是把下一个参数当目录", () => {
  const r = node([SCAFFOLD, "--root"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--root 需要一个目录参数/);
});

test("--root --dry-run 缺路径同样报错（避免把 --dry-run 当成目录名）", () => {
  const r = node([SCAFFOLD, "--root", "--dry-run"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--root 需要一个目录参数/);
});

test("未知参数被拒绝", () => {
  const r = node([SCAFFOLD, "--frobnicate"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /未知参数：--frobnicate/);
});

test("--help 显示用法并以 0 退出", () => {
  const r = node([SCAFFOLD, "--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /用法：node scaffold\.mjs/);
});

test("CONTEXT_DEV_VERSION 在 scaffold 与 audit 两份脚本中一致", () => {
  const scaffoldText = readFileSync(SCAFFOLD, "utf8");
  const auditText = readFileSync(TEMPLATE_AUDIT, "utf8");
  const versionRe = /CONTEXT_DEV_VERSION = "([^"]+)"/;
  const scaffoldVersion = scaffoldText.match(versionRe)?.[1];
  const auditVersion = auditText.match(versionRe)?.[1];
  assert.ok(scaffoldVersion, "scaffold.mjs 缺少 CONTEXT_DEV_VERSION");
  assert.ok(auditVersion, "audit-context.mjs 缺少 CONTEXT_DEV_VERSION");
  assert.equal(auditVersion, scaffoldVersion, "两份脚本的 CONTEXT_DEV_VERSION 不一致");
});

test("audit --root 能体检指定目录；--help 显示用法", () => {
  const help = node([TEMPLATE_AUDIT, "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /用法：node scripts\/audit-context\.mjs/);

  const bad = node([TEMPLATE_AUDIT, "--root"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--root 需要一个目录参数/);
});

test("audit --root 可以体检框架仓库根（0 error）", () => {
  const r = node([TEMPLATE_AUDIT, "--root", REPO]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 个 error/);
  assert.match(r.stdout, /结论：0 个 error、\d+ 个 warning/);
});

test("audit 在未初始化的项目上无 error、TODO 报 warning、退出 0", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    const r = node([join(dir, "scripts", "audit-context.mjs")], { cwd: dir });
    assert.equal(r.status, 0); // TODO(init) 是 warning，不再是硬错误
    assert.match(r.stdout, /0 个 error/);
    assert.match(r.stdout, /TODO\(init\) 残留/);
    assert.match(r.stdout, /共 \d+ 处 TODO\(init\) 未填充/);
  }));

test("audit 在装好全部技能的项目上只有 TODO warning（技能内相对链接有效）", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    for (const name of SKILL_NAMES) {
      cpSync(join(REPO, ".agents", "skills", name), join(dir, ".agents", "skills", name), { recursive: true });
    }
    const r = node([join(dir, "scripts", "audit-context.mjs")], { cwd: dir });
    assert.equal(r.status, 0); // 仍是初始化前：TODO 只作 warning
    assert.match(r.stdout, /结论：0 个 error、\d+ 个 warning/);
    assert.doesNotMatch(r.stdout, /链接指向不存在的路径/);
  }));

// git 不保存 mtime，克隆后所有文件的 mtime 都是同一个 checkout 时间。下面两条构造的正是
// 那个场景：文件全是刚写出来的（mtime 相同），只有提交时间相差很远。若检查退回 mtime，
// 两条都会静默通过——那是这个框架最忌讳的"安静地说谎"。
test("时效性检查读 git 提交时间：mtime 全相同也能发现项目文件比 AGENTS.md 新", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    commitAt(dir, "2024-01-01T00:00:00+0000", "骨架");
    writeFileSync(join(dir, "main.js"), "console.log(1);\n");
    commitAt(dir, "2024-09-01T00:00:00+0000", "代码");

    const r = auditIn(dir);
    assert.match(r.stdout, /项目文件比 AGENTS\.md 新 \d+ 天（最近改动：main\.js）/);
    assert.match(r.stdout, /项目文件比学习收件箱新 \d+ 天且收件箱是空的/);
  }));

test("未跟踪的新代码文件按 mtime 参与时效性，不静默漏报", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    commitAt(dir, "2024-01-01T00:00:00+0000", "骨架");
    writeFileSync(join(dir, "main.js"), "console.log(1);\n"); // 未跟踪，git log 看不见

    const r = auditIn(dir);
    assert.match(r.stdout, /项目文件比 AGENTS\.md 新 \d+ 天（最近改动：main\.js）/);
  }));

test("scripts/ 下的业务脚本参与时效性（只排除 audit-context.mjs 自身）", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    commitAt(dir, "2024-01-01T00:00:00+0000", "骨架");
    writeFileSync(join(dir, "scripts", "main.mjs"), "console.log(1);\n");
    commitAt(dir, "2024-09-01T00:00:00+0000", "业务脚本");

    const r = auditIn(dir);
    assert.match(r.stdout, /项目文件比 AGENTS\.md 新 \d+ 天（最近改动：scripts\/main\.mjs）/);
  }));

test("上下文与代码同期提交时不误报过期", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    writeFileSync(join(dir, "main.js"), "console.log(1);\n");
    commitAt(dir, "2024-09-01T00:00:00+0000", "骨架与代码");

    const r = auditIn(dir);
    assert.doesNotMatch(r.stdout, /项目文件比 AGENTS\.md 新/);
    assert.doesNotMatch(r.stdout, /项目文件比学习收件箱新/);
  }));

test("收件箱有未提交改动时按 mtime 判定，不把刚转过的闭环误报成从没转", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    commitAt(dir, "2024-01-01T00:00:00+0000", "骨架");
    writeFileSync(join(dir, "main.js"), "console.log(1);\n");
    commitAt(dir, "2024-09-01T00:00:00+0000", "代码");
    // 蒸馏刚写进收件箱、还没提交：git log 看不见这次写入，必须回退到 mtime
    writeFileSync(
      join(dir, "docs", "learning-inbox.md"),
      "# 学习收件箱\n\n## 待合并\n\n### 2024-09-02 纠正 — 示例\n",
    );

    const r = auditIn(dir);
    assert.doesNotMatch(r.stdout, /项目文件比学习收件箱新/);
    assert.match(r.stdout, /学习收件箱有 1 条待合并候选/);
  }));

test("孤儿文档检查递归 docs/ 子目录，但链接到目录即视为可达", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    // 脚手架自带的 ADR 种子靠 AGENTS.md 里的 `docs/decisions/` 目录链接可达，不算孤儿
    writeFileSync(join(dir, "docs", "decisions", "0002-example.md"), "# 示例决策\n");
    mkdirSync(join(dir, "docs", "notes"));
    writeFileSync(join(dir, "docs", "notes", "scratch.md"), "# 随手记\n");

    const r = auditIn(dir);
    assert.doesNotMatch(r.stdout, /decisions[/\\]0002-example\.md 没有被任何文档链接到/);
    assert.match(r.stdout, /docs\/notes\/scratch\.md 没有被任何文档链接到/);
  }));

test("框架仓库自身的体检目标（templates 树）是合法的初始化前状态", () => {
  const r = node([TEMPLATE_AUDIT]);
  assert.equal(r.status, 0); // 只有 TODO 与缺失 skills 目录的 warning，无 error
  assert.match(r.stdout, /0 个 error/);
  assert.match(r.stdout, /TODO\(init\) 残留/);
});
