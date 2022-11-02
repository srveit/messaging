'use strict'
const fs = require('fs')
const { createMessaging } = require('../index')
const outputDir = '.'
const messaging = createMessaging()

;['inbound', 'outbound'].forEach((name) => {
  const dotFile = `${outputDir}/${name}.dot`
  // const svgFile = `${outputDir}/${name}.svg`
  const psFile = `${outputDir}/${name}.ps`
  const dotMethod = `${name}Dot`
  const command = `dot -Glabelloc="t" -Gsize="10,7.5" -Glabel=${name} -Tps ${dotFile} -o ${psFile}`

  fs.writeFileSync(dotFile, messaging[dotMethod])
  console.log('wrote', dotFile)
  console.log(command)
})
