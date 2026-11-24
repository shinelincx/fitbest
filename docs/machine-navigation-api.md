# 器械导航与蓝牙匹配 API

App 启动或刷新配置时可匿名调用 `GET /api/v1/machine-navigation`。由现有反向代理接入的 App 使用 `/fit-best/api/v1/machine-navigation`，联调入口为 `https://cloud.thinkfiter.com/fit-best/api/v1/machine-navigation`。响应带 `Cache-Control: no-cache`，每次刷新均读取当前配置。

## 脱敏示例

```json
{
  "machineTypes": [
    {"code":"treadmill","names":{"zh-CN":"跑步机","en":"Treadmill"},"sortOrder":10},
    {"code":"ski","names":{"zh-CN":"滑雪机","en":"Ski Erg"},"sortOrder":30}
  ],
  "bleRules": [
    {"machineType":"treadmill","match":"exact","patterns":["Demo-TM-0001"],"preferredProtocol":"PRIVATE","priority":10},
    {"machineType":"ski","match":"exact","patterns":["Demo-SKI-0001"],"preferredProtocol":"FTMS","priority":20}
  ],
  "resistanceDisabledPatterns": []
}
```

- `machineTypes` 按 `sortOrder`、`code` 升序排列。`names` 包含 `zh-CN` 和已填写的其他语言，客户端依次尝试当前语言、基础语言和 `zh-CN`。隐藏导航入口后，其已启用的蓝牙规则仍会下发。
- `bleRules` 按 `priority` 升序排列。广播名和规则文本去掉首尾空白并忽略大小写，`exact` 匹配全文，`prefix` 匹配前缀，`contains` 匹配子串。同一规则内的 `patterns` 为任一命中，多个规则命中时以第一条为准。
- `preferredProtocol` 是 `FTMS`（`1826`）或 `PRIVATE`（旧端 `FFF0`）。客户端需发现服务和训练所需的 GATT 特征并成功订阅，才可使用该数据通道。首选不可用时尝试另一条可用通道。手动选机保留用户选定的类型，可应用同类型规则。无规则或设备未知时继续走现有识别和手动连接。
- `resistanceDisabledPatterns` 等价于旧 `DrapList` 的子串匹配，沿用同样的空白和大小写处理。该字段独立于机型和协议偏好。列表为空时返回 `[]`。请求失败时客户端可使用最近一次有效配置，成功返回空列表时以新结果为准，并保留手动入口。
- 成功返回 `200`。服务端错误遵循现有 `{ "code": 500, "message": "…" }` 格式。管理端参数错误用 `400`，缺少有效会话用 `401`，无平台权限用 `403`，规则或导航项不存在用 `404`，启用规则优先级或匹配条件重复用 `409`。

## 后台维护

平台管理员可以在「数据字典与配置 → 器械导航与蓝牙规则」调整名称、排序、导航可见性、蓝牙规则和禁调阻力名单。保存即时生效，预览基于已保存且启用的规则，展示所有匹配结果和生效规则。紧急修正可以停用问题规则，保存前后值写入管理审计。

| 方法 | 路径，前缀 `/api/v1/admin/system/machine-navigation` | 请求 |
| --- | --- | --- |
| GET | 目录根路径 | 返回全部项和规则，含 `visible`、`id`、`enabled` |
| GET | `/preview?name=…` | 返回按优先级排序的 `matchedRules` 和 `resistanceDisabled` |
| PUT | `/items/{code}` | `names`、`sortOrder`、`visible` |
| POST | `/ble-rules` | `machineType`、`match`、`patterns`、`preferredProtocol`、`priority`、`enabled` |
| PUT | `/ble-rules/{id}` | 同新增规则，用 `enabled: false` 停用 |
| PUT | `/resistance-disabled-patterns` | `{ "patterns": [] }` |

## 初始数据与联调

首发仅下发 [Issue #9](https://github.com/shinelincx/fitbest/issues/9) 中两台样机的完整名称。`YJ01-S7Pro-000007` 匹配 `treadmill / PRIVATE`，`Kpower-00028` 匹配 `ski / FTMS`，禁调阻力名单初始为空。生产旧配置需要先核实，再导入系列匹配规则和 `DrapList`。导入时保留旧 `id=1` 和 `id=3` 的名称覆盖，滑雪机同机型的 FTMS 规则优先。旧 `id=36` 对应新 `ski`，使用划船机数据解析时仍按 `ski` 保存训练记录。旧 `id=2` 对应 `treadmill`，`id=5` 对应 `rower`。旧路径及 `BleList` 待确认消费方式和兼容需求后处理。

联调先验证游客能读取配置，后台保存后刷新 GET 可见变化。App 接入后，用双协议 YJ01 验证确实从 `FFF0` 读取训练数据，用 `kPOWER-00028` 验证大小写匹配和 `ski` 记录。另覆盖无规则、多个条件命中、首选服务缺失、接口失败和空列表时的手动连接。
