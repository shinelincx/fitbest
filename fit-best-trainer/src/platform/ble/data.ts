export function toUint8Array(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

export function toDataView(value: Uint8Array): DataView<ArrayBuffer> {
  if (value.buffer instanceof ArrayBuffer) {
    return new DataView(value.buffer, value.byteOffset, value.byteLength)
  }

  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return new DataView(copy.buffer)
}
