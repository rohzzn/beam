import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ...props
})

export function IconMonitor(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

export function IconAppWindow(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <circle cx="6.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function IconMic(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

export function IconWebcam(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="9" r="5" />
      <path d="M6 21c1-3 3.5-4.5 6-4.5S17 18 18 21" />
    </svg>
  )
}

export function IconVolume(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <polygon points="4,9 8,9 13,4 13,20 8,15 4,15" />
      <path d="M16 8a5 5 0 0 1 0 8" />
    </svg>
  )
}

export function IconPause(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}

export function IconPlay(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <polygon points="6,4 20,12 6,20" />
    </svg>
  )
}

export function IconSquare(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconFolder(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  )
}

export function IconCopy(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

export function IconX(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function IconGif(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <text x="12" y="15" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none">
        GIF
      </text>
    </svg>
  )
}

export function IconCheck(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <polyline points="20,6 9,17 4,12" />
    </svg>
  )
}

export function IconSettings(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

export function IconKeyboard(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="6" y1="9" x2="6" y2="9.01" />
      <line x1="10" y1="9" x2="10" y2="9.01" />
      <line x1="14" y1="9" x2="14" y2="9.01" />
      <line x1="18" y1="9" x2="18" y2="9.01" />
      <line x1="7" y1="15" x2="17" y2="15" />
    </svg>
  )
}

export function IconCrop(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  )
}

export function IconScissors(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <polyline points="6,9 12,15 18,9" />
    </svg>
  )
}

export function IconZap(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
    </svg>
  )
}

export function IconClick(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <path d="M6 3v2M3 6h2M4.5 4.5l1.4 1.4" />
      <path d="M9 8 20 12l-4.5 1.8L13 18Z" />
    </svg>
  )
}

export function IconZoom(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
      <line x1="10.5" y1="8" x2="10.5" y2="13" />
      <line x1="8" y1="10.5" x2="13" y2="10.5" />
    </svg>
  )
}

export function IconCaption(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg {...base(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <line x1="6" y1="15" x2="10.5" y2="15" />
      <line x1="13.5" y1="15" x2="18" y2="15" />
    </svg>
  )
}
