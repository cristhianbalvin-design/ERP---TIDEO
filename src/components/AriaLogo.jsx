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
      <rect x="3" y="23" width="10" height="20" rx="5" fill="#12375C" stroke="#22D3E5" strokeWidth="1.5" />
      <rect x="51" y="23" width="10" height="20" rx="5" fill="#12375C" stroke="#22D3E5" strokeWidth="1.5" />
      <path d="M8 28v10M56 28v10" stroke="#48E8F2" strokeWidth="2" strokeLinecap="round" />
      <rect x="10" y="6" width="44" height="52" rx="21" fill={`url(#${gradientId})`} stroke="#36D5E4" strokeWidth="1.5" />
      <rect x="15" y="20" width="34" height="29" rx="13" fill="#061321" stroke="#29C7DB" strokeWidth="1.5" />
      <ellipse cx="25" cy="32" rx="2.6" ry="5" fill="#65F4F6" />
      <ellipse cx="39" cy="32" rx="2.6" ry="5" fill="#65F4F6" />
      <path d="M28 42v2M32 41v3M36 42v2" stroke="#52E9F0" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
