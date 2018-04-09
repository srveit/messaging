'use strict';
const fs = require('fs'),
  {createMessaging} = require('../index'),
  outputDir = '.',
  messaging = createMessaging();

['inbound', 'outbound'].map(name => {
  const dotFile = `${outputDir}/${name}.dot`,
    svgFile = `${outputDir}/${name}.svg`,
    psFile = `${outputDir}/${name}.ps`,
    dotMethod = `${name}Dot`,
    command = `dot -Glabelloc="t" -Gsize="10,7.5" -Glabel=${name} -Tps ${dotFile} -o ${psFile}`;
  fs.writeFileSync(dotFile, messaging[dotMethod]);
  console.log('wrote', dotFile);
  console.log(command);
});
