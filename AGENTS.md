<!-- FRAMEWORK-AGENTS: context-dev 框架仓库维护者手册。GitHub Template 复制后由 scaffold 在「同时命中 README 的 FRAMEWORK-README 标记」时受控替换为项目手册；用户自己的 AGENTS.md 不含本标记，绝不覆盖。 -->

# context-dev — Agent 工作手册

**这是框架本身的仓库，不是用它初始化出来的项目。** `.agents/skills/` 是**产品**——五个要被安装到别人项目里的技能；`templates/` 下的一切是**产出物**，是别人项目的起点。把它们当成本仓库的配置来改，是这里最容易犯、也最贵的错。

本文件不会被 `scaffold.mjs` 复制到任何地方（它只复制 `templates/`）；但 GitHub Template 会把它复制进新仓库，此时 `scaffold.mjs` 会识别上面的 `FRAMEWORK-AGENTS` 标记并在 README 仍带 `FRAMEWORK-README` 标记时受控替换。改它只影响在本仓库里干活的 agent。

## 快速上手

零依赖，无需安装，只要 Node 20+（CI 固定 20）：

```bash
node --version
node --test
```

验证命令（改完代码必须自己跑，不要让用户当第一个发现问题的人）：

| 目的 | 命令 |
| --- | --- |
| 测试（脚手架与体检脚本的冒烟） | `node --test` |
| 语法检查 | `node --check .agents/skills/init/scaffold.mjs`、`node --check .agents/skills/init/templates/scripts/audit-context.mjs` |
| 体检模板树（看输出用） | `node .agents/skills/init/templates/scripts/audit-context.mjs` |
| 体检仓库根（CI 同款） | `node .agents/skills/init/templates/scripts/audit-context.mjs --root .` |

前三条合起来就是 `.github/workflows/ci.yml` 的全部内容，没有额外的全量档。

体检脚本本身已被 `node --test` 覆盖，手动跑只是为了看输出。不带 `--root` 时 ROOT 由脚本自身位置推导，所以检查的是 `templates/` 子树而不是仓库根；`--root .` 才会体检本仓库根。模板树的合格状态是「0 error、若干占位符 warning」——占位符是 warning 不是 error。仓库根体检的「缺少 docs/learning-inbox.md」warning 是预期：根目录按铁律 4 不补 docs/，学习闭环只存在于 `templates/` 生成的用户项目里。因此 `/ship-change` 第 7 步在本仓库没有收件箱可写：蒸馏信号直接并入本文件或 README，不要创建 `docs/`。

## 目录地图

```
AGENTS.md                本文件。每次对话全量加载
.agents/skills/          产品：五个技能，唯一需要安装到用户项目的东西
  init/SKILL.md          分阶段访谈流程（含轻量档）
  init/scaffold.mjs      把 templates/ 生成到用户项目根
  init/references/       访谈题库与答案落盘映射，按需加载
  init/templates/        用户项目的骨架模板 —— 产出物，不是本仓库的配置
tests/                   scaffold 与 audit 的冒烟测试，脚本的行为边界以它为准
.github/workflows/ci.yml 语法检查 + node --test
README.md                对外说明书，带 FRAMEWORK-README 标记（初始化时被整份替换）
```

## 铁律

前五条是这个仓库特有的，违反了会让产品对所有用户出错，而且从代码里读不出来。

1. **不在本仓库运行 `/init`，也不运行不带 `--root` 的 `scaffold.mjs`。** 它会把 12 个骨架文件写进仓库根，和 `templates/` 树混成两套同名文件，之后没人分得清哪份是产品、哪份是配置。要试脚手架就用 `--dry-run` 或 `--root <临时目录>`。
2. **改 `templates/` 下的文件时，判断标准是「对一个陌生项目是否成立」，不是「对 context-dev 是否方便」。** 那里的每一行都会成为别人项目的起点。
3. **`templates/AGENTS.md.tmpl` 的 `.tmpl` 后缀不能去掉。** 宿主会递归发现并全量注入仓库里所有 `AGENTS.md`，改回 `.md` 就等于把一份满是初始化占位符、开头写着「这个仓库还没初始化」的模板塞进本仓库每一轮对话。`tests/` 里有用例锁着这条。
4. **根目录不补 `docs/`、`scripts/`、`.agents/evals/`。** 那套骨架只存在于 `templates/` 下。在根目录再放一套会出现两份同名文件，而它们语义完全不同——一份是产出物，一份是配置。
5. **改了 `templates/` 或两个脚本，同一次改动里更新 `tests/` 和 `README.md`。** README 里有目录结构树和「设计取舍」清单，它是唯一的对外说明；漂了就是对每一个使用者说谎，而这正是这个框架声称要消灭的东西。
6. **不确定就问，不要编。** 宿主行为、用户意图、某条规则当初为什么这么定——没在仓库里读到依据就先查证或先问。这个仓库的产出是「给 agent 看的规则」，一句猜出来的规则会被复制进每一个用户项目。
7. **改完自己跑与改动相关的验证命令。** 动了脚本就 `node --test`，动了文档就把改到的链接点一遍。没跑就说"应该没问题"不可接受。
8. **破坏性操作先确认。** `git push`、强制推送、删分支、重置历史、递归删除——用户明确要求前一律不做。
9. **密钥和真实数据永不进仓库。** 需要示例时用明显虚构的值。

## 术语

| 术语 | 含义 | 代码中的名字 |
| --- | --- | --- |
| 骨架 | scaffold 生成到用户项目根的那 12 个文件 | `SKELETON_FILES`（测试里断言其中 12 个） |
| 模板树 | `.agents/skills/init/templates/` 及其全部内容 | `TEMPLATES` |
| 宿主 | 加载技能的 agent 运行时（DSH 正式支持，Codex 未验证） | — |
| 主尺 / 备尺 | `AGENTS.md` 的行数门禁 / 字节门禁，备尺对稀疏散文沉默是设计意图 | `AGENTS_LINE_TARGET` / `AGENTS_BYTE_CAP` |
| 框架代码 | `--update-framework` 允许覆盖的部分，目前只有 `scripts/` | `FRAMEWORK_DIRS` |
| 收件箱 | 用户项目里的 `docs/learning-inbox.md`，复盘蒸馏的队列 | `inboxPath` |

## 文档地图

| 什么时候读 | 文件 |
| --- | --- |
| 要理解框架整体、或某个设计当初为什么这么定 | [README.md](README.md) |
| 要改某个技能的流程 | `.agents/skills/<name>/SKILL.md` |
| 要改访谈问什么、答案落到哪个文件 | [题库](.agents/skills/init/references/question-bank.md)、[落盘映射](.agents/skills/init/references/output-map.md) |
| 要确认脚本的行为边界（改动会不会破坏承诺） | [tests/context-scripts.test.mjs](tests/context-scripts.test.mjs) |

## 可用技能

这五个是**产品**，不是本仓库的开发工具。在本仓库里它们只有一种正当用法：作为被修改的对象。

| 什么时候用 | 技能 |
| --- | --- |
| 用户项目的初始化访谈（**勿在本仓库运行**） | `/init` |
| 产品契约访谈，被 init 阶段 2 调用 | `/product-design` |
| 交付一次改动的标准流程；本仓库照走第 1–6 步，第 7 步无收件箱，蒸馏直接并入本文件或 README | `/ship-change` |
| 做了有取舍的技术决策 | `/record-decision` |
| 体检并更新上下文文件 | `/maintain-context` |

## 当前状态

v0.3.0（`CONTEXT_DEV_VERSION` 在 `scaffold.mjs` 与 `templates/scripts/audit-context.mjs` **各有一份，改版本号要两处一起改**）。五个技能齐全，DSH 正式支持，Codex 只验证了安装与 frontmatter。

本仓库没有 `docs/roadmap.md`，范围没有文件级的唯一来源——**新增能力前先在对话里把范围对齐**，别默认「顺手加上更好」。

## 维护这份手册

- 改了命令、目录结构、铁律、术语 → 同一个改动里更新本文件。
- 细节增长超过 5 行 → 移到 README 或对应的 `SKILL.md`，这里只留链接。
- 本文件是占位符宿主，正文里别字面写出初始化占位标记，否则体检会把它当成没填完的空。
- 目标 150 行以内。本仓库根目录没有体检脚本，这条只能靠自觉。
