import { useEffect, useRef, useState } from 'react'
import type { BeamSettings, Quality, RegionRect, SourceInfo } from '../../../preload/index'
import {
  IconCaption,
  IconCheck,
  IconClick,
  IconCrop,
  IconFolder,
  IconKeyboard,
  IconMic,
  IconMonitor,
  IconSettings,
  IconVolume,
  IconWebcam,
  IconX
} from '../components/Icons'
import Logo from '../components/Logo'
import { QUALITY_OPTIONS } from '../lib/quality'

type Tab = 'screen' | 'window' | 'region'

function Switch({
  on,
  onToggle,
  disabled
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
    >
      <span className="switch__knob" />
    </button>
  )
}

function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  const key = e.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null
  const named: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc'
  }
  const mainKey = named[key] ?? (key.length === 1 ? key.toUpperCase() : key)
  parts.push(mainKey)
  return parts.join('+')
}

export default function Home(): React.JSX.Element {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [loadingSources, setLoadingSources] = useState(true)
  const [tab, setTab] = useState<Tab>('screen')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [micOn, setMicOn] = useState(true)
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([])
  const [micDeviceId, setMicDeviceId] = useState<string>('')

  const [webcamOn, setWebcamOn] = useState(false)
  const [webcamDevices, setWebcamDevices] = useState<MediaDeviceInfo[]>([])
  const [webcamDeviceId, setWebcamDeviceId] = useState<string>('')

  const [systemAudioOn, setSystemAudioOn] = useState(false)
  const [quality, setQuality] = useState<Quality>('high')
  const [countdown, setCountdown] = useState<number | null>(null)

  const [showClicksOn, setShowClicksOn] = useState(false)
  const [showKeystrokesOn, setShowKeystrokesOn] = useState(false)
  const [liveCaptionsOn, setLiveCaptionsOn] = useState(false)

  const [region, setRegion] = useState<RegionRect | null>(null)
  const [selectingRegion, setSelectingRegion] = useState(false)

  const [settings, setSettings] = useState<BeamSettings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const prefsLoaded = useRef(false)

  async function refreshSources(): Promise<void> {
    setLoadingSources(true)
    try {
      const list = await window.beam.listSources()
      setSources(list)
      if (!selectedId && list.length > 0) {
        const firstOfTab = list.find((s) => s.type === tab) ?? list[0]
        setSelectedId(firstOfTab.id)
        setTab(firstOfTab.type)
      }
    } finally {
      setLoadingSources(false)
    }
  }

  async function primeDevicePermissions(): Promise<void> {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      probe.getTracks().forEach((t) => t.stop())
    } catch {
      // permission denied or no devices; selection dropdowns will just be empty
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const mics = devices.filter((d) => d.kind === 'audioinput')
      const cams = devices.filter((d) => d.kind === 'videoinput')
      setMicDevices(mics)
      setWebcamDevices(cams)
      if (mics[0]) setMicDeviceId((cur) => cur || mics[0].deviceId)
      if (cams[0]) setWebcamDeviceId((cur) => cur || cams[0].deviceId)
    } catch {
      // ignore
    }
  }

  async function loadSettings(): Promise<void> {
    const s = await window.beam.getSettings()
    setSettings(s)
    const prefs = s.recordingPrefs
    setMicOn(prefs.micEnabled)
    if (prefs.micDeviceId) setMicDeviceId(prefs.micDeviceId)
    setWebcamOn(prefs.webcamEnabled)
    if (prefs.webcamDeviceId) setWebcamDeviceId(prefs.webcamDeviceId)
    setSystemAudioOn(prefs.systemAudio)
    setQuality(prefs.quality)
    setShowClicksOn(prefs.showClicks)
    setShowKeystrokesOn(prefs.showKeystrokes)
    setLiveCaptionsOn(prefs.liveCaptions)
    prefsLoaded.current = true
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; setState happens after the await, not synchronously
    refreshSources()
    primeDevicePermissions()
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist recording preferences whenever they change, so the global hotkey
  // (which can't see this React state) starts a recording with whatever the
  // user last configured here.
  useEffect(() => {
    if (!prefsLoaded.current) return
    window.beam.saveRecordingPrefs({
      micEnabled: micOn,
      micDeviceId: micDeviceId || undefined,
      webcamEnabled: webcamOn,
      webcamDeviceId: webcamDeviceId || undefined,
      systemAudio: systemAudioOn,
      quality,
      showClicks: showClicksOn,
      showKeystrokes: showKeystrokesOn,
      liveCaptions: liveCaptionsOn
    })
  }, [
    micOn,
    micDeviceId,
    webcamOn,
    webcamDeviceId,
    systemAudioOn,
    quality,
    showClicksOn,
    showKeystrokesOn,
    liveCaptionsOn
  ])

  useEffect(() => {
    if (!capturingHotkey) return
    function onKeyDown(e: KeyboardEvent): void {
      e.preventDefault()
      const accel = acceleratorFromEvent(e)
      if (!accel || !accel.includes('+')) return
      setCapturingHotkey(false)
      window.beam.setHotkey(true, accel).then(setSettings)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturingHotkey])

  // Fires when a recording fails to actually start (e.g. the source picker
  // was closed, screen-share permission was denied) — without this, that
  // failure was an entirely silent revert back to this picker, which is
  // exactly what made an earlier crash-on-start bug so hard to diagnose
  // from a bug report alone.
  useEffect(() => {
    return window.beam.onRecordingFailed((reason) => setErrorMsg(reason))
  }, [])

  const filtered = sources.filter((s) => s.type === tab)

  async function handleSelectRegion(): Promise<void> {
    setSelectingRegion(true)
    try {
      const rect = await window.beam.selectRegion()
      if (rect) setRegion(rect)
    } finally {
      setSelectingRegion(false)
    }
  }

  async function handleStart(): Promise<void> {
    const source =
      tab === 'region'
        ? sources.find((s) => s.type === 'screen')
        : sources.find((s) => s.id === selectedId)
    if (!source) return
    if (tab === 'region' && !region) return

    setErrorMsg(null)
    for (const n of [3, 2, 1]) {
      setCountdown(n)
      await new Promise((r) => setTimeout(r, 700))
    }
    setCountdown(null)

    await window.beam.startRecording({
      sourceId: source.id,
      sourceName: source.name,
      micEnabled: micOn,
      micDeviceId: micOn ? micDeviceId : undefined,
      systemAudio: systemAudioOn,
      webcamEnabled: webcamOn,
      webcamDeviceId: webcamOn ? webcamDeviceId : undefined,
      quality,
      region: tab === 'region' ? (region ?? undefined) : undefined,
      showClicks: showClicksOn,
      showKeystrokes: showKeystrokesOn,
      liveCaptions: micOn && liveCaptionsOn
    })
  }

  async function handleChooseOutputDir(): Promise<void> {
    const dir = await window.beam.chooseOutputDir()
    setSettings((s) => (s ? { ...s, outputDir: dir } : s))
  }

  async function handleResetOutputDir(): Promise<void> {
    await window.beam.resetOutputDir()
    setSettings((s) => (s ? { ...s, outputDir: null } : s))
  }

  async function handleToggleHotkey(): Promise<void> {
    if (!settings) return
    const next = await window.beam.setHotkey(!settings.hotkeyEnabled, settings.startStopHotkey)
    setSettings(next)
  }

  return (
    <div className="home">
      <div className="home__titlebar" />
      <div className="home__brand">
        <Logo size={28} />
        <div className="home__title">Beam</div>
        <div className="home__spacer" />
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setSettingsOpen((v) => !v)}
          title="Settings"
        >
          <IconSettings width={16} height={16} />
        </button>
      </div>

      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-panel__row">
            <span className="settings-panel__label">
              <IconFolder width={15} height={15} />
              Save recordings to
            </span>
          </div>
          <div className="settings-panel__path" title={settings?.outputDir ?? undefined}>
            {settings?.outputDir ?? 'Videos\\Beam (default)'}
          </div>
          <div className="settings-panel__actions">
            <button className="btn btn-secondary btn-sm" onClick={handleChooseOutputDir}>
              Change…
            </button>
            {settings?.outputDir && (
              <button className="btn btn-ghost btn-sm" onClick={handleResetOutputDir}>
                Reset to default
              </button>
            )}
          </div>

          <div className="settings-panel__row settings-panel__row--spaced">
            <span className="settings-panel__label">
              <IconKeyboard width={15} height={15} />
              Start/stop hotkey
            </span>
            <Switch on={settings?.hotkeyEnabled ?? false} onToggle={handleToggleHotkey} />
          </div>
          {settings?.hotkeyEnabled && (
            <div className="settings-panel__actions">
              <kbd className="settings-panel__kbd">{settings.startStopHotkey}</kbd>
              <button className="btn btn-secondary btn-sm" onClick={() => setCapturingHotkey(true)}>
                {capturingHotkey ? 'Press a key combo…' : 'Change…'}
              </button>
            </div>
          )}
          <div className="settings-panel__hint">
            Works anywhere, even when Beam isn&apos;t focused. Starts a full-screen recording with
            your current mic/webcam/quality settings, or stops the active one.
          </div>
        </div>
      )}

      <div className="home__body">
        <div className="tabs">
          <button
            className={`tabs__btn ${tab === 'screen' ? 'active' : ''}`}
            onClick={() => setTab('screen')}
          >
            Full Screen
          </button>
          <button
            className={`tabs__btn ${tab === 'window' ? 'active' : ''}`}
            onClick={() => setTab('window')}
          >
            Window
          </button>
          <button
            className={`tabs__btn ${tab === 'region' ? 'active' : ''}`}
            onClick={() => setTab('region')}
          >
            Region
          </button>
        </div>

        {tab === 'region' ? (
          <div className="region-picker">
            <button
              className="region-picker__draw"
              onClick={handleSelectRegion}
              disabled={selectingRegion}
            >
              <IconCrop width={20} height={20} />
              {region ? 'Re-select region' : 'Draw a region to capture'}
            </button>
            {region && (
              <div className="region-picker__summary">
                {Math.round(region.wFrac * 100)}% × {Math.round(region.hFrac * 100)}% of your
                primary display
              </div>
            )}
          </div>
        ) : (
          <div className="source-grid">
            {loadingSources && <div className="source-empty">Loading sources…</div>}
            {!loadingSources && filtered.length === 0 && (
              <div className="source-empty">Nothing to capture here yet.</div>
            )}
            {filtered.map((s) => (
              <button
                key={s.id}
                className={`source-card ${selectedId === s.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <img className="source-card__thumb" src={s.thumbnail} alt={s.name} />
                <span className="source-card__label">
                  {s.type === 'screen' ? <IconMonitor className="source-card__icon" /> : null}
                  {s.appIcon ? <img className="source-card__icon" src={s.appIcon} alt="" /> : null}
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="option-row">
          <span className="option-row__label">
            <IconMic className="option-row__icon" />
            Microphone
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {micOn && micDevices.length > 0 && (
              <select value={micDeviceId} onChange={(e) => setMicDeviceId(e.target.value)}>
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Microphone'}
                  </option>
                ))}
              </select>
            )}
            <Switch on={micOn} onToggle={() => setMicOn((v) => !v)} />
          </div>
        </div>

        <div className="option-row">
          <span className="option-row__label">
            <IconWebcam className="option-row__icon" />
            Webcam bubble
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {webcamOn && webcamDevices.length > 0 && (
              <select value={webcamDeviceId} onChange={(e) => setWebcamDeviceId(e.target.value)}>
                {webcamDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || 'Camera'}
                  </option>
                ))}
              </select>
            )}
            <Switch on={webcamOn} onToggle={() => setWebcamOn((v) => !v)} />
          </div>
        </div>

        <div className="option-row">
          <span className="option-row__label">
            <IconVolume className="option-row__icon" />
            System audio
          </span>
          <Switch on={systemAudioOn} onToggle={() => setSystemAudioOn((v) => !v)} />
        </div>

        <div className="option-row">
          <span className="option-row__label">
            <IconClick className="option-row__icon" />
            Click ripples
          </span>
          <Switch on={showClicksOn} onToggle={() => setShowClicksOn((v) => !v)} />
        </div>

        <div className="option-row">
          <span className="option-row__label">
            <IconKeyboard className="option-row__icon" />
            Keystroke overlay
          </span>
          <Switch on={showKeystrokesOn} onToggle={() => setShowKeystrokesOn((v) => !v)} />
        </div>

        <div className="option-row">
          <span className="option-row__label">
            <IconCaption className="option-row__icon" />
            Live captions
            {!micOn && <span className="option-row__hint"> (needs microphone)</span>}
          </span>
          <Switch
            on={liveCaptionsOn && micOn}
            onToggle={() => setLiveCaptionsOn((v) => !v)}
            disabled={!micOn}
          />
        </div>

        <div className="quality-options">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`quality-option ${quality === opt.value ? 'selected' : ''}`}
              onClick={() => setQuality(opt.value)}
            >
              <div>
                <div className="quality-option__label">{opt.label}</div>
                <div className="quality-option__detail">{opt.detail}</div>
              </div>
              <span className="quality-option__check">
                {quality === opt.value && <IconCheck width={10} height={10} />}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="home__footer">
        {errorMsg && <div className="home__error">{errorMsg}</div>}
        <button
          className="btn btn-primary home__start"
          onClick={handleStart}
          disabled={tab === 'region' ? !region : !selectedId}
        >
          Start Recording
        </button>
      </div>

      {countdown !== null && (
        <div className="countdown-overlay">
          <div key={countdown} className="countdown-overlay__number">
            {countdown}
          </div>
        </div>
      )}

      {capturingHotkey && (
        <div className="countdown-overlay" onClick={() => setCapturingHotkey(false)}>
          <IconX width={28} height={28} />
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--text-dim)' }}>
            Press a key combo (e.g. Ctrl+Shift+R)…
          </div>
        </div>
      )}
    </div>
  )
}
