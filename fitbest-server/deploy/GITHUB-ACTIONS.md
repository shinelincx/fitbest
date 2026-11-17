# GitHub Actions 生产部署

CI 在 main 的提交通过测试并发布镜像后，可通过 SSH 部署到已有服务器。部署只在仓库变量 `DEPLOY_ENABLED` 为 `true` 时运行，也可以在 Actions 页面手动运行 main 分支的 FITBEST CI/CD。

在仓库 Settings → Secrets and variables → Actions 配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `DEPLOY_ENABLED` | 配置核对完成后设置为 `true` |
| Variable | `DEPLOY_HOST` | 服务器地址 |
| Variable | `DEPLOY_PORT` | SSH 端口，默认 22 |
| Variable | `DEPLOY_USER` | SSH 用户 |
| Variable | `DEPLOY_PATH` | 服务器已有部署目录，例如 `/opt/fitbest/server` |
| Variable | `DEPLOY_COMPOSE_PROJECT` | 必填，已有 Compose 项目名。必须与现有项目相同，以继续使用原有数据卷 |
| Secret | `DEPLOY_SSH_PRIVATE_KEY` | SSH 私钥 |
| Secret | `DEPLOY_SSH_KNOWN_HOSTS` | 经过独立核验的服务器 SSH 主机公钥记录 |
| Secret | `FITBEST_PRODUCTION_ENV` | 完整的生产 `.env` 内容，包括原有数据库密码及 JWT、二维码签名等密钥 |

首次部署前，将服务器现有的 `/opt/fitbest/server/.env` 完整复制到 `FITBEST_PRODUCTION_ENV`，包括所有可选业务参数；部署会逐字节核对该文件，避免首次迁移时覆盖现有配置。请使用安全渠道，勿把内容提交到仓库或粘贴到公开日志。配置文件为 Docker Compose 的 `.env` 格式，含特殊字符的值应按 Compose 规则引用。当前工作流拉取公开的 GHCR 镜像；使用私有镜像时需为部署任务配置包读取权限和 GHCR 登录。

服务器需要 Docker Compose、curl、tar 和 Bash；部署账户需要 Docker 权限。确认服务器的现有 Compose 项目名（可用 `docker compose ls` 查看），设置对应变量，检查 `/opt/fitbest/server/.env` 和持久化卷已备份，再启用部署。部署会要求已有的 `${DEPLOY_COMPOSE_PROJECT}_pg_data` 和 `${DEPLOY_COMPOSE_PROJECT}_redis_data` 卷存在。工作流通过 SSH 传输发布镜像，并通过固定主机公钥验证 SSH；不接受自动信任的新主机公钥。

每次部署使用独立目录保存 Compose 文件和权限为 600 的生产配置，并在服务健康及页面检查通过后更新 `.fitbest-current`。失败会标记工作流失败，但不会自动回滚已启动的容器或数据库迁移；排查前请检查服务器的运行状态。历史发布目录含敏感配置，应限制目录访问。更改 `POSTGRES_PASSWORD` 需要先单独迁移数据库密码；工作流会拒绝直接修改该参数。
