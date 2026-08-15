// scaffold.mjs 与 audit-context.mjs 的冒烟测试。零依赖：node:test + child_process。
// 运行：node --test（或 node --test tests/context-scripts.test.mjs）
// 覆盖：骨架生成与幂等、--dry-run、符号链接边界（含 --root 本身为符号链接）、
//       参数校验、--help、audit 在初始化前 / 装完技能后的状态、框架仓库自身的体检目标。

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
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

test("audit 在未初始化的项目上无 error、报占位符、退出 1", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    const r = node([join(dir, "scripts", "audit-context.mjs")], { cwd: dir });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /0 个 error/);
    assert.match(r.stdout, /共 \d+ 处占位符未填充/);
  }));

test("audit 在装好全部技能的项目上 0 error 0 warning（技能内相对链接有效）", () =>
  withDir((dir) => {
    scaffoldProject(dir);
    for (const name of SKILL_NAMES) {
      cpSync(join(REPO, ".agents", "skills", name), join(dir, ".agents", "skills", name), { recursive: true });
    }
    const r = node([join(dir, "scripts", "audit-context.mjs")], { cwd: dir });
    assert.equal(r.status, 1); // 仍是初始化前（有占位符）
    assert.match(r.stdout, /结论：0 个 error、0 个 warning/);
  }));

test("框架仓库自身的体检目标（templates 树）是合法的初始化前状态", () => {
  const r = node([TEMPLATE_AUDIT]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /0 个 error/);
  assert.match(r.stdout, /共 \d+ 处占位符未填充/);
});
