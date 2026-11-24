export type BrandFilter = 'all' | 'hyrox' | 'btwe'

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
