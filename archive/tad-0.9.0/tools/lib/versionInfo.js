var fs = require('fs')
var pack = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
var electronPack = JSON.parse(fs.readFileSync('./node_modules/electron/package.json', 'utf-8'))
module.exports.tadVersion = pack.version
module.exports.electronVersion = electronPack.version
