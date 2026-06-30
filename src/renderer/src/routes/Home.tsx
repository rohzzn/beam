import { useEffect, useState } from 'react'
import type { Quality, SourceInfo } from '../../../preload/index'
import { IconCheck, IconMic, IconMonitor, IconVolume, IconWebcam } from '../components/Icons'
import Logo from '../components/Logo'
import { QUALITY_OPTIONS } from '../lib/quality'

type Tab = 'screen' | 'window'

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
    >
      <span className="switch__knob" />
    </button>
  )
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
      if (mics[0]) setMicDeviceId(mics[0].deviceId)
      if (cams[0]) setWebcamDeviceId(cams[0].deviceId)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount; setState happens after the await, not synchronously
    refreshSources()
    primeDevicePermissions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = sources.filter((s) => s.type === tab)

  async function handleStart(): Promise<void> {
    if (!selectedId) return
    const source = sources.find((s) => s.id === selectedId)
    if (!source) return

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
      quality
    })
  }

  return (
    <div className="home">
      <div className="home__titlebar" />
      <div className="home__brand">
        <Logo size={28} />
        <div className="home__title">Beam</div>
      </div>

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
        </div>

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
        <button
          className="btn btn-primary home__start"
          onClick={handleStart}
          disabled={!selectedId}
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
    </div>
  )
}
