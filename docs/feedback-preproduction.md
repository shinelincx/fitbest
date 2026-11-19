# Fitbest #2 预发布实施与验收记录

工作树基线为 `a17d5ae`，与绑定仓库的 `main` 相同。本轮核对了 GitHub Issue #2 全文的 25 条用户故事、实施和测试要求，以及批准摘录。以下记录覆盖本轮工作树的实施和验证状态。 [GitHub Issue #2](https://github.com/shinelincx/fitbest/issues/2)

## 覆盖与差异

| Issue 范围 | main 核对结果 | 本轮变更 |
| --- | --- | --- |
| 1–14，三端入口与提交体验 | Fitbest 设置缺少入口。HYROX、BTWE 帮助页有 FAQ 和写入本地存储的反馈表单。 | Fitbest 设置新增入口，两赛事端在原帮助页提交，保留 FAQ 和联系信息。三端共用表单，支持图片预览、移除、错误反馈、防重复、保留草稿并重试，收到持久化回执后才显示成功。 |
| 4–5、21–22，账号和数据范围 | 服务端以签名令牌和活跃账号校验用户，以签名令牌、后台账号状态、角色、组织、门店和会话版本校验管理员。用户表无组织归属，训练记录的业务授权无法用于推导反馈权限。 | 登录反馈关联已验证用户。访客的提交者为空。平台 `super` 跨来源读取并处理。非 `super` 的反馈列表、详情、图片及操作缺少已确认授权，当前返回 403。 |
| 15–22，后台工作流 | 后台无反馈模块。 | 提供来源、状态和时间过滤、分页、详情、受保护的图片及历史。版本条件更新提供处理、解决、重开和备注，冲突返回 409，刷新详情后可重试。 |
| 23–25，升级、存储和一致性 | Spring Boot 统一服务使用 PostgreSQL 与 Flyway，已有 Redis 和两种 Nginx 入口模板。旧赛事端反馈存储在设备上。 | V14 增量创建反馈、附件和处理历史。附件使用 UUID 与数据库字节列，写入和主记录使用同一事务。保留旧反馈存储键的数据。 |
| 手机、HD 与原生选图 | Fitbest Android/iOS 均为 Capacitor 包装，既有数据导入使用 `@capawesome/capacitor-file-picker` 和 Filesystem。原生当前使用本地访客资料，登录路由跳回个人页。 | 原生反馈用现有插件的图片选择器和 Filesystem，浏览器用多选文件控件。原生包通过构建环境指定预发布 HTTPS API。原生访客可走提交接口，登录验收走已有云账号入口。 |

### 人工审议项

- **只读数据范围。** 请维护方确认反馈与组织、门店或显式授权记录的关系，以及哪些角色可读取访客反馈。当前只有已经得到批准的 `super` 访问范围。后台可以呈现服务端给出的只读状态，实际服务端现阶段不会向无已确认范围的只读账号提供反馈。
- **代理来源 IP。** 请维护方核对实际代理直连服务端的对端地址、上游 CDN 或负载均衡和防止绕过的入口边界。服务端默认使用底层连接的 IP。只有明确配置的代理对端可提供由 Nginx 覆盖的 `X-Fitbest-Client-IP`。配置缺失时，经过同一代理的匿名用户共享该代理对端的限频额度。
- **图片解码边界。** 为限制解码内存，当前实现拒绝超过 2,500 万像素的图片，即使压缩体积在 5 MiB 内。Issue #2 未指定像素限制，提交维护方确认实际设备兼容性和该额外边界。
- **原生登录覆盖。** 当前原生产品入口仅提供本地访客模式。是否开放原生云账号入口须人工决定。Fitbest Web/HD、HYROX、BTWE 复用现有登录体系。

## 联调契约

- `POST /api/v1/feedback` 使用 `multipart/form-data`。发送 `source`（`fitbest`、`hyrox` 或 `btwe`）、`text` 及零到三个 `images` 部件，另带 UUID `Idempotency-Key`。携带 Bearer 时须通过已有身份校验。合法提交返回 `{id, createdAt}`。同一来源及身份范围、同键同内容返回原回执，同键不同内容返回 409。匿名请求先检查来源 IP 的滚动 60 秒窗口，每个窗口最多接受五次，包括同键重试。
- 后台使用既有管理 Bearer。 `GET /api/v1/admin/feedback` 支持 `source`、`status`、`from`（含）、`to`（不含）、从 1 开始的 `page` 与 `size`。详情为 `GET /api/v1/admin/feedback/{id}`，图片为同路径下的 `attachments/{attachmentId}`，图片与详情走相同授权。
- `POST /api/v1/admin/feedback/{id}/actions` 提交 `version`、`action` 及可选 `note`。操作值为 `start`、`resolve`、`reopen`、`note`，其中 `note` 操作要求非空备注。遇到 409 时需要刷新详情、确认最新状态后再提交。回执、列表和历史在 HTTP 边界输出 ISO UTC 字符串，数据库使用带时区的时间类型。
- 联调使用隔离 PostgreSQL、Redis 与样本数据。Nginx 配置保留旧 API 路由，反馈上传的两个入口限为 16 MiB。部署代理时按已确认的服务端连接 IP 填写逗号分隔的 `FEEDBACK_TRUSTED_PROXIES`。原生包构建时传入隔离预发布 `VITE_API_BASE=https://<预发布域>/fit-best/api/v1`，由预发布 CORS 配置允许验收包的实际 WebView Origin。

## 本工作树实际验证

| 项目 | 状态 | 证据与剩余范围 |
| --- | --- | --- |
| 空库初始化、V13 增量升级 | 通过，数据库层 | PostgreSQL 17.11 单用户模式实跑 V1–V14，另跑 V13 至 V14 并保留旧账号样本。Flyway Java 测试未运行。 |
| 幂等约束、附件事务与重启 | 通过，数据库层 | 重放同一键后仅有一条反馈和一张附件。注入重复附件位置约束错误并回滚后，重启数据库进程读取到原反馈和原始附件字节，无测试事务残留。Spring 应用重启、并发 HTTP 和服务端事务集成未运行。 |
| TS/TSX、配置和旧 FAQ | 通过，静态检查 | 已解析变更的 TS/TSX、Spring YAML 和 Maven POM，`git diff --check` 通过。两端 FAQ 内容与 main 相同，新表单不访问旧反馈存储键。旧客户端实际运行及样本本地数据保留验收未运行。 |
| 运行环境准备 | 失败，环境限制 | 沙箱拒绝 TCP 套接字和 Unix 服务端绑定，无法启动联网 PostgreSQL/Redis。未提供 JDK、Maven 或 Nginx。前端离线依赖安装因缓存缺失失败，网络 DNS 受限。 |
| 三端访客和登录至后台、权限、ISO 回执、Redis 限频、后台 403/409/500 | 未运行 | 已加入 `FeedbackPostgresTest` 和 `feedback.spec.ts`。服务端用例覆盖三来源身份、图片授权、同键五次及第六次 429、跨来源并发、写入冲突和错误边界。浏览器用例使用模拟响应验证页面交互，真实权限仍由 HTTP 用例验证。 |
| 体积上限与反代 | 未运行 | 配置已核对。直接请求的目标为 Spring JSON 413，代理提前拒绝的目标为 Nginx 413（默认错误正文通常为 HTML）。本轮没有真实 HTTP 响应可比较。 |
| 手机、HD、键盘、Android/iOS 原生选图 | 未运行 | 已接入浏览器和原生选择器。待在手机和 HD 视口验证三端文字、预览移除、失败保留、重试和键盘，待 Android/iOS 检查选择、取消、格式、大小和 HTTPS 上传。 |

预发布复验使用 `FITBEST_SYNC_PG_URL`、`FITBEST_SYNC_PG_USER`、`FITBEST_SYNC_PG_PASSWORD` 和 `FITBEST_FEEDBACK_REDIS_URL` 指向独立服务。在 `fitbest-server` 运行 `mvn -Dtest=FeedbackPostgresTest,FlywayBaselinePostgresTest test`，在 `fit-best-admin` 安装依赖和 Playwright Firefox 后运行 `npm test -- tests/feedback.spec.ts`。使用同一个隔离 4 MiB 文件构造四个附件部件，使整包因部件开销超过 16 MiB，同时单部件小于 5 MiB。分别向服务端直连 `/api/v1/feedback` 和代理 `/fit-best/api/v1/feedback` 上传，采集状态、Content-Type、正文和数据库写入情况，再通过合法小请求验证两路径正常。不同测试使用独立来源 IP 或等待滚动窗口结束。

## 正式发布前维护方核对

| 项目 | 确认状态 |
| --- | --- |
| 生产容量与图片解码并发、可用数据库空间、备份恢复 | 待确认 |
| 反馈、附件及处理历史保留期限 | 待确认 |
| 正式部署设施、持久卷、Redis、信任代理和入口 | 待确认 |
| 发布负责人 | 待确认 |
| 实际验收设备及版本（手机、HD、Android、iOS、浏览器） | 待确认 |

本记录属于预发布实施和局部验收。完整联合验收仍待运行。
