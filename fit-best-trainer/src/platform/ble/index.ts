import { Capacitor } from '@capacitor/core'
import { NativeBleAdapter } from './native'
import type { BleAdapter } from './types'
import { WebBleAdapter } from './web'

export const ble: BleAdapter = Capacitor.isNativePlatform()
  ? new NativeBleAdapter()
  : new WebBleAdapter()

export const bleAdapter = ble
export { toDataView, toUint8Array } from './data'
export type {
  BleAdapter,
  BleCharacteristic,
  BleConnection,
  BleDeviceRef,
  BleScanOptions,
} from './types'
export default ble
