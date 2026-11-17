import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// 支持的语言；中文为源语言（代码里的中文原文即 key，无需中文翻译文件）
export const LANGS = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
] as const

export type LangCode = (typeof LANGS)[number]['code']
export type LangSetting = LangCode | 'system'

export const LANG_KEY = 'fitbest:lang'

type OtherLang = Exclude<LangCode, 'zh-CN'>
// 非中文语言包懒加载，不影响首屏体积
const loaders: Record<OtherLang, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./locales/en.json'),
  ja: () => import('./locales/ja.json'),
  ko: () => import('./locales/ko.json'),
  es: () => import('./locales/es.json'),
  de: () => import('./locales/de.json'),
  fr: () => import('./locales/fr.json'),
}

export function getLangSetting(): LangSetting {
  const v = localStorage.getItem(LANG_KEY)
  return LANGS.some((l) => l.code === v) ? (v as LangCode) : 'system'
}

function resolve(setting: LangSetting): LangCode {
  if (setting !== 'system') return setting
  const nav = (navigator.language || 'zh-CN').toLowerCase()
  if (nav.startsWith('zh')) return 'zh-CN'
  const hit = LANGS.find((l) => l.code !== 'zh-CN' && nav.startsWith(l.code))
  return hit ? hit.code : 'en'
}

void i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  // 缺翻译时直接返回 key（即中文原文）
  fallbackLng: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  resources: {},
  returnEmptyString: false,
})

export async function setLanguage(setting: LangSetting): Promise<void> {
  localStorage.setItem(LANG_KEY, setting)
  const lang = resolve(setting)
  if (lang !== 'zh-CN' && !i18n.hasResourceBundle(lang, 'translation')) {
    const mod = await loaders[lang as OtherLang]()
    i18n.addResourceBundle(lang, 'translation', mod.default, true, true)
  }
  await i18n.changeLanguage(lang)
  document.documentElement.lang = lang
}

export function currentLangLabel(): string {
  const setting = getLangSetting()
  if (setting === 'system') return '跟随系统'
  return LANGS.find((l) => l.code === setting)?.label ?? '简体中文'
}

// 启动时恢复用户选择 / 跟随系统
void setLanguage(getLangSetting())

export default i18n
