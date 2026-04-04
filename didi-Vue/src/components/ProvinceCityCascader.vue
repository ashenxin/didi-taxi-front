<template>
  <el-cascader
    :model-value="cascaderVal"
    clearable
    filterable
    :placeholder="placeholder"
    :options="provinceAndCityData"
    :props="cascaderProps"
    :style="mergedStyle"
    @update:model-value="onChange"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { provinceAndCityData } from 'element-china-area-data'
import { gbCodesToCascaderValue, cascaderValuesToGbPair, toGb6ProvinceCode } from '../utils/regionCodes'

const props = defineProps({
  provinceCode: { type: String, default: '' },
  cityCode: { type: String, default: '' },
  /** 为 true 时可选仅省级（省管理员） */
  allowProvinceOnly: { type: Boolean, default: false },
  /** 锁定省级（如省管理员筛城市时省不可变） */
  lockProvince: { type: Boolean, default: false },
  lockedProvinceCode: { type: String, default: '' },
  placeholder: { type: String, default: '选择省 / 市' },
  width: { type: String, default: '280px' }
})

const emit = defineEmits(['update:provinceCode', 'update:cityCode'])

const cascaderVal = ref([])

watch(
  () => [
    props.lockProvince ? props.lockedProvinceCode : props.provinceCode,
    props.cityCode,
    props.lockProvince,
    props.lockedProvinceCode
  ],
  () => {
    const prov = props.lockProvince ? props.lockedProvinceCode : props.provinceCode
    cascaderVal.value = gbCodesToCascaderValue(prov, props.cityCode)
  },
  { immediate: true }
)

const cascaderProps = computed(() => ({
  expandTrigger: 'hover',
  checkStrictly: props.allowProvinceOnly
}))

const mergedStyle = computed(() => ({
  width: props.width
}))

function onChange(val) {
  cascaderVal.value = val || []
  const { provinceCode, cityCode } = cascaderValuesToGbPair(val)
  if (props.lockProvince) {
    emit('update:provinceCode', toGb6ProvinceCode(props.lockedProvinceCode))
    emit('update:cityCode', cityCode)
  } else {
    emit('update:provinceCode', provinceCode)
    emit('update:cityCode', cityCode)
  }
}
</script>
