import React, { useId } from 'react';

export default function AriaLogo({ size = 20 }) {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="12" y1="6" x2="52" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#224E78" />
          <stop offset="1" stopColor="#071D38" />
        </linearGradient>
      </defs>
      <rect x="2" y="23" width="10" height="18" rx="5" fill="#12375C" stroke="#22D3E5" strokeWidth="1.5" />
      <rect x="52" y="23" width="10" height="18" rx="5" fill="#12375C" stroke="#22D3E5" strokeWidth="1.5" />
      <path d="M7 28v8M57 28v8" stroke="#48E8F2" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="8" width="48" height="48" rx="24" fill={`url(#${gradientId})`} stroke="#36D5E4" strokeWidth="1.5" />
      <rect x="13" y="20" width="38" height="26" rx="13" fill="#061321" stroke="#29C7DB" strokeWidth="1.5" />
      <ellipse cx="25" cy="31" rx="3.2" ry="6" fill="#65F4F6" />
      <ellipse cx="39" cy="31" rx="3.2" ry="6" fill="#65F4F6" />
      <path d="M27 40 Q32 43.5 37 40" stroke="#52E9F0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
