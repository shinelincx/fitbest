import { expect, test } from 'vitest'
import { parseEquipmentLabel, parseNfcEquipmentLabel } from '../src/ble/equipmentLabel'

test('keeps the exact device name from a legacy NFC link or a QR payload', () => {
  expect(parseEquipmentLabel('https://example.test/?from=nfc&name=YJ01-S7Pro-000007&stype=2', null))
    .toEqual({ type: 'treadmill', name: 'YJ01-S7Pro-000007' })
  expect(parseEquipmentLabel('{"type":"ski","name":"Kpower-00028"}', null))
    .toEqual({ type: 'ski', name: 'Kpower-00028' })
})

test('uses the type picker for generic labels and rejects unrelated labels', () => {
  expect(parseEquipmentLabel('Treadmill A1', null)).toEqual({ type: 'treadmill', name: '' })
  expect(parseEquipmentLabel('rower', null)).toEqual({ type: 'rower', name: '' })
  expect(parseEquipmentLabel('https://example.test/', null)).toBeNull()
  expect(parseEquipmentLabel('FB-PN-100', null)).toBeNull()
})

test('uses the configured machine type for a legacy FitBest sticker', () => {
  const label = 'http://www.thinkfiter.com/qr/fitbest.php?type=connectDevice&blename=TF04-S001-0010'
  expect(parseEquipmentLabel(label, {
    machineTypes: [],
    bleRules: [{ machineType: 'treadmill', match: 'contains', patterns: ['TF04-S001-'], preferredProtocol: 'PRIVATE', priority: 46 }],
    resistanceDisabledPatterns: [],
  })).toEqual({ type: 'treadmill', name: 'TF04-S001-0010' })
})
test('NFC requires the legacy marker and a complete case-preserved name', () => {
  expect(parseNfcEquipmentLabel('https://example.test/?from=nfc&name=Tf04-S001-0010&stype=2&mac=00', null))
    .toEqual({ type: 'treadmill', name: 'Tf04-S001-0010' })
  expect(parseNfcEquipmentLabel('from=nfc&stype=2', null)).toBeNull()
  expect(parseNfcEquipmentLabel('treadmill', null)).toBeNull()
})
