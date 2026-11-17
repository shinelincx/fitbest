import { useState, useCallback } from 'react'

export type BrandFilter = 'all' | 'hyrox' | 'btwe'

const STORAGE_KEY = 'fitbest-admin:brand-filter'

export function useBrandFilter(): {
  brand: BrandFilter
  setBrand: (b: BrandFilter) => void
  param: string | undefined
} {
  const [brand, setBrandState] = useState<BrandFilter>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'hyrox' || raw === 'btwe' || raw === 'all') return raw
    } catch {
      // ignore
    }
    return 'all'
  })

  const setBrand = useCallback((b: BrandFilter) => {
    setBrandState(b)
    try {
      localStorage.setItem(STORAGE_KEY, b)
    } catch {
      // ignore
    }
  }, [])

  return {
    brand,
    setBrand,
    param: brand === 'all' ? undefined : brand,
  }
}

export const BRAND_META: Record<
  BrandFilter,
  { label: string; color: string; accent: string; bg: string; appParam?: string }
> = {
  all: { label: '全部品牌', color: '#1f1f1f', accent: '#4a9eff', bg: '#eef5ff' },
  hyrox: {
    label: 'HYROX',
    color: '#f01808',
    accent: '#f01808',
    bg: '#fff0ee',
    appParam: 'hyrox',
  },
  btwe: { label: 'BTWE', color: '#0a6e3a', accent: '#18a957', bg: '#e8faf0', appParam: 'btwe' },
}
