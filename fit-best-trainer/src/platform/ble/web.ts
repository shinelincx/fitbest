import { toDataView, toUint8Array } from './data'
import type {
  BleAdapter,
  BleCharacteristic,
  BleConnection,
  BleDeviceRef,
  BleScanOptions,
} from './types'
import { normalizeUuid } from './uuid'

interface WebDeviceEntry {
  device: BluetoothDevice
  disconnectListener?: EventListener
}

class WebBleCharacteristic implements BleCharacteristic {
  private readonly characteristic: BluetoothRemoteGATTCharacteristic
  private notificationListener?: EventListener

  constructor(characteristic: BluetoothRemoteGATTCharacteristic) {
    this.characteristic = characteristic
  }

  async startNotifications(callback: (bytes: Uint8Array) => void): Promise<() => void> {
    this.clearNotificationListener()

    const listener: EventListener = (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value
      if (value) callback(toUint8Array(value))
    }

    this.notificationListener = listener
    this.characteristic.addEventListener('characteristicvaluechanged', listener)

    try {
      await this.characteristic.startNotifications()
    } catch (error) {
      if (this.notificationListener === listener) this.clearNotificationListener()
      throw error
    }

    return () => {
      if (this.notificationListener === listener) this.clearNotificationListener()
    }
  }

  async stopNotifications(): Promise<void> {
    this.clearNotificationListener()
    await this.characteristic.stopNotifications()
  }

  async writeWithoutResponse(bytes: Uint8Array): Promise<void> {
    await this.characteristic.writeValueWithoutResponse(toDataView(bytes))
  }

  private clearNotificationListener(): void {
    if (!this.notificationListener) return
    this.characteristic.removeEventListener('characteristicvaluechanged', this.notificationListener)
    this.notificationListener = undefined
  }
}

class WebBleConnection implements BleConnection {
  readonly device: BleDeviceRef
  private readonly server: BluetoothRemoteGATTServer
  private readonly services: Set<string>
  private disconnectPromise?: Promise<void>

  constructor(
    device: BleDeviceRef,
    server: BluetoothRemoteGATTServer,
    services: BluetoothRemoteGATTService[],
  ) {
    this.device = device
    this.server = server
    this.services = new Set(services.map((service) => normalizeUuid(service.uuid)))
  }

  hasService(uuid: string): boolean {
    return this.services.has(normalizeUuid(uuid))
  }

  async isConnected(): Promise<boolean> {
    return this.server.connected
  }

  async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<BleCharacteristic> {
    const service = await this.server.getPrimaryService(normalizeUuid(serviceUuid))
    const characteristic = await service.getCharacteristic(normalizeUuid(characteristicUuid))
    return new WebBleCharacteristic(characteristic)
  }

  disconnect(): Promise<void> {
    if (!this.disconnectPromise) this.disconnectPromise = this.disconnectOnce()
    return this.disconnectPromise
  }

  private async disconnectOnce(): Promise<void> {
    if (this.server.connected) this.server.disconnect()
  }
}

export class WebBleAdapter implements BleAdapter {
  private readonly devices = new Map<string, WebDeviceEntry>()

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth)
  }

  async cancelScan(): Promise<void> {
    // Web Bluetooth 的设备选择器由浏览器负责关闭。
  }

  async requestDevice(options: BleScanOptions): Promise<BleDeviceRef> {
    const services = options.services.map(normalizeUuid)
    const optionalServices = Array.from(
      new Set([...services, ...(options.optionalServices ?? []).map(normalizeUuid)]),
    )

    const device = options.acceptAll
      ? await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices })
      : await navigator.bluetooth.requestDevice({
          filters: [
            ...(options.namePrefix ? [{ namePrefix: options.namePrefix }] : []),
            { namePrefix: 'FB-' },
            { namePrefix: 'TF-' },
            ...services.map((service) => ({ services: [service] })),
          ],
          optionalServices,
        })

    this.devices.set(device.id, { device })
    return { id: device.id, name: device.name }
  }

  async connect(device: BleDeviceRef, onDisconnect: () => void): Promise<BleConnection> {
    const entry = this.devices.get(device.id)
    if (!entry) throw new Error('BLE device not found; call requestDevice first')

    const gatt = entry.device.gatt
    if (!gatt) throw new Error('BLE GATT server is unavailable')

    if (entry.disconnectListener) {
      entry.device.removeEventListener('gattserverdisconnected', entry.disconnectListener)
    }
    const disconnectListener = () => onDisconnect()
    entry.disconnectListener = disconnectListener
    entry.device.addEventListener('gattserverdisconnected', disconnectListener)

    const server = await gatt.connect()
    const services = await server.getPrimaryServices()
    return new WebBleConnection(device, server, services)
  }
}
