/**
 * Parse attribute value string into components
 * @param {string} attributeValue - Attribute value string (e.g., "4703:uint16:1:1:%:W")
 * @returns {Object} Parsed attribute components
 */
function parseAttributeValue(attributeValue) {
  const parts = attributeValue.split(':')
  
  if (parts.length < 6) {
    throw new Error('Invalid attribute value format')
  }
  
  return {
    address: parseInt(parts[0]),
    type: parts[1].replace(/\[[0-9]\]/, ''),
    quantity: parseInt(parts[2]),
    scaleFactor: parts[3],
    enumString: parts[4],
    access: parts[5]
  }
}

/**
 * Validate modbus message payload
 * @param {Object} payload - Message payload
 * @returns {boolean} True if valid
 */
function isValidModbusPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  
  const fc = parseInt(payload.fc)
  const address = parseInt(payload.address)
  const quantity = parseInt(payload.quantity)
  
  if (!Number.isInteger(fc)) {
    return false
  }
  
  if (!Number.isInteger(address) || address < 0 || address > 65535) {
    return false
  }
  
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 65535) {
    return false
  }
  
  return true
}

/**
 * Build modbus read message
 * @param {string} unitId - Unit ID
 * @param {Object} attribute - Parsed attribute
 * @returns {Object} Modbus message object
 */
function buildReadMessage(unitId, attribute) {
  return {
    fc: 3,
    unitid: parseInt(unitId),
    address: attribute.address,
    quantity: attribute.quantity
  }
}

/**
 * Build modbus write message
 * @param {string} unitId - Unit ID
 * @param {Object} attribute - Parsed attribute
 * @param {*} value - Value to write
 * @returns {Object} Modbus message object
 */
function buildWriteMessage(unitId, attribute, value) {
  return {
    fc: 6,
    unitid: parseInt(unitId),
    address: attribute.address,
    quantity: attribute.quantity,
    value: value
  }
}

module.exports = {
  parseAttributeValue,
  isValidModbusPayload,
  buildReadMessage,
  buildWriteMessage
}
