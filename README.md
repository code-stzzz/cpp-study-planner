# 知程 · C++ 信奥学习规划工作台

供多位老师在本机管理班级、学生和课程，按每周上课进度、寒暑假集训与 GESP 大纲生成学习路线，审核调整后导出家长版 PDF。

## 当前功能

- 管理老师、班级、学生，以及班级进度和学生个人进度。
- AC 班 U1–U8 共 104 课：U1 包含 8 次数理课；冬夏令营保留逐日大纲。
- 在完整规划周期内匹配 GESP 3、6、9、12 月场次，支持老师指定或推迟场次后重新匹配路线。
- 绑定兼容 Chat Completions 的 API，生成可编辑的路线与建议；密钥仅在后端加密保存。
- 保存草稿与不可变定稿版本；导出包含整体路线图、学习建议和阶段详解的 PDF。阶段内容支持连续分页、续页标题和重复表头。

## 本机运行

需要 Node.js 24 或更高版本、Python 3，以及 ReportLab。Windows 默认使用微软雅黑；也可以通过 `PLANNER_FONT` 指定兼容的中文字体。

```powershell
python -m pip install -r app/requirements.txt
cd app
node server.mjs
```

Windows 也可以双击 `app/启动网站.cmd`，该启动文件优先使用本机 Codex 配套的 Node.js，否则使用 PATH 中的 Node.js。网站默认位于 <http://127.0.0.1:4317/>；首次运行设置管理员账号，再添加老师与学生。

PDF 生成器优先使用本机 Codex 配套的 Python，否则使用 PATH 中的 `python`；可通过 `PLANNER_PYTHON` 指定 Python 可执行文件。详细操作与当前功能边界见 [使用说明](app/README.md)。

## 验证

```powershell
python -m pip install -r app/requirements-dev.txt
cd app
node --test tests/*.test.mjs
```

如果没有 Codex 配套 Python，运行测试前请将 `PLANNER_PYTHON` 设置为本机 Python 的绝对路径。测试使用独立临时数据库和本机模拟接口，不访问真实学生数据或收费模型接口。

## 目录

- `app/`：本机服务、网页、PDF 导出、课程种子与测试。
- `data/`：课程、集训和考纲的结构化资料与来源文件。
- `docs/`：需求草案、资料整理与考级匹配说明。

运行后创建的 `app/.data/` 保存学生、账号、规划和加密密钥，已被 Git 忽略。备份本机业务数据时需另外完整备份该目录；从仓库重新下载只会得到代码和课程资料。

目前面向本机 MVP 验证，未部署公网。课程进度用于推算教学安排，学生是否适合参加认证仍由老师结合测评判断。
