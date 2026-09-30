/**
 * The ?debug tuning panel — dynamically imported so lil-gui stays out of the
 * normal bundle and precache. Folders are generated from the descriptor
 * table. Every dial belongs to the server's sim: a change is forwarded with
 * `tune` (a rebuild-group dial makes the server rebuild its world). The
 * client-only groups (NET, CAMERA) apply locally as well.
 */
import GUI from 'lil-gui'
import { createConfig, type Config } from '../../shared/config'
import { TUNABLES } from '../../shared/config/tunables'
import { clearOverrides, collectOverrides, getByPath, saveOverrides, setByPath } from './overrides'

/** What the panel needs from the composition root (GameScene satisfies it structurally). */
export interface TuningHost {
  readonly config: Config
  readonly seed: number
  /** A dial changed: the value is already in `config`; forward it. */
  tunableChanged(path: string): void
  /** Ask the server to rebuild its world on the current seed. */
  restart(): void
  readout(): { lines: string[]; overBudget: boolean }
}

export function mountTuningPanel(host: TuningHost): GUI {
  const defaults = createConfig()
  const gui = new GUI({ title: 'Tuning', width: 300 })
  gui.domElement.style.zIndex = '10'
  // A slider drag must never become a gas press: the panel overlaps the gas
  // zone by design, so stop everything from bubbling to the window-level input listeners.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'keydown', 'keyup']) {
    gui.domElement.addEventListener(type, (e) => e.stopPropagation())
  }

  // Instrument readout, above the folders, 4 Hz; the perf line turns red over budget.
  const readoutEl = document.createElement('pre')
  readoutEl.style.cssText =
    'margin:0;padding:6px 8px;font:10px/1.5 monospace;white-space:pre-wrap;color:#e8e8e8;background:rgba(20,20,20,0.85);'
  gui.domElement.insertBefore(readoutEl, gui.domElement.querySelector('.children'))
  const renderReadout = (): void => {
    const { lines, overBudget } = host.readout()
    readoutEl.textContent = lines.join('\n')
    readoutEl.style.color = overBudget ? '#ff5c5c' : '#e8e8e8'
  }
  renderReadout()
  setInterval(renderReadout, 250)

  const persist = (): void => saveOverrides(collectOverrides(host.config, defaults))

  const folders = new Map<string, GUI>()
  const rebuildFolders = new Map<string, GUI>()
  for (const t of TUNABLES) {
    const [recName, key] = t.path.split('.') as [keyof Config & string, string]
    if (!folders.has(recName)) folders.set(recName, gui.addFolder(recName).close())
    let parent = folders.get(recName)!
    if (t.group === 'rebuild') {
      if (!rebuildFolders.has(recName)) rebuildFolders.set(recName, parent.addFolder('(rebuilds)'))
      parent = rebuildFolders.get(recName)!
    }
    const target = host.config[recName] as unknown as Record<string, number>
    const ctrl = parent.add(target, key, t.min, t.max, t.step)
    if (t.group === 'live') {
      ctrl.onChange(() => {
        persist()
        host.tunableChanged(t.path)
      })
    } else {
      ctrl.onFinishChange(() => {
        persist()
        host.tunableChanged(t.path)
      })
    }
  }

  const actions = {
    Reset: (): void => {
      clearOverrides()
      for (const t of TUNABLES) {
        setByPath(host.config, t.path, getByPath(defaults, t.path)!)
        host.tunableChanged(t.path)
      }
      gui.controllersRecursive().forEach((c) => c.updateDisplay())
    },
    Copy: (): void => {
      const json = JSON.stringify(collectOverrides(host.config, defaults), null, 2)
      console.log('[tuning] overrides (paste into src/config/):\n' + json)
      void navigator.clipboard?.writeText(json)
    },
  }
  gui.add(actions, 'Reset')
  gui.add(actions, 'Copy')

  const dbg = gui.addFolder('Debug')
  const dbgState = { seed: String(host.seed), Restart: () => host.restart() }
  dbg.add(dbgState, 'Restart')
  dbg.add(dbgState, 'seed').disable()

  return gui
}
