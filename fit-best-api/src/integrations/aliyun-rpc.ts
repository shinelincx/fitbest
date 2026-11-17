import { createHmac, randomUUID } from 'node:crypto'
import { config } from '../config'

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

interface RpcResponse {
  Code?: string
  Message?: string
  RequestId?: string
  EnvId?: string
  [key: string]: unknown
}

/** 阿里云 RPC 风格 API 签名（短信 SendSms / 邮件 SingleSendMail 共用） */
export async function aliyunRpc(
  host: string,
  action: string,
  version: string,
  params: Record<string, string>,
): Promise<RpcResponse> {
  if (!config.aliyun.accessKeyId || !config.aliyun.accessKeySecret) {
    throw new Error('阿里云 AccessKey 未配置')
  }

  const all: Record<string, string> = {
    AccessKeyId: config.aliyun.accessKeyId,
    Action: action,
    Format: 'JSON',
    RegionId: config.aliyun.dmRegion,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: version,
    ...params,
  }

  const canonical = Object.keys(all)
    .sort()
    .map((key) => `${encode(key)}=${encode(all[key])}`)
    .join('&')
  const stringToSign = `GET&${encode('/')}&${encode(canonical)}`
  const signature = createHmac('sha1', `${config.aliyun.accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')

  const res = await fetch(`https://${host}/?${canonical}&Signature=${encode(signature)}`)
  const data = (await res.json()) as RpcResponse
  if (!res.ok || (data.Code && data.Code !== 'OK')) {
    throw new Error(data.Message || `阿里云接口调用失败（${res.status}）`)
  }
  return data
}
