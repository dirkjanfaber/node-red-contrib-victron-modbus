const fs = require('fs')
const path = require('path')
const {
  parseAttributesFile,
  parseAttributeRow,
  findAttributesFile
} = require('../../src/lib/csv-parser')

describe('csv-parser', () => {
  const testCsvPath = path.join(__dirname, '../fixtures/test-attributes.csv')
  const testDir = path.dirname(testCsvPath)

  beforeAll(() => {
    // Create test CSV file
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    const csvContent = `com.victronenergy.system,/Serial,800,,string[6],1,,R
com.victronenergy.settings,/Settings/Pump0/StartValue,4703,%,uint16,1,,W
com.victronenergy.battery,/Dc/0/Voltage,259,V DC,uint16,10,,R
com.victronenergy.solarcharger,/State,3,0=Off;1=Low power;2=Fault;3=Bulk;4=Absorption;5=Float,uint16,1,,R`

    fs.writeFileSync(testCsvPath, csvContent)
  })

  afterAll(() => {
    // Clean up test file
    if (fs.existsSync(testCsvPath)) {
      fs.unlinkSync(testCsvPath)
    }
  })

  describe('parseAttributeRow', () => {
    test('should parse string attribute row', () => {
      const row = ['com.victronenergy.system', '/Serial', '', '', '800', 'string[6]', '1', 'R']
      const result = parseAttributeRow(row)
      expect(result).toEqual({
        label: 'com.victronenergy.system:/Serial',
        value: '800:string:6:1::R'
      })
    })

    test('should parse uint16 attribute row', () => {
      const row = ['com.victronenergy.settings', '/Settings/Pump0/StartValue', '', '%', '4703', 'uint16', '1', 'W']
      const result = parseAttributeRow(row)
      expect(result).toEqual({
        label: 'com.victronenergy.settings:/Settings/Pump0/StartValue',
        value: '4703:uint16:1:1:%:W'
      })
    })

    test('should parse int32 attribute row', () => {
      const row = ['com.victronenergy.battery', '/Power', '', 'W', '842', 'int32', '1', 'R']
      const result = parseAttributeRow(row)
      expect(result).toEqual({
        label: 'com.victronenergy.battery:/Power',
        value: '842:int32:2:1:W:R'
      })
    })

    test('should parse uint32 attribute row', () => {
      const row = ['com.victronenergy.battery', '/Energy', '', 'kWh', '843', 'uint32', '100', 'R']
      const result = parseAttributeRow(row)
      expect(result).toEqual({
        label: 'com.victronenergy.battery:/Energy',
        value: '843:uint32:2:100:kWh:R'
      })
    })

    test('should handle invalid rows', () => {
      expect(parseAttributeRow([])).toBeNull()
      expect(parseAttributeRow(null)).toBeNull()
      expect(parseAttributeRow(['only', 'three', 'items'])).toBeNull()
    })
  })

  describe('parseAttributesFile', () => {
    test('should parse attributes from CSV file', async () => {
      const attributes = await parseAttributesFile(testCsvPath)
      expect(attributes).toBeInstanceOf(Array)
      expect(attributes.length).toBeGreaterThan(0)
      expect(attributes[0]).toHaveProperty('label')
      expect(attributes[0]).toHaveProperty('value')
    })

    test('should sort attributes by label', async () => {
      const attributes = await parseAttributesFile(testCsvPath)
      for (let i = 1; i < attributes.length; i++) {
        expect(attributes[i - 1].label.localeCompare(attributes[i].label)).toBeLessThanOrEqual(0)
      }
    })

    test('should reject if file does not exist', async () => {
      await expect(parseAttributesFile('/nonexistent/path.csv'))
        .rejects
        .toThrow('Attributes file not found')
    })
  })

  describe('findAttributesFile', () => {
    let tempFiles = []

    afterEach(() => {
      // Clean up temp files
      tempFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      })
      tempFiles = []

      // Clean up environment variable
      delete process.env.VICTRON_ATTRIBUTES_PATH
    })

    test('should prioritize custom path over all others', () => {
      const customPath = path.join(testDir, 'custom-attributes.csv')
      const userDirPath = path.join(testDir, 'userdir-attributes.csv')

      fs.writeFileSync(customPath, 'test')
      fs.writeFileSync(userDirPath, 'test')
      tempFiles.push(customPath, userDirPath)

      const result = findAttributesFile(testDir, customPath)
      expect(result).toBe(customPath)
    })

    test('should use environment variable if custom path not provided', () => {
      const envPath = path.join(testDir, 'env-attributes.csv')
      fs.writeFileSync(envPath, 'test')
      tempFiles.push(envPath)

      process.env.VICTRON_ATTRIBUTES_PATH = envPath

      const result = findAttributesFile(testDir)
      expect(result).toBe(envPath)
    })

    test('should find file in user directory', () => {
      const userDirPath = path.join(testDir, 'attributes.csv')
      fs.writeFileSync(userDirPath, 'test')
      tempFiles.push(userDirPath)

      const result = findAttributesFile(testDir)
      expect(result).toBe(userDirPath)
    })

    test('should check parent directory (Home Assistant scenario)', () => {
      const parentDir = path.join(testDir, '..')
      const parentPath = path.join(parentDir, 'attributes.csv')

      fs.writeFileSync(parentPath, 'test')
      tempFiles.push(parentPath)

      const result = findAttributesFile(testDir)
      // Normalize both paths for comparison
      expect(path.resolve(result)).toBe(path.resolve(parentPath))
    })

    test('should return null if file not found anywhere', () => {
      const result = findAttributesFile('/nonexistent/path')
      expect(result).toBeNull()
    })

    test('should handle null/undefined userDir gracefully', () => {
      const result = findAttributesFile(null)
      expect(result).toBeNull()
    })

    test('should fall back when custom path does not exist', () => {
      const customPath = '/nonexistent/custom.csv'
      const userDirPath = path.join(testDir, 'attributes.csv')

      fs.writeFileSync(userDirPath, 'test')
      tempFiles.push(userDirPath)

      // Custom path is checked first, but since it doesn't exist,
      // it should fall back to userDir
      const result = findAttributesFile(testDir, customPath)
      expect(result).toBe(userDirPath)
    })

    test('should check current working directory as fallback', () => {
      const cwdPath = path.join(process.cwd(), 'attributes.csv')
      fs.writeFileSync(cwdPath, 'test')
      tempFiles.push(cwdPath)

      const result = findAttributesFile('/nonexistent')
      // The result might be relative, so resolve both paths
      expect(path.resolve(result)).toBe(path.resolve(cwdPath))
    })
  })

  describe('findAttributesFile - priority order', () => {
    let tempFiles = []

    afterEach(() => {
      tempFiles.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      })
      tempFiles = []
      delete process.env.VICTRON_ATTRIBUTES_PATH
    })

    test('should follow correct priority: custom > env > venus > userdir', () => {
      const customPath = path.join(testDir, 'custom.csv')
      const envPath = path.join(testDir, 'env.csv')
      const userDirPath = path.join(testDir, 'attributes.csv')

      // Create all files
      fs.writeFileSync(customPath, 'custom')
      fs.writeFileSync(envPath, 'env')
      fs.writeFileSync(userDirPath, 'userdir')
      tempFiles.push(customPath, envPath, userDirPath)

      process.env.VICTRON_ATTRIBUTES_PATH = envPath

      // Custom path should win
      let result = findAttributesFile(testDir, customPath)
      expect(result).toBe(customPath)

      // Without custom path, env should win
      result = findAttributesFile(testDir, null)
      expect(result).toBe(envPath)

      // Without env, userdir should win
      delete process.env.VICTRON_ATTRIBUTES_PATH
      result = findAttributesFile(testDir, null)
      expect(result).toBe(userDirPath)
    })
  })
})