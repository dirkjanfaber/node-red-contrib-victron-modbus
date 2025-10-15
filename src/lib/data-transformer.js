/**
 * Transform raw modbus data based on type
 * @param {Array} payload - Raw modbus data
 * @param {string} type - Data type (int16, uint16, int32, uint32, string)
 * @returns {*} Transformed value
 */
function transformModbusData(payload, type) {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('Invalid payload')
  }

  switch (type) {
    case 'int16':
      return toSignedInt16(payload[0])

    case 'uint16':
      return payload[0]

    case 'int32':
      return toSignedInt32(payload[1])

    case 'uint32':
      return payload[1]

    case 'string':
      return convertToString(payload)

    default:
      throw new Error(`Unknown type: ${type}`)
  }
}

/**
 * Convert unsigned 16-bit value to signed 16-bit integer
 * @param {number} value - Unsigned 16-bit value
 * @returns {number} Signed 16-bit integer
 */
function toSignedInt16(value) {
  // Use bit shift to convert: x << 16 >> 16
  return (value << 16) >> 16
}

/**
 * Convert unsigned 32-bit value to signed 32-bit integer
 * @param {number} value - Unsigned 32-bit value
 * @returns {number} Signed 32-bit integer
 */
function toSignedInt32(value) {
  // Use bitwise OR with 0 to convert: x | 0
  return value | 0
}

/**
 * Convert modbus registers to string
 * @param {Array} payload - Array of register values
 * @returns {string} Converted string
 */
function convertToString(payload) {
  let result = ''
  payload.forEach(value => {
    result += String.fromCharCode(value >> 8)
    result += String.fromCharCode(value & 0xff)
  })
  return result
}

/**
 * Apply scale factor to numeric value
 * @param {number} value - Numeric value
 * @param {string|number} scaleFactor - Scale factor
 * @returns {number} Scaled value
 */
function applyScaleFactor(value, scaleFactor) {
  const factor = parseFloat(scaleFactor)
  if (isNaN(factor) || factor === 0) {
    return value
  }
  return value / factor
}

/**
 * Apply enum mapping to value
 * @param {number} value - Numeric value
 * @param {Object} enumMap - Enum mapping object
 * @returns {string|number} Mapped value or original if not found
 */
function applyEnumMapping(value, enumMap) {
  if (!enumMap || typeof enumMap !== 'object') {
    return value
  }
  return enumMap[value] !== undefined ? enumMap[value] : value
}

/**
 * Parse enum string from attribute value
 * @param {string} enumString - Enum string (e.g., "0=Off;1=On")
 * @returns {Object} Enum mapping object
 */
function parseEnumString(enumString) {
  if (!enumString || !enumString.includes('=')) {
    return null
  }

  return enumString.split(';').reduce((acc, curr) => {
    const parts = curr.split('=')
    if (parts.length === 2) {
      acc[parts[0]] = parts[1]
    }
    return acc
  }, {})
}

/**
 * Parse reverse enum string for writing
 * @param {string} enumString - Enum string
 * @returns {Object} Reverse enum mapping (label -> value)
 */
function parseReverseEnumString(enumString) {
  if (!enumString || !enumString.includes('=')) {
    return null
  }

  return enumString.split(';').reduce((acc, curr) => {
    const parts = curr.split('=')
    if (parts.length === 2) {
      acc[parts[1]] = parts[0]
    }
    return acc
  }, {})
}

module.exports = {
  transformModbusData,
  toSignedInt16,
  toSignedInt32,
  convertToString,
  applyScaleFactor,
  applyEnumMapping,
  parseEnumString,
  parseReverseEnumString
}