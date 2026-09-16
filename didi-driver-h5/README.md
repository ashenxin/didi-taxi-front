# didi-driver-h5

司机侧 H5，使用 Vue 3、Vite 6 和 Vant 4。项目范围与业务状态见[前端 README](../README.md)，协作和修改约定见[前端 AGENTS.md](../AGENTS.md)。

## 本地启动

```bash
npm i
npm run dev
```

开发服务器默认端口为 `6274`。

默认后端聚合服务见 `.env.development`（走网关 18080）：

- `VITE_API_BASE_URL=http://127.0.0.1:18080`（经网关转发）
- 只有在明确排查网关与 BFF 边界时，才临时直连 `driver-api`（默认 8101）：`VITE_API_BASE_URL=http://127.0.0.1:8101`。正常开发和联调统一走网关。

## 听单心跳

- 上线听单后，H5 约每 15 秒调用 `POST /driver/api/v1/drivers/{driverId}/heartbeat`。
- 定位成功时心跳携带经纬度并更新司机池 GEO；定位失败时仍续司机级 Presence。
- 页面恢复可见或 WS 重连时会立即补心跳；手动下线、退出登录时停止心跳。
