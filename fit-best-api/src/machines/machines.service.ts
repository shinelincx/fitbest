import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.module'
import { parseQrValue } from '../common/scan-token'

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(gymId?: string) {
    const machines = await this.prisma.machine.findMany({
      where: { status: 'active', ...(gymId ? { gymId } : {}) },
      include: { model: true, gym: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return machines.map((machine) => this.serialize(machine))
  }

  private serialize(machine: {
    id: string
    serialNo: string
    status: string
    gymId: string
    model: { type: string; model: string; brand: string | null }
    gym?: { id: string; name: string } | null
  }) {
    return {
      id: machine.id,
      type: machine.model.type,
      model: machine.model.model,
      brand: machine.model.brand,
      name: `${machine.model.brand ? `${machine.model.brand} ` : ''}${machine.model.model}`,
      serialNo: machine.serialNo,
      status: machine.status,
      gymId: machine.gymId,
      gymName: machine.gym?.name ?? null,
    }
  }

  async resolve(kind: 'qr' | 'nfc', value: string) {
    let machineId: string | null = null

    if (kind === 'qr') {
      machineId = parseQrValue(value)
      if (!machineId) {
        const tag = await this.prisma.machineTag.findUnique({ where: { tagValue: value } })
        if (tag && tag.tagType === 'qr' && tag.status === 'active') machineId = tag.machineId
      }
    } else {
      const tag = await this.prisma.machineTag.findUnique({ where: { tagValue: value } })
      if (tag && tag.tagType === 'nfc' && tag.status === 'active') machineId = tag.machineId
      if (!machineId) machineId = parseQrValue(value)
      if (!machineId) {
        const machine = await this.prisma.machine.findUnique({ where: { serialNo: value } })
        machineId = machine?.id ?? null
      }
    }

    if (!machineId) throw new NotFoundException('未识别到器械，请重新扫码或贴卡')

    const machine = await this.prisma.machine.findUnique({
      where: { id: machineId },
      include: { model: true, gym: { select: { id: true, name: true } } },
    })
    if (!machine) throw new NotFoundException('未找到该器械，请联系门店工作人员')
    if (machine.status !== 'active') throw new BadRequestException('该设备维护中，请更换其他器械')

    return { machine: this.serialize(machine) }
  }
}
