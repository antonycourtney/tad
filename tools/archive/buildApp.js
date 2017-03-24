/*
 * Run webpack to build with production version of React, and other optimizations
 */
var VersionInfo = require('./lib/versionInfo')
var execute = require('./lib/execute')

var env = {
  NODE_ENV: 'production',
  CHANNEL: 'dev'
}

var cmds = []
cmds = cmds.concat([
  '"./node_modules/.bin/webpack"'
])

execute(cmds, env, console.log.bind(null, 'done'))
