# didi-driver-h5

司机侧 H5（Vite + Vue3）。

## 本地启动

```bash
npm i
npm run dev
```

默认后端聚合服务见 `.env.development`（走网关 18080）：

- `VITE_API_BASE_URL=http://127.0.0.1:18080`（经网关转发）
- 直连 `driver-api`（默认 8101）时可改为：`VITE_API_BASE_URL=http://127.0.0.1:8101`

## 听单心跳

- 上线听单后，H5 约每 15 秒调用 `POST /driver/api/v1/drivers/{driverId}/heartbeat`。
- 定位成功时心跳携带经纬度并更新司机池 GEO；定位失败时仍续司机级 Presence。
- 页面恢复可见或 WS 重连时会立即补心跳；手动下线、退出登录时停止心跳。

# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
