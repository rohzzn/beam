import { autoUpdater } from 'electron-updater'
import { dialog } from 'electron'
import { is } from '@electron-toolkit/utils'

const CHECK_INTERVAL = 4 * 60 * 60 * 1000

let wired = false

function wireEvents(): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.error('[beam] auto-update error', err)
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'A new version of Beam has been downloaded.',
        detail:
          "Restart now to finish installing it, or it'll install automatically the next time Beam quits.",
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall()
      })
      .catch((err) => console.error('[beam] update prompt failed', err))
  })
}

/** Checks GitHub Releases (via electron-builder.yml's publish config) for a
 *  newer version, downloads it silently in the background, and only
 *  interrupts the user once it's actually ready to install. Dev builds have
 *  no real update metadata to check against, so this is a no-op there. */
export function initAutoUpdater(): void {
  if (is.dev) return
  wireEvents()

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[beam] checkForUpdates failed', err)
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL)
}

/** For the tray's "Check for Updates…" item — unlike the silent background
 *  check, this always tells the user something (found, not found, or
 *  error), since they explicitly asked. */
export async function checkForUpdatesManually(): Promise<void> {
  if (is.dev) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Updates are not available in development builds.'
    })
    return
  }
  wireEvents()

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || result.updateInfo.version === autoUpdater.currentVersion.version) {
      await dialog.showMessageBox({
        type: 'info',
        message: "You're up to date.",
        detail: `Beam ${autoUpdater.currentVersion.version}`
      })
    }
    // If an update WAS found, checkForUpdates already kicked off the
    // download, and the update-downloaded handler above takes it from here.
  } catch (err) {
    console.error('[beam] manual update check failed', err)
    await dialog.showMessageBox({
      type: 'error',
      message: 'Could not check for updates.',
      detail: err instanceof Error ? err.message : String(err)
    })
  }
}
