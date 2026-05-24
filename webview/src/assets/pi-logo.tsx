// webview/src/assets/pi-logo.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

export function PiLogo({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="F5 logo"
    >
      <circle cx="50" cy="50" r="48" fill="#e01f27" />
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontSize="52"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        fill="white"
      >
        f5
      </text>
    </svg>
  );
}
