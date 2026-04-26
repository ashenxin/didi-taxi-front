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

# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).
