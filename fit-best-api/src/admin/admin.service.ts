import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { MachineType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.module'
import type { AdminPayload } from '../common/jwt'
import { buildQrValue } from '../common/scan-token'
import { dayStartShanghai, weekStartShanghai } from '../common/time'
import { maskEmail, maskPhone, maskWechat } from '../common/profile'
import {
  auditScope,
  eventScope,
  gymScope,
  machineScope,
  modelScope,
  resolveOrgId,
  resolveWritableGymId,
  sessionScope,
  userScope,
} from './tenant'

type MachineView = Prisma.MachineGetPayload<{
  include: { model: true; gym: { select: { id: true; name: true } } }
}>

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} 时间格式不正确`)
  return date
}

function pageParams(page?: string, pageSize?: string) {
  const current = Math.max(1, Number(page) || 1)
  const size = Math.min(5000, Math.max(1, Number(pageSize) || 20))
  return { page: current, pageSize: size, skip: (current - 1) * size }
}

function normalizeApp(value?: string): 'hyrox' | 'btwe' | undefined {
  const v = value?.trim().toLowerCase()
  if (v === 'hyrox' || v === 'btwe') return v
  return undefined
}

function completedBool(value?: string): boolean | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return undefined
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private machineView(machine: MachineView) {
    return {
      id: machine.id,
      type: machine.model.type,
      model: machine.model.model,
      brand: machine.model.brand,
      name: `${machine.model.brand ? `${machine.model.brand} ` : ''}${machine.model.model}`,
      modelId: machine.modelId,
      serialNo: machine.serialNo,
      status: machine.status,
      firmware: machine.firmware,
      gymId: machine.gymId,
      gymName: machine.gym.name,
      createdAt: machine.createdAt,
    }
  }

  private tagView(tag: { id: string; tagType: string; tagValue: string; status: string; printedAt: Date | null; createdAt: Date }) {
    return {
      id: tag.id,
      tagType: tag.tagType,
      tagValue: tag.tagValue,
      status: tag.status,
      printedAt: tag.printedAt,
      createdAt: tag.createdAt,
    }
  }

  private mask(type: string, identifier: string): string {
    if (type === 'phone') return maskPhone(identifier)
    if (type === 'email') return maskEmail(identifier)
    return maskWechat(identifier)
  }

  async overview(admin: AdminPayload, app?: string) {
    const normalized = normalizeApp(app)
    const today = dayStartShanghai()
    const weekStart = weekStartShanghai()
    const userWhere = { status: 'active', ...userScope(admin) }
    const sessionWhere = { ...sessionScope(admin) }
    if (normalized) {
      // overview 不直接关联 TrainingRecord，这里用设备 session 补一个 app 过滤近似：
      // 活跃用户数按 TrainingRecord 过滤，session 侧维持原口径
      const [appUserIds] = await Promise.all([
        this.prisma.trainingRecord.findMany({
          where: { app: normalized },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ])
      if (appUserIds.length) (userWhere as Prisma.UserWhereInput).id = { in: appUserIds.map((u) => u.userId) }
    }
    const machineWhere = { ...machineScope(admin), status: 'active' as const }

    const [users, sessionsToday, sessionsThisWeek, activeMachines, gyms, typeGroups] = await Promise.all([
      this.prisma.user.count({ where: userWhere }),
      this.prisma.session.count({ where: { ...sessionWhere, startedAt: { gte: today } } }),
      this.prisma.session.count({ where: { ...sessionWhere, startedAt: { gte: weekStart } } }),
      this.prisma.machine.count({ where: machineWhere }),
      admin.role === 'super'
        ? this.prisma.gym.count()
        : admin.role === 'org_admin'
          ? this.prisma.gym.count({ where: { orgId: admin.orgId } })
          : this.prisma.gym.count({ where: admin.gymId ? { id: admin.gymId } : { id: { in: [] } } }),
      this.prisma.session.groupBy({
        by: ['machineType'],
        where: { ...sessionWhere, startedAt: { gte: weekStart } },
        _count: { _all: true },
      }),
    ])

    // 训练记录分 app 汇总（按传入 app 过滤后的统计）
    const appKpi = normalized
      ? await this.prisma.trainingRecord.aggregate({
          where: { app: normalized },
          _count: true,
          _sum: { totalTimeSec: true, distanceM: true },
        })
      : null

    return {
      users,
      sessionsToday,
      sessionsThisWeek,
      activeMachines,
      gyms,
      byType: typeGroups.map((item) => ({ type: item.machineType, sessions: item._count._all })),
      trainingRecordsTotal: appKpi?._count ?? null,
      trainingTotalSec: appKpi?._sum.totalTimeSec ?? null,
      trainingTotalDistanceM: appKpi?._sum.distanceM ?? null,
    }
  }

  async users(
    admin: AdminPayload,
    filters: { keyword?: string; app?: string; page?: string; pageSize?: string },
  ) {
    const { page: current, pageSize: size, skip } = pageParams(filters.page, filters.pageSize)
    const where: Prisma.UserWhereInput = { status: { not: 'deleted' }, ...userScope(admin) }
    const normalized = normalizeApp(filters.app)
    if (normalized) {
      const ids = (
        await this.prisma.trainingRecord.findMany({
          where: { app: normalized },
          select: { userId: true },
          distinct: ['userId'],
        })
      ).map((u) => u.userId)
      if (!ids.length) return { total: 0, page: current, pageSize: size, items: [] }
      where.id = { in: ids }
    }
    if (filters.keyword) {
      where.OR = [
        { nickname: { contains: filters.keyword, mode: 'insensitive' } },
        { identities: { some: { identifier: { contains: filters.keyword } } } },
      ]
    }
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { identities: true, goal: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
    ])
    return {
      total,
      page: current,
      pageSize: size,
      items: users.map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        status: user.status,
        createdAt: user.createdAt,
        goals: { weeklySessions: user.goal?.weeklySessions ?? 0, weeklyMinutes: user.goal?.weeklyMinutes ?? 0 },
        identities: user.identities.map((identity) => ({
          type: identity.type,
          identifier: this.mask(identity.type, identity.identifier),
          verifiedAt: identity.verifiedAt,
        })),
      })),
    }
  }

  async userDetail(admin: AdminPayload, id: string, app?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, status: { not: 'deleted' }, ...userScope(admin) },
      include: { identities: true, goal: true },
    })
    if (!user) throw new NotFoundException('用户不存在')

    const normalized = normalizeApp(app)
    const trWhere: Prisma.TrainingRecordWhereInput = { userId: id, ...(normalized ? { app: normalized } : {}) }
    const [trainingRecords, registrations, sessions] = await Promise.all([
      this.prisma.trainingRecord.findMany({
        where: trWhere,
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.eventRegistration.findMany({
        where: { userId: id },
        include: { event: { select: { id: true, title: true, startAt: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.session.findMany({
        where: { userId: id, ...sessionScope(admin) },
        include: { machine: { select: { serialNo: true } } },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
    ])

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      status: user.status,
      createdAt: user.createdAt,
      goals: { weeklySessions: user.goal?.weeklySessions ?? 0, weeklyMinutes: user.goal?.weeklyMinutes ?? 0 },
      identities: user.identities.map((identity) => ({
        type: identity.type,
        identifier: this.mask(identity.type, identity.identifier),
        verifiedAt: identity.verifiedAt,
      })),
      trainingRecords: trainingRecords.map((record) => ({
        id: record.id,
        app: record.app,
        planId: record.planId,
        completed: record.completed,
        totalTimeSec: record.totalTimeSec,
        distanceM: record.distanceM,
        rpe: record.rpe,
        weakestStation: record.weakestStation,
        moduleTimes: record.moduleTimes,
        startedAt: record.startedAt,
        createdAt: record.createdAt,
      })),
      registrations: registrations.map((registration) => ({
        id: registration.id,
        status: registration.status,
        createdAt: registration.createdAt,
        event: registration.event,
      })),
      sessions: sessions.map((session) => ({
        id: session.id,
        machineType: session.machineType,
        machineSerialNo: session.machine?.serialNo ?? null,
        durationSec: session.durationSec,
        distanceM: session.distanceM,
        calories: session.calories,
        startedAt: session.startedAt,
      })),
    }
  }

  async sessions(
    admin: AdminPayload,
    filters: { gymId?: string; machineId?: string; app?: string; from?: string; to?: string; page?: string; pageSize?: string },
  ) {
    const { page: current, pageSize: size, skip } = pageParams(filters.page, filters.pageSize)
    const where: Prisma.SessionWhereInput = { ...sessionScope(admin) }
    if (filters.gymId) where.gymId = filters.gymId
    if (filters.machineId) where.machineId = filters.machineId
    const normalized = normalizeApp(filters.app)
    if (normalized) {
      const ids = (
        await this.prisma.trainingRecord.findMany({
          where: { app: normalized },
          select: { userId: true },
          distinct: ['userId'],
        })
      ).map((u) => u.userId)
      if (!ids.length) return { items: [], total: 0, page: current, pageSize: size }
      where.userId = { in: ids }
    }
    const from = parseDate(filters.from, 'from')
    const to = parseDate(filters.to, 'to')
    if (from || to) where.startedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

    const [total, sessions] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        include: { user: { select: { nickname: true } }, machine: { select: { serialNo: true } } },
        orderBy: { startedAt: 'desc' },
        skip,
        take: size,
      }),
    ])

    const items = sessions.map((session) => ({
      id: session.id,
      userNickname: session.user.nickname,
      gymId: session.gymId,
      machineId: session.machineId,
      machineSerialNo: session.machine?.serialNo ?? null,
      machineType: session.machineType,
      machineModel: session.machineModel,
      durationSec: session.durationSec,
      distanceM: session.distanceM,
      calories: session.calories,
      avgHr: session.avgHr,
      avgSpeed: session.avgSpeed == null ? null : Number(session.avgSpeed),
      cadence: session.cadence,
      power: session.power,
      source: session.source,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    }))

    return { items, total, page: current, pageSize: size }
  }

  async machines(admin: AdminPayload, gymId?: string) {
    const machines = await this.prisma.machine.findMany({
      where: { ...machineScope(admin), ...(gymId ? { gymId } : {}) },
      include: { model: true, gym: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return machines.map((machine) => this.machineView(machine))
  }

  async createMachine(
    admin: AdminPayload,
    input: {
      orgId?: string
      gymId?: string
      modelId: string
      serialNo: string
      status?: 'active' | 'maintenance' | 'retired'
      firmware?: string
    },
  ) {
    const orgId = resolveOrgId(admin, input.orgId)
    const gymId = resolveWritableGymId(admin, input.gymId)
    if (!gymId) throw new BadRequestException('请选择门店')

    const [gym, model] = await Promise.all([
      this.prisma.gym.findUnique({ where: { id: gymId } }),
      this.prisma.machineModel.findUnique({ where: { id: input.modelId } }),
    ])
    if (!gym || gym.orgId !== orgId) throw new BadRequestException('门店不属于该组织')
    if (!model || model.orgId !== orgId) throw new BadRequestException('器械型号不属于该组织')

    try {
      const machine = await this.prisma.machine.create({
        data: {
          orgId,
          gymId,
          modelId: input.modelId,
          serialNo: input.serialNo,
          status: input.status ?? 'active',
          firmware: input.firmware,
        },
        include: { model: true, gym: { select: { id: true, name: true } } },
      })
      return this.machineView(machine)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该序列号已存在')
      throw error
    }
  }

  async updateMachine(
    admin: AdminPayload,
    id: string,
    input: { gymId?: string; status?: 'active' | 'maintenance' | 'retired'; firmware?: string | null },
  ) {
    const machine = await this.prisma.machine.findFirst({ where: { id, ...machineScope(admin) } })
    if (!machine) throw new NotFoundException('器械不存在')

    let gymId: string | undefined
    if (input.gymId && (admin.role === 'super' || admin.role === 'org_admin')) {
      const gym = await this.prisma.gym.findUnique({ where: { id: input.gymId } })
      if (!gym || gym.orgId !== machine.orgId) throw new BadRequestException('门店不属于该组织')
      gymId = input.gymId
    }

    const updated = await this.prisma.machine.update({
      where: { id },
      data: { gymId, status: input.status, firmware: input.firmware },
      include: { model: true, gym: { select: { id: true, name: true } } },
    })
    return this.machineView(updated)
  }

  async machineModels(admin: AdminPayload) {
    const models = await this.prisma.machineModel.findMany({
      where: modelScope(admin),
      include: { _count: { select: { machines: true } } },
      orderBy: [{ type: 'asc' }, { model: 'asc' }],
    })
    return models.map((model) => ({
      id: model.id,
      orgId: model.orgId,
      type: model.type,
      model: model.model,
      brand: model.brand,
      specs: model.specs,
      machineCount: model._count.machines,
      createdAt: model.createdAt,
    }))
  }

  async createMachineModel(
    admin: AdminPayload,
    input: { orgId?: string; type: MachineType; model: string; brand?: string; specs?: Record<string, unknown> },
  ) {
    const orgId = resolveOrgId(admin, input.orgId)
    try {
      return await this.prisma.machineModel.create({
        data: { orgId, type: input.type, model: input.model, brand: input.brand, specs: input.specs as object },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该型号已存在')
      throw error
    }
  }

  async generateQrTag(admin: AdminPayload, machineId: string) {
    const machine = await this.prisma.machine.findFirst({
      where: { id: machineId, ...machineScope(admin) },
      include: { model: true, gym: { select: { id: true, name: true } } },
    })
    if (!machine) throw new NotFoundException('器械不存在')

    const existing = await this.prisma.machineTag.findFirst({
      where: { machineId, tagType: 'qr', status: 'active' },
    })
    if (existing) {
      return { machine: this.machineView(machine), tag: this.tagView(existing), qrValue: existing.tagValue }
    }

    const tagValue = buildQrValue(machine.id)
    try {
      const tag = await this.prisma.machineTag.create({
        data: { machineId, tagType: 'qr', tagValue, printedAt: new Date() },
      })
      return { machine: this.machineView(machine), tag: this.tagView(tag), qrValue: tagValue }
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
      const tag = await this.prisma.machineTag.findUnique({ where: { tagValue } })
      if (!tag) throw error
      return { machine: this.machineView(machine), tag: this.tagView(tag), qrValue: tag.tagValue }
    }
  }

  async createNfcTag(admin: AdminPayload, machineId: string, tagValue: string) {
    const machine = await this.prisma.machine.findFirst({
      where: { id: machineId, ...machineScope(admin) },
      include: { model: true, gym: { select: { id: true, name: true } } },
    })
    if (!machine) throw new NotFoundException('器械不存在')

    try {
      const tag = await this.prisma.machineTag.create({
        data: { machineId, tagType: 'nfc', tagValue, printedAt: new Date() },
      })
      return { machine: this.machineView(machine), tag: this.tagView(tag) }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该 NFC 标签已被使用')
      throw error
    }
  }

  async eventLinks(admin: AdminPayload) {
    const [events, counts] = await Promise.all([
      this.prisma.eventLink.findMany({
        where: eventScope(admin),
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.eventRegistration.groupBy({
        by: ['eventId'],
        where: { event: eventScope(admin) },
        _count: { _all: true },
      }),
    ])
    const countMap = new Map(counts.map((item) => [item.eventId, item._count._all]))
    return events.map((event) => ({ ...event, registrationCount: countMap.get(event.id) ?? 0 }))
  }

  async registrations(
    admin: AdminPayload,
    filters: { eventId?: string; from?: string; to?: string; page?: string; pageSize?: string },
  ) {
    const { page: current, pageSize: size, skip } = pageParams(filters.page, filters.pageSize)
    const where: Prisma.EventRegistrationWhereInput = { event: eventScope(admin) }
    if (filters.eventId) where.eventId = filters.eventId
    const from = parseDate(filters.from, 'from')
    const to = parseDate(filters.to, 'to')
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

    const [total, items] = await Promise.all([
      this.prisma.eventRegistration.count({ where }),
      this.prisma.eventRegistration.findMany({
        where,
        include: {
          user: { select: { id: true, nickname: true, avatar: true } },
          event: { select: { id: true, title: true, startAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
    ])

    return {
      total,
      page: current,
      pageSize: size,
      items: items.map((registration) => ({
        id: registration.id,
        status: registration.status,
        createdAt: registration.createdAt,
        user: registration.user,
        event: registration.event,
      })),
    }
  }

  async createEventLink(
    admin: AdminPayload,
    input: {
      orgId?: string
      title: string
      subtitle?: string
      coverUrl?: string
      externalUrl: string
      startAt?: Date
      endAt?: Date
      sort?: number
      status?: string
    },
  ) {
    const orgId = admin.role === 'super' ? input.orgId ?? null : admin.orgId
    return this.prisma.eventLink.create({ data: { ...input, orgId } })
  }

  async updateEventLink(
    admin: AdminPayload,
    id: string,
    input: {
      orgId?: string
      title?: string
      subtitle?: string | null
      coverUrl?: string | null
      externalUrl?: string
      startAt?: Date | null
      endAt?: Date | null
      sort?: number
      status?: string
    },
  ) {
    const event = await this.prisma.eventLink.findFirst({ where: { id, ...eventScope(admin) } })
    if (!event) throw new NotFoundException('赛事不存在')
    return this.prisma.eventLink.update({
      where: { id },
      data: { ...input, orgId: admin.role === 'super' ? input.orgId : undefined },
    })
  }

  async deleteEventLink(admin: AdminPayload, id: string) {
    const event = await this.prisma.eventLink.findFirst({ where: { id, ...eventScope(admin) } })
    if (!event) throw new NotFoundException('赛事不存在')
    await this.prisma.eventLink.delete({ where: { id } })
    return { ok: true }
  }

  async auditLogs(admin: AdminPayload, page?: string, pageSize?: string) {
    const { page: current, pageSize: size, skip } = pageParams(page, pageSize)
    const where = auditScope(admin)
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
    ])
    return { items, total, page: current, pageSize: size }
  }

  // ---------- Gym CRUD ----------

  async gyms(admin: AdminPayload) {
    const gyms = await this.prisma.gym.findMany({
      where: gymScope(admin),
      orderBy: { createdAt: 'desc' },
    })
    const orgIds = [...new Set(gyms.map((g) => g.orgId))]
    const orgs = await this.prisma.org.findMany({ where: { id: { in: orgIds } } })
    const orgMap = new Map(orgs.map((o) => [o.id, o.name]))
    const counts = await this.prisma.machine.groupBy({
      by: ['gymId'],
      _count: { gymId: true },
      where: { gymId: { in: gyms.map((g) => g.id) } },
    })
    const countMap = new Map(counts.map((c) => [c.gymId, c._count.gymId]))
    return gyms.map((g) => ({
      id: g.id,
      orgId: g.orgId,
      orgName: orgMap.get(g.orgId) ?? '',
      name: g.name,
      code: g.code,
      address: g.address,
      timezone: g.timezone,
      status: g.status,
      machineCount: countMap.get(g.id) ?? 0,
      createdAt: g.createdAt,
    }))
  }

  async createGym(
    admin: AdminPayload,
    input: { orgId?: string; name: string; code: string; address?: string; timezone?: string },
  ) {
    const orgId = resolveOrgId(admin, input.orgId)
    try {
      const gym = await this.prisma.gym.create({
        data: {
          orgId,
          name: input.name,
          code: input.code,
          address: input.address,
          timezone: input.timezone ?? 'Asia/Shanghai',
        },
      })
      const org = await this.prisma.org.findUnique({ where: { id: orgId } })
      return {
        id: gym.id,
        orgId: gym.orgId,
        orgName: org?.name ?? '',
        name: gym.name,
        code: gym.code,
        address: gym.address,
        timezone: gym.timezone,
        status: gym.status,
        machineCount: 0,
        createdAt: gym.createdAt,
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('该组织下门店编码已存在')
      throw error
    }
  }

  async updateGym(
    admin: AdminPayload,
    id: string,
    input: { name?: string; code?: string; address?: string | null; timezone?: string; status?: string },
  ) {
    const gym = await this.prisma.gym.findFirst({ where: { id, ...gymScope(admin) } })
    if (!gym) throw new NotFoundException('门店不存在')
    const updated = await this.prisma.gym.update({ where: { id }, data: input })
    const org = await this.prisma.org.findUnique({ where: { id: updated.orgId } })
    const machineCount = await this.prisma.machine.count({ where: { gymId: id } })
    return {
      id: updated.id,
      orgId: updated.orgId,
      orgName: org?.name ?? '',
      name: updated.name,
      code: updated.code,
      address: updated.address,
      timezone: updated.timezone,
      status: updated.status,
      machineCount,
      createdAt: updated.createdAt,
    }
  }

  async deleteGym(admin: AdminPayload, id: string) {
    const gym = await this.prisma.gym.findFirst({ where: { id, ...gymScope(admin) } })
    if (!gym) throw new NotFoundException('门店不存在')
    const machineCount = await this.prisma.machine.count({ where: { gymId: id } })
    if (machineCount > 0) throw new BadRequestException(`该门店还有 ${machineCount} 台器械，无法删除`)
    await this.prisma.gym.delete({ where: { id } })
    return { ok: true }
  }

  // ---------- Brand-filtered brand-new endpoints ----------

  async trainingRecords(
    admin: AdminPayload,
    filters: {
      app?: string
      userId?: string
      completed?: string
      from?: string
      to?: string
      page?: string
      pageSize?: string
    },
  ) {
    const { page: current, pageSize: size, skip } = pageParams(filters.page, filters.pageSize)
    const normalized = normalizeApp(filters.app)
    const completed = completedBool(filters.completed)
    const from = parseDate(filters.from, 'from')
    const to = parseDate(filters.to, 'to')

    // 用户范围：把 userScope 先转成 userId 集合（trainingRecord 直接挂 userId，没有 gym/org 外键）
    const userWhere: Prisma.UserWhereInput = userScope(admin)
    const userIds = admin.role === 'super'
      ? undefined
      : (
          await this.prisma.user.findMany({
            where: userWhere,
            select: { id: true },
          })
        ).map((u) => u.id)
    if (userIds && !userIds.length) return { items: [], total: 0, page: current, pageSize: size }

    const where: Prisma.TrainingRecordWhereInput = {}
    if (userIds) where.userId = { in: userIds }
    if (normalized) where.app = normalized
    if (filters.userId) where.userId = filters.userId
    if (completed !== undefined) where.completed = completed
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

    const [total, records] = await Promise.all([
      this.prisma.trainingRecord.count({ where }),
      this.prisma.trainingRecord.findMany({
        where,
        include: { user: { select: { nickname: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
    ])

    return {
      items: records.map((r) => ({
        id: r.id,
        userNickname: r.user.nickname,
        app: r.app,
        completed: r.completed,
        totalTimeSec: r.totalTimeSec,
        distanceM: r.distanceM,
        rpe: r.rpe,
        weakestStation: r.weakestStation,
        moduleTimes: r.moduleTimes,
        runSplits: r.runSplits,
        avgHr: r.avgHr,
        maxHr: r.maxHr,
        startedAt: r.startedAt,
        createdAt: r.createdAt,
      })),
      total,
      page: current,
      pageSize: size,
    }
  }

  async deviceSessions(
    admin: AdminPayload,
    filters: {
      app?: string
      mode?: string
      deviceSerial?: string
      from?: string
      to?: string
      page?: string
      pageSize?: string
    },
  ) {
    const { page: current, pageSize: size, skip } = pageParams(filters.page, filters.pageSize)
    const where: Prisma.DeviceSessionWhereInput = {}
    const normalized = normalizeApp(filters.app)
    if (normalized) where.app = normalized
    if (filters.mode === 'training' || filters.mode === 'race') where.mode = filters.mode
    if (filters.deviceSerial) where.device = { serialNo: filters.deviceSerial }
    const from = parseDate(filters.from, 'from')
    const to = parseDate(filters.to, 'to')
    if (from || to) where.startedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }

    const [total, sessions] = await Promise.all([
      this.prisma.deviceSession.count({ where }),
      this.prisma.deviceSession.findMany({
        where,
        include: {
          user: { select: { nickname: true } },
          device: { select: { serialNo: true, label: true } },
          trainingRecord: { select: { id: true } },
          _count: { select: { segments: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: size,
      }),
    ])

    return {
      items: sessions.map((s) => ({
        id: s.id,
        userNickname: s.user.nickname,
        deviceSerialNo: s.device.serialNo,
        deviceLabel: s.device.label,
        app: s.app,
        mode: s.mode,
        clientSessionId: s.clientSessionId,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        avgHr: s.avgHr,
        maxHr: s.maxHr,
        closeReason: s.closeReason,
        quality: s.quality,
        segmentCount: s._count.segments,
        trainingRecordId: s.trainingRecordId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
      total,
      page: current,
      pageSize: size,
    }
  }
}
