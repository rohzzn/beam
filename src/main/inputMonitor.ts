import { screen } from 'electron'
import { uIOhook, UiohookKey, UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi'
import { getInputOverlay } from './windows'

const MODIFIER_CODES = new Set<number>([
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight
])

const KEY_LABELS: Record<number, string> = {
  [UiohookKey.Backspace]: 'Backspace',
  [UiohookKey.Tab]: 'Tab',
  [UiohookKey.Enter]: 'Enter',
  [UiohookKey.CapsLock]: 'Caps Lock',
  [UiohookKey.Escape]: 'Esc',
  [UiohookKey.Space]: 'Space',
  [UiohookKey.PageUp]: 'Page Up',
  [UiohookKey.PageDown]: 'Page Down',
  [UiohookKey.End]: 'End',
  [UiohookKey.Home]: 'Home',
  [UiohookKey.ArrowLeft]: '←',
  [UiohookKey.ArrowUp]: '↑',
  [UiohookKey.ArrowRight]: '→',
  [UiohookKey.ArrowDown]: '↓',
  [UiohookKey.Insert]: 'Insert',
  [UiohookKey.Delete]: 'Delete',
  [UiohookKey[0]]: '0',
  [UiohookKey[1]]: '1',
  [UiohookKey[2]]: '2',
  [UiohookKey[3]]: '3',
  [UiohookKey[4]]: '4',
  [UiohookKey[5]]: '5',
  [UiohookKey[6]]: '6',
  [UiohookKey[7]]: '7',
  [UiohookKey[8]]: '8',
  [UiohookKey[9]]: '9',
  [UiohookKey.A]: 'A',
  [UiohookKey.B]: 'B',
  [UiohookKey.C]: 'C',
  [UiohookKey.D]: 'D',
  [UiohookKey.E]: 'E',
  [UiohookKey.F]: 'F',
  [UiohookKey.G]: 'G',
  [UiohookKey.H]: 'H',
  [UiohookKey.I]: 'I',
  [UiohookKey.J]: 'J',
  [UiohookKey.K]: 'K',
  [UiohookKey.L]: 'L',
  [UiohookKey.M]: 'M',
  [UiohookKey.N]: 'N',
  [UiohookKey.O]: 'O',
  [UiohookKey.P]: 'P',
  [UiohookKey.Q]: 'Q',
  [UiohookKey.R]: 'R',
  [UiohookKey.S]: 'S',
  [UiohookKey.T]: 'T',
  [UiohookKey.U]: 'U',
  [UiohookKey.V]: 'V',
  [UiohookKey.W]: 'W',
  [UiohookKey.X]: 'X',
  [UiohookKey.Y]: 'Y',
  [UiohookKey.Z]: 'Z',
  [UiohookKey.F1]: 'F1',
  [UiohookKey.F2]: 'F2',
  [UiohookKey.F3]: 'F3',
  [UiohookKey.F4]: 'F4',
  [UiohookKey.F5]: 'F5',
  [UiohookKey.F6]: 'F6',
  [UiohookKey.F7]: 'F7',
  [UiohookKey.F8]: 'F8',
  [UiohookKey.F9]: 'F9',
  [UiohookKey.F10]: 'F10',
  [UiohookKey.F11]: 'F11',
  [UiohookKey.F12]: 'F12',
  [UiohookKey.Semicolon]: ';',
  [UiohookKey.Equal]: '=',
  [UiohookKey.Comma]: ',',
  [UiohookKey.Minus]: '-',
  [UiohookKey.Period]: '.',
  [UiohookKey.Slash]: '/',
  [UiohookKey.Backquote]: '`',
  [UiohookKey.BracketLeft]: '[',
  [UiohookKey.Backslash]: '\\',
  [UiohookKey.BracketRight]: ']',
  [UiohookKey.Quote]: "'"
}

function keyLabel(e: UiohookKeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.keycode)) return null
  const main = KEY_LABELS[e.keycode]
  if (!main) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Win')
  parts.push(main)
  return parts.join('+')
}

let active = false
let onMouseDown: ((e: UiohookMouseEvent) => void) | null = null
let onKeyDown: ((e: UiohookKeyboardEvent) => void) | null = null

export interface InputOverlayOptions {
  showClicks: boolean
  showKeystrokes: boolean
}

export function startInputMonitor(options: InputOverlayOptions): void {
  if (active) return
  active = true

  if (options.showClicks) {
    onMouseDown = (e: UiohookMouseEvent): void => {
      const overlay = getInputOverlay()
      if (!overlay || overlay.isDestroyed()) return
      const display = screen.getPrimaryDisplay()
      overlay.webContents.send('input:click', {
        x: e.x - display.bounds.x,
        y: e.y - display.bounds.y
      })
    }
    uIOhook.on('mousedown', onMouseDown)
  }

  if (options.showKeystrokes) {
    onKeyDown = (e: UiohookKeyboardEvent): void => {
      const label = keyLabel(e)
      if (!label) return
      const overlay = getInputOverlay()
      if (!overlay || overlay.isDestroyed()) return
      overlay.webContents.send('input:key', label)
    }
    uIOhook.on('keydown', onKeyDown)
  }

  uIOhook.start()
}

export function stopInputMonitor(): void {
  if (!active) return
  active = false
  if (onMouseDown) uIOhook.off('mousedown', onMouseDown)
  if (onKeyDown) uIOhook.off('keydown', onKeyDown)
  onMouseDown = null
  onKeyDown = null
  uIOhook.stop()
}
