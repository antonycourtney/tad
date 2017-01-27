/* @flow */

const db = require('sqlite')
const commandLineArgs = require('command-line-args')
const getUsage = require('command-line-usage')
const csvimport = require('../src/csvimport')
const path = require('path')

const pkgInfo = require('../package.json')

const optionDefinitions = [
  {
    name: 'csvfile',
    type: String,
    defaultOption: true,
    typeLabel: '[underline]{file}.csv',
    description: 'CSV file to view, with header row'
  },
  {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Show usage information'
  },
  {
    name: 'version',
    alias: 'v',
    type: Boolean,
    description: 'Print version number and exit'
  }
]

const usageInfo = [
  {
    header: 'csvimport-cli',
    content: 'CLI interface for importing CSV files into sqlite'
  },
  {
    header: 'Synopsis',
    content: [
      '$ csvimport [[italic]{options}] [underline]{file}.csv'
    ]
  },
  {
    header: 'Options',
    optionList: optionDefinitions.filter(opt => opt.name !== 'csvfile')
  }
]

const showVersion = () => {
  const version = pkgInfo.version
  console.log(version)
}

const showUsage = () => {
  const usage = getUsage(usageInfo)
  console.log(usage)
}

const main = () => {
  try {
    const argv = process.argv.slice(1)
    const options = commandLineArgs(optionDefinitions, argv)
    if (options.help) {
      showUsage()
      process.exit(0)
    }
    if (options.version) {
      showVersion()
      process.exit(0)
    }
    let targetPath
    if (options['executed-from']) {
      if (options.csvfile && options.csvfile.startsWith('/')) {
        // absolute pathname:
        targetPath = options.csvfile
      } else {
        targetPath = path.join(options['executed-from'], options.csvfile)
      }
    } else {
      targetPath = options.csvfile
    }
    global.options = options
    const hrProcStart = process.hrtime()

    db.open(':memory:')
      .then(() => csvimport.importSqlite(targetPath))
      .then(md => {
        const [es, ens] = process.hrtime(hrProcStart)
        console.info('import completed in %ds %dms', es, ens / 1e6)
        console.log('Import complete. Imported ' + md.rowCount +
          ' rows into table "' + md.tableName + '"')
        process.exit(0)
      })
      .catch(err => {
        console.error('error importing CSV file: ', err, err.stack)
      })
  } catch (err) {
    console.error('Error: ', err.message)
    showUsage()
    process.exit(1)
  }
}

main()
