import { useEffect, useState } from 'react'
import { systemApi, type MachineTypeItem } from '@/api/system'

export function useMachineTypes() {
  const [types, setTypes] = useState<MachineTypeItem[]>([])

  useEffect(() => {
    let active = true
    systemApi.machineTypes().then(rows => {
      if (active) setTypes(rows)
    }).catch(() => {
      // API 拦截器显示错误，旧记录仍可显示原始代码。
    })
    return () => { active = false }
  }, [])

  return { types, labels: Object.fromEntries(types.map(({ code, label }) => [code, label])) }
}
