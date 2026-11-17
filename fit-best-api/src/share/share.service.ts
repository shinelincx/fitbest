import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { config } from '../config'
import { PrismaService } from '../prisma/prisma.module'

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const TYPE_LABEL: Record<string, string> = {
  treadmill: '跑步机',
  rower: '划船机',
  ski: '滑雪机',
  bike: '风阻车',
  sled: '雪橇机',
  rep: '力量训练',
}

function makeCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length]
  return code
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  private url(code: string): string {
    return `${config.publicBaseUrl.replace(/\/$/, '')}/s/${code}`
  }

  private serialize(link: {
    code: string
    sessionId: string | null
    views: number
    createdAt: Date
    ogTitle: string | null
    ogDesc: string | null
    ogImageUrl: string | null
  }) {
    return {
      code: link.code,
      url: this.url(link.code),
      sessionId: link.sessionId,
      views: link.views,
      createdAt: link.createdAt,
      og: { title: link.ogTitle, description: link.ogDesc, image: link.ogImageUrl },
    }
  }

  async create(userId: string, input: { sessionId?: string; weeklyPayload?: Record<string, unknown> }) {
    if (!input.sessionId && !input.weeklyPayload) {
      throw new BadRequestException('请提供训练记录或周报数据')
    }

    let ogTitle = '我的 FITBEST 训练'
    let ogDesc = '一起动起来，练出更好的自己'
    let ogImageUrl: string | null = null

    if (input.sessionId) {
      const session = await this.prisma.session.findFirst({
        where: { id: input.sessionId, userId },
        include: { user: { select: { nickname: true, avatar: true } } },
      })
      if (!session) throw new NotFoundException('训练记录不存在')

      const existing = await this.prisma.shareLink.findUnique({ where: { sessionId: session.id } })
      if (existing) return this.serialize(existing)

      const minutes = Math.round(session.durationSec / 60)
      const label = TYPE_LABEL[session.machineType] ?? '器械'
      ogTitle = `${session.user.nickname} 完成了一次${label}训练`
      ogDesc = `${minutes} 分钟 · ${session.calories} 千卡 · ${(session.distanceM / 1000).toFixed(2)} 公里`
      ogImageUrl = session.user.avatar
    } else if (input.weeklyPayload) {
      const payload = input.weeklyPayload
      const sessions = Number(payload.sessions ?? payload.totalSessions ?? 0)
      const minutes = Number(payload.minutes ?? payload.totalMinutes ?? 0)
      ogTitle = '我的本周训练战报'
      ogDesc = `本周完成 ${Number.isFinite(sessions) ? sessions : 0} 次训练，累计 ${
        Number.isFinite(minutes) ? minutes : 0
      } 分钟`
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeCode()
      try {
        const link = await this.prisma.shareLink.create({
          data: {
            code,
            sessionId: input.sessionId,
            weeklyPayload: input.weeklyPayload as object | undefined,
            ogTitle,
            ogDesc,
            ogImageUrl,
          },
        })
        return this.serialize(link)
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error
      }
    }
    throw new BadRequestException('分享码生成失败，请稍后重试')
  }

  async view(code: string): Promise<string | null> {
    const link = await this.prisma.shareLink.findUnique({ where: { code } })
    if (!link) return null
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null

    await this.prisma.shareLink.update({ where: { code }, data: { views: { increment: 1 } } }).catch(() => undefined)

    const title = escapeHtml(link.ogTitle ?? 'FITBEST 训练分享')
    const desc = escapeHtml(link.ogDesc ?? '一起动起来，练出更好的自己')
    const image = link.ogImageUrl ? escapeHtml(link.ogImageUrl) : ''

    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
${image ? `<meta property="og:image" content="${image}">` : ''}
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
main{width:min(90vw,420px);padding:32px;border-radius:24px;background:linear-gradient(160deg,#151b24,#0b0f14);border:1px solid #232b36;text-align:center}
.brand{margin:0 0 20px;font-size:13px;letter-spacing:4px;color:#5fd0a0;font-weight:600}
h1{margin:0 0 12px;font-size:24px;line-height:1.35}
p.desc{margin:0 0 24px;color:#9aa7b5;font-size:15px;line-height:1.6}
.tip{margin:0;font-size:12px;color:#5c6878}
</style>
</head>
<body>
<main>
<p class="brand">FITBEST</p>
<h1>${title}</h1>
<p class="desc">${desc}</p>
<p class="tip">打开 FITBEST App 查看完整训练数据</p>
</main>
</body>
</html>`
  }
}
