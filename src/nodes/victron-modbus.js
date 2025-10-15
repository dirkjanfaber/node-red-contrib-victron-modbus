const path = require('path')
const csvParser = require(path.join(__dirname, '../lib/csv-parser'))
const dataTransformer = require(path.join(__dirname, '../lib/data-transformer'))
const attributeParser = require(path.join(__dirname, '../lib/attribute-parser'))

module.exports = function (RED) {
  'use strict'
  const mbBasics = require('node-red-contrib-modbus/modbus/modbus-basics')
  const mbCore = require('node-red-contrib-modbus/modbus/core/modbus-core')
  const mbIOCore = require('node-red-contrib-modbus/modbus/core/modbus-io-core')
  const internalDebugLog = require('debug')('contribVictron:modbus')

  function VictronModbusNode (config) {
    RED.nodes.createNode(this, config)
    this.internalDebugLog = internalDebugLog

    const node = this
    node.bufferMessageList = new Map()
    node.INPUT_TIMEOUT_MILLISECONDS = 1000
    node.delayOccured = false
    node.inputDelayTimer = null

    const modbusClient = RED.nodes.getNode(config.server)
    if (!modbusClient) {
      return
    }

    modbusClient.registerForModbus(node)
    mbBasics.initModbusClientEvents(node, modbusClient)

    node.onModbusReadDone = function (resp, msg) {
      if (node.showStatusActivities) {
        mbBasics.setNodeStatusTo('reading done', node)
      }

      const response = mbIOCore.buildMessageWithIO(node, resp.data, resp, msg)

      // Transform the response using the new data-transformer module
      try {
        msg.payload = dataTransformer.transformModbusData(msg.payload, msg.type)

        // Apply scale factor for non-string types
        if (msg.type !== 'string' && msg.scalefactor) {
          msg.payload = dataTransformer.applyScaleFactor(msg.payload, msg.scalefactor)
        }

        // Apply enum mapping if present
        if (msg.enum) {
          msg.payload = dataTransformer.applyEnumMapping(msg.payload, msg.enum)
        }

        // Update node status with the parsed value
        node.updateStatusWithValue(msg.payload, 'read')
      } catch (err) {
        node.warn('Error transforming data: ' + err.message)
        node.internalDebugLog('Transform error:', err)
      }

      node.send(response)
      node.emit('modbusVictronNodeDone')
    }

    node.onModbusWriteDone = function (resp, msg) {
      if (node.showStatusActivities) {
        mbBasics.setNodeStatusTo('writing done', node)
      }

      node.warn(msg)
      let writtenValue
      if (msg.enum) {
        writtenValue = msg.enum[+msg.payload.value]
      } else {
        writtenValue = msg.payload.value
      }

      // Update node status with the written value
      node.updateStatusWithValue(writtenValue, 'write')

      node.send(mbCore.buildMessage(node.bufferMessageList, writtenValue, resp, msg))
      node.emit('modbusFlexWriteNodeDone')
    }

    node.errorProtocolMsg = function (err, msg) {
      if (node.showErrors) {
        mbBasics.logMsgError(node, err, msg)
      }
    }

    node.onModbusReadError = function (err, msg) {
      node.warn(err.message)
      node.internalDebugLog(err.message)
      const origMsg = mbCore.getOriginalMessage(node.bufferMessageList, msg)
      node.errorProtocolMsg(err, origMsg)
      mbBasics.sendEmptyMsgOnFail(node, err, msg)
      mbBasics.setModbusError(node, modbusClient, err, origMsg)
      node.emit('modbusVictronNodeError')
    }

    node.onModbusWriteError = function (err, msg) {
      node.internalDebugLog(err.message)
      const origMsg = mbCore.getOriginalMessage(node.bufferMessageList, msg)
      node.errorProtocolMsg(err, origMsg)
      mbBasics.sendEmptyMsgOnFail(node, err, msg)
      mbBasics.setModbusError(node, modbusClient, err, origMsg)
      node.emit('modbusFlexWriteNodeError')
    }

    node.prepareMsg = function (msg) {
      if (typeof msg.payload === 'string') {
        msg.payload = JSON.parse(msg.payload)
      }

      msg.payload.fc = parseInt(msg.payload.fc) || 3
      msg.payload.unitid = parseInt(msg.payload.unitid)
      msg.payload.address = parseInt(msg.payload.address) || 0
      msg.payload.quantity = parseInt(msg.payload.quantity) || 1

      return msg
    }

    node.isValidModbusMsg = function (msg) {
      // Use the new attribute-parser validation
      return attributeParser.isValidModbusPayload(msg.payload)
    }

    node.buildNewMessageObject = function (node, msg) {
      const messageId = mbCore.getObjectId()
      return {
        topic: msg.topic || node.id,
        messageId,
        payload: {
          value: msg.payload.value || msg.value,
          unitid: msg.payload.unitid,
          fc: msg.payload.fc,
          address: msg.payload.address,
          quantity: msg.payload.quantity,
          emptyMsgOnFail: node.emptyMsgOnFail,
          keepMsgProperties: node.keepMsgProperties,
          messageId
        }
      }
    }

    function verboseWarn (logMessage) {
      node.warn('Victron-Modbus -> ' + logMessage)
    }

    node.updateStatusWithValue = function (value, operation) {
      // Format the value for display
      let displayValue = value
      if (typeof value === 'number') {
        // Round to 2 decimal places for cleaner display
        displayValue = Math.round(value * 100) / 100
      } else if (typeof value === 'string') {
        // Truncate long strings
        displayValue = value.length > 20 ? value.substring(0, 20) + '...' : value
      }

      const statusColor = operation === 'read' ? 'green' : 'blue'
      const statusShape = operation === 'read' ? 'dot' : 'ring'

      node.status({
        fill: statusColor,
        shape: statusShape,
        text: `${operation}: ${displayValue}`
      })
    }

    node.isReadyForInput = function () {
      return (modbusClient.client && modbusClient.isActive() && node.delayOccured)
    }

    node.isNotReadyForInput = function () {
      return !node.isReadyForInput()
    }

    node.resetInputDelayTimer = function () {
      if (node.inputDelayTimer) {
        verboseWarn('reset input delay timer node ' + node.id)
        clearTimeout(node.inputDelayTimer)
      }
      node.inputDelayTimer = null
      node.delayOccured = false
    }

    node.initializeInputDelayTimer = function () {
      node.delayOccured = false
      node.inputDelayTimer = setTimeout(function () {
        node.delayOccured = true
      }, node.INPUT_TIMEOUT_MILLISECONDS)
    }

    node.initializeInputDelayTimer()

    node.on('input', function (msg) {
      // Allow dynamic override of unitid and attribute via message properties
      const unitid = msg.unitid || config.unitid
      const attribute = msg.attribute || config.attribute

      if (!attribute || !attribute.value) {
        node.error('No attribute specified in config or message', msg)
        return
      }

      // Prepare message payload based on config attribute
      if (config.write) {
        msg.payload = {
          value: msg.payload,
          fc: 6
        }

        // Handle string to enum conversion for write operations
        if (typeof msg.payload.value === 'string') {
          const enumString = attribute.value.split(':')[4]
          const reverseEnum = dataTransformer.parseReverseEnumString(enumString)
          if (reverseEnum) {
            msg.payload.value = reverseEnum[msg.payload.value]
          }
        }
      } else {
        msg.payload = {
          fc: 3
        }
      }

      // Parse attribute value and populate message
      const attributeValue = attribute.value.split(':')
      msg.payload.address = parseInt(attributeValue[0])
      msg.payload.unitid = unitid
      msg.payload.quantity = parseInt(attributeValue[2])
      msg.scalefactor = attributeValue[3]
      msg.type = attributeValue[1].replace(/\[[0-9]\]/, '')

      // Parse enum string if present
      const enumString = attributeValue[4]
      if (enumString && enumString.includes('=')) {
        msg.enum = dataTransformer.parseEnumString(enumString)
      }

      if (mbBasics.invalidPayloadIn(msg)) {
        verboseWarn('Invalid message on input.')
        return
      }

      if (!modbusClient.client) {
        return
      }

      if (node.isNotReadyForInput()) {
        verboseWarn('Inject while node is not ready for input.')
        return
      }

      if (modbusClient.isInactive()) {
        verboseWarn('You sent an input to inactive client. Please use initial delay on start or send data more slowly.')
        return
      }

      const origMsgInput = Object.assign({}, msg)
      try {
        const inputMsg = node.prepareMsg(origMsgInput)
        if (node.isValidModbusMsg(inputMsg)) {
          const newMsg = node.buildNewMessageObject(node, inputMsg)
          newMsg.type = msg.type
          newMsg.scalefactor = msg.scalefactor
          newMsg.enum = msg.enum
          node.bufferMessageList.set(newMsg.messageId, mbBasics.buildNewMessage(node.keepMsgProperties, inputMsg, newMsg))
          if (config.write) {
            modbusClient.emit('writeModbus', newMsg, node.onModbusWriteDone, node.onModbusWriteError)
          } else {
            modbusClient.emit('readModbus', newMsg, node.onModbusReadDone, node.onModbusReadError)
          }
        }
      } catch (err) {
        node.errorProtocolMsg(err, origMsgInput)
        mbBasics.sendEmptyMsgOnFail(node, err, origMsgInput)
      }

      if (node.showStatusActivities) {
        mbBasics.setNodeStatusTo(modbusClient.actualServiceState, node)
      }
    })

    node.on('close', function (done) {
      node.resetInputDelayTimer()
      mbBasics.setNodeStatusTo('closed', node)
      node.bufferMessageList.clear()
      modbusClient.deregisterForModbus(node.id, done)
    })
  }

  RED.nodes.registerType('victron-modbus', VictronModbusNode)

  // HTTP endpoint for attributes - refactored to use csv-parser module
  RED.httpNode.get('/victron/attributes', RED.auth.needsPermission('victron-modbus.read'), async (req, res) => {
    try {
      // Get custom path from query parameter (if provided)
      const customPath = req.query.path || null

      // Find the attributes file using the new csv-parser module
      const attributesFile = csvParser.findAttributesFile(RED.settings.userDir, customPath)

      if (!attributesFile) {
        console.log('No attributes file found. Searched locations:')
        console.log('  - Custom path:', customPath || '(not specified)')
        console.log('  - Environment variable VICTRON_ATTRIBUTES_PATH:', process.env.VICTRON_ATTRIBUTES_PATH || '(not set)')
        console.log('  - /opt/victronenergy/dbus-modbustcp/attributes.csv')
        console.log('  - ' + RED.settings.userDir + '/attributes.csv')
        console.log('  - /config/node-red/attributes.csv (Home Assistant)')
        console.log('  - /share/node-red/attributes.csv (Home Assistant)')

        return res.status(404).json({
          error: 'Attributes file not found',
          hint: 'Place attributes.csv in Node-RED user directory or set custom path in node configuration'
        })
      }

      console.log('Loading attributes from:', attributesFile)

      // Parse attributes using the new csv-parser module
      const attributes = await csvParser.parseAttributesFile(attributesFile)

      res.setHeader('Content-Type', 'application/json')
      res.send(attributes)
    } catch (error) {
      console.error('Error loading attributes:', error)
      res.status(500).json({ error: 'Failed to load attributes', details: error.message })
    }
  })
}