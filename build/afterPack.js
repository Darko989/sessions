const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const appDir = context.appOutDir

  // Remove large unnecessary files (~9MB saved)
  const removeFiles = ['LICENSES.chromium.html']
  for (const file of removeFiles) {
    const filePath = path.join(appDir, file)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  if (context.electronPlatformName !== 'linux') return

  // Write a wrapper script that sets --no-sandbox before launching the real binary
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
