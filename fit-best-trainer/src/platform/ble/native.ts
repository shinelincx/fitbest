import { Capacitor } from '@capacitor/core'
import { BleClient } from '@capacitor-community/bluetooth-le'
import type { BleService, RequestBleDeviceOptions } from '@capacitor-community/bluetooth-le'
import { toDataView, toUint8Array } from './data'
import type {
  BleAdapter,
  BleCharacteristic,
  BleConnection,
  BleDeviceRef,
  BleScanOptions,
} from './types'
import { normalizeUuid } from './uuid'

let initialization: Promise<void> | undefined

async function ensureReady(): Promise<void> {
  if (!initialization) {
    initialization = BleClient.initialize({ androidNeverForLocation: true }).catch((error) => {
      initialization = undefined
      throw error
    })
  }
  await initialization

  if (Capacitor.getPlatform() === 'android' && !(await BleClient.isEnabled())) {
    await BleClient.requestEnable()
  }
}

export async function scanNearbyDevices(onDevice: (device: BleDeviceRef, services: string[]) => void) {
  await ensureReady()
  await BleClient.requestLEScan({}, ({ device, localName, uuids }) => {
    onDevice({ id: device.deviceId, name: device.name || localName }, uuids ?? [])
  })
  return () => BleClient.stopLEScan()
}

class NativeBleCharacteristic implements BleCharacteristic {
  private readonly deviceId: string
  private readonly serviceUuid: string
  private readonly characteristicUuid: string

  constructor(deviceId: string, serviceUuid: string, characteristicUuid: string) {
    this.deviceId = deviceId
    this.serviceUuid = serviceUuid
    this.characteristicUuid = characteristicUuid
  }

  async startNotifications(callback: (bytes: Uint8Array) => void): Promise<() => void> {
    let active = true
    await BleClient.startNotifications(
      this.deviceId,
      this.serviceUuid,
      this.characteristicUuid,
      (value) => {
        if (active) callback(toUint8Array(value))
      },
    )
    return () => {
      active = false
    }
  }

  async stopNotifications(): Promise<void> {
    await BleClient.stopNotifications(this.deviceId, this.serviceUuid, this.characteristicUuid)
  }

  async writeWithoutResponse(bytes: Uint8Array): Promise<void> {
    await BleClient.writeWithoutResponse(
      this.deviceId,
      this.serviceUuid,
      this.characteristicUuid,
      toDataView(bytes),
    )
  }

  async writeWithResponse(bytes: Uint8Array): Promise<void> {
    await BleClient.write(this.deviceId, this.serviceUuid, this.characteristicUuid, toDataView(bytes))
  }

  async read(): Promise<Uint8Array> {
    return toUint8Array(await BleClient.read(this.deviceId, this.serviceUuid, this.characteristicUuid))
  }
}

class NativeBleConnection implements BleConnection {
  readonly device: BleDeviceRef
  private readonly services: Map<string, BleService>
  private disconnectPromise?: Promise<void>

  constructor(device: BleDeviceRef, services: BleService[]) {
    this.device = device
    this.services = new Map(services.map((service) => [normalizeUuid(service.uuid), service]))
  }

  hasService(uuid: string): boolean {
    return this.services.has(normalizeUuid(uuid))
  }

  async isConnected(): Promise<boolean> {
    try {
      const devices = await BleClient.getConnectedDevices(Array.from(this.services.keys()))
      return devices.some((device) => device.deviceId === this.device.id)
    } catch {
      return false
    }
  }

  async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<BleCharacteristic> {
    return new NativeBleCharacteristic(
      this.device.id,
      normalizeUuid(serviceUuid),
      normalizeUuid(characteristicUuid),
    )
  }

  async listCharacteristics(serviceUuid: string) {
    return this.services.get(normalizeUuid(serviceUuid))?.characteristics ?? []
  }

  disconnect(): Promise<void> {
    if (!this.disconnectPromise) this.disconnectPromise = BleClient.disconnect(this.device.id)
    return this.disconnectPromise
  }
}

export class NativeBleAdapter implements BleAdapter {
  isSupported(): boolean {
    return Capacitor.isPluginAvailable('BluetoothLe')
  }

  async cancelScan(): Promise<void> {
    await BleClient.stopLEScan()
  }

  async requestDevice(options: BleScanOptions): Promise<BleDeviceRef> {
    await ensureReady()

    const requestOptions: RequestBleDeviceOptions = {
      optionalServices: options.optionalServices?.map(normalizeUuid),
    }
    if (!options.acceptAll) {
      requestOptions.services = options.services.map(normalizeUuid)
      if (options.namePrefix) requestOptions.namePrefix = options.namePrefix
    }

    const device = await BleClient.requestDevice(requestOptions)
    return { id: device.deviceId, name: device.name }
  }

  async connect(device: BleDeviceRef, onDisconnect: () => void): Promise<BleConnection> {
    await ensureReady()
    await BleClient.connect(device.id, () => onDisconnect())
    try {
      return new NativeBleConnection(device, await BleClient.getServices(device.id))
    } catch (error) {
      await BleClient.disconnect(device.id).catch(() => undefined)
      throw error
    }
  }
}
