import React, { useId } from 'react';

export default function AriaLogo({ size = 20 }) {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="6" y1="20" x2="58" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#35E0EE" />
          <stop offset="1" stopColor="#1673B4" />
        </linearGradient>
      </defs>
      <path d="M8 33C8 19 19 8 32 8s24 11 24 25" stroke={`url(#${gradientId})`} strokeWidth="4" strokeLinecap="round" fill="none" />
      <rect x="6" y="21" width="52" height="28" rx="14" fill={`url(#${gradientId})`} />
      <rect x="11" y="26" width="42" height="18" rx="9" fill="#071426" />
      <rect x="23" y="30" width="4" height="10" rx="2" fill="#5FF3F7" />
      <rect x="37" y="30" width="4" height="10" rx="2" fill="#5FF3F7" />
      <path d="M24 56h16" stroke={`url(#${gradientId})`} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
