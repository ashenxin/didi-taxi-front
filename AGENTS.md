# AGENTS.md

本文档维护前端技术栈、项目结构、修改授权和开发协作方式。三端功能、业务规则和后端契约统一维护在 `README.md`。

## 前端项目

- 本项目为 Vue 3 + JavaScript 前端应用，包含乘客端 H5、司机端 H5 和管理后台三个独立应用。
- 包管理工具：npm。
- 构建工具：Vite 6。
- H5 UI 组件库：Vant 4。
- 管理后台 UI 组件库：Element Plus 2。
- 路由管理：Vue Router 4。
- 组件开发方式：Vue 单文件组件 + 原生 CSS，当前未使用 TypeScript。
- 接口与实时通信：HTTP API + 原生 WebSocket。
- 环境配置：通过 `VITE_API_BASE_URL` 配置后端网关地址。
- 质量检查：使用共享 Node.js 脚本检查前后端 API 契约，并在 Vite 构建前自动执行。

## 项目结构

```text
didi-taxi-front/
├── didi-passenger-h5/       # 乘客端 H5
│   ├── public/              # 静态资源
│   └── src/
│       ├── api/             # HTTP 请求封装
│       ├── assets/          # 页面资源
│       ├── components/      # 通用组件
│       ├── features/        # 按功能拆分的代码
│       └── utils/           # 状态、WebSocket 等工具
├── didi-driver-h5/          # 司机端 H5
│   ├── public/              # 静态资源
│   └── src/
│       ├── api/             # HTTP 请求封装
│       ├── assets/          # 页面资源
│       ├── components/      # 通用组件
│       ├── features/        # 按功能拆分的代码
│       └── utils/           # 订单状态、定位等工具
├── didi-Vue/                # 管理后台
│   ├── public/              # 静态资源
│   └── src/
│       ├── api/             # HTTP 请求封装
│       ├── components/      # 通用组件
│       ├── composables/     # 组合式逻辑
│       ├── features/        # 按功能拆分的代码
│       ├── layouts/         # 布局组件
│       ├── router/          # 路由与动态路由
│       ├── stores/          # 前端状态
│       ├── utils/           # 工具函数
│       └── views/           # 页面组件
└── scripts/                 # 三端共享的检查脚本
```

## 修改授权约定

- 探索代码、读取配置、查询日志和其他只读排查可以直接进行。
- 新增、编辑或删除代码、配置、测试及文档前，必须先说明拟修改范围并获得用户明确确认；分析或排查请求本身不视为修改授权。
- 用户确认后，只能在当次确认的范围内写入，不得扩展到尚未讨论的应用或功能。

## 开发约定

- 修改前检查工作区状态，保留用户已有改动，不覆盖、不回退、不顺带整理无关文件。
- 先确认变更属于乘客端、司机端还是管理后台，只修改和验证本次涉及的应用。
- 修改接口调用前，先阅读同级后端仓库 `../didi-taxi` 中对应的 PRD、TECH、API 和 TEST 文档；发现文档与实现不一致时，先说明冲突并确认权威口径。
- 前端不得自行推断后端权威状态；所有业务判断以后端响应和已定版文档为准。
- 除非用户明确授权，不修改后端仓库，不启动、停止或重启任何前后端服务。
- 修改完成后，在每个受影响的应用目录执行 `npm test` 和 `npm run build`；不得用未涉及应用的构建结果代替验证。
- 正常联调通过 `VITE_API_BASE_URL` 指向后端网关；临时直连 BFF 或核心服务只允许用于用户明确要求的排障。
- Git 提交前只纳入本次授权范围内的文件。
- Git 提交信息格式统一为 `type(scope): description`。
  - `type` 只使用：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore`。
  - `scope` 使用本次变更涉及的应用、模块或功能名称。
  - `description` 使用简洁中文；应用名、代码标识和通用缩写可以保留英文。
