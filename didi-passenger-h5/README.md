# didi-passenger-h5

乘客侧 H5，使用 Vue 3、Vite 6 和 Vant 4。项目范围与业务状态见[前端 README](../README.md)，协作和修改约定见[前端 AGENTS.md](../AGENTS.md)。

## 本地启动

```bash
npm i
npm run dev
```

开发服务器默认端口为 `6273`。

默认后端聚合服务见 `.env.development`（走网关 18080）：

- `VITE_API_BASE_URL=http://127.0.0.1:18080`（经网关转发）
- 只有在明确排查网关与 BFF 边界时，才临时直连 `passenger-api`（默认 8100）：`VITE_API_BASE_URL=http://127.0.0.1:8100`。正常开发和联调统一走网关。

## 下单接口契约

- 推荐入口：`POST /app/api/v1/orders`
- 必带请求头：`Authorization: Bearer <accessToken>`、`Idempotency-Key: <uuid>`
- `Idempotency-Key`：一次真实下单点击生成一次；同一次网络重试复用同一个 key，新下单意图生成新 key。
- 完单后通过 `GET /app/api/v1/orders/{orderNo}/settlement` 查询账单；待支付订单通过
  `POST /app/api/v1/orders/{orderNo}/payments` 发起主动支付，每次新的支付意图使用新的
  `Idempotency-Key`，网络失败重试复用同一个 key。
- 当前 H5 会自动生成并发送该 Header；网络异常或超时后的再次点击会复用 key，收到明确服务端响应后结束本次幂等尝试。
- 当前后端语义：HTTP 下单只保证创建 `CREATED` 订单，派单由 Outbox + Kafka + capacity 异步推进；前端通过乘客 WS `ORDER_CHANGED` 后拉订单详情，WS 不可用时再轮询兜底。
