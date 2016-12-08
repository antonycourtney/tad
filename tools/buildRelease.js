var VersionInfo = require('./lib/versionInfo')
var execute = require('./lib/execute')

// For now -- remove when ready
var releaseSuffix = '-preview'

var relBaseName = 'tad-' + VersionInfo.tadVersion + releaseSuffix
var releaseDir = './release/' + relBaseName
var releaseTar = relBaseName + '.tgz'

console.log('Packaging version ' + VersionInfo.tadVersion + ' in ' + releaseDir + ' with Electron ' + VersionInfo.electronVersion)

var cmds = ['echo Cleaning up release dir...']

cmds = cmds.concat([
  'rm -rf ' + releaseDir,
  'rm -f ' + releaseTar,
  'mkdir ' + releaseDir
])

cmds = cmds.concat([
  'echo Copying files to staging dir...',
  'cp -r ./dist/mac/Tad.app ' + releaseDir,
  'cp -r ./csv ' + releaseDir,
  'cp ./doc/release/README.txt ' + releaseDir,
  'cp ./tools/scripts/install.sh ' + releaseDir
])

cmds = cmds.concat([
  'echo Creating tar file...',
  'cd release',
  'tar czf ' + releaseTar + ' ' + relBaseName,
  'cd ..'
])
execute(cmds, {}, console.log.bind(null, 'done'))
