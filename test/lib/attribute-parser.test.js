const {
  parseAttributeValue,
  isValidModbusPayload,
  buildReadMessage,
  buildWriteMessage
} = require('../../src/lib/attribute-parser')

describe('attribute-parser', () => {
  describe('parseAttributeValue', () => {
    test('should parse valid attribute value', () => {
      const result = parseAttributeValue('4703:uint16:1:1:%:W')
      expect(result).toEqual({
        address: 4703,
        type: 'uint16',
        quantity: 1,
        scaleFactor: '1',
        enumString: '%',
        access: 'W'
      })
    })

    test('should handle array notation in type', () => {
      const result = parseAttributeValue('800:string[6]:6:1::R')
      expect(result.type).toBe('string')
    })

    test('should throw error for invalid format', () => {
      expect(() => parseAttributeValue('invalid')).toThrow('Invalid attribute value format')
      expect(() => parseAttributeValue('1:2:3')).toThrow('Invalid attribute value format')
    })
  })

  describe('isValidModbusPayload', () => {
    test('should validate correct payload', () => {
      const payload = {
        fc: 3,
        address: 100,
        quantity: 1
      }
      expect(isValidModbusPayload(payload)).toBe(true)
    })

    test('should reject invalid function code', () => {
      expect(isValidModbusPayload({ fc: 'invalid', address: 100, quantity: 1 })).toBe(false)
    })

    test('should reject invalid address', () => {
      expect(isValidModbusPayload({ fc: 3, address: -1, quantity: 1 })).toBe(false)
      expect(isValidModbusPayload({ fc: 3, address: 70000, quantity: 1 })).toBe(false)
    })

    test('should reject invalid quantity', () => {
      expect(isValidModbusPayload({ fc: 3, address: 100, quantity: 0 })).toBe(false)
      expect(isValidModbusPayload({ fc: 3, address: 100, quantity: 70000 })).toBe(false)
    })

    test('should reject null or undefined payload', () => {
      expect(isValidModbusPayload(null)).toBe(false)
      expect(isValidModbusPayload(undefined)).toBe(false)
    })
  })

  describe('buildReadMessage', () => {
    test('should build read message', () => {
      const attribute = {
        address: 4703,
        quantity: 1
      }
      const result = buildReadMessage('100', attribute)
      expect(result).toEqual({
        fc: 3,
        unitid: 100,
        address: 4703,
        quantity: 1
      })
    })
  })

  describe('buildWriteMessage', () => {
    test('should build write message', () => {
      const attribute = {
        address: 4703,
        quantity: 1
      }
      const result = buildWriteMessage('100', attribute, 50)
      expect(result).toEqual({
        fc: 6,
        unitid: 100,
        address: 4703,
        quantity: 1,
        value: 50
      })
    })
  })
})
