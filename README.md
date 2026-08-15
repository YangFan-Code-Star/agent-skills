<!-- FRAMEWORK-README：本 README 描述 context-dev 框架本身。复制后运行 /init 初始化时，把它整份换成你项目的说明，连同这一行删掉。 -->

# context-dev

一套让 agent 越用越懂项目的技能框架：把「只有你知道、代码里读不出来」的信息固化成按需加载的分层文档，每次任务结束后把「纠正信号」蒸馏回收件箱、定期合并回上下文，形成自我进化的闭环。

语言无关——骨架是 Markdown + 一个零依赖 Node 脚本，源码目录留空，由初始化访谈按项目形态生成。

> **English:** A self-improving agent-context framework for DeepSeek Harness. It turns "what only you know" into layered, on-demand documentation, then distills every task's corrections back into that context — so the agent gets smarter the more you use it. See [English summary](#english-summary).

## 它解决什么

大多数项目文档在讲「系统怎么造」，没有一处讲「你想要什么、为什么、哪些不能碰」。后果是 agent 每次都要被重新教一遍：反复提议被否决过的方案、凭空猜测业务口径、在文档腐烂后照着旧信息自信地干错事。

这套框架把「教会 agent」从口口相传，变成文件结构 + 强制流程。

## 两种用法

### A. 作为新项目模板

```bash
git clone https://github.com/YangFan-Code-Star/context-dev.git my-project
cd my-project
rm -rf .git && git init
# 在 agent 里打开，说「初始化项目」即可（描述自动触发，也可显式调用 init 技能）
```

`init` 先生成骨架（`AGENTS.md`、`docs/`、`scripts/`、`.agents/evals/`、`.gitignore`），再分阶段访谈你——先定位项目，再按形态（Web / CLI / 数据流水线 / 库 / 机器学习 / 自动化脚本）深挖，然后问红线与范围。每个阶段结束立刻落盘，随时可中断、可续问。

### B. 装进现有项目

只需把技能目录拷进你项目，再跑一次初始化：

```bash
# Windows (PowerShell)：
Copy-Item context-dev\.agents\skills\* <你的项目>\.agents\skills\ -Recurse
# macOS / Linux：
# cp -r context-dev/.agents/skills/* <你的项目>/.agents/skills/
# 然后在项目里说「初始化项目」即可
```

脚手架只创建**缺失**的骨架文件，绝不覆盖你已有的 `AGENTS.md`、`docs/`、`scripts/`。技能也可装到全局 `~/.dsh/skills/`，之后在任何项目里都能直接调用初始化。

## 支持的宿主

本框架针对 **DSH（DeepSeek Harness）** 设计，单一事实源，不做镜像副本：

| 入口文件 | 技能目录 |
| --- | --- |
| `AGENTS.md` | `.agents/skills/`（全局 `~/.dsh/skills/`） |

## 技能

- **init**：分阶段访谈，把「用户到底想要什么、红线、口径」写进分层文档。
- **product-design**：把产品需求收敛成「一个问题 → 一个输出 → 一个决定」的契约（init 在访谈产品形态时调用）。
- **ship-change**：交付改动的标准流程，第 7 步把「被纠正了什么、卡了 20 分钟」蒸馏进收件箱。
- **maintain-context**：定期体检，把收件箱合并进上下文，删掉过期内容。
- **record-decision**：把有取舍的技术决策写成 ADR。

## 结构

```
.agents/skills/                          技能（自包含，唯一需要安装的东西）
  init/                     初始化：访谈 + 落盘 + 骨架脚手架
    SKILL.md                             分阶段访谈流程
    scaffold.mjs                         把 templates/ 生成到项目根
    references/                          访谈题库与落盘映射
    templates/                           项目骨架模板（被 scaffold 到项目根）
      AGENTS.md                          工作手册模板（目标 150 行内 / 32 KiB 自律上限）
      docs/                              知识库：goals / architecture / glossary / roadmap / troubleshooting / decisions
      docs/learning-inbox.md             复盘蒸馏收件箱（队列）
      scripts/audit-context.mjs          确定性体检脚本
      .agents/evals/behavior-cases.md    行为红线用例
  product-design/                        产品契约访谈
  ship-change/                           交付改动的标准流程（含复盘蒸馏）
  record-decision/                       把技术取舍写成 ADR
  maintain-context/                      体检 + 合并收件箱 + 删过期内容
  tests/                                 脚本冒烟测试（node --test，见 .github/workflows/）
README.md / LICENSE / .gitignore
```

> 注意：体检脚本的 ROOT 由脚本自身位置推导。在**框架仓库**里直接运行 `templates/scripts/audit-context.mjs`，检查的是 `templates/` 模板树（初始化前状态），不是仓库根；对项目运行请用脚手架生成的 `scripts/audit-context.mjs`。

## 设计取舍

- **为什么分层**：上下文窗口是有预算的。判断标准不是「这条信息有用吗」，而是「它值它占的位置吗」。
- **为什么只记模型猜不到的东西**：上下文的价值不来自「写得全」，而来自「补上了模型没法自己推断的那部分」——你的口径选择、历史包袱、被否决的方案、红线、项目特有的陷阱。"要写测试"、"注意错误处理"这类模型本来就知道的，写进文档纯属浪费预算。
- **为什么删比加更重要**：过期的规则比没有规则更糟——它会让 agent 主动做错事，而且错得很自信。每次体检都该有删除动作，优先删：换掉的技术对应的规则、已经内化成代码结构的约定、当时怕出错但从没出过错的叮嘱。
- **为什么用脚本**：能被脚本确定性判定的事（链接失效、占位符残留、技能缺 description），就不写成让模型自检的散文。
- **为什么有学习闭环**：初始化只保证「第一天就懂」，复盘蒸馏保证「越用越懂」。不靠"技能触发次数"、"文档读取频率"这类自觉统计——它们没有可靠的钩子，只会漂移；可靠的是任务里自然产生的纠正信号（哪里不懂、被纠正了什么、卡了多久）。
- **为什么 `roadmap.md` 必须有「明确不做」**：挡掉 agent 自作主张的扩张。
- **为什么单一事实源**：一份 `AGENTS.md` + 一份 `.agents/skills/`，不生成任何镜像副本——镜像会制造漂移，而漂移需要第二个机制去盯，属于自造复杂度。
- **为什么触发用散文而非机器契约**：DSH 按 `description` 触发技能，不消费优先级表或契约文件。状态驱动的技能锚定确定性信号（`init` 锚 `TODO(init)` 残留、`maintain-context` 锚脚本报错），意图驱动的技能靠子步骤串起来（init→product-design、ship-change→record-decision）。加第二份机器可读契约只会制造漂移，属于自造复杂度。

## English summary

`context-dev` is a self-improving agent-context framework for DeepSeek Harness. The core idea: context is a budget. So it splits knowledge into four layers — `AGENTS.md` (loaded every conversation), skills (loaded on task match), `docs/` (read on demand), and scripts/evals (run on demand). A staged interview (`init`) captures "what only you know" — goals, red lines, terminology, rejected approaches — into that layered documentation. After every task, `ship-change` distills corrections and hard-won knowledge into a learning inbox; `maintain-context` periodically merges them back and prunes stale rules. The result: the agent gets smarter the more you use it, without re-explaining your project every time.

Language-agnostic — the skeleton is Markdown plus one zero-dependency Node script.

## License

[MIT](LICENSE)
