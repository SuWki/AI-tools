# AI WorkHub V2 · MVP

> 2026-11-10 当前文档入口：[平台维护文档](docs/handbook/README.md)。新增四份 Word：整体优化与后续设计、业务逻辑、开发接手、部署与验收。代码基线 a1fa1f7；下方旧版本功能与验证表保留为历史，请以新文档和当前源码核对完成度。

> 2026-11-07 新增采购模块（后端 3.2.0）：独立供应商报价链接、同口径比价、目标价回复、承接、变更及统计。提供带运行时的 Windows 体验 ZIP，见 [采购模块使用说明](docs/PROCUREMENT-README.md)。尚未部署公网门户；体验包不是生产安装验收。

> 当前开发版本：V3.1。已接入三企业场景和版本化工单工作区，详见 [V3 开发与验证记录](docs/V3-development-status.md)。下方 V2 验证表为历史记录，不能代替 V3 验收。
>
> 新版后端构建命令：`mvn test`、`mvn package`，启动产物为 `backend/target/workhub-backend-3.2.0.jar`。前端仍使用 `npm run dev` / `npm run build`。若需使用独立后端端口，可设置 `VITE_API_TARGET`，例如 `http://127.0.0.1:18080`。

企业内部 AI 提效工作台的最小可运行版本：以「客户咨询 → 需求确认 → 回复草稿 → 跟进闭环」为主流程，辅以产品知识、业务工具、复盘分析和企业级数据隔离。

- 原型与方案依据：[总体设计与 MVP 实施方案](docs/reference/AI_WorkHub_V2_总体设计与MVP实施方案.docx)、[离线交互原型](docs/reference/AI_WorkHub_V2_Prototype.html)
- 当前实现核查：[2026-11-05 进度检查](docs/2026-11-05-implementation-review.md)（区分代码实现、构建验证和未完成验收项）
- 所有代码与运行产物均位于 `D:\AI-tools`

## 技术栈与关键决策

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | React 18 + TypeScript 5 + Vite 5 | 仅用原生 CSS，结构与交互对齐原型；无 UI 框架依赖 |
| 后端 | Java 8 + Spring Boot 2.7.18 + JdbcTemplate | 本机 JDK 为 1.8，Spring Boot 3.x 需要 Java 17，因此采用 2.7.18（兼容 Java 8） |
| 数据 | SQLite（`sqlite-jdbc`，`backend/data/workhub.db`） | 本地轻量持久化；启动自动建表与写入演示数据，Hikari 连接池固定为 1 |
| 认证 | 登录后签发 Bearer Token，保存于 `sessions` 表；BCrypt 校验密码 | 无 Spring Security 过滤链，使用拦截器 + 服务层租户校验，保持 MVP 简单可读 |
| 多租户 | `tenants` + `memberships`，所有业务表带 `tenant_id` | 每次查询/写入都从登录会话取当前租户；切换公司需具备成员关系 |
| AI | 不调用任何真实模型 | 方案将真实 AI/API 排除在 MVP 外；回复模板与 Prompt 由业务规则拼装，可复制到外部工具 |

## 目录结构

```
D:\AI-tools
├─ .github/workflows/        GitHub Pages 构建与部署工作流
├─ backend/                  Spring Boot 后端
│  ├─ src/main/java/com/aiworkhub/
│  │  ├─ auth/               登录、会话、拦截器
│  │  ├─ controller/         REST 控制器
│  │  ├─ service/            工单、知识、分析、仪表盘、导出、审计
│  │  └─ resources/schema.sql
│  ├─ data/                  SQLite 数据文件（首次启动自动生成）
│  └─ target/                构建产物
├─ frontend/                 React + Vite 前端
│  ├─ index.html             Vite 入口
│  └─ src/
│     ├─ demo/               浏览器本地演示 API 与样例数据（Pages 使用）
│     ├─ realApi.ts          真实后端 API 实现
│     └─ pages/              六个业务页面
└─ README.md
```

## 启动步骤

### 0. 环境要求

- JDK 8 及以上、Maven 3.6+
- Node.js 18+、npm 9+
- 无需安装数据库，首次启动自动创建 SQLite

### 1. 启动后端（终端 1）

```powershell
cd D:\AI-tools\backend
mvn clean package -DskipTests
java -jar target\workhub-backend-3.2.0.jar
```

- 端口：`8080`
- 健康检查：<http://localhost:8080/api/health>
- 数据文件：`D:\AI-tools\backend\data\workhub.db`（首次启动自动写入 3 家企业与演示数据）

重置演示数据（任选其一）：

```powershell
# 方式 A：停掉后端，删除数据库后重启
Remove-Item D:\AI-tools\backend\data\workhub.db
java -jar target\workhub-backend-3.2.0.jar
```

也可在页面「设置」中使用「重置演示数据」（仅 ADMIN），或在 API 中调用 `POST /api/admin/reset-demo`。

### 2. 启动前端（终端 2）

```powershell
cd D:\AI-tools\frontend
npm install
npm run dev
```

浏览器打开：<http://127.0.0.1:5173>（Vite 已将 `/api` 代理到 `http://localhost:8080`）

生产构建：

```powershell
npm run build
```

产物在 `frontend/dist`。这是 React SPA，`frontend/index.html` 是构建入口，必须通过 HTTP 服务打开，不能直接以 `file://` 双击运行。可执行 `npm run preview`（端口 4173，已内置 `/api` → `8080` 代理）验证生产构建。

GitHub Pages 演示构建（静态托管、无后端）：

```powershell
$env:VITE_BASE='/AI-tools/'; $env:VITE_DEMO_MODE='true'; npm run build
```

- `VITE_BASE=/AI-tools/` 把静态资源改为 `/AI-tools/assets/...`，匹配仓库子路径，避免 Pages 白屏。
- `VITE_DEMO_MODE=true` 让前端改用浏览器内置样例数据与 localStorage，完全不请求 `/api`。
- 产物同样在 `frontend/dist`，用 `$env:VITE_BASE='/AI-tools/'; npm run preview` 可在本地模拟 Pages 路径（打开 <http://localhost:4173/AI-tools/>）。

## 在线演示（GitHub Pages）

- 访问地址形式：`https://<owner>.github.io/AI-tools/`；本仓库为 `https://suwki.github.io/AI-tools/`（推送到 `main` 后由工作流发布）。
- 工作流：`.github/workflows/deploy-pages.yml`，在 push 到 `main` 时执行 `npm ci` + 演示构建，并通过 `actions/configure-pages` / `actions/upload-pages-artifact` / `actions/deploy-pages` 发布 `frontend/dist`。
- 首次使用需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**（不是 “Deploy from a branch”）。
- 若修改仓库名，需同步修改工作流中的 `VITE_BASE`（例如 `/new-repo-name/`）。

演示模式限制：

- 只有静态前端，**没有后端服务**，所有“接口”由 `frontend/src/demo/demoApi.ts` 在浏览器内模拟。
- 数据保存在当前浏览器 `localStorage`（工单、知识、复盘等），**不持久化到服务器**；清理浏览器数据、换设备或换浏览器后即恢复初始样例。
- 登录使用内置演示账号（统一密码 `demo1234`），仅用于演示，不是真实账号体系；请勿录入真实敏感客户信息。
- 不调用真实 AI，也无文件导入、真实消息渠道等能力；正式能力需启动后端并使用真实模式。

切回真实后端：

- 默认构建（不设置 `VITE_DEMO_MODE` 或设为 `false`）即使用 `frontend/src/realApi.ts`，行为与本地开发一致，请求 `/api`。
- 本地开发/预览已配置 `/api` → `http://localhost:8080` 代理；部署到自有服务器时，由反向代理把 `/api` 指向 Spring Boot 后端。
- 代码隔离：`frontend/src/api.ts` 只按 `VITE_DEMO_MODE` 选择 `demoApi` / `realApi`，页面与 `ApiClient` 接口不变；真实模式默认不受演示代码影响。

## 演示账号（统一密码 `demo1234`）

| 账号 | 工作空间 | 角色 |
|---|---|---|
| `admin@workhub.demo` | 空压机 / 润滑油 / 羊驼 3 家（可切换） | ADMIN |
| `sales@compressor.demo` | 空压机设备公司 | SALES |
| `reviewer@compressor.demo` | 空压机设备公司 | REVIEWER |
| `manager@compressor.demo` | 空压机设备公司 | MANAGER |
| `sales@lubricant.demo` | 润滑油贸易公司 | SALES |
| `sales@alpaca.demo` | 羊驼工艺品公司 | SALES |

## 已实现范围（对应方案模块）

### M01 企业身份、角色与隔离 · P0
- 邮箱+密码登录，BCrypt 校验，Bearer Token 存服务端 `sessions`。
- 3 家企业、6 个账号、成员-角色关系（ADMIN / SALES / REVIEWER / MANAGER）。
- 企业切换仅对拥有成员关系的用户开放；切换后所有页面数据随之刷新。
- **服务端强制隔离**：所有工单、知识、复盘、规则、审计查询均带当前 `tenant_id`；跨企业访问返回 404/403，前端无法绕过。
- 角色校验：知识审核需 ADMIN/REVIEWER；重置演示数据需 ADMIN；审计日志需 ADMIN/MANAGER。

### M02 客户案例闭环 · P0
- 工单创建、列表、状态筛选、详情。
- 状态流转：待处理 → 处理中 → 已完成（可重新打开），状态变化自动写入操作记录。
- 客户原话、需求确认清单、参考回复、下一步行动、跟进记录、操作历史。
- 复制回复模板、复制 AI 分析指令，复制回复会写入审计。

### M03 需求确认清单 · P1
- 按企业/行业分别配置必问字段：空压机 4 项、润滑油 4 项、羊驼 4 项。
- 仪表盘与工单详情按当前企业展示；Prompt 构建时注入这些规则。

### M04 产品知识库 · P0
- 列表、关键词搜索（名称 / SKU / 简介，支持中英文）。
- 新增资料默认「待审核」，展示审核状态与来源。
- ADMIN/REVIEWER 可审核通过，记录审核人并递增版本号；未审核状态在列表中清晰标识。
- 预置空压机、润滑油、羊驼三类示例资料，均标注「示意/待核验」。

### M05 业务模板与人工回复 · P1
- 按企业提供回复模板与下一步行动建议（压缩空气、润滑油、工艺品各一套，中英双语）。
- Prompt 构建器支持 4 类任务：客户回复建议、销售话术诊断、产品信息整理、商品文案草稿。
- 生成内容只使用当前企业知识条目，并标注每条资料是否已审核；不调用模型。

### M06 中英文双语 · P1
- 界面全量中英切换，语言写入浏览器并在服务端保存用户偏好。
- 内置企业名、示例工单、示例知识、规则、模板随语言切换。
- 员工自行输入的客户内容不自动翻译（符合方案约束）。

### M07 销售复盘 · P1
- 粘贴对话 → 生成 4 项人工检查清单（明确提示「不调用 AI」）。
- 可保存人工/外部 AI 复盘结论，并列出历史复盘记录。

### M08 统计与数据导出 · P1
- 仪表盘：工单总数、待处理、已完成、知识条目数。
- 设置页：工单、知识、复盘、已完成数量。
- `GET /api/export` 导出当前企业 JSON（工单含跟进记录、知识、复盘、规则），前端生成下载文件。

### M09 基础审计 · P1
- 记录：创建工单、状态变更、新增跟进、复制回复、创建知识、审核知识、保存复盘、重置演示。
- 审计记录包含企业、操作人、动作、对象、详情与时间。
- API `GET /api/audit?limit=50`（ADMIN/MANAGER）。
- 说明：本 MVP 未做审计日志页面，仅在服务端记录并提供 API。

## 主要 API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录，返回 token + 用户/企业/角色 |
| GET | `/api/auth/me` | 当前会话 |
| POST | `/api/auth/switch-tenant` | 切换工作空间（校验成员关系） |
| PATCH | `/api/auth/locale` | 保存语言偏好 |
| GET | `/api/dashboard` | 指标、最近工单、需求规则 |
| GET/POST | `/api/cases` | 工单列表 / 新建 |
| GET | `/api/cases/{id}` | 工单详情 + 跟进历史 |
| PATCH | `/api/cases/{id}/status` | 状态流转 |
| POST | `/api/cases/{id}/notes` | 添加跟进 |
| GET | `/api/cases/{id}/reply` | 回复模板 + 需求规则 |
| POST | `/api/cases/{id}/reply-copy` | 复制回复审计 |
| GET/POST | `/api/knowledge` | 知识列表 / 新增 |
| PATCH | `/api/knowledge/{id}/review` | 审核通过（ADMIN/REVIEWER） |
| GET | `/api/tools/prompt` | 生成指令（type、caseId、lang） |
| POST | `/api/analysis/checklist` | 生成检查清单 |
| GET/POST | `/api/analysis/reviews` | 复盘列表 / 保存 |
| GET | `/api/settings` | 设置页统计 |
| GET | `/api/export` | 当前企业 JSON 导出 |
| POST | `/api/admin/reset-demo` | 重置当前企业演示数据（ADMIN） |
| GET | `/api/audit` | 审计日志（ADMIN/MANAGER） |
| GET | `/api/health` | 健康检查（免登录） |

## 本地验证结果

验证环境：Windows、JDK 1.8.0_202、Maven 3.9.10、Node 24、Chrome（浏览器自动化）。

| 验证项 | 结果 | 证据摘要 |
|---|---|---|
| 后端构建 | 通过 | `mvn clean package -DskipTests`，Spring Boot 2.7.18 启动成功，Tomcat 8080 |
| 前端构建 | 通过 | `tsc --noEmit && vite build`，46 modules，无类型错误 |
| Pages 演示构建 | 通过 | `VITE_BASE=/AI-tools/ VITE_DEMO_MODE=true npm run build`；`dist/index.html` 引用 `/AI-tools/assets/...` |
| Pages 产物预览 | 通过 | `VITE_BASE=/AI-tools/ npm run preview` 后访问 `http://localhost:4173/AI-tools/` 返回 200，JS/CSS 均 `text/javascript`/`text/css` 200 |
| Pages 演示交互 | 通过 | 浏览器登录 admin → 2 工单 / 2 知识；C-1024 标记处理中成功；`localStorage` token 为 `demo:...`，网络日志无 `/api` 请求 |
| 生产构建预览 | 通过 | `npm run preview` 启动 4173，页面返回 200，`/api/health` 代理返回 ok |
| 登录 / 未授权 | 通过 | 正确账号返回 token；错误 token 返回 401 |
| 租户隔离 | 通过 | `sales@lubricant.demo` 访问空压机工单 `C-1024` 返回 404；切换企业后列表由 3 条变为 1 条 |
| 角色校验 | 通过 | SALES 审核知识返回 403；ADMIN 审核成功，version 1→2 |
| 工单闭环 | 通过 | 新建 → 处理中 → 跟进 → 已完成；状态变更与跟进均进入历史；浏览器端同样通过 |
| 回复模板 / 需求清单 | 通过 | 返回 4 项规则与双语模板；复制动作写入审计 |
| Prompt 构建 | 通过 | 中英文 Prompt 均包含企业、客户原话与知识条目，且标注 reviewed/unreviewed |
| 检查清单 / 复盘 | 通过 | 返回 4 项检查点；保存复盘后列表可见（浏览器已验证） |
| 仪表盘统计 | 通过 | 初始种子：空压机 2 工单 / 2 知识，润滑油 1/1，羊驼 1/1 |
| 知识审核 UI | 通过 | 浏览器新增 BR-01 → 待审核 → 审核通过 → 已审核 |
| 语言切换 | 通过 | 中文 ↔ EN 全站标题与内置样例切换，切回中文正常 |
| 企业切换 UI | 通过 | 下拉切换到润滑油公司，工单/知识立即替换 |
| 数据导出 | 通过 | API 返回工单、知识、复盘、规则；浏览器点击导出出现成功 toast |
| 重置演示数据 | API 通过 | ADMIN 调用后恢复 2 工单 / 2 知识；UI 按钮已实现，但浏览器自动化在确认弹窗处超时，未完成该步骤的自动化验证 |
| 退出登录 | 通过 | 退出后回到登录页；SALES 账号仅有一个工作空间且下拉禁用 |

### 验证过程中发现并修复的问题

1. 前端页面文件初始使用了错误的相对导入路径（`./api`），TypeScript 构建报 7 个 `TS2307`；改为 `../api` 等上级路径后构建通过。
2. 复制功能在无剪贴板权限的浏览器环境中直接返回失败；`clipboard.ts` 增加 `execCommand` 兜底逻辑，正常浏览器与受限环境均可降级复制。
3. 重新打包时旧后端进程占用了 jar，导致 Maven repackage 无法重命名；停止旧进程后重新构建成功。
4. 浏览器自动化部分步骤因元素在视口外或确认弹窗超时被中断，经复核属于测试脚本限制；重新以单页、聚焦步骤验证后通过（检查清单、工单闭环、知识审核等）。
5. 首次健康检查在数据种子完成前请求会看到 0 条数据（启动竞态），等待种子完成后统计恢复为 2/2；数据库文件删除后重启可稳定复现初始数据。

## 未实现 / 待办清单

- **真实 AI 接入**：未调用任何模型；回复、清单、Prompt 均为规则模板，需人工审核后使用。
- **知识文件导入**：未实现 PDF/图片上传、OCR、切片、向量检索；仅支持手工录入文本。
- **外部渠道接入**：未接入 WhatsApp Business API、邮件收发或自动同步会话。
- **经营分析**：未实现成交金额、赢单/输单归因、处理时长与趋势图表。
- **成员与权限管理 UI**：账号、角色、企业成员均为种子数据，无邀请/停用/改角色界面；需求规则与回复模板也无管理界面。
- **审计页面**：仅服务端记录 + API，无前端查看页面。
- **附件与更多导出格式**：未实现附件上传、PDF/CSV 导出；仅 JSON 导出。
- **生产安全与运维**：无 SSO、密码找回、Token 刷新/吊销、全局限流、审计归档、备份恢复、HTTPS/反向代理、Docker；CI 仅包含 GitHub Pages 前端部署，无后端构建与自动化测试流水线。
- **删除能力**：工单与知识条目暂无删除/归档操作（原型未提供）。
- **性能与并发**：SQLite + 单连接池适合本地演示，不适合多实例生产部署；上线应替换为 PostgreSQL/MySQL 并引入缓存、队列与对象存储。

## 使用边界

本项目是试点级 MVP：具备登录、租户隔离与角色校验，但所有产品参数、价格、库存、交期均来自「示意数据」，不得作为对外承诺依据；请勿录入真实敏感客户信息。正式上线前需补齐上述待办并完成安全与合规评审。
