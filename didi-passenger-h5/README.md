# didi-passenger-h5

乘客侧 H5（Vite + Vue3）。

## 本地启动

```bash
npm i
npm run dev
```

默认后端聚合服务见 `.env.development`（走网关 18080）：

- `VITE_API_BASE_URL=http://127.0.0.1:18080`（经网关转发）
- 直连 `passenger-api`（默认 8100）时可改为：`VITE_API_BASE_URL=http://127.0.0.1:8100`

## 下单接口契约

- 推荐入口：`POST /app/api/v1/orders`
- 必带请求头：`Authorization: Bearer <accessToken>`、`Idempotency-Key: <uuid>`
- `Idempotency-Key`：一次真实下单点击生成一次；同一次网络重试复用同一个 key，新下单意图生成新 key。
- 当前 H5 会自动生成并发送该 Header；网络异常或超时后的再次点击会复用 key，收到明确服务端响应后结束本次幂等尝试。
- 当前后端语义：HTTP 下单只保证创建 `CREATED` 订单，派单由 Outbox + Kafka + capacity 异步推进；前端通过乘客 WS `ORDER_CHANGED` 后拉订单详情，WS 不可用时再轮询兜底。

# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
