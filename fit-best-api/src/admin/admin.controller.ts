import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { z } from 'zod'
import { AdminGuard } from '../common/admin.guard'
import { CurrentAdmin } from '../common/decorators'
import type { AdminPayload } from '../common/jwt'
import { ZodPipe } from '../common/zod.pipe'
import { AdminService } from './admin.service'
import { AuditInterceptor } from './audit.interceptor'

const uuid = z.string().uuid('ID 格式不正确')
const machineTypeSchema = z.enum(['treadmill', 'rower', 'ski', 'bike', 'sled', 'rep'])
const machineStatusSchema = z.enum(['active', 'maintenance', 'retired'])

const createMachineSchema = z.object({
  orgId: uuid.optional(),
  gymId: uuid.optional(),
  modelId: uuid,
  serialNo: z.string().trim().min(1, '请填写序列号').max(100),
  status: machineStatusSchema.optional(),
  firmware: z.string().max(100).optional(),
})

const updateMachineSchema = z.object({
  gymId: uuid.optional(),
  status: machineStatusSchema.optional(),
  firmware: z.string().max(100).nullable().optional(),
})

const createModelSchema = z.object({
  orgId: uuid.optional(),
  type: machineTypeSchema,
  model: z.string().trim().min(1, '请填写型号名称').max(100),
  brand: z.string().max(100).optional(),
  specs: z.record(z.any()).optional(),
})

const qrTagSchema = z.object({ machineId: uuid })
const nfcTagSchema = z.object({ machineId: uuid, tagValue: z.string().trim().min(1).max(200) })

const eventLinkBase = {
  orgId: uuid.optional(),
  title: z.string().trim().min(1, '请填写赛事标题').max(100),
  subtitle: z.string().max(200).optional(),
  coverUrl: z.string().max(500).optional(),
  externalUrl: z.string().url('请填写合法的跳转链接'),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  status: z.enum(['published', 'draft', 'offline']).optional(),
}

const createEventLinkSchema = z.object(eventLinkBase)
const updateEventLinkSchema = z.object({
  orgId: uuid.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  subtitle: z.string().max(200).nullable().optional(),
  coverUrl: z.string().max(500).nullable().optional(),
  externalUrl: z.string().url('请填写合法的跳转链接').optional(),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  status: z.enum(['published', 'draft', 'offline']).optional(),
})

const gymStatusSchema = z.enum(['active', 'closed', 'maintenance'])

const createGymSchema = z.object({
  orgId: uuid.optional(),
  name: z.string().trim().min(1, '请填写门店名称').max(100),
  code: z.string().trim().min(1, '请填写门店编码').max(50),
  address: z.string().max(300).optional(),
  timezone: z.string().max(50).optional(),
})

const updateGymSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z.string().trim().min(1).max(50).optional(),
  address: z.string().max(300).nullable().optional(),
  timezone: z.string().max(50).optional(),
  status: gymStatusSchema.optional(),
})

@Controller('api/v1/admin')
@UseGuards(AdminGuard)
@UseInterceptors(AuditInterceptor)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(
    @CurrentAdmin() payload: AdminPayload,
    @Query('app') app?: string,
  ) {
    return this.admin.overview(payload, app)
  }

  @Get('users')
  users(
    @CurrentAdmin() payload: AdminPayload,
    @Query('keyword') keyword?: string,
    @Query('app') app?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.users(payload, { keyword: keyword?.trim() || undefined, app, page, pageSize })
  }

  @Get('users/:id')
  userDetail(
    @CurrentAdmin() payload: AdminPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('app') app?: string,
  ) {
    return this.admin.userDetail(payload, id, app)
  }

  @Get('sessions')
  sessions(
    @CurrentAdmin() payload: AdminPayload,
    @Query('gymId') gymId?: string,
    @Query('machineId') machineId?: string,
    @Query('app') app?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.sessions(payload, { gymId, machineId, app, from, to, page, pageSize })
  }

  @Get('training-records')
  trainingRecords(
    @CurrentAdmin() payload: AdminPayload,
    @Query('app') app?: string,
    @Query('userId') userId?: string,
    @Query('completed') completed?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.trainingRecords(payload, { app, userId, completed, from, to, page, pageSize })
  }

  @Get('device-sessions')
  deviceSessions(
    @CurrentAdmin() payload: AdminPayload,
    @Query('app') app?: string,
    @Query('mode') mode?: string,
    @Query('deviceSerial') deviceSerial?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.deviceSessions(payload, { app, mode, deviceSerial, from, to, page, pageSize })
  }

  @Get('machines')
  machines(@CurrentAdmin() payload: AdminPayload, @Query('gymId') gymId?: string) {
    return this.admin.machines(payload, gymId)
  }

  @Post('machines')
  createMachine(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(createMachineSchema)) body: z.infer<typeof createMachineSchema>,
  ) {
    return this.admin.createMachine(payload, body)
  }

  @Patch('machines/:id')
  updateMachine(
    @CurrentAdmin() payload: AdminPayload,
    @Param('id') id: string,
    @Body(new ZodPipe(updateMachineSchema)) body: z.infer<typeof updateMachineSchema>,
  ) {
    return this.admin.updateMachine(payload, id, body)
  }

  @Get('machine-models')
  machineModels(@CurrentAdmin() payload: AdminPayload) {
    return this.admin.machineModels(payload)
  }

  @Post('machine-models')
  createMachineModel(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(createModelSchema)) body: z.infer<typeof createModelSchema>,
  ) {
    return this.admin.createMachineModel(payload, body)
  }

  @Post('tags/generate')
  generateQrTag(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(qrTagSchema)) body: z.infer<typeof qrTagSchema>,
  ) {
    return this.admin.generateQrTag(payload, body.machineId)
  }

  @Post('tags/nfc')
  createNfcTag(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(nfcTagSchema)) body: z.infer<typeof nfcTagSchema>,
  ) {
    return this.admin.createNfcTag(payload, body.machineId, body.tagValue)
  }

  @Get('event-links')
  eventLinks(@CurrentAdmin() payload: AdminPayload) {
    return this.admin.eventLinks(payload)
  }

  @Post('event-links')
  createEventLink(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(createEventLinkSchema)) body: z.infer<typeof createEventLinkSchema>,
  ) {
    return this.admin.createEventLink(payload, body)
  }

  @Patch('event-links/:id')
  updateEventLink(
    @CurrentAdmin() payload: AdminPayload,
    @Param('id') id: string,
    @Body(new ZodPipe(updateEventLinkSchema)) body: z.infer<typeof updateEventLinkSchema>,
  ) {
    return this.admin.updateEventLink(payload, id, body)
  }

  @Delete('event-links/:id')
  deleteEventLink(@CurrentAdmin() payload: AdminPayload, @Param('id') id: string) {
    return this.admin.deleteEventLink(payload, id)
  }

  @Get('event-registrations')
  registrations(
    @CurrentAdmin() payload: AdminPayload,
    @Query('eventId') eventId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.registrations(payload, { eventId, from, to, page, pageSize })
  }

  @Get('audit-logs')
  auditLogs(
    @CurrentAdmin() payload: AdminPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.auditLogs(payload, page, pageSize)
  }

  // ---------- Gym management ----------

  @Get('gyms')
  gyms(@CurrentAdmin() payload: AdminPayload) {
    return this.admin.gyms(payload)
  }

  @Post('gyms')
  createGym(
    @CurrentAdmin() payload: AdminPayload,
    @Body(new ZodPipe(createGymSchema)) body: z.infer<typeof createGymSchema>,
  ) {
    return this.admin.createGym(payload, body)
  }

  @Patch('gyms/:id')
  updateGym(
    @CurrentAdmin() payload: AdminPayload,
    @Param('id') id: string,
    @Body(new ZodPipe(updateGymSchema)) body: z.infer<typeof updateGymSchema>,
  ) {
    return this.admin.updateGym(payload, id, body)
  }

  @Delete('gyms/:id')
  deleteGym(@CurrentAdmin() payload: AdminPayload, @Param('id') id: string) {
    return this.admin.deleteGym(payload, id)
  }
}
