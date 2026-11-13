import { createApp } from 'vue'
import {
  ElAlert,
  ElAutocomplete,
  ElAside,
  ElButton,
  ElCard,
  ElCascader,
  ElConfigProvider,
  ElContainer,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElImage,
  ElInput,
  ElInputNumber,
  ElLink,
  ElLoading,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElPopconfirm,
  ElProgress,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSubMenu,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElUpload
} from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router, { bootstrapAdminRoutes } from './router'
import './styles.css'

const elementComponents = [
  ElAlert,
  ElAutocomplete,
  ElAside,
  ElButton,
  ElCard,
  ElCascader,
  ElConfigProvider,
  ElContainer,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElImage,
  ElInput,
  ElInputNumber,
  ElLink,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElPopconfirm,
  ElProgress,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSubMenu,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElUpload
]

const app = createApp(App)
elementComponents.forEach((component) => app.component(component.name, component))
app.directive('loading', ElLoading.directive)

// 先注册动态菜单路由，再触发 router 的首次导航；否则刷新深链会先命中通配符。
bootstrapAdminRoutes()
  .catch((e) => console.error('[admin] 菜单预加载失败', e))
  .finally(() => app.use(router).mount('#app'))
