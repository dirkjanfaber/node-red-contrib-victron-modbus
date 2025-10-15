const fs = require('fs')
const { parse } = require('csv-parse')

/**
 * Parse attributes from CSV file
 * @param {string} filePath - Path to attributes.csv
 * @returns {Promise<Array>} Array of attribute objects
 */
async function parseAttributesFile(filePath) {
  return new Promise((resolve, reject) => {
    const attributes = []

    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Attributes file not found: ${filePath}`))
    }

    const fileStream = fs.createReadStream(filePath)

    fileStream
      .pipe(parse({ delimiter: ',', from_line: 1, relax_column_count: true }))
      .on('data', (row) => {
        try {
          const attribute = parseAttributeRow(row)
          if (attribute) {
            attributes.push(attribute)
          }
        } catch (error) {
          // Skip invalid rows
        }
      })
      .on('end', () => {
        attributes.sort((a, b) => a.label.localeCompare(b.label))
        resolve(attributes)
      })
      .on('error', reject)
  })
}

/**
 * Parse a single CSV row into an attribute object
 * CSV format (based on actual victron attributes.csv):
 * Index 0: service (e.g., "com.victronenergy.system")
 * Index 1: path (e.g., "/Serial")
 * Index 2: ? (empty or other data)
 * Index 3: unit (e.g., "V DC", "%")
 * Index 4: address (e.g., "800")
 * Index 5: type (e.g., "string[6]", "uint16", "int32")
 * Index 6: scaleFactor (e.g., "1", "10")
 * Index 7: access (e.g., "R", "W")
 *
 * @param {Array} row - CSV row data
 * @returns {Object|null} Attribute object or null if invalid
 */
function parseAttributeRow(row) {
  if (!row || row.length < 6) {
    return null
  }

  let quantity = 1
  const typeField = row[5]  // type is at index 5

  if (typeField && typeField.match(/string/)) {
    quantity = parseInt(typeField.replace(/\D+/g, '')) || 1
  }
  if (typeField && typeField.match(/int32|uint32/)) {
    quantity = 2
  }

  const type = typeField ? typeField.replace(/\[[0-9]\]/, '') : ''

  // Format: address:type:quantity:scaleFactor:enumString:access
  // row[0] = service, row[1] = path
  // row[4] = address, row[5] = type, row[6] = scaleFactor, row[3] = unit/enum, row[7] = access
  return {
    label: row[0] + ':' + row[1],
    value: row[4] + ':' + type + ':' + quantity + ':' + row[6] + ':' + row[3] + ':' + row[7]
  }
}

/**
 * Find attributes file in standard locations
 * Priority order:
 * 1. Custom path from node config
 * 2. Environment variable VICTRON_ATTRIBUTES_PATH
 * 3. Venus OS default location
 * 4. Node-RED user directory
 * 5. Node-RED configuration directory (for Home Assistant)
 * 6. Common alternative paths
 *
 * @param {string} userDir - Node-RED user directory
 * @param {string} customPath - Optional custom path from node configuration
 * @returns {string|null} Path to attributes file or null
 */
function findAttributesFile(userDir, customPath) {
  const possiblePaths = []

  // 1. Custom path from node configuration (highest priority)
  if (customPath) {
    possiblePaths.push(customPath)
  }

  // 2. Environment variable
  if (process.env.VICTRON_ATTRIBUTES_PATH) {
    possiblePaths.push(process.env.VICTRON_ATTRIBUTES_PATH)
  }

  // 3. Venus OS default location
  possiblePaths.push('/opt/victronenergy/dbus-modbustcp/attributes.csv')

  // 4. Node-RED user directory
  if (userDir) {
    possiblePaths.push(userDir + '/attributes.csv')

    // 5. Home Assistant add-on locations
    possiblePaths.push(userDir + '/../attributes.csv')  // Parent directory
    possiblePaths.push('/config/node-red/attributes.csv')  // HA config
    possiblePaths.push('/share/node-red/attributes.csv')  // HA share
  }

  // 6. Common alternative paths
  possiblePaths.push('/data/attributes.csv')
  possiblePaths.push('./attributes.csv')  // Current working directory

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath
    }
  }

  return null
}

module.exports = {
  parseAttributesFile,
  parseAttributeRow,
  findAttributesFile
}