# 仿滴滴平台前端

## 项目说明

本仓库包含乘客端 H5、司机端 H5 和管理后台三个独立的 Vue 3 应用。后端仓库位于同级目录 `../didi-taxi`。

三端正常联调统一访问后端网关 `http://127.0.0.1:18080`，不直接访问 `order`、`capacity`、`passenger` 等核心服务。前端技术栈、修改授权和通用开发约定见 [AGENTS.md](AGENTS.md)。

## 应用地图

| 应用 | 目录 | 开发端口 | 技术栈 | 主要功能 |
|---|---|---:|---|---|
| 乘客端 H5 | `didi-passenger-h5` | 6273 | Vue 3 + Vite 6 + Vant 4 | 登录、下单与跟单、个人中心、钱包、券包、福利和 AI 助手入口 |
| 司机端 H5 | `didi-driver-h5` | 6274 | Vue 3 + Vite 6 + Vant 4 | 登录注册、听单、接拒单、履约、行程记录、今日运营和换队 |
| 管理后台 | `didi-Vue` | 6275 | Vue 3 + Vite 6 + Element Plus 2 | 登录、动态菜单、订单、运力、计价、优惠券、换队审核和系统用户 |

## 启动与验证

进入需要操作的应用目录后执行：

```bash
npm install
npm run dev
npm test
npm run build
```

`npm test` 会运行共享脚本 `scripts/check-api-contract.mjs`，检查关键前端调用是否仍有对应的后端 Controller；`npm run build` 会先执行同一检查，再进行 Vite 构建。

三端通过 `VITE_API_BASE_URL` 配置后端地址，当前 `.env.development` 默认值均为：

```text
http://127.0.0.1:18080
```

## 后端访问边界

| 前端 | 网关前缀 | BFF | 主要权威来源 |
|---|---|---|---|
| 管理后台 | `/admin/**` | `admin-api` | 后台鉴权、菜单和数据域由后台接口裁决 |
| 乘客端 | `/app/**` | `passenger-api` | 订单状态以 `order` 为准，账号生命周期以 `passenger` 为准 |
| 司机端 | `/driver/**` | `driver-api` | 订单状态以 `order` 为准，司机与运力状态以 `capacity` 为准 |

通用规则：

- 网关负责 JWT 验签并注入可信 `X-User-Id`，前端不能自行构造身份头替代后端鉴权。
- BFF 负责端侧身份校验、聚合和编排，不替代核心服务裁决业务状态。
- Redis 只用于索引、缓存、Presence 和推送辅助，不是前端可依赖的业务权威来源。
- 前端倒计时、静态文案和按钮状态不能决定订单终态、接单资格、支付状态或账号生命周期状态。
- WebSocket 用于通知“数据发生变化”，收到事件后仍应通过 HTTP 获取权威详情。

## 乘客端 H5

主要文件：

- `didi-passenger-h5/src/App.vue`
- `didi-passenger-h5/src/style.css`
- `didi-passenger-h5/src/api/http.js`
- `didi-passenger-h5/src/utils/orderStatus.js`
- `didi-passenger-h5/src/utils/passengerOrderWs.js`

### 当前功能

- 支持短信和密码登录、退出登录。
- 叫车面板主按钮接入真实下单，支持订单详情跟踪和乘客取消。
- 订单变化优先通过乘客 WebSocket 通知，WebSocket 不可用时使用 HTTP 轮询兜底。
- 「我的订单」支持按类型分页查询当前乘客订单。
- 「设置」支持资料展示、换手机号、账号注销及生命周期操作进度查询。
- 「我的钱包」支持钱包摘要、支付宝/微信免密协议和优惠券展示。
- 「券包」支持优惠券列表、登录后可领取查询和领取。
- 「福利」支持签到进度、签到和积分查询。
- AI 助手当前为指定途经点路线规划的静态交互演示；真实 POI、路线和对话数据尚未接通。
- 银行卡、借钱、车险及其他未接入业务的视觉入口只显示“待开发”。

### 下单与跟单规则

- 当前真实下单入口是叫车面板主按钮，使用 `POST /app/api/v1/orders`；`/orders/create` 只保留为兼容入口。
- 一次真实下单意图生成一个 `Idempotency-Key`；网络结果不确定时复用原 key，新下单意图必须生成新 key。
- 等待态包括 `CREATED`、`ASSIGNED`、`PENDING_DRIVER_CONFIRM` 和重新派单中；等待态允许乘客取消。
- `reDispatching=true` 时展示“正在重新派单”或等价文案。
- `ORDER_CHANGED` 只触发订单详情刷新，不能直接作为订单展示权威。
- 系统取消、乘客取消和其他终态以详情接口返回的状态、`cancelBy` 和 `cancelReason` 为准。
- 静态 Tab 和占位页面不能遮蔽进行中的订单，乘客必须能够返回跟单状态。

### 个人中心与钱包规则

- 换号和注销提交需要新的 `Idempotency-Key`，并原样提交短信响应中的生命周期版本。
- 注销返回 HTTP 202 只表示已经受理；前端必须保存受限 token 和 `operationNo`，直到操作进入最终状态。
- 钱包入口顺序为：免密支付设置、银行卡、优惠券、借钱、车险。
- 免密支付当前只支持支付宝和微信，可以同时开通，但只能有一个默认渠道。
- 可用优惠券数量未加载或为空时展示 `0 张`，不能展示 `- 张`。
- 银行卡、借钱和车险当前只保留入口，不调用真实业务接口。

乘客端详细接口和业务口径见后端[一期 README](../didi-taxi/README.md)与[二期功能 README](../didi-taxi/二期功能/README.md)。

## 司机端 H5

主要文件：

- `didi-driver-h5/src/App.vue`
- `didi-driver-h5/src/style.css`
- `didi-driver-h5/src/api/http.js`
- `didi-driver-h5/src/utils/orderStatus.js`
- `didi-driver-h5/src/utils/tripStatus.js`
- `didi-driver-h5/src/utils/geolocation.js`

### 当前功能

- 支持短信或密码登录、注册和退出登录。
- 支持上线/下线听单，并在听单期间发送心跳；定位成功时更新 GEO，定位失败时继续维持 Presence。
- 支持待确认指派、接单、拒单、到达前取消、到达、开始行程和完成行程。
- 支持司机 WebSocket 指派通知，并保留 HTTP 对账和降级路径。
- 首页工作台集中展示当前工作状态、接单操作和行程操作。
- 支持成功接单后的行程记录、状态与日期筛选、稳定快照分页、逐次服务详情和今日运营看板。
- 支持换队申请和申请状态查询。

### 业务规则

- 司机能够登录不代表能够接单；上线听单和接单资格必须以后端校验结果为准。
- `ASSIGNED` 和 `PENDING_DRIVER_CONFIRM` 都属于待确认指派状态。
- WebSocket 正常时不固定每 2 秒刷新待接单列表；HTTP 只用于首次加载、关键操作后对账、手动刷新和降级。
- 司机确认超时后，指派会被释放并重新派单；确认超时不等同主动拒单，也不产生司机与乘客隔离。
- 司机接成一单后，其他待确认指派可能被释放并重新派单。
- 司机退出登录会拒绝待确认指派、释放尚未到达的 `ACCEPTED` 订单并下线听单；到达后或行程中的订单不会自动释放。
- 换队申请处于审核中时不可接单。
- 行程记录从成功接单开始；拒单和确认超时不生成记录，成功接单后的取消和改派按每次司机服务分别留痕。
- 今日运营按 `Asia/Shanghai` 自然日统计；展示金额不等于司机净收入。

司机端接口及状态口径见后端[一期 README](../didi-taxi/README.md)、[换队文档](../didi-taxi/二期功能/司机_换队功能_API.md)和[行程看板文档](../didi-taxi/二期功能/司机端_行程记录与今日运营看板_API.md)。

## 管理后台

主要文件：

- `didi-Vue/src/api/http.js`
- `didi-Vue/src/router/index.js`
- `didi-Vue/src/router/dynamicRoutes.js`
- `didi-Vue/src/router/adminViewRegistry.js`
- `didi-Vue/src/stores/adminSession.js`
- `didi-Vue/src/features/**`

### 当前功能

- `/login` 提供后台登录；401 响应会清理会话并跳转登录页。
- 登录后根据后端菜单动态注册路由，页面组件通过 `ADMIN_VIEW_REGISTRY` 白名单加载。
- 支持订单列表与详情、公司/车队、司机、车辆、换队审核、计价规则和系统用户管理。
- 计价规则编辑页已接入车队营销优惠券方案的查询、新建、编辑、发布和下架。

### 业务规则

- 菜单决定是否能够进入页面，数据域决定能够查看哪些数据。
- 非 SUPER 用户受省/市数据域限制；越权筛选返回 403，越权资源返回 404。
- 订单列表不能逐行补查乘客手机号，乘客手机号只在订单详情中展示。
- 计价规则遵守公司、省、市、产品线维度和有效期不重叠约束。
- 运力页面中的公司记录表示“公司 + 车队”，技术引用统一使用 `companyId`。
- 换队审核拒绝必须填写原因，已经处理的申请不能重复审核。
- 车队优惠券由超管维护，其他后台账号只读。

后台接口与权限口径见后端 README 中的[后台管理文档导航](../didi-taxi/README.md#后台管理与地图)。

## 文档入口

- [后端一期与公共说明](../didi-taxi/README.md)
- [后端二期功能说明](../didi-taxi/二期功能/README.md)
- [前端协作约定](AGENTS.md)
- [钱包与免密支付 API](../didi-taxi/二期功能/乘客端_个人中心_我的钱包_免密支付与优惠券_API.md)
- [车队营销优惠券 API](../didi-taxi/二期功能/车队营销优惠券_API.md)
- [司机换队 API](../didi-taxi/二期功能/司机_换队功能_API.md)
- [司机行程记录与今日运营 API](../didi-taxi/二期功能/司机端_行程记录与今日运营看板_API.md)
- [AI 客服指定途经点路线规划 PRD](../didi-taxi/二期功能/乘客端_AI客服_指定途经点路线规划_PRD.md)

## 修改后的验证建议

- 修改乘客端后，在 `didi-passenger-h5` 执行 `npm test` 和 `npm run build`，并验证登录、主操作、错误态和退出登录。
- 修改司机端后，在 `didi-driver-h5` 执行 `npm test` 和 `npm run build`，并验证登录、听单、订单主操作、错误态和退出登录。
- 修改管理后台后，在 `didi-Vue` 执行 `npm test` 和 `npm run build`，并验证菜单路由、401 跳转和至少一个带数据域的列表查询。
