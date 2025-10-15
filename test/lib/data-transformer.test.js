const {
  transformModbusData,
  toSignedInt16,
  toSignedInt32,
  convertToString,
  applyScaleFactor,
  applyEnumMapping,
  parseEnumString,
  parseReverseEnumString
} = require('../../src/lib/data-transformer')

describe('data-transformer', () => {
  describe('toSignedInt16', () => {
    test('should handle positive values', () => {
      expect(toSignedInt16(100)).toBe(100)
      expect(toSignedInt16(32767)).toBe(32767)  // Max positive int16
    })

    test('should convert negative values correctly', () => {
      expect(toSignedInt16(65535)).toBe(-1)     // 0xFFFF = -1
      expect(toSignedInt16(65000)).toBe(-536)   // 0xFDE8 = -536
      expect(toSignedInt16(32768)).toBe(-32768) // Min int16
    })

    test('should handle zero', () => {
      expect(toSignedInt16(0)).toBe(0)
    })
  })

  describe('toSignedInt32', () => {
    test('should handle positive values', () => {
      expect(toSignedInt32(100)).toBe(100)
      expect(toSignedInt32(2147483647)).toBe(2147483647)  // Max positive int32
    })

    test('should convert negative values correctly', () => {
      expect(toSignedInt32(4294967295)).toBe(-1)          // 0xFFFFFFFF = -1
      expect(toSignedInt32(4294967196)).toBe(-100)        // -100
      expect(toSignedInt32(2147483648)).toBe(-2147483648) // Min int32
    })

    test('should handle zero', () => {
      expect(toSignedInt32(0)).toBe(0)
    })
  })

  describe('transformModbusData', () => {
    test('should transform int16 with sign conversion', () => {
      expect(transformModbusData([100], 'int16')).toBe(100)
      expect(transformModbusData([65535], 'int16')).toBe(-1)
      expect(transformModbusData([65000], 'int16')).toBe(-536)
    })

    test('should transform uint16 without sign conversion', () => {
      expect(transformModbusData([100], 'uint16')).toBe(100)
      expect(transformModbusData([65535], 'uint16')).toBe(65535)
    })

    test('should transform int32 with sign conversion', () => {
      expect(transformModbusData([0, 100], 'int32')).toBe(100)
      expect(transformModbusData([0, 4294967295], 'int32')).toBe(-1)
    })

    test('should transform uint32 without sign conversion', () => {
      expect(transformModbusData([0, 100], 'uint32')).toBe(100)
      expect(transformModbusData([0, 4294967295], 'uint32')).toBe(4294967295)
    })

    test('should transform string', () => {
      // String "AB" = 0x4142 = [0x4142] in modbus
      expect(transformModbusData([0x4142], 'string')).toBe('AB')
    })

    test('should throw error for invalid payload', () => {
      expect(() => transformModbusData([], 'int16')).toThrow('Invalid payload')
      expect(() => transformModbusData(null, 'int16')).toThrow('Invalid payload')
    })

    test('should throw error for unknown type', () => {
      expect(() => transformModbusData([100], 'unknown')).toThrow('Unknown type')
    })
  })

  describe('convertToString', () => {
    test('should convert modbus registers to string', () => {
      // "Hello" = [0x4865, 0x6C6C, 0x6F00]
      const result = convertToString([0x4865, 0x6C6C, 0x6F00])
      expect(result).toContain('He')
      expect(result).toContain('ll')
    })

    test('should handle empty array', () => {
      expect(convertToString([])).toBe('')
    })
  })

  describe('applyScaleFactor', () => {
    test('should apply scale factor', () => {
      expect(applyScaleFactor(100, 10)).toBe(10)
      expect(applyScaleFactor(255, 10)).toBe(25.5)
    })

    test('should handle scale factor of 1', () => {
      expect(applyScaleFactor(100, 1)).toBe(100)
    })

    test('should handle invalid scale factor', () => {
      expect(applyScaleFactor(100, 0)).toBe(100)
      expect(applyScaleFactor(100, 'invalid')).toBe(100)
    })
  })

  describe('applyEnumMapping', () => {
    test('should map value to enum', () => {
      const enumMap = { 0: 'Off', 1: 'On', 2: 'Auto' }
      expect(applyEnumMapping(0, enumMap)).toBe('Off')
      expect(applyEnumMapping(1, enumMap)).toBe('On')
      expect(applyEnumMapping(2, enumMap)).toBe('Auto')
    })

    test('should return original value if not in enum', () => {
      const enumMap = { 0: 'Off', 1: 'On' }
      expect(applyEnumMapping(99, enumMap)).toBe(99)
    })

    test('should handle null/undefined enum', () => {
      expect(applyEnumMapping(5, null)).toBe(5)
      expect(applyEnumMapping(5, undefined)).toBe(5)
    })
  })

  describe('parseEnumString', () => {
    test('should parse enum string', () => {
      const result = parseEnumString('0=Off;1=On;2=Auto')
      expect(result).toEqual({ 0: 'Off', 1: 'On', 2: 'Auto' })
    })

    test('should handle empty or invalid string', () => {
      expect(parseEnumString('')).toBeNull()
      expect(parseEnumString('invalid')).toBeNull()
      expect(parseEnumString(null)).toBeNull()
    })
  })

  describe('parseReverseEnumString', () => {
    test('should parse reverse enum string', () => {
      const result = parseReverseEnumString('0=Off;1=On;2=Auto')
      expect(result).toEqual({ Off: '0', On: '1', Auto: '2' })
    })

    test('should handle empty or invalid string', () => {
      expect(parseReverseEnumString('')).toBeNull()
      expect(parseReverseEnumString('invalid')).toBeNull()
      expect(parseReverseEnumString(null)).toBeNull()
    })
  })
})