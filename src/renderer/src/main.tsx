import '@fontsource-variable/inter/wght.css'
import './assets/beam.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Home from './routes/Home'
import ControlBar from './routes/ControlBar'
import WebcamBubble from './routes/WebcamBubble'
import Editor from './routes/Editor'
import RegionSelect from './routes/RegionSelect'
import InputOverlay from './routes/InputOverlay'

function resolveRoute(): React.JSX.Element {
  const hash = window.location.hash.replace(/^#/, '')
  const [path, query] = hash.split('?')
  const params = new URLSearchParams(query ?? '')

  switch (path) {
    case '/control':
      return <ControlBar />
    case '/webcam':
      return <WebcamBubble />
    case '/editor':
      return <Editor filePath={decodeURIComponent(params.get('file') ?? '')} />
    case '/region-select':
      return <RegionSelect />
    case '/input-overlay':
      return <InputOverlay />
    default:
      return <Home />
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode>{resolveRoute()}</StrictMode>)
