export interface BleDeviceRef {
  id: string
  name?: string
}

export interface BleScanOptions {
  services: string[]
  optionalServices?: string[]
  namePrefix?: string
  acceptAll?: boolean
}

export interface BleAdapter {
  isSupported(): boolean
  requestDevice(options: BleScanOptions): Promise<BleDeviceRef>
  connect(device: BleDeviceRef, onDisconnect: () => void): Promise<BleConnection>
  cancelScan(): Promise<void>
}

export interface BleConnection {
  device: BleDeviceRef
  hasService(uuid: string): boolean
  getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<BleCharacteristic>
  isConnected(): Promise<boolean>
  disconnect(): Promise<void>
}

export interface BleCharacteristic {
  startNotifications(callback: (bytes: Uint8Array) => void): Promise<() => void>
  stopNotifications(): Promise<void>
  writeWithoutResponse(bytes: Uint8Array): Promise<void>
}
