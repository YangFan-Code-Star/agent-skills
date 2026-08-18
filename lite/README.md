# context-dev lite

context-dev 的轻量发行包，给**个人 / 中小型项目**用：周末小工具、一次性脚本、试验性原型、个人研究，也适合你想长期迭代但不需要 PR / CL / 代码审查等团队流程的项目。上下文只生成 4 个文件、只装 2 个技能、初始化只问 3 个问题。

完整版仍在 `.agents/skills/`：适合复杂长期维护、多人协作、需要统一 PR / CL / 代码审查等项目。两套**二选一安装**，不要同时装进同一个项目——`init` 同名技能会被宿主命中一份，另一份只是白白占预算。

`lite/` 目录可以单独拷走使用，不依赖完整版技能目录。

## 与完整版的区别

| 维度 | 完整版 | lite |
| --- | --- | --- |
| 技能 | init / product-design / ship-change / record-decision / maintain-context | init / maintain |
| 骨架文件 | 12 个 | 4 个：`AGENTS.md`、`.gitignore`、`docs/plan.md`、`docs/log.md` |
| 初始化 | 分阶段访谈，按形态深挖 | 固定 3 问 |
| 决策记录 | 一决策一 ADR | `docs/log.md` 一段，稳定后并入 `docs/plan.md` |
| 学习闭环 | ship-change → learning-inbox → maintain-context | 任务末尾追加 log → maintain 合并 |
| 自动体检 | `scripts/audit-context.mjs` | 无；验证靠项目自己的测试 / 构建命令 |
| 行为用例 | `.agents/evals/` | 无；红线直接写在 `AGENTS.md` 铁律 |
| 流程负担 | 会问提交/分支、CI、决策记录等 | 不引入 PR / CL / 代码审查；直接改、直接跑、直接记 |

## 安装

安装分两步：复制技能 + 生成骨架。脚手架只创建**缺失**文件，绝不覆盖你已有的 `AGENTS.md`、`docs/`、`.gitignore`。

```bash
# 项目级技能（推荐）
mkdir -p <你的项目>/.agents/skills
cp -r lite/skills/* <你的项目>/.agents/skills/

# 生成 4 个骨架文件
node lite/scaffold.mjs --root <你的项目>
```

也可以装全局，与项目级**二选一**：

```bash
mkdir -p ~/.dsh/skills
cp -r lite/skills/* ~/.dsh/skills/
```

Windows (PowerShell) 同理：先 `New-Item -ItemType Directory -Force <目标目录> | Out-Null` 再 `Copy-Item lite\skills\* <目标目录> -Recurse`——目标目录不存在时 Copy-Item 会把第一个技能的内容当成 skills 本身，静默装错。

然后回到项目里说「初始化项目」即可（描述会自动触发，也可显式调用 `init`）。

## 初始化会问什么

1. 一句话说清做什么、给谁用。
2. 做到什么程度算成功 / 完成。
3. 从零到能跑起来、以及验证改动，分别跑什么命令。

## 日常怎么转

这就是个人 / 中小型项目长期迭代的轻量闭环：

- 每个任务结束：把决定、坑、纠正追加进 `docs/log.md`。
- 每隔一段时间（或一个里程碑结束）说「整理一下上下文」，`/maintain` 会把日志里的稳定内容合并进 `docs/plan.md` 或 `AGENTS.md`，并删掉过期规则。
- 没有体检脚本：轻量项目的验证命令就是它的质量门禁，写在 `AGENTS.md`「验证命令」里。

## 升级

重新复制技能目录覆盖项目里的 `.agents/skills/init` 和 `.agents/skills/maintain` 即可；scaffold 仍只创建缺失文件，因此模板自身的修复不会覆盖已有骨架，需要时人工同步。

## 宿主支持

lite 与完整版使用同一套 `SKILL.md` 发现机制：DSH 下按 `name` + `description` 触发，可装项目级或 `~/.dsh/skills/` 全局。Codex 未验证 lite 的运行时路由；仓库里的自动化覆盖是 scaffold 与 frontmatter 的脚本级测试，不构成宿主端到端验证。

## 目录

```
lite/
├── README.md          本说明
├── scaffold.mjs       生成轻量骨架，零依赖 Node 脚本
├── skills/            产品：两个技能，唯一需要安装到项目里的东西
│   ├── init/          轻量初始化：3 问 + 落盘
│   └── maintain/      轻量维护：核对 + 合并 + 删过期
└── templates/         轻量骨架模板（被 scaffold 到项目根）
    ├── AGENTS.md.tmpl
    ├── .gitignore
    └── docs/
        ├── plan.md
        └── log.md
```
