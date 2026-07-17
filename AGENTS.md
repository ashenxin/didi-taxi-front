# AGENTS.md

本文档用于帮助后续维护者和 AI coding agent 快速理解 `didi-taxi-front` 三端前端项目。内容基于当前前端代码，以及同级后端仓库 `../didi-taxi` 中的 Markdown 文档整理。

## 项目地图

| 应用 | 目录 | 默认开发端口 | 技术栈 | 职责 |
|---|---|---:|---|---|
| 乘客端 H5 | `didi-passenger-h5` | 5173 | Vue 3 + Vite + Vant | 乘客登录、首页、下单/跟单、取消、退出登录、我的订单、设置、我的钱包、乘客 WS 降级。 |
| 司机端 H5 | `didi-driver-h5` | 5174 | Vue 3 + Vite + Vant | 司机登录/注册、上线/下线听单、指派单、接单/拒单/取消、行程推进、司机 WS 推送、换队流程。 |
| 管理后台 | `didi-Vue` | 5175 | Vue 3 + Vite + Element Plus + Vue Router | 后台登录、动态菜单、订单管理、运力配置、计价管理、换队审核、系统用户。 |

每个应用都在自己的目录中启动或构建：

```bash
npm run dev
npm test
npm run build
```

`npm test` 执行共享的前后端 API 契约检查；`npm run build` 会先自动执行同一检查，再进入 Vite 构建。

三端都通过 `VITE_API_BASE_URL` 配置后端根地址，当前 `.env.development` 默认是 `http://127.0.0.1:18080`。后端文档中有些地方写的是网关 `8080`，以前端仓库当前环境文件为准。

## 后端契约摘要

后端是 Java/Spring 多模块项目。正常业务请求必须统一经过网关，再进入三端 API 聚合服务（`admin-api` / `passenger-api` / `driver-api`），绝不能让前端、联调脚本或排查建议直连核心服务（如 `order-service`、`capacity-service`、`passenger` 内部服务等）。只有在用户明确说明“排障直连核心服务”时，才可以临时直连，并且要在回复中标明这是非正常流程。

浏览器/H5 流量入口：

| 前端 | 网关前缀 | BFF | 后端权威来源 |
|---|---|---|---|
| 管理后台 | `/admin/**` | `admin-api` | `admin-api` + `passenger sys_*` 负责鉴权和数据域 |
| 乘客端 | `/app/**` | `passenger-api` | `order-service` 负责订单状态 |
| 司机端 | `/driver/**` | `driver-api` | `order-service` 负责订单状态，`capacity-service` 负责运力状态 |

乘客钱包相关的后端边界：

- 前端只访问 `passenger-api` 暴露的 `/app/api/v1/wallet/**`。
- `wallet-service` 维护免密支付协议和支付单，默认端口 8095。
- `calculate-service` 维护优惠券模板、用户券和用券流水。
- `order-service` 维护 `trip_order_settlement` 订单结算快照。
- 银行卡、借钱、车险当前只保留入口，不接真实业务接口。

后端文档中的关键规则：

- 网关校验 JWT 签名、过期时间和 audience，并注入可信 `X-User-Id`；前端不能依赖自己伪造或手动传入的身份头。
- BFF 只做端侧聚合、身份校验和编排，不替代 `order-service` 做订单状态裁决。
- `order-service` 是订单状态流转的权威来源，关键写操作依赖状态条件更新/CAS。
- `capacity-service` 负责司机听单状态、Redis GEO 司机池、候选司机、司机公司/车队与换队数据。
- Redis 是索引、缓存、推送辅助，不是业务权威数据源。
- 前端倒计时、静态文案、按钮状态都不能作为超时、取消、接单资格或订单终态的权威依据。

## 乘客端 H5 说明

主要文件：

- `didi-passenger-h5/src/App.vue`
- `didi-passenger-h5/src/style.css`
- `didi-passenger-h5/src/api/http.js`
- `didi-passenger-h5/src/utils/orderStatus.js`
- `didi-passenger-h5/src/utils/passengerOrderWs.js`

当前状态：

- 登录页仍然使用真实乘客鉴权接口。
- 登录后的首页已经大幅改造成偏静态的高德风格地图页，包含可拖动/滚动的叫车面板和底部导航。
- 首页中的许多按钮当前会调用 `showFeatureTodo(...)`，只提示“待开发”，不会触发下单。
- 底部「我的」页已接入个人中心二期能力：
  - `我的订单`：调用 `/app/api/v1/orders` 分页展示订单。
  - `设置`：调用 `/app/api/v1/settings/**` 展示资料、更换手机号、注销账号。
  - `我的钱包`：调用 `/app/api/v1/wallet/**` 展示钱包摘要、免密支付设置和优惠券列表。
- 叫车面板的主按钮已经绑定 `placeOrder`，真实下单、详情轮询兜底、取消订单、乘客 WS 跟单和退出登录均处于启用状态；其他尚未实现的视觉入口继续使用 `showFeatureTodo(...)`。

恢复功能时需要保留的后端契约：

- 登录：
  - `POST /app/api/v1/auth/sms/send`
  - `POST /app/api/v1/auth/login-sms`
  - `POST /app/api/v1/auth/login-password`
  - `POST /app/api/v1/auth/logout`
- 订单：
  - 当前 H5/MVP 推荐一步下单：`POST /app/api/v1/orders`
    - 必须带 `Authorization: Bearer <accessToken>` 与 `Idempotency-Key: <uuid>`。
    - `Idempotency-Key` 在用户一次真实下单点击时生成；同一次网络重试复用同一个 key，新下单意图必须生成新 key。
    - 后端缺少 `Idempotency-Key` 返回 400；同 key、不同下单内容返回 409；同 key、同内容重复提交返回同一 `orderNo`。
    - 该入口现在是两段式主路径：HTTP 只保证创建 `CREATED` 订单，派单由后端 Outbox + Kafka + capacity 异步推进；前端通过 WS `ORDER_CHANGED` 或订单详情轮询感知 `PENDING_DRIVER_CONFIRM` / 后续状态。
  - `/app/api/v1/orders/create` 保留为兼容入口，语义与主入口一致：只创建订单，派单异步推进；恢复真实下单时仍默认使用 `/app/api/v1/orders`
  - 订单详情：`GET /app/api/v1/orders/{orderNo}`
  - 乘客取消：`POST /app/api/v1/orders/{orderNo}/cancel`
- 乘客 WS：
  - `POST /app/api/v1/auth/ws-token`
  - `ws(s)://.../app/ws/v1/stream?token=...`
  - WS 只作为“订单变化提醒”的实时通道，收到 `ORDER_CHANGED` 后拉一次 HTTP 订单详情；HTTP 详情仍然是展示权威。
  - 稳态不做常驻短轮询；WS 失败或不可用时才进入 HTTP 详情轮询兜底。
- 个人中心：
  - `GET /app/api/v1/orders?type=&pageNo=&pageSize=`
  - `GET /app/api/v1/settings/profile`
  - `POST /app/api/v1/settings/phone-change/sms/send`
  - `POST /app/api/v1/settings/phone-change/confirm`
  - `POST /app/api/v1/settings/account-cancel/sms/send`
  - `POST /app/api/v1/settings/account-cancel/confirm`
- 钱包：
  - `GET /app/api/v1/wallet/summary`
  - `GET /app/api/v1/wallet/auto-pay/agreements`
  - `POST /app/api/v1/wallet/auto-pay/agreements/sign`
  - `POST /app/api/v1/wallet/auto-pay/agreements/{agreementId}/default`
  - `POST /app/api/v1/wallet/auto-pay/agreements/{agreementId}/close`
  - `GET /app/api/v1/wallet/coupons`
  - `GET /app/api/v1/wallet/coupons/available`

乘客端产品/状态规则：

- 等待态包含 `CREATED`、`ASSIGNED`、`PENDING_DRIVER_CONFIRM` 以及重新派单中。
- 等待态下乘客可以取消订单。
- 后端按 `createdAt` 累计等待 3 分钟仍无司机接单时系统取消订单；前端应展示后端返回的 `cancelBy` / `cancelReason`，并在取消态结束跟单回到未下单首页。
- `reDispatching=true` 表示应展示“正在重新派单”或等价文案；来源包括司机拒单、到达前取消、司机 30s 确认窗口超时释放指派。确认窗超时不写司机-乘客隔离键，下一轮仍可再次派给同一司机。
- 不要把所有静态视觉按钮都接到 `placeOrder`；当前唯一真实下单入口是叫车面板主按钮，其他入口应在各自功能完成后再启用。
- 我的钱包页面入口顺序固定为：免密支付设置、银行卡、优惠券、借钱、车险；其中银行卡、借钱、车险点击后只提示待开发。
- 钱包摘要中可用优惠券数量为空或未加载时展示 `0 张`，不要展示 `- 张`。
- 免密支付本期只支持支付宝/微信，允许同时开通，但只能有一个默认渠道。

## 司机端 H5 说明

主要文件：

- `didi-driver-h5/src/App.vue`
- `didi-driver-h5/src/style.css`
- `didi-driver-h5/src/api/http.js`
- `didi-driver-h5/src/utils/orderStatus.js`
- `didi-driver-h5/src/utils/tripStatus.js`
- `didi-driver-h5/src/utils/geolocation.js`

当前已实现能力：

- 短信或密码登录/注册。
- 通过 `/driver/api/v1/drivers/{driverId}/online` 上线/下线听单。
- 听单期间约每 15 秒调用 `/driver/api/v1/drivers/{driverId}/heartbeat`，定位成功时更新 GEO，定位失败时仍续 Presence。
- 通过 `/driver/api/v1/orders/assigned` 拉取指派单列表。
- 接单、拒单、到达前取消、到达、开始行程、完成行程。
- 司机 WS token 与 WS 指派推送，并有 HTTP 降级。
- 首页工作台将“当前工作状态 / 接单操作 / 行程操作”压在同一张操作页中；不要再拆回三张长卡片。
- 司机换队申请与状态页。

需要保留的后端契约：

- 鉴权：
  - `POST /driver/api/v1/auth/sms/send`
  - `POST /driver/api/v1/auth/register-sms`
  - `POST /driver/api/v1/auth/register-password`
  - `POST /driver/api/v1/auth/login-sms`
  - `POST /driver/api/v1/auth/login-password`
  - `POST /driver/api/v1/auth/logout`
- 听单与订单：
  - `POST /driver/api/v1/drivers/{driverId}/online`
  - `POST /driver/api/v1/drivers/{driverId}/heartbeat`
  - `GET /driver/api/v1/orders/assigned`
  - `POST /driver/api/v1/orders/{orderNo}/accept`
  - `POST /driver/api/v1/orders/{orderNo}/reject`
  - `POST /driver/api/v1/orders/{orderNo}/cancel`
  - `POST /driver/api/v1/orders/{orderNo}/arrive`
  - `POST /driver/api/v1/orders/{orderNo}/start`
  - `POST /driver/api/v1/orders/{orderNo}/finish`
- WS：
  - `POST /driver/api/v1/auth/ws-token`
  - `ws(s)://.../driver/ws/v1/stream?token=...`

司机端业务规则：

- 司机允许登录，不代表允许接单；上线听单和接单必须由后端校验接单资格。
- 接单资格展示优先使用 `/driver/api/v1/team-change/belonging` 的 `canAcceptOrder`；无归属数据时用听单状态兜底（未听单/听单中显示可接单，服务中显示服务中）。
- `ASSIGNED` 和 `PENDING_DRIVER_CONFIRM` 都属于待确认指派列表状态。
- 待确认指派不应固定每 2s 走 HTTP 自动刷新；WS 正常时由 WS 推送更新，HTTP 只用于首次加载、上线/关键操作后对账和手动刷新。
- 司机 30s 内未确认待接指派时，后端释放本轮指派，订单回到 `CREATED` 并重新派单；司机端待确认列表应通过 WS/对账消失。该超时不等同主动拒单，不触发 30 分钟司机-乘客隔离。
- 司机接成一单后，同司机其它待确认指派可能会被释放并重新派单。
- 拒单和到达前取消会让乘客订单进入重新派单；拒单/取消原因不展示给乘客。
- 当前司机退出登录会拒掉待确认指派、释放 `ACCEPTED` 已接未到订单并下线听单；`ARRIVED / STARTED` 等到达后或行程中订单不自动释放。
- 提交换队申请后，司机在审核通过或撤销恢复前不可接单。

## 管理后台说明

主要文件：

- `didi-Vue/src/api/http.js`
- `didi-Vue/src/router/index.js`
- `didi-Vue/src/router/dynamicRoutes.js`
- `didi-Vue/src/router/adminViewRegistry.js`
- `didi-Vue/src/stores/adminSession.js`
- `didi-Vue/src/features/**`

当前结构：

- 根路由加载 `AdminShellLayout`。
- 登录页是 `/login`。
- 登录后根据后端菜单动态注册路由；组件加载由 `ADMIN_VIEW_REGISTRY` 白名单限制。
- 401 会清理后台 token 并跳转登录。

需要保留的管理端契约：

- 鉴权/菜单：
  - `POST /admin/api/v1/auth/login`
  - `GET /admin/api/v1/auth/me`
  - `GET /admin/api/v1/auth/menus`
- 订单：
  - `GET /admin/api/v1/orders`
  - `GET /admin/api/v1/orders/{orderNo}`
- 运力：
  - `/admin/api/v1/capacity/companies`
  - `/admin/api/v1/capacity/drivers`
  - `/admin/api/v1/capacity/cars`
  - `/admin/api/v1/capacity/team-change-requests`
- 计价：
  - `/admin/api/v1/pricing/fare-rules`
- 钱包/优惠券：
  - 乘客钱包在乘客端展示；车队营销优惠券后台能力已经接入计价规则编辑页。
  - 后台已从计价规则详情页接入优惠券方案列表、创建、编辑、发布和下架，路径为 `/admin/api/v1/pricing/fare-rules/{id}/coupons/**`。
- 系统用户：
  - `/admin/api/v1/system/admin-users`

管理端业务规则：

- 菜单决定能不能进入页面，数据域决定能看到哪些数据。
- 非 SUPER 用户有省/市数据域限制。越权筛选返回 403，越权资源返回 404。
- 订单列表不要逐行补乘客手机号，避免 N+1；乘客手机号只应在详情中展示。
- 计价规则需要遵守公司 + 省 + 市 + 产品线维度，以及有效期不重叠规则。
- 运力页面中，公司记录表示“公司 + 车队”，技术引用使用 `companyId`。
- 换队审核拒绝必须填写原因；重复审核不应成功。

## 乘客端静态首页的功能恢复策略

当前乘客首页是有意做成偏静态的视觉壳。恢复业务功能应分阶段进行：

1. 保留登录拦截和高德风格视觉壳。
2. 先选择叫车面板中的单一主入口接回真实下单，例如目的地行或“现在出发”。
3. 拿到 `orderNo` 后，在叫车面板内部或其上方重新展示订单跟踪面板。
4. 其它服务入口、活动卡片、券包/福利等继续保持“待开发”，直到有明确后端契约。
5. 订单跟踪优先使用乘客 WS `ORDER_CHANGED` 触发 HTTP 详情刷新；WS 不可用时保留 HTTP 轮询兜底。
6. WS 只作为“订单变化提醒”，不作为订单状态权威。

需要避免的问题：

- 不要让静态 Tab 或占位页把进行中订单完全藏起来，必须能回到跟单状态。
- 不要让每个视觉卡片都触发下单。
- 不要根据前端倒计时推断订单终态。
- 不要删除旧订单函数，除非替代逻辑已经上线并通过验证。

## 开发检查清单

改代码前：

- 确认变更属于乘客端、司机端还是管理后台。
- 判断该功能当前是纯视觉占位，还是已经接了真实 API。
- 如果要改接口契约，先阅读 `../didi-taxi` 中对应后端文档。

改代码后：

- 在每个被修改的前端应用目录执行 `npm test` 和 `npm run build`；构建前会再次校验关键前端调用是否仍有对应后端 Controller。
- 乘客/司机订单相关改动至少手动验证登录、主操作、错误态和退出登录。
- 管理后台改动至少验证菜单路由注册、401 跳转、一个带数据域的列表查询。
- 除非明确为了排障直连 BFF，否则 `VITE_API_BASE_URL` 应保持走网关。

## 已阅读的后端文档

上述前端约束来自当前 `../didi-taxi` 仓库中的所有 Markdown 文档，包括：

- `AGENTS.md`、`README.md`、`TODO与差距总览.md`
- 乘客/司机 MVP 文档：`第一期MVP_乘客派单司机闭环_*`、`乘客司机端_最小闭环接口调用文档.md`、`乘客司机端_Redis与听单下线策略.md`
- 登录文档：`乘客端_登录_*`、`司机端_登录注册_*`
- 实时与网关文档：`乘客端与司机端_WebSocket_对比.md`、`司机端_WebSocket与实时协议入门.md`、`司机端_上线听单与接单设计.md`、`网关服务_设计.md`、`网关服务_技术.md`
- 订单与派单文档：`订单与派单_订单服务幂等与并发方案说明.md`、`订单与派单_两段式Outbox与Kafka_技术方案.md`
- 管理后台文档：`后台管理系统_权限*`、`后台管理系统_订单管理_*`、`后台管理系统_运力配置_*`、`后台管理系统_计价管理_*`
- 二期个人中心文档：`二期功能/乘客端_个人中心_我的订单_*`、`二期功能/乘客端_个人中心_设置_*`、`二期功能/乘客端_个人中心_我的钱包_免密支付与优惠券_*`
- 司机换队文档：`二期功能/司机_换队功能_*`
- 车队营销优惠券文档：`二期功能/车队营销优惠券_PRD.md`、`二期功能/车队营销优惠券_TECH.md`、`二期功能/车队营销优惠券_API.md`、`二期功能/车队营销优惠券_SQL.md`
- 车队营销优惠券讨论稿：`二期功能/车队营销优惠券规则_讨论稿.md`
