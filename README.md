<!-- FRAMEWORK-README：本 README 描述 context-dev 框架本身。复制后运行 /init 初始化时，把它整份换成你项目的说明，连同这一行删掉。 -->

# context-dev

一套让 agent 越用越懂项目的技能框架：把「只有你知道、代码里读不出来」的信息固化成按需加载的分层文档，每次任务结束后把「纠正信号」蒸馏回收件箱、定期合并回上下文，形成自我进化的闭环。

语言无关——骨架是 Markdown + 零依赖 Node 脚本，源码目录留空，由初始化访谈按项目形态生成。分两档发行：**完整版**（`.agents/skills/`，五个技能）和 **lite 轻量版**（`lite/`，两个技能、四个骨架文件），按项目复杂度和协作方式选一套。

> **English:** A self-improving agent-context framework for DeepSeek Harness. It turns "what only you know" into layered, on-demand documentation, then distills every task's corrections back into that context — so the agent gets smarter the more you use it. See [English summary](#english-summary).

## 它解决什么

大多数项目文档在讲「系统怎么造」，没有一处讲「你想要什么、为什么、哪些不能碰」。后果是 agent 每次都要被重新教一遍：反复提议被否决过的方案、凭空猜测业务口径、在文档腐烂后照着旧信息自信地干错事。

这套框架把「教会 agent」从口口相传，变成文件结构 + 强制流程。

## 完整版用法

### A. 作为新项目模板

在 GitHub 仓库页点击 **Use this template → Create a new repository**，克隆新仓库后在 agent 里说「初始化项目」即可（描述会自动触发，也可显式调用 `init` 技能）。

`init` 先生成骨架（`AGENTS.md`、`docs/`、`scripts/`、`.agents/evals/`、`.gitignore`），再分阶段访谈你——先定位项目，再按形态（Web / CLI / 数据流水线 / 库 / 机器学习 / 自动化脚本）深挖，然后问红线与范围。每个阶段结束立刻落盘，随时可中断、可续问。

模板会保留 `tests/context-scripts.test.mjs` 和 `.github/workflows/ci.yml`，它们只验证 context-dev 的脚手架与体检脚本，不代表你的项目代码已经有测试或 CI；初始化时仍需按项目技术栈补齐真实验证链路。

### B. 装进现有项目

只需把技能目录拷进你项目，再跑一次初始化：

```bash
# 目标目录必须先存在：不存在时 Copy-Item 会把第一个技能的内容当成 skills 本身，静默装错
# Windows (PowerShell)：
New-Item -ItemType Directory -Force <你的项目>\.agents\skills | Out-Null
Copy-Item context-dev\.agents\skills\* <你的项目>\.agents\skills\ -Recurse
# macOS / Linux：
# mkdir -p <你的项目>/.agents/skills
# cp -r context-dev/.agents/skills/* <你的项目>/.agents/skills/
# 然后在项目里说「初始化项目」即可
```

`init` 阶段 0 会先检查目标项目是否已挂载技能；如果你只生成了骨架却忘了拷技能，它会先让你确认「用全局技能」还是「复制进项目」，再继续生成骨架。

脚手架只创建**缺失**的骨架文件，绝不覆盖你已有的 `AGENTS.md`、`docs/`、`scripts/`。唯一例外：**用 “Use this template” 复制出来的新仓库**会残留框架自己的 `AGENTS.md`（开头写着“这是框架本身的仓库，不要运行 init”）。它带有 `FRAMEWORK-AGENTS` 标记；当且仅当 README 还带着 `FRAMEWORK-README` 标记时，`scaffold.mjs` 会把这份维护者手册受控替换成项目手册。你自己的 `AGENTS.md` 没有这个标记，绝不会被覆盖。技能也可装到全局 `~/.dsh/skills/`，之后在任何项目里都能直接调用初始化——但**装全局和装项目二选一**，两处都装会出现同名技能的两份不同版本，宿主触发时只会命中其中一份。

## 轻量版 lite

给个人 / 中小型项目用：周末小工具、一次性脚本、试验原型、个人研究，也适合想长期迭代但不引入 PR / CL / 代码审查等团队流程的项目。完整版一次访谈二三十题、生成 12 个文件，对这些项目是负担而不是帮助。

`lite/` 是独立发行包，与完整版**二选一安装**：只装 2 个技能（`init` + `maintain`），只生成 4 个骨架文件（`AGENTS.md`、`.gitignore`、`docs/plan.md`、`docs/log.md`），初始化固定只问 3 个问题，没有 `audit-context.mjs`、`.agents/evals/`、ADR 模板和框架自带 CI——个人 / 中小型项目的质量门禁就是它自己的测试命令。

```bash
# 装技能（项目级；也可以装到 ~/.dsh/skills/，二选一）
mkdir -p <你的项目>/.agents/skills
cp -r context-dev/lite/skills/* <你的项目>/.agents/skills/
# 生成骨架
node context-dev/lite/scaffold.mjs --root <你的项目>
# 然后在项目里说「初始化项目」
```

安装、三个问题、日常循环和升级说明见 [lite/README.md](lite/README.md)。

### 升级已初始化的项目

`scripts/audit-context.mjs` 是初始化那天复制过去的，不会随框架自动更新（文件头写着它的 context-dev 版本号）。想升级：

```bash
node <技能目录>/scaffold.mjs --root <你的项目> --update-framework
```

它只覆盖 `scripts/` 下的框架代码。`AGENTS.md`、`docs/`、`.agents/evals/` 一律不动——`evals` 里有 init 访谈时写进去的项目红线用例，属于你的内容。

## 支持的宿主

本框架正式支持 **DSH（DeepSeek Harness）**，单一事实源，不做镜像副本：

| 宿主 | 状态 | 入口文件 | 技能目录 |
| --- | --- | --- | --- |
| DSH | 正式支持 | `AGENTS.md` | `.agents/skills/`（全局 `~/.dsh/skills/`） |
| Codex | 可安装，但尚未验证运行时路由 | `AGENTS.md` | 全局 `~/.codex/skills/` |

Codex 目前只验证了完整版五个 Skill 的安装、frontmatter 与脚本机械检查；Skill 发现、跨 Skill 调用和完整初始化流程尚未做宿主端到端验证，因此暂不列入正式支持范围。lite 复用同一套 `SKILL.md` 触发机制，但尚未单独做宿主端到端验证；当前对它的自动化保证是 scaffold 冒烟测试与 frontmatter 检查。

## 技能

- **init**：分阶段访谈，把「用户到底想要什么、红线、口径」写进分层文档。
- **product-design**：把产品需求收敛成「一个问题 → 一个输出 → 一个决定」的契约（init 在访谈产品形态时调用）。
- **ship-change**：交付改动的标准流程，第 7 步把「被纠正了什么、卡了 20 分钟」蒸馏进收件箱。
- **maintain-context**：定期体检，把收件箱合并进上下文，删掉过期内容。
- **record-decision**：把有取舍的技术决策写成 ADR。

## 结构

```
.agents/skills/                          完整版技能（自包含，唯一需要安装的东西）
  init/                     初始化：访谈 + 落盘 + 骨架脚手架
    SKILL.md                             分阶段访谈流程
    scaffold.mjs                         把 templates/ 生成到项目根
    references/                          访谈题库与落盘映射
    templates/                           项目骨架模板（被 scaffold 到项目根）
      AGENTS.md.tmpl                     工作手册模板（目标 150 行内 / 17 KiB 自律上限）
      docs/                              知识库：goals / architecture / glossary / roadmap / troubleshooting / decisions
      docs/learning-inbox.md             复盘蒸馏收件箱（队列）
      scripts/audit-context.mjs          确定性体检脚本
      .agents/evals/behavior-cases.md    行为红线用例
  product-design/                        产品契约访谈
  ship-change/                           交付改动的标准流程（含复盘蒸馏）
  record-decision/                       把技术取舍写成 ADR
  maintain-context/                      体检 + 合并收件箱 + 删过期内容
lite/                                    轻量版发行包（与完整版二选一）
  README.md                              安装 / 用法 / 与完整版差异
  scaffold.mjs                           把轻量模板生成到项目根
  skills/                                init + maintain 两个轻量技能
  templates/                             轻量骨架：AGENTS.md.tmpl、.gitignore、docs/plan.md、docs/log.md
tests/                                   框架脚本冒烟测试（node --test）
.github/workflows/ci.yml                 框架自身的 CI
README.md / LICENSE / .gitignore / .gitattributes
```

> 注意：体检脚本的 ROOT 由脚本自身位置推导。在**框架仓库**里直接运行 `templates/scripts/audit-context.mjs`，检查的是 `templates/` 模板树（初始化前状态），不是仓库根；要体检框架仓库根，用 `node .agents/skills/init/templates/scripts/audit-context.mjs --root .`。对项目运行请用脚手架生成的 `scripts/audit-context.mjs`。

## 设计取舍

- **为什么分层**：上下文窗口是有预算的。判断标准不是「这条信息有用吗」，而是「它值它占的位置吗」。
- **为什么是 150 行 / 17 KiB 双门禁**：行数是主尺（根目录一份 `AGENTS.md`），字节是备尺（根目录所有 AGENTS 文件合计）——抓"行数不多但每行很密"的写作。真正要控的是 token 预算，字节是行 / 字符 / 字节三种代理里跨语言偏差最小的（中文约 3 字节/token、英文约 4，差 30% 上下；字符数反而差 3~4 倍）。17 KiB 按 150 行目标和本仓库实测行密度 70~85 字节/行 标定；备尺对稀疏散文保持沉默是设计意图，不是需要修的死分支。
- **为什么只记模型猜不到的东西**：上下文的价值不来自「写得全」，而来自「补上了模型没法自己推断的那部分」——你的口径选择、历史包袱、被否决的方案、红线、项目特有的陷阱。"要写测试"、"注意错误处理"这类模型本来就知道的，写进文档纯属浪费预算。
- **为什么删比加更重要**：过期的规则比没有规则更糟——它会让 agent 主动做错事，而且错得很自信。每次体检都该有删除动作，优先删：换掉的技术对应的规则、已经内化成代码结构的约定、当时怕出错但从没出过错的叮嘱。
- **为什么用脚本**：能被脚本确定性判定的事（链接失效、占位符残留、技能缺 description），就不写成让模型自检的散文。
- **为什么模板里的 `AGENTS.md` 带 `.tmpl` 后缀**：宿主会递归发现仓库里所有 `AGENTS.md` 并全量注入。模板那份满是 `TODO(init)`，开头还写着"这个仓库还没初始化，第一件事运行 `/init`"——不加后缀，任何在框架仓库里干活的 agent 都会被指示去初始化框架本身，而且每轮对话都白吃这份预算。`scaffold.mjs` 复制到项目根时剥掉后缀。
- **为什么时效性检查读 git 提交时间而不是 mtime**：git 不保存 mtime，克隆、CI、换机器之后所有文件的 mtime 都是同一个 checkout 时间，基于 mtime 的"文档过期""闭环空转"检查会永久静默通过——正是本框架最忌讳的"安静地说谎"，还偏偏发生在专门抓它的检查里。未跟踪或有未提交改动的文件仍回退到 mtime：蒸馏刚写进收件箱还没提交时，纯 git 会把刚转过的闭环误报成"从没转"。
- **为什么符号链接防线到根为止、不承诺竞态安全**：`scaffold.mjs` 拒绝把符号链接当作项目根（否则骨架会整体落入链接目标），也拒绝沿仓库内符号链接越界写入；但检查与写入之间存在极窄的 TOCTOU 窗口——这是本地单用户场景可接受的最佳努力防线，不是对抗并发修改的安全边界，跨平台原子方案代价过高，明确不引入。
- **为什么有学习闭环**：初始化只保证「第一天就懂」，复盘蒸馏保证「越用越懂」。不靠"技能触发次数"、"文档读取频率"这类自觉统计——它们没有可靠的钩子，只会漂移；可靠的是任务里自然产生的纠正信号（哪里不懂、被纠正了什么、卡了多久）。
- **为什么 `roadmap.md` 必须有「明确不做」**：挡掉 agent 自作主张的扩张。
- **为什么单一事实源**：一份 `AGENTS.md` + 一份 `.agents/skills/`，不生成任何镜像副本——镜像会制造漂移，而漂移需要第二个机制去盯，属于自造复杂度。
- **为什么触发用散文而非机器契约**：DSH 按 `description` 触发技能，不消费优先级表或契约文件。状态驱动的技能锚定确定性信号（`init` 锚 `AGENTS.md` 顶部的「这个仓库还没初始化」引用块、`maintain-context` 锚脚本报错），意图驱动的技能靠子步骤串起来（init→product-design、ship-change→record-decision）。加第二份机器可读契约只会制造漂移，属于自造复杂度。
- **为什么 lite 自带一份 scaffold 而不是复用完整版**：`lite/` 要能被单独拷走安装，不能依赖完整版技能目录里的路径。重复约一百行路径与符号链接防线是发行独立性的代价；测试用三处版本号一致和相同的符号链接用例把两份 scaffold 锁在同一个行为边界里。
- **为什么轻量版不是把完整版删几行**：个人 / 中小型项目的瓶颈不是"问题太多"，而是"文档和流程比项目本身活得还久"。lite 因此砍掉自动体检、evals 和 ADR 编号系统，把闭环缩成"任务末尾追加 `docs/log.md` → `/maintain` 合并"；也不问敏感数据、不推荐换完整版，只保留和具体功能实现相关的最小问题集。
- **为什么框架 `AGENTS.md` 也带标记**：GitHub Template 会把仓库根目录的 `AGENTS.md` 原样复制进新仓库，而它开头写着“不要运行 init”——不处理会打断模板主路径。给框架维护者手册加 `FRAMEWORK-AGENTS` 标记，`scaffold.mjs` 只有在它和 README 的 `FRAMEWORK-README` 标记**同时**命中时才替换，用户自己的 `AGENTS.md` 依旧绝不覆盖。

## English summary

`context-dev` is a self-improving agent-context framework for DeepSeek Harness. The core idea: context is a budget. So it splits knowledge into four layers — `AGENTS.md` (loaded every conversation), skills (loaded on task match), `docs/` (read on demand), and scripts/evals (run on demand). A staged interview (`init`) captures "what only you know" — goals, red lines, terminology, rejected approaches — into that layered documentation. After every task, `ship-change` distills corrections and hard-won knowledge into a learning inbox; `maintain-context` periodically merges them back and prunes stale rules. The result: the agent gets smarter the more you use it, without re-explaining your project every time.

Language-agnostic — the skeleton is Markdown plus one zero-dependency Node script.

A `lite/` edition ships two skills (`init` and `maintain`) and four skeleton files for personal and small-to-medium projects that want long-term iteration without PR/CL/code-review overhead; it has no audit script, no evals, and a three-question interview focused on concrete feature implementation, with no safety valve pushing users to the full edition.

The five full-edition Skills can be installed in Codex, but runtime routing and the complete cross-Skill workflow have not yet been validated there; Codex is not currently an officially supported host.

## License

[MIT](LICENSE)
