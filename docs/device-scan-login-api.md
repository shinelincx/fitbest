# 设备端扫码登录联调

设备端应用显示动态二维码。训练者用已登录的 Fitbest 手机端从首页「扫码」进入，核对手机和设备屏幕上的六位核验码，再选择「确认登录设备」。设备端领取会话后即可访问现有用户 API。

云账号扫码授权从 Fitbest 手机 Web/PWA 发起。原生访客包识别到登录码时会提供打开手机网页版的入口，训练者可在网页版登录后重新扫码。

## 地址和凭证

- 生产 API 基础地址为 `https://cloud.thinkfiter.com/fit-best/api/v1`。服务直连使用 `/api/v1`。
- 下面的扫码接口均使用 `POST /auth/device-login/<操作>`，请求体为 JSON。手机调用 `inspect`、`confirm` 时设置 `Authorization: Bearer <手机端 accessToken>`。
- 设备端只将 `qrPayload` 字符串的原始内容用于绘制二维码。`deviceSecret` 由设备端存于本次扫码流程的内存里，用于 `poll` 和 `cancel`。请避免将其写入日志、URL、埋点或二维码。

## 请求和响应

### 1. 设备申请二维码

`POST /auth/device-login/start`，例如 `{"deviceName":"划船机 R-01"}`。设备展示名可省略，最长 120 字符。手机端将它作为本次登录的展示信息。

```json
{
  "scanId": "0123456789abcdef0123456789abcdef",
  "qrPayload": "{\"type\":\"fitbest.device-login\",\"version\":1,\"scanId\":\"0123456789abcdef0123456789abcdef\"}",
  "deviceSecret": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "verificationCode": "082314",
  "expiresAt": "2026-11-27T09:31:30Z",
  "pollIntervalSeconds": 3
}
```

二维码和核验码在设备端同屏显示，服务端生成的登录请求在 90 秒后到期。确认操作不延长截止时间。

### 2. 手机预览并确认

`POST /auth/device-login/inspect`，请求体为 `{"scanId":"0123456789abcdef0123456789abcdef"}`。返回 `deviceName`、`verificationCode`、`expiresAt`。`deviceName` 省略时返回 `null`。训练者仍可关闭预览并退出手机端授权操作。

训练者点击确认后，将相同请求体发给 `POST /auth/device-login/confirm`。响应为 `{"ok":true}`。处于有效期内且尚未领取时，同一账号可重试确认。手机未登录或登录已经失效时，先登录再重新扫码。

### 3. 设备轮询和领取

`POST /auth/device-login/poll`，请求体包含 `scanId` 和 `deviceSecret`。按 `pollIntervalSeconds` 轮询，同一时间只发起一个请求。

| 返回的 `status` | 处理方式 |
| --- | --- |
| `pending` | 用户尚未确认。继续等待，并保持设备端未登录。 |
| `signed_in` | 响应同时返回 `accessToken`、`refreshToken` 及标准登录响应中的 `user`。保存设备端独立会话并进入登录态。可以用 `GET /api/v1/me` 核对该账号。 |
| `redeemed` | 本次会话已领取。若从未收到成功响应，丢弃申请凭证并重新出码。 |
| `cancelled` | 申请已取消，或确认账号在领取前已注销。停止轮询。 |
| `expired` | 申请已到期。停止轮询并允许重新出码。 |

尚未领取时，离开扫码页可提交 `POST /auth/device-login/cancel`，请求体与 `poll` 相同。未失效请求返回 `{"status":"cancelled"}`。重复取消返回同一状态。已到期返回 `expired`，已领取返回 409。

## 错误和恢复

| HTTP | 含义和处理 |
| --- | --- |
| 400 | 请求体无法解析，或设备名称不符合限制。 |
| 401 | 手机端会话无效。登录后重新扫码。 |
| 404 | 登录请求不存在、已清理，或设备凭证无效。设备端重新申请。 |
| 409 | 已由其他账号确认或已领取。按照界面提示重新出码或从当前设备端会话退出。 |
| 410 | 手机端预览或确认时，二维码已过期或取消。设备端重新出码。 |
| 429 | 创建或轮询过于频繁。按 `Retry-After` 响应头中的秒数退避。 |
| 5xx 或网络错误 | 在有效期内重试。若随后返回 `redeemed`，生成新二维码重新授权。 |

错误响应沿用 `{ "code": 404, "message": "设备登录请求不存在" }` 格式。过期请求保留十分钟供客户端识别状态，再由服务端清理。短暂断网时保留本次请求，网络恢复后继续轮询，直到过期或进入终态。

设备会话通过 `POST /auth/refresh` 刷新。在共享设备上退出时，用设备端 `accessToken` 调用 `POST /auth/logout`，在请求体中提交设备端最新的 `refreshToken`，并清除本地保存的用户资料与凭证。手机端会话仍可使用。
