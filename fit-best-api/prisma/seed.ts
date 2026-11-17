import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'
import { buildQrValue } from '../src/common/scan-token'

const prisma = new PrismaClient()

const ORG_CODE = 'FITBEST'
const GYM_CODE = 'SH-001'

async function main() {
  const adminPhone = process.env.SEED_ADMIN_PHONE
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminPhone || !adminPassword) {
    throw new Error('Set SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD before seeding')
  }

  const org = await prisma.org.upsert({
    where: { code: ORG_CODE },
    update: { name: 'FITBEST' },
    create: { name: 'FITBEST', code: ORG_CODE },
  })

  const gym = await prisma.gym.upsert({
    where: { orgId_code: { orgId: org.id, code: GYM_CODE } },
    update: { name: '上海旗舰店', address: '上海市静安区训练中心 1 号' },
    create: {
      orgId: org.id,
      code: GYM_CODE,
      name: '上海旗舰店',
      address: '上海市静安区训练中心 1 号',
      timezone: 'Asia/Shanghai',
    },
  })

  const models = [
    { type: 'treadmill' as const, model: 'Treadmill A1', brand: 'FITBEST', specs: { beltWidthMm: 550, maxSpeedKmh: 22 } },
    { type: 'rower' as const, model: 'RowErg R1', brand: 'FITBEST', specs: { damperLevels: 10 } },
    { type: 'ski' as const, model: 'SkiErg S1', brand: 'FITBEST', specs: { resistanceLevels: 8 } },
    { type: 'bike' as const, model: 'BikeErg B1', brand: 'FITBEST', specs: { resistanceLevels: 12 } },
  ]

  const modelRecords = []
  for (const item of models) {
    modelRecords.push(
      await prisma.machineModel.upsert({
        where: { orgId_type_model: { orgId: org.id, type: item.type, model: item.model } },
        update: { brand: item.brand, specs: item.specs },
        create: { orgId: org.id, type: item.type, model: item.model, brand: item.brand, specs: item.specs },
      }),
    )
  }

  const machineSeeds = [
    { serialNo: 'FB-TM-001', modelId: modelRecords[0].id, firmware: 'v1.0.0' },
    { serialNo: 'FB-RW-001', modelId: modelRecords[1].id, firmware: 'v1.0.0' },
    { serialNo: 'FB-SK-001', modelId: modelRecords[2].id, firmware: 'v1.0.0' },
    { serialNo: 'FB-BK-001', modelId: modelRecords[3].id, firmware: 'v1.0.0' },
  ]

  for (const item of machineSeeds) {
    const machine = await prisma.machine.upsert({
      where: { serialNo: item.serialNo },
      update: { orgId: org.id, gymId: gym.id, modelId: item.modelId, firmware: item.firmware },
      create: {
        orgId: org.id,
        gymId: gym.id,
        modelId: item.modelId,
        serialNo: item.serialNo,
        firmware: item.firmware,
      },
    })
    const tagValue = buildQrValue(machine.id)
    await prisma.machineTag.upsert({
      where: { tagValue },
      update: { machineId: machine.id, status: 'active' },
      create: { machineId: machine.id, tagType: 'qr', tagValue, printedAt: new Date() },
    })
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10)
  await prisma.adminUser.upsert({
    where: { phone: adminPhone },
    update: { passwordHash, role: 'super', status: 'active' },
    create: {
      orgId: org.id,
      name: 'FITBEST 管理员',
      phone: adminPhone,
      passwordHash,
      role: 'super',
    },
  })

  const eventCount = await prisma.eventLink.count({ where: { orgId: org.id } })
  if (eventCount === 0) {
    await prisma.eventLink.createMany({
      data: [
        {
          orgId: org.id,
          title: 'FITBEST 城市挑战赛',
          subtitle: '线上报名，线下门店参赛',
          externalUrl: 'https://fitbest.example.com/events/city-challenge',
          sort: 1,
          status: 'published',
        },
        {
          orgId: org.id,
          title: '冬季划船机公开赛',
          subtitle: 'RowErg 500m 竞速',
          externalUrl: 'https://fitbest.example.com/events/rower-winter',
          sort: 2,
          status: 'published',
        },
      ],
    })
  }

  console.log('种子数据完成：org=%s gym=%s admin=13800000000', org.code, gym.code)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
