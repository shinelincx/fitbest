import { useState, useEffect } from 'react'
import type { BrandFilter } from '@/utils/brand'

/**
 * 订阅全局品牌过滤器。AdminLayout 顶部切换后，各页面用这个 hook 重新拉数。
 * 返回当前品牌值与对应的 app query 参数（hyrox | btwe | undefined）。
 */
export function useBrand(): { brand: BrandFilter; app?: string } {
  const [brand, setBrand] = useState<BrandFilter>(() => {
    try {
      const raw = localStorage.getItem('fitbest-admin:brand-filter')
      if (raw === 'hyrox' || raw === 'btwe' || raw === 'all') return raw
    } catch {
      // ignore
    }
    return 'all'
  })

  useEffect(() => {
    function onBrand(e: Event) {
      const detail = (e as CustomEvent).detail as BrandFilter
      if (detail) setBrand(detail)
    }
    window.addEventListener('brand-filter-change', onBrand)
    return () => window.removeEventListener('brand-filter-change', onBrand)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fitbest-admin:brand-filter')
      if (raw === 'hyrox' || raw === 'btwe' || raw === 'all') setBrand(raw)
    } catch {
      // ignore
    }
  }, [])

  return { brand, app: brand === 'all' ? undefined : brand }
}
