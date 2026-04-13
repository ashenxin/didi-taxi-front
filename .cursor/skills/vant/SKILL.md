---
name: vant
description: >-
  Builds and refactors Vue 3 mobile H5 with Vant 4.x in this repo (`didi-passenger-h5`,
  `didi-driver-h5`): components, theming, unplugin-vue-components. Use when the user
  mentions Vant, van-button, mobile UI, or Vite H5 work under didi-taxi-front.
---

# Vant（本仓库 H5）

## 适用范围

- **`didi-passenger-h5`**：开发服务默认 **5173**
- **`didi-driver-h5`**：开发服务默认 **5174**

两子项目均已接入 **Vant 4** + **`unplugin-vue-components`** + **`VantResolver({ importStyle: true })`**；`src/main.js` 已引入 **Toast / Dialog** 的样式，便于 `showToast`、`showDialog` 等函数式 API。

## 约定

1. **组件**：在 `.vue` 中直接使用 `<van-button>`、`<van-cell>` 等，按需解析，无需手写全量 `vant` CSS。
2. **函数式 API**：从 `vant` 按需 `import { showToast, showDialog, ... }`；若新增其它函数式能力且样式缺失，在对应子项目 `main.js` 增加 `vant/es/<模块>/style`。
3. **改 Vite 配置**：两个子项目配置应对称（resolver、插件顺序），除非某一端刻意差异。
4. **API 细节**：以 [Vant 4 中文文档](https://vant-ui.github.io/vant/#/zh-CN/home) 为准。

## 新子项目接入（如需复制模板）

```bash
cd <子项目目录>
npm i vant && npm i -D unplugin-vue-components
```

`vite.config.js` 中与现有一致：

```js
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'

// plugins: [
//   vue(),
//   Components({ resolvers: [VantResolver({ importStyle: true })] }),
// ],
```

`main.js` 建议保留：

```js
import 'vant/es/dialog/style'
import 'vant/es/toast/style'
```

## 个人全局技能（可选）

若希望所有仓库可用，可将本目录复制到 `~/.cursor/skills/vant/`。
