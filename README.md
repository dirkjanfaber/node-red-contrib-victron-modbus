# node-red-contrib-victron-modbus

Leaning on the shoulders of giants. So in this case the code of the flex-getter
module of
[node-red-contrib-modbus](https://github.com/biancoroyal/node-red-contrib-modbus)
is used to create a Victron specific modbus client. 

It uses the `/opt/victronenergy/dbus-modbustcp/attributes.csv` file for making the
dropdown in the edit panel to select the value to read. Al you need to determine
before you can use the node, is to get the used Unit ID.

It will show _all_ available attributes, not just the ones that are actually available on the system.
Also, make sure that you enter the correct Unit ID to match the wanted attribute. The easiest way
to obtain the attribute is to check the console under _Settings -> Services ->
Modbus TCP -> Available services_.

## Installation

You can install the node from the palette manager, but be warned that, if you
don't have `node-red-contrib-modbus` installed yet, you will need to restart
Node-RED first. See [here](https://github.com/node-red/node-red/issues/569) for
more details.

