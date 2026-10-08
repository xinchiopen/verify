/** 声明 vite 环境变量的类型 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_PUBLIC_PATH: string
  readonly VITE_AMAP_WEB_KEY: string
  readonly VITE_AMAP_SECURITY_JS_CODE?: string
  readonly VITE_FEISHU_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
