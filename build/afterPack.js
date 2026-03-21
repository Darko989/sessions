const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return

  // Write a wrapper script that sets --no-sandbox before launching the real binary
  const appDir = context.appOutDir
  const exeName = context.packager.executableName
  const realBin = path.join(appDir, exeName)
  const wrapperBin = realBin + '-real'

  // Rename the real binary
  fs.renameSync(realBin, wrapperBin)

  // Create a wrapper script that passes --no-sandbox
  const wrapper = `#!/bin/bash
DIR="$(dirname "$(readlink -f "$0")")"
exec "$DIR/${exeName}-real" --no-sandbox "$@"
`
  fs.writeFileSync(realBin, wrapper, { mode: 0o755 })
}
