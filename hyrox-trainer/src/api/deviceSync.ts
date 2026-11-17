import { createDeviceSync } from '../../../race-trainer-shared/deviceSync'

export { bandSerial, getLastDeviceSync, subscribeToDeviceSync } from '../../../race-trainer-shared/deviceSync'
export * from '../../../race-trainer-shared/deviceProtocol'

export const { pendingDeviceCount, flushDeviceOutbox, syncDeviceSession, removeDeviceFromOutbox } = createDeviceSync('hyrox')
