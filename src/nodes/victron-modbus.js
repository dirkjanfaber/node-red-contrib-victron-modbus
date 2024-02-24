const fs = require('fs')
const { parse } = require('csv-parse')

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
      // Now parse the response for readable output
      switch (msg.type) {
        case 'int16': {
          msg.payload = msg.payload[0]
          break
        }
        case 'uint16': {
          msg.payload = msg.payload[0]
          break
        }
        case 'int32': {
          msg.payload = msg.payload[1]
          break
        }
        case 'uint32': {
          msg.payload = msg.payload[1]
          break
        }
        case 'string': {
          let b = ''
          msg.payload.forEach(x => {
            b += String.fromCharCode(x >> 8)
            b += String.fromCharCode(x & 0xff)
          })
          msg.payload = b
          break
        }
        default: {
          node.warn('unknown type ' + msg.type)
        }
      }
      if (msg.type !== 'string' && msg.scalefactor) {
        msg.payload = msg.payload / msg.scalefactor
      }
      if (msg.enum) {
        msg.payload = msg.enum[msg.payload]
      }

      node.send(response)
      node.emit('modbusVictronNodeDone')
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
      let isValid = true

      if (!(Number.isInteger(msg.payload.fc))) {
        node.error('FC Not Valid', msg)
        isValid &= false
      }

      if (isValid &&
              !(Number.isInteger(msg.payload.address) &&
              msg.payload.address >= 0 &&
              msg.payload.address <= 65535)) {
        node.error('Address Not Valid', msg)
        isValid &= false
      }

      if (isValid &&
              !(Number.isInteger(msg.payload.quantity) &&
              msg.payload.quantity >= 1 &&
              msg.payload.quantity <= 65535)) {
        node.error('Quantity Not Valid', msg)
        isValid &= false
      }

      return isValid
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
      node.resetInputDelayTimer()
      if (node.delayOnStart) {
        verboseWarn('initialize input delay timer node ' + node.id)
        node.inputDelayTimer = setTimeout(() => {
          node.delayOccured = true
        }, node.INPUT_TIMEOUT_MILLISECONDS * node.startDelayTime)
      } else {
        node.delayOccured = true
      }
    }

    node.initializeInputDelayTimer()

    // From flex writer
    node.onModbusWriteDone = function (resp, msg) {
      if (node.showStatusActivities) {
        mbBasics.setNodeStatusTo('writing done', node)
      }

      node.warn(msg)
      if (msg.enum) {
        msg.payload = msg.enum[+msg.payload.value]
      } else {
        msg.payload = msg.payload.value
      }

      node.send(mbCore.buildMessage(node.bufferMessageList, msg.payload, resp, msg))
      node.emit('modbusFlexWriteNodeDone')
    }

    node.errorProtocolMsg = function (err, msg) {
      if (node.showErrors) {
        mbBasics.logMsgError(node, err, msg)
      }
    }

    node.onModbusWriteError = function (err, msg) {
      node.internalDebugLog(err.message)
      const origMsg = mbCore.getOriginalMessage(node.bufferMessageList, msg)
      node.errorProtocolMsg(err, origMsg)
      mbBasics.sendEmptyMsgOnFail(node, err, msg)
      mbBasics.setModbusError(node, modbusClient, err, origMsg)
      node.emit('modbusFlexWriteNodeError')
    }

    node.on('input', function (msg) {
      if (config.write) {
        msg.payload = {
          value: msg.payload,
          fc: 6
        }

        if (typeof (msg.payload.value) === 'string') {
          const enums = {}
          config.attribute.value.split(':')[4].split(';').forEach((e) => {
            const b = e.split('=')
            enums[b[1]] = b[0]
          })
          msg.payload.value = enums[msg.payload.value]
        }
      } else {
        msg.payload = {
          fc: 3
        }
      }
      msg.payload.address = parseInt(config.attribute.value.split(':')[0])
      msg.payload.unitid = config.unitid
      msg.payload.quantity = parseInt(config.attribute.value.split(':')[2])
      msg.scalefactor = config.attribute.value.split(':')[3]
      msg.type = config.attribute.value.split(':')[1].replace(/\[[0-9]\]/, '')
      if (config.attribute.value.split(':')[4].includes('=')) {
        msg.enum = config.attribute.value.split(':')[4].split(';').reduce((acc, curr) => {
          const split = curr.split('=')
          acc[split[0]] = split[1]
          return acc
        }, {})
      }

      if (mbBasics.invalidPayloadIn(msg)) {
        verboseWarn('Invalid message on input.')
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

      const origMsgInput = Object.assign({}, msg) // keep it origin
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

  RED.httpNode.get('/victron/attributes', RED.auth.needsPermission('victron-modbus.read'), (req, res) => {
    const attributes = []
    const possibleFilesPaths = [
      '/opt/victronenergy/dbus-modbustcp/attributes.csv',
      RED.settings.userDir + '/attributes.csv'
    ]
    let attributesFile = null

    for (const filePath of possibleFilesPaths) {
      if (fs.existsSync(filePath)) {
        attributesFile = filePath
        break
      }
    }

    if (!attributesFile) {
      console.log('no attributes file found')
      return
    }

    const handleError = (error) => {
      console.error('Error:', error)
    }

    const handleRow = (row) => {
      try {
        let q = 1
        if (row[5] && row[5].match(/string/)) {
          q = parseInt(row[5].replace(/\D+/g, '')) || 1
        }
        if (row[5] && row[5].match(/int32/)) {
          q = 2
        }
        const t = row[5] ? row[5].replace(/\[[0-9]\]/, '') : ''
        attributes.push({
          label: row[0] + ':' + row[1],
          value: row[4] + ':' + t + ':' + q + ':' + row[6] + ':' + row[3] + ':' + row[7]
        })
      } catch (error) {
        handleError(error)
      }
    }

    const handleEnd = () => {
      attributes.sort((a, b) => a.label.localeCompare(b.label))
      res.setHeader('Content-Type', 'application/json')
      res.send(attributes)
    }

    const fileStream = fs.createReadStream(attributesFile)
    fileStream.on('error', handleError)

    fileStream
      .pipe(parse({ delimiter: ',', from_line: 1, relax_column_count: true }))
      .on('data', handleRow)
      .on('end', handleEnd)
  })
}
