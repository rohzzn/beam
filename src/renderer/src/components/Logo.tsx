export default function Logo({ size = 26 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="220" fill="#0A0A0D" />
      <circle cx="660" cy="360" r="270" fill="#4D2FF5" />
    </svg>
  )
}
