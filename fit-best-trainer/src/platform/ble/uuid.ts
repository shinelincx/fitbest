const BLUETOOTH_BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb'

export function normalizeUuid(uuid: string): string {
  const value = uuid.trim().toLowerCase()
  const shortUuid = /^(?:0x)?([\da-f]{4})$/.exec(value)
  return shortUuid ? `0000${shortUuid[1]}${BLUETOOTH_BASE_UUID_SUFFIX}` : value
}
