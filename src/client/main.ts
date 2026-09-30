import Phaser from 'phaser'
import { registerSW } from 'virtual:pwa-register'
import { GameScene } from './scenes/GameScene'

registerSW({ immediate: true })

document.addEventListener('contextmenu', (e) => e.preventDefault())

// No pinch or double-tap zoom on the iPad. Safari ignores user-scalable, and a pinch can begin from the second
// finger's touchstart before any gesture event fires, so the page cancels every native touch event outright:
// the controls read pointer events, which still arrive, and the browser never gets a gesture to act on.
// The tuning panel keeps its native handling (its sliders are pointer-based too, but leave it be).
// The tuning panel and the Night overlay's name box keep their native touches (a text field needs them to focus).
const inPanel = (e: Event): boolean => e.target instanceof Element && e.target.closest('.lil-gui, #night input') !== null
for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
  document.addEventListener(type, (e) => { if (!inPanel(e)) e.preventDefault() }, { passive: false, capture: true })
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#1d2b3a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: 1,
    autoRound: true,
  },
  input: { activePointers: 3 },
  scene: [GameScene],
})
