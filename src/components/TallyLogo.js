import React from 'react';

/**
 * TallyLogo - Shared brand logo component
 * Four vertical lines with a diagonal fifth line (traditional tally mark style).
 * Used in Header, Login, and Landing Page.
 *
 * @param {number} size - Width/height in pixels (default 22)
 * @param {string} color - Stroke color (default 'white')
 */
const TallyLogo = ({ size = 22, color = 'white' }) => (
  <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
    {/* Four vertical lines */}
    <line x1="5" y1="3" x2="5" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="9.5" y1="3" x2="9.5" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="14" y1="3" x2="14" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <line x1="18.5" y1="3" x2="18.5" y2="21" stroke={color} strokeWidth="2" strokeLinecap="round" />
    {/* Diagonal fifth line */}
    <line x1="2.5" y1="18" x2="21" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default TallyLogo;
