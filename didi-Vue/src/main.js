import { createApp } from 'vue'
import {
  ElAlert,
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
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSubMenu,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem
} from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import './styles.css'

const elementComponents = [
  ElAlert,
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
  ElRadio,
  ElRadioGroup,
  ElSelect,
  ElSubMenu,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTimeline,
  ElTimelineItem
]

const app = createApp(App)
elementComponents.forEach((component) => app.component(component.name, component))
app.directive('loading', ElLoading.directive)
app.use(router).mount('#app')
