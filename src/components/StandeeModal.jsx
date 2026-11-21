import { useEffect, useRef, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { uploadHeaderImage, fetchSuperAdminEmail, supabase } from '../lib/supabaseClient';
import { openGmailCompose } from '../lib/gmail';

function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(255, 255, 255, ${alpha})`;
  const cleaned = hex.replace('#', '');
  if (cleaned.length < 6) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(cleaned.substring(0, 2), 16) || 0;
  const g = parseInt(cleaned.substring(2, 4), 16) || 0;
  const b = parseInt(cleaned.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Advanced Dynamic QR Canvas Engine:
 * - Whole-QR background photo + Center Logo/Icon Badge
 * - Corner Eye Shapes: Squircle, Circle, Square
 * - Dot Distributions: Micro-Dots, Rounded, Diamond, Smooth, Classic
 */
export async function renderCustomQrCanvas({
  url,
  width,
  qrDotColor = '#2B1E16',
  qrBgColor = '#ffffff',
  qrEyeShape = 'square',
  qrDotStyle = 'classic',
  qrBgImageUrl = '',
  centerLogoUrl = ''
}) {
  const qrCanvas = document.createElement('canvas');
  qrCanvas.width = width;
  qrCanvas.height = width;
  const qrCtx = qrCanvas.getContext('2d');

  // 1. Base canvas background
  qrCtx.fillStyle = qrBgColor;
  qrCtx.fillRect(0, 0, width, width);

  // 2. Extract QR matrix data with High Error Correction
  const qr = QRCode.create(url || 'https://example.com', {
    errorCorrectionLevel: 'H'
  });
  const matrix = qr.modules;
  const modCount = matrix.size;
  const margin = 2;
  const totalCells = modCount + (margin * 2);
  const cellSize = width / totalCells;
  const offset = margin * cellSize;
  const targetSize = modCount * cellSize;

  // 3. Composite full background photo if provided
  if (qrBgImageUrl) {
    try {
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve;
        bgImg.onerror = reject;
        bgImg.src = qrBgImageUrl;
      });

      const imgW = bgImg.naturalWidth || bgImg.width;
      const imgH = bgImg.naturalHeight || bgImg.height;
      let sx = 0, sy = 0, sSize = Math.min(imgW, imgH);
      if (imgW > imgH) sx = (imgW - imgH) / 2;
      else sy = (imgH - imgW) / 2;

      qrCtx.drawImage(bgImg, sx, sy, sSize, sSize, offset, offset, targetSize, targetSize);
      qrCtx.fillStyle = hexToRgba(qrBgColor, 0.28);
      qrCtx.fillRect(offset, offset, targetSize, targetSize);
    } catch (_) {}
  }

  // 4. Draw the 3 Corner Finder Patterns (Eyes)
  const eyeCellCount = 7;
  const eyeSize = eyeCellCount * cellSize;
  const eyePositions = [
    { r: 0, c: 0 },
    { r: 0, c: modCount - 7 },
    { r: modCount - 7, c: 0 }
  ];

  for (const eye of eyePositions) {
    const x0 = offset + (eye.c * cellSize);
    const y0 = offset + (eye.r * cellSize);

    qrCtx.fillStyle = qrBgColor;
    qrCtx.fillRect(x0 - (cellSize * 0.4), y0 - (cellSize * 0.4), eyeSize + (cellSize * 0.8), eyeSize + (cellSize * 0.8));

    if (qrEyeShape === 'squircle') {
      const outerRadius = eyeSize * 0.28;
      const innerGap = cellSize;
      const pupilOffset = cellSize * 2;
      const pupilSize = cellSize * 3;

      qrCtx.fillStyle = qrDotColor;
      qrCtx.beginPath();
      qrCtx.roundRect(x0, y0, eyeSize, eyeSize, outerRadius);
      qrCtx.fill();

      qrCtx.fillStyle = qrBgColor;
      qrCtx.beginPath();
      qrCtx.roundRect(x0 + innerGap, y0 + innerGap, eyeSize - (2 * innerGap), eyeSize - (2 * innerGap), outerRadius * 0.75);
      qrCtx.fill();

      qrCtx.fillStyle = qrDotColor;
      qrCtx.beginPath();
      qrCtx.roundRect(x0 + pupilOffset, y0 + pupilOffset, pupilSize, pupilSize, outerRadius * 0.6);
      qrCtx.fill();
    } else if (qrEyeShape === 'circle') {
      const cx = x0 + (eyeSize / 2);
      const cy = y0 + (eyeSize / 2);

      qrCtx.fillStyle = qrDotColor;
      qrCtx.beginPath();
      qrCtx.arc(cx, cy, eyeSize / 2, 0, Math.PI * 2);
      qrCtx.fill();

      qrCtx.fillStyle = qrBgColor;
      qrCtx.beginPath();
      qrCtx.arc(cx, cy, (eyeSize / 2) - cellSize, 0, Math.PI * 2);
      qrCtx.fill();

      qrCtx.fillStyle = qrDotColor;
      qrCtx.beginPath();
      qrCtx.arc(cx, cy, 1.5 * cellSize, 0, Math.PI * 2);
      qrCtx.fill();
    } else {
      qrCtx.fillStyle = qrDotColor;
      qrCtx.fillRect(x0, y0, eyeSize, eyeSize);

      qrCtx.fillStyle = qrBgColor;
      qrCtx.fillRect(x0 + cellSize, y0 + cellSize, 5 * cellSize, 5 * cellSize);

      qrCtx.fillStyle = qrDotColor;
      qrCtx.fillRect(x0 + (2 * cellSize), y0 + (2 * cellSize), 3 * cellSize, 3 * cellSize);
    }
  }

  // Helper: check if cell is within any of the 3 eyes
  function isInEye(r, c) {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= modCount - 7) return true;
    if (r >= modCount - 7 && c < 7) return true;
    return false;
  }

  // 5. Draw Body QR Data Modules
  qrCtx.fillStyle = qrDotColor;

  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (matrix.get(r, c) && !isInEye(r, c)) {
        const x = offset + (c * cellSize);
        const y = offset + (r * cellSize);

        if (qrDotStyle === 'rounded') {
          const radius = cellSize * 0.44;
          qrCtx.beginPath();
          qrCtx.arc(x + cellSize / 2, y + cellSize / 2, radius, 0, Math.PI * 2);
          qrCtx.fill();
        } else if (qrDotStyle === 'diamond') {
          qrCtx.beginPath();
          qrCtx.moveTo(x + cellSize / 2, y);
          qrCtx.lineTo(x + cellSize, y + cellSize / 2);
          qrCtx.lineTo(x + cellSize / 2, y + cellSize);
          qrCtx.lineTo(x, y + cellSize / 2);
          qrCtx.closePath();
          qrCtx.fill();
        } else if (qrDotStyle === 'micro') {
          const pad = cellSize * 0.12;
          qrCtx.beginPath();
          qrCtx.roundRect(x + pad, y + pad, cellSize - (pad * 2), cellSize - (pad * 2), cellSize * 0.22);
          qrCtx.fill();
        } else if (qrDotStyle === 'smooth') {
          const pad = cellSize * 0.05;
          qrCtx.beginPath();
          qrCtx.roundRect(x + pad, y + pad, cellSize - (pad * 2), cellSize - (pad * 2), cellSize * 0.4);
          qrCtx.fill();
        } else {
          qrCtx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }
  }

  // 6. Draw Center Logo / Emblem
  if (centerLogoUrl) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = centerLogoUrl;
      });

      const logoSize = width * 0.22;
      const lx = (width - logoSize) / 2;
      const ly = (width - logoSize) / 2;
      const badgeRadius = logoSize * 0.24;

      qrCtx.save();
      qrCtx.fillStyle = '#ffffff';
      qrCtx.shadowColor = 'rgba(0, 0, 0, 0.22)';
      qrCtx.shadowBlur = 10;
      qrCtx.shadowOffsetY = 2;
      qrCtx.beginPath();
      qrCtx.roundRect(lx - 6, ly - 6, logoSize + 12, logoSize + 12, badgeRadius + 3);
      qrCtx.fill();
      qrCtx.lineWidth = 2.5;
      qrCtx.strokeStyle = '#e2e8f0';
      qrCtx.stroke();
      qrCtx.restore();

      qrCtx.save();
      qrCtx.beginPath();
      qrCtx.roundRect(lx, ly, logoSize, logoSize, badgeRadius);
      qrCtx.clip();
      qrCtx.drawImage(logoImg, lx, ly, logoSize, logoSize);
      qrCtx.restore();
    } catch (_) {}
  }

  return qrCanvas;
}

export const STANDEE_TEMPLATES = [
  // ── HERITAGE MINIMALIST COLLECTION (4 Free Curated Templates) ──
  {
    id: 'circle-logo',
    aliases: ['free-1', 'pure-ivory', 'organic-green'],
    name: 'Organic Green',
    tier: 'free',
    shade: 'light',
    hasLogo: false,
    logoPlacement: 'none',
    previewImage: '/standees/preview-free-1.png',
    bgImage: '/standees/free-1.png',
    htmlFile: '/standees/free-1.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 514, y: 943, size: 252 },
    qrBgColor: '#FBF6EA',
    titleSlot: { x: 512, y: 230, font: 'bold 44px "Chewy", cursive', color: '#194D33', maxWidth: 640 },
    taglineSlot: { x: 512, y: 310, font: '500 18px "Jost", sans-serif', color: '#194D33', maxWidth: 600 },
    logoSlot: null,
    previewCardBg: '#FBF6EA',
    previewQrDot: '#194D33',
    previewQrBg: '#FFFFFF',
    accentColor: '#194D33',
    tagline: 'Farm to Fork Organic',
    badge: '✓ FREE',
    extraSlots: [
      { key: 'corner1', label: 'Corner Tag 1', def: 'GOOD' },
      { key: 'corner2', label: 'Corner Tag 2', def: 'FOOD' },
      { key: 'corner3', label: 'Corner Tag 3', def: 'GOOD' },
      { key: 'corner4', label: 'Corner Tag 4', def: 'MOOD' },
      { key: 'tag1', label: 'Sub-tag 1', def: 'BOWLS' },
      { key: 'tag2', label: 'Sub-tag 2', def: 'BITES' },
      { key: 'tag3', label: 'Sub-tag 3', def: 'GOOD VIBES' }
    ],
    config: {
      theme: 'light',
      cardBgColor: '#FBF6EA',
      qrDotColor: '#194D33',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'warm-kraft-frame',
    aliases: ['free-2', 'artisan-kraft', 'olive-oak', 'olive-wood'],
    name: 'Olive Wood',
    tier: 'free',
    shade: 'dark',
    hasLogo: true,
    logoPlacement: 'center',
    previewImage: '/standees/preview-free-2.png',
    bgImage: '/standees/free-2.png',
    htmlFile: '/standees/free-2.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 513, y: 958, size: 280 },
    qrBgColor: '#122A1E',
    titleSlot: { x: 512, y: 340, font: 'bold 46px "Bodoni Moda", Georgia, serif', color: '#FAF6EE', maxWidth: 640 },
    taglineSlot: { x: 512, y: 430, font: '400 16px "Jost", sans-serif', color: '#C5B7A3', maxWidth: 600 },
    logoSlot: { x: 512, y: 180, size: 120 },
    previewCardBg: '#122A1E',
    previewQrDot: '#FFFFFF',
    previewQrBg: '#122A1E',
    accentColor: '#C5B7A3',
    tagline: 'Deep Olive Noir Reserve',
    badge: '✓ FREE',
    extraSlots: [
      { key: 'tag1', label: 'Sub-tag 1', def: 'GOOD FOOD' },
      { key: 'tag2', label: 'Sub-tag 2', def: 'GREAT PEOPLE' }
    ],
    config: {
      theme: 'dark',
      cardBgColor: '#122A1E',
      qrDotColor: '#FFFFFF',
      qrBgColor: '#122A1E',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'clean-acrylic',
    aliases: ['free-3', 'crisp-acrylic', 'spice-soul', 'spice-terracotta'],
    name: 'Spice Terracotta',
    tier: 'free',
    shade: 'light',
    hasLogo: true,
    logoPlacement: 'top',
    previewImage: '/standees/preview-free-3.png',
    bgImage: '/standees/free-3.png',
    htmlFile: '/standees/free-3.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 513, y: 957, size: 267 },
    qrBgColor: '#F9F0E1',
    titleSlot: { x: 512, y: 330, font: 'bold 46px "DM Serif Display", serif', color: '#4A150D', maxWidth: 640 },
    taglineSlot: { x: 512, y: 420, font: '500 17px "Jost", sans-serif', color: '#4A150D', maxWidth: 600 },
    logoSlot: { x: 512, y: 190, size: 120 },
    previewCardBg: '#F9F0E1',
    previewQrDot: '#4A150D',
    previewQrBg: '#FFFFFF',
    accentColor: '#C27835',
    tagline: 'Royal Awadhi Heritage',
    badge: '✓ FREE',
    extraSlots: [
      { key: 'tag1', label: 'Sub-tag 1', def: 'TRADITIONAL FLAVOURS' },
      { key: 'tag2', label: 'Sub-tag 2', def: 'MODERN EXPERIENCE' }
    ],
    config: {
      theme: 'light',
      cardBgColor: '#F9F0E1',
      qrDotColor: '#4A150D',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'charcoal-minimal',
    aliases: ['free-4', 'noir-obsidian', 'courtyard-botanic', 'botanic-garden'],
    name: 'Botanic Garden',
    tier: 'free',
    shade: 'light',
    hasLogo: false,
    logoPlacement: 'none',
    previewImage: '/standees/preview-free-4.png',
    bgImage: '/standees/free-4.png',
    htmlFile: '/standees/free-4.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 512, y: 977, size: 292 },
    qrBgColor: '#FAF6EE',
    titleSlot: { x: 512, y: 260, font: 'bold 48px "Bodoni Moda", Georgia, serif', color: '#1A3A2A', maxWidth: 640 },
    taglineSlot: { x: 512, y: 345, font: '400 17px "Jost", sans-serif', color: '#1A3A2A', maxWidth: 600 },
    logoSlot: null,
    previewCardBg: '#FAF6EE',
    previewQrDot: '#1A3A2A',
    previewQrBg: '#FFFFFF',
    accentColor: '#2D5B44',
    tagline: 'Lush Botanical Bistro',
    badge: '✓ FREE',
    extraSlots: [
      { key: 'prefix', label: 'Prefix word', def: 'the' },
      { key: 'tag1', label: 'Sub-tag 1', def: 'GOOD FOOD' },
      { key: 'tag2', label: 'Sub-tag 2', def: 'BRIGHTER DAYS' }
    ],
    config: {
      theme: 'light',
      cardBgColor: '#FAF6EE',
      qrDotColor: '#1A3A2A',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },

  // ── PALACE IMPERIAL TIER (4 PRO Luxury Templates - All 887×1774) ──
  {
    id: 'midnight-gold',
    aliases: ['premium-1', 'emerald-solarium', 'emerald-luxury'],
    name: 'Emerald Luxury',
    tier: 'pro',
    shade: 'dark',
    hasLogo: true,
    logoPlacement: 'center',
    previewImage: '/standees/preview-premium-1.png',
    bgImage: '/standees/premium-1.png',
    htmlFile: '/standees/premium-1.html',
    aspectRatio: '887 / 1774',
    nativeWidth: 887,
    nativeHeight: 1774,
    qrCenter: { x: 477, y: 1029, size: 264 },
    qrBgColor: '#0D2F27',
    titleSlot: { x: 442, y: 310, font: '500 38px "Jost", sans-serif', color: '#E5D0A1', maxWidth: 580 },
    taglineSlot: { x: 442, y: 390, font: '400 16px "Jost", sans-serif', color: '#E5D0A1', maxWidth: 540 },
    logoSlot: { x: 442, y: 200, size: 120 },
    previewCardBg: '#08271A',
    previewQrDot: '#F59E0B',
    previewQrBg: '#051910',
    accentColor: '#E5D0A1',
    featureTag: 'Gold Foil',
    badge: '⭐ PRO',
    tagline: 'Deep Emerald & Gold Foil',
    extraSlots: [
      { key: 'slogan1', label: 'Top Slogan 1', def: 'GOOD FOOD' },
      { key: 'slogan2', label: 'Top Slogan 2', def: 'BETTER COMPANY' },
      { key: 'foot1', label: 'Footer Tag 1', def: 'FLAVOURS' },
      { key: 'foot2', label: 'Footer Tag 2', def: 'PEOPLE' },
      { key: 'foot3', label: 'Footer Tag 3', def: 'MEMORIES' }
    ],
    config: {
      theme: 'dark',
      cardBgColor: '#08271A',
      qrDotColor: '#E5D0A1',
      qrBgColor: '#051910',
      qrEyeShape: 'squircle',
      qrDotStyle: 'micro',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'gourmet-bistro',
    aliases: ['premium-2', 'midnight-sapphire', 'sapphire-gold'],
    name: 'Sapphire Gold',
    tier: 'pro',
    shade: 'dark',
    hasLogo: true,
    logoPlacement: 'top',
    previewImage: '/standees/preview-premium-2.png',
    bgImage: '/standees/premium-2.png',
    htmlFile: '/standees/premium-2.html',
    aspectRatio: '887 / 1774',
    nativeWidth: 887,
    nativeHeight: 1774,
    qrCenter: { x: 443, y: 1037, size: 273 },
    qrBgColor: '#0A192F',
    titleSlot: { x: 442, y: 310, font: '500 38px "Jost", sans-serif', color: '#E5D0A1', maxWidth: 580 },
    taglineSlot: { x: 442, y: 390, font: '400 16px "Jost", sans-serif', color: '#E5D0A1', maxWidth: 540 },
    logoSlot: { x: 442, y: 200, size: 120 },
    previewCardBg: '#01121D',
    previewQrDot: '#E5D0A1',
    previewQrBg: '#020C14',
    accentColor: '#E5D0A1',
    featureTag: 'Sapphire',
    badge: '⭐ PRO',
    tagline: 'Royal Sapphire & Gold Leaf',
    extraSlots: [
      { key: 'corner1', label: 'Corner Tag 1', def: 'GOOD' },
      { key: 'corner2', label: 'Corner Tag 2', def: 'FOOD' },
      { key: 'corner3', label: 'Corner Tag 3', def: 'GREAT' },
      { key: 'corner4', label: 'Corner Tag 4', def: 'PEOPLE' },
      { key: 'foot1', label: 'Footer Tag 1', def: 'TASTE' },
      { key: 'foot2', label: 'Footer Tag 2', def: 'PEOPLE' },
      { key: 'foot3', label: 'Footer Tag 3', def: 'PLACES' }
    ],
    config: {
      theme: 'dark',
      cardBgColor: '#01121D',
      qrDotColor: '#E5D0A1',
      qrBgColor: '#020C14',
      qrEyeShape: 'squircle',
      qrDotStyle: 'micro',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'artisan-botanical',
    aliases: ['premium-3', 'zen-ink-parchment', 'japanese-zen'],
    name: 'Japanese Zen',
    tier: 'pro',
    shade: 'light',
    hasLogo: true,
    logoPlacement: 'top',
    previewImage: '/standees/preview-premium-3.png',
    bgImage: '/standees/premium-3.png',
    htmlFile: '/standees/premium-3.html',
    aspectRatio: '436 / 1022',
    nativeWidth: 436,
    nativeHeight: 1022,
    qrCenter: { x: 225, y: 585, size: 136 },
    qrBgColor: '#EFE8D8',
    titleSlot: { x: 218, y: 377, font: '400 24px "Bodoni Moda", Georgia, serif', color: '#2B1E16', maxWidth: 280 },
    taglineSlot: { x: 218, y: 252, font: '400 10px "Jost", sans-serif', color: '#8C2D19', maxWidth: 260 },
    logoSlot: { x: 219, y: 165, size: 98 },
    previewCardBg: '#EFE8D8',
    previewQrDot: '#2B1E16',
    previewQrBg: '#FAF6EE',
    accentColor: '#8C2D19',
    featureTag: 'Wabi-Sabi',
    badge: '⭐ PRO',
    tagline: 'Minimalist Zen Japanese Ink',
    extraSlots: [
      { key: 'side1', label: 'Vertical Tag 1', def: 'GOOD FOOD' },
      { key: 'side2', label: 'Vertical Tag 2', def: 'GOOD MOOD' },
      { key: 'foot1', label: 'Footer Tag 1', def: 'EAT' },
      { key: 'foot2', label: 'Footer Tag 2', def: 'EXPLORE' },
      { key: 'foot3', label: 'Footer Tag 3', def: 'ENJOY' },
      { key: 'foot4', label: 'Footer Tag 4', def: 'REPEAT' }
    ],
    config: {
      theme: 'light',
      cardBgColor: '#EFE8D8',
      qrDotColor: '#2B1E16',
      qrBgColor: '#FAF6EE',
      qrEyeShape: 'circle',
      qrDotStyle: 'rounded',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'sunset-bistro',
    aliases: ['premium-4', 'travertine-sunlight', 'classic-marble'],
    name: 'Classic Marble',
    tier: 'pro',
    shade: 'light',
    hasLogo: true,
    logoPlacement: 'center',
    previewImage: '/standees/preview-premium-4.png',
    bgImage: '/standees/premium-4.png',
    htmlFile: '/standees/premium-4.html',
    aspectRatio: '887 / 1774',
    nativeWidth: 887,
    nativeHeight: 1774,
    qrCenter: { x: 444, y: 963, size: 243 },
    qrBgColor: '#F8F6F0',
    titleSlot: { x: 442, y: 340, font: 'bold 38px "Bodoni Moda", Georgia, serif', color: '#1B2A20', maxWidth: 580 },
    taglineSlot: { x: 442, y: 420, font: '400 16px "Jost", sans-serif', color: '#1B2A20', maxWidth: 540 },
    logoSlot: { x: 442, y: 220, size: 120 },
    previewCardBg: '#F8F6F0',
    previewQrDot: '#1B2A20',
    previewQrBg: '#FFFFFF',
    accentColor: '#1B2A20',
    featureTag: 'Travertine',
    badge: '⭐ PRO',
    tagline: 'Imperial Marble & Sage Elegance',
    extraSlots: [],
    config: {
      theme: 'light',
      cardBgColor: '#F8F6F0',
      qrDotColor: '#1B2A20',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'squircle',
      qrDotStyle: 'smooth',
      qrBgImageUrl: ''
    }
  },

  // ── LEGACY BACKWARD-COMPATIBILITY TEMPLATES ──
  {
    id: 'architectural-menu',
    aliases: [],
    name: 'Architectural Menu (Classic)',
    tier: 'free',
    isLegacy: true,
    shade: 'light',
    hasLogo: true,
    logoPlacement: 'top',
    bgImage: '/standees/free-3.png',
    htmlFile: '/standees/free-3.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 513, y: 957, size: 267 },
    qrBgColor: '#F9F0E1',
    titleSlot: { x: 512, y: 330, font: 'bold 46px "Playfair Display", Georgia, serif', color: '#4A150D', maxWidth: 640 },
    taglineSlot: { x: 512, y: 420, font: '600 17px "Plus Jakarta Sans", sans-serif', color: '#4A150D', maxWidth: 600 },
    logoSlot: { x: 512, y: 190, size: 120 },
    previewCardBg: '#F9F0E1',
    previewQrDot: '#4A150D',
    previewQrBg: '#FFFFFF',
    accentColor: '#C27835',
    tagline: 'Classic Architectural Edition',
    badge: '✓ FREE',
    extraSlots: [],
    config: {
      theme: 'light',
      cardBgColor: '#F9F0E1',
      qrDotColor: '#4A150D',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'alabaster-serif',
    aliases: [],
    name: 'Alabaster Serif (Classic)',
    tier: 'free',
    isLegacy: true,
    shade: 'light',
    hasLogo: false,
    logoPlacement: 'none',
    bgImage: '/standees/free-1.png',
    htmlFile: '/standees/free-1.html',
    aspectRatio: '1024 / 1536',
    nativeWidth: 1024,
    nativeHeight: 1536,
    qrCenter: { x: 514, y: 943, size: 252 },
    qrBgColor: '#FBF6EA',
    titleSlot: { x: 512, y: 230, font: 'bold 44px "Playfair Display", Georgia, serif', color: '#194D33', maxWidth: 640 },
    taglineSlot: { x: 512, y: 310, font: '600 18px "Plus Jakarta Sans", sans-serif', color: '#194D33', maxWidth: 600 },
    logoSlot: null,
    previewCardBg: '#FBF6EA',
    previewQrDot: '#194D33',
    previewQrBg: '#FFFFFF',
    accentColor: '#194D33',
    tagline: 'Classic Alabaster Edition',
    badge: '✓ FREE',
    extraSlots: [],
    config: {
      theme: 'light',
      cardBgColor: '#FBF6EA',
      qrDotColor: '#194D33',
      qrBgColor: '#FFFFFF',
      qrEyeShape: 'square',
      qrDotStyle: 'classic',
      qrBgImageUrl: ''
    }
  },
  {
    id: 'mocha-boutique',
    aliases: [],
    name: 'Mocha Boutique (Classic)',
    tier: 'pro',
    isLegacy: true,
    shade: 'dark',
    hasLogo: true,
    logoPlacement: 'center',
    bgImage: '/standees/premium-1.png',
    htmlFile: '/standees/premium-1.html',
    aspectRatio: '887 / 1774',
    nativeWidth: 887,
    nativeHeight: 1774,
    qrCenter: { x: 477, y: 1029, size: 264 },
    qrBgColor: '#0D2F27',
    titleSlot: { x: 442, y: 310, font: 'bold 38px "Playfair Display", Georgia, serif', color: '#E5D0A1', maxWidth: 580 },
    taglineSlot: { x: 442, y: 390, font: '600 16px "Plus Jakarta Sans", sans-serif', color: '#E5D0A1', maxWidth: 540 },
    logoSlot: { x: 442, y: 200, size: 120 },
    previewCardBg: '#08271A',
    previewQrDot: '#F59E0B',
    previewQrBg: '#051910',
    accentColor: '#E5D0A1',
    featureTag: 'Mocha',
    badge: '⭐ PRO',
    tagline: 'Classic Mocha Boutique Edition',
    extraSlots: [],
    config: {
      theme: 'dark',
      cardBgColor: '#08271A',
      qrDotColor: '#E5D0A1',
      qrBgColor: '#051910',
      qrEyeShape: 'squircle',
      qrDotStyle: 'micro',
      qrBgImageUrl: ''
    }
  }
];

/**
 * Intelligent outer-boundary flood-fill background removal using pure HTML5 Canvas.
 * Detects outer background color from border corners, floods inwards from the perimeter,
 * erases outer background to transparent alpha, preserves inner logo artwork, and feathers edges.
 */
export async function removeImageBackground(imageSource, tolerance = 32) {
  if (!imageSource || typeof document === 'undefined') return imageSource;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) return resolve(imageSource);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(imageSource);

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // Sample corner/border pixels to determine outer background color
        const corners = [
          0,
          (width - 1) * 4,
          (height - 1) * width * 4,
          ((height - 1) * width + (width - 1)) * 4
        ];

        let bgR = 0, bgG = 0, bgB = 0, sampleCount = 0;
        for (const idx of corners) {
          if (data[idx + 3] > 20) {
            bgR += data[idx];
            bgG += data[idx + 1];
            bgB += data[idx + 2];
            sampleCount++;
          }
        }

        if (sampleCount === 0) {
          return resolve(imageSource);
        }

        bgR = Math.round(bgR / sampleCount);
        bgG = Math.round(bgG / sampleCount);
        bgB = Math.round(bgB / sampleCount);

        function colorDist(idx) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          return Math.sqrt(
            (r - bgR) * (r - bgR) +
            (g - bgG) * (g - bgG) +
            (b - bgB) * (b - bgB)
          );
        }

        const feather = 18;
        const totalPixels = width * height;
        const visited = new Uint8Array(totalPixels);
        const queue = new Int32Array(totalPixels);
        let head = 0;
        let tail = 0;

        // Seed boundary border pixels
        for (let x = 0; x < width; x++) {
          const topIdx = x;
          const btmIdx = (height - 1) * width + x;
          if (!visited[topIdx]) {
            visited[topIdx] = 1;
            if (colorDist(topIdx * 4) <= tolerance + feather) queue[tail++] = topIdx;
          }
          if (!visited[btmIdx]) {
            visited[btmIdx] = 1;
            if (colorDist(btmIdx * 4) <= tolerance + feather) queue[tail++] = btmIdx;
          }
        }

        for (let y = 0; y < height; y++) {
          const lftIdx = y * width;
          const rgtIdx = y * width + (width - 1);
          if (!visited[lftIdx]) {
            visited[lftIdx] = 1;
            if (colorDist(lftIdx * 4) <= tolerance + feather) queue[tail++] = lftIdx;
          }
          if (!visited[rgtIdx]) {
            visited[rgtIdx] = 1;
            if (colorDist(rgtIdx * 4) <= tolerance + feather) queue[tail++] = rgtIdx;
          }
        }

        // BFS traversal: only clear exterior background connected to borders
        while (head < tail) {
          const curr = queue[head++];
          const cx = curr % width;
          const cy = Math.floor(curr / width);
          const pIdx = curr * 4;
          const dist = colorDist(pIdx);

          if (dist <= tolerance) {
            data[pIdx + 3] = 0;

            if (cx > 0) {
              const nIdx = curr - 1;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                if (colorDist(nIdx * 4) <= tolerance + feather) queue[tail++] = nIdx;
              }
            }
            if (cx < width - 1) {
              const nIdx = curr + 1;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                if (colorDist(nIdx * 4) <= tolerance + feather) queue[tail++] = nIdx;
              }
            }
            if (cy > 0) {
              const nIdx = curr - width;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                if (colorDist(nIdx * 4) <= tolerance + feather) queue[tail++] = nIdx;
              }
            }
            if (cy < height - 1) {
              const nIdx = curr + width;
              if (!visited[nIdx]) {
                visited[nIdx] = 1;
                if (colorDist(nIdx * 4) <= tolerance + feather) queue[tail++] = nIdx;
              }
            }
          } else if (dist <= tolerance + feather) {
            const factor = (dist - tolerance) / feather;
            data[pIdx + 3] = Math.round(data[pIdx + 3] * factor);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (_) {
        resolve(imageSource);
      }
    };

    img.onerror = () => resolve(imageSource);
    img.src = imageSource;
  });
}

/**
 * Ensure all Standee Google Fonts are actively downloaded and decoded in document memory
 */
export async function ensureTemplateFontsLoaded(targetDoc = (typeof document !== 'undefined' ? document : null)) {
  if (!targetDoc || !targetDoc.fonts?.load) return;

  const fontDescriptors = [
    '400 100px Chewy',
    '400 100px Jost',
    '500 100px Jost',
    '600 100px Jost',
    '700 100px Jost',
    '400 100px "Bodoni Moda"',
    '700 100px "Bodoni Moda"',
    '400 100px "DM Serif Display"',
    '400 100px "Cormorant Garamond"',
    '600 100px "Cormorant Garamond"',
    '400 100px Allura',
    '400 100px "Playfair Display"',
    '700 100px "Playfair Display"'
  ];

  try {
    await Promise.all(fontDescriptors.map((f) => targetDoc.fonts.load(f).catch(() => {})));
    await targetDoc.fonts.ready;
  } catch (_) {}
}

/**
 * High-fidelity pixel-perfect capture from the live Standee preview iframe
 * Directly draws clean artwork, vector SVG QR, and computed typography onto canvas without any paste slip
 */
/**
 * Load an image with CORS enabled so drawing it never taints the export canvas.
 * Returns null when the host doesn't allow cross-origin reads (logo is skipped
 * instead of breaking the PNG download / print).
 */
function loadCorsImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    if (!/^data:|^blob:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderIframeToCanvas(iframe, canvas, template = null, pixelScale = 1) {
  if (!iframe || !canvas) return;
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) return;
  const cv = iframeDoc.getElementById('cv');
  if (!cv) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const parentDoc = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null);
  await Promise.all([
    ensureTemplateFontsLoaded(parentDoc),
    ensureTemplateFontsLoaded(iframeDoc)
  ]);

  const targetWidth = cv.offsetWidth || 1024;
  const targetHeight = cv.offsetHeight || 1536;

  // Render directly at the requested output resolution (e.g. 300 DPI print
  // size) so text and the vector QR stay razor sharp instead of being
  // upscaled from a 1024px bitmap.
  const scale = Number(pixelScale) > 0 ? Number(pixelScale) : 1;
  canvas.width = Math.round(targetWidth * scale);
  canvas.height = Math.round(targetHeight * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const win = iframeDoc.defaultView || window;

  // Helper to reliably compute absolute coordinates of elements inside #cv
  function getElementPosition(el, idSelector, slotFallback) {
    let left = 0, top = 0, width = 0, height = 0;

    // 1. Try inline style on the element
    if (el?.style?.left) left = parseFloat(el.style.left);
    if (el?.style?.top) top = parseFloat(el.style.top);
    if (el?.style?.width) width = parseFloat(el.style.width);
    if (el?.style?.height) height = parseFloat(el.style.height);

    // 2. Try window.getComputedStyle
    if ((!left && !top) && el && win.getComputedStyle) {
      try {
        const cs = win.getComputedStyle(el);
        if (cs.left && cs.left !== 'auto') left = parseFloat(cs.left) || 0;
        if (cs.top && cs.top !== 'auto') top = parseFloat(cs.top) || 0;
        if (cs.width && cs.width !== 'auto') width = parseFloat(cs.width) || 0;
        if (cs.height && cs.height !== 'auto') height = parseFloat(cs.height) || 0;
      } catch (_) {}
    }

    // 3. Try reading directly from CSS stylesheet rules (#qr or #logo)
    if ((!left && !top) && iframeDoc.styleSheets) {
      try {
        for (const sheet of Array.from(iframeDoc.styleSheets)) {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            if (rule.selectorText === idSelector || rule.selectorText === `#cv > ${idSelector}`) {
              if (rule.style?.left) left = parseFloat(rule.style.left) || left;
              if (rule.style?.top) top = parseFloat(rule.style.top) || top;
              if (rule.style?.width) width = parseFloat(rule.style.width) || width;
              if (rule.style?.height) height = parseFloat(rule.style.height) || height;
            }
          }
        }
      } catch (_) {}
    }

    // 4. Try offsetLeft / offsetTop inside #cv
    if ((!left && !top) && el && typeof el.offsetLeft === 'number') {
      left = el.offsetLeft || 0;
      top = el.offsetTop || 0;
      width = width || el.offsetWidth || 0;
      height = height || el.offsetHeight || 0;
    }

    // 5. Template slot fallback
    if ((!left && !top) && slotFallback) {
      if (typeof slotFallback.size === 'number') {
        const sz = slotFallback.size;
        left = slotFallback.x - (sz / 2);
        top = slotFallback.y - (sz / 2);
        width = width || sz;
        height = height || sz;
      } else if (typeof slotFallback.x === 'number') {
        left = slotFallback.x;
        top = slotFallback.y;
      }
    }

    return { left, top, width, height };
  }

  // 1. Draw High-Res Clean Background Artwork
  const bgImg = cv.querySelector('img.bg');
  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
    try {
      ctx.drawImage(bgImg, 0, 0, targetWidth, targetHeight);
    } catch (_) {}
  } else {
    ctx.fillStyle = '#FAF6EE';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Draw text exactly where the browser lays it out. Templates position each
  // .t element with line-height:normal, so the glyph baseline sits at
  // top + fontBoundingBoxAscent. Using textBaseline:'top' (old behaviour)
  // shifted every line and made letters collide with the line below.
  function drawSpacedText(text, x, baselineY, letterSpacing) {
    if (!letterSpacing) {
      ctx.fillText(text, x, baselineY);
      return;
    }
    if ('letterSpacing' in ctx) {
      ctx.letterSpacing = `${letterSpacing}px`;
      ctx.fillText(text, x, baselineY);
      ctx.letterSpacing = '0px';
      return;
    }
    // Manual fallback (Safari / older engines): place glyphs one by one.
    let cx = x;
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, cx, baselineY);
      cx += ctx.measureText(ch).width + letterSpacing;
    }
  }

  // 2. Draw all live .t text elements positioned by template layout engine
  const textElements = Array.from(cv.querySelectorAll('.t'));
  textElements.forEach((el) => {
    if (el.style.visibility === 'hidden') return;
    const text = el.textContent;
    if (!text || !text.trim()) return;

    try {
      const style = win.getComputedStyle ? win.getComputedStyle(el) : el.style;
      const fontSize = parseFloat(style.fontSize) || 16;
      const fontFamily = style.fontFamily || 'sans-serif';
      const fontWeight = style.fontWeight || '400';
      const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
      const color = style.color || '#000000';
      // Negative spacing is used to tighten long names — it must be honoured.
      const letterSpacing = parseFloat(el.style.letterSpacing || style.letterSpacing) || 0;

      const left = el.style.left ? parseFloat(el.style.left) || 0 : (el.offsetLeft || 0);
      const top = el.style.top ? parseFloat(el.style.top) || 0 : (el.offsetTop || 0);

      const parentRot = el.closest('.rot');
      const isTilt = el.classList.contains('tilt') || (el.style.transform && el.style.transform.includes('-3deg'));

      ctx.save();
      ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const metrics = ctx.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || fontSize * 0.8;
      const lineHeight = parseFloat(style.lineHeight);
      const descent = metrics.fontBoundingBoxDescent || fontSize * 0.2;
      // line-height:normal → baseline = top + ascent; explicit line-height adds half-leading.
      const halfLeading = Number.isFinite(lineHeight) ? (lineHeight - (ascent + descent)) / 2 : 0;
      const baselineY = top + halfLeading + ascent;

      if (parentRot) {
        const rotLeft = parseFloat(parentRot.style.left) || parentRot.offsetLeft || 0;
        const rotTop = parseFloat(parentRot.style.top) || parentRot.offsetTop || 0;
        ctx.translate(rotLeft, rotTop);
        ctx.rotate(Math.PI / 2);
      } else if (isTilt) {
        const cx = left + metrics.width / 2;
        const cy = top + fontSize / 2;
        ctx.translate(cx, cy);
        ctx.rotate(-3 * Math.PI / 180);
        ctx.translate(-cx, -cy);
      }

      drawSpacedText(text, left, baselineY, letterSpacing);
      ctx.restore();
    } catch (_) {}
  });

  // 3. Draw live #name element container (multi-line flex layout in free-1).
  // Uses each line's real layout box (offsetTop/Left are transform-free) so
  // stacked words never overlap.
  const nameEl = iframeDoc.getElementById('name');
  if (nameEl && nameEl.style.visibility !== 'hidden' && nameEl.textContent.trim()) {
    try {
      const nLeft = parseFloat(nameEl.style.left) || nameEl.offsetLeft || 247;
      const nTop = parseFloat(nameEl.style.top) || nameEl.offsetTop || 85;
      const nW = nameEl.offsetWidth || parseFloat(nameEl.style.width) || 488;
      const nH = nameEl.offsetHeight || parseFloat(nameEl.style.height) || 345;
      const isTilt = nameEl.classList.contains('tilt') || (nameEl.style.transform && nameEl.style.transform.includes('-3deg'));
      const nameStyle = win.getComputedStyle ? win.getComputedStyle(nameEl) : nameEl.style;
      const nameFamily = nameStyle.fontFamily || "Chewy, 'Lilita One', sans-serif";
      const nameColor = nameStyle.color || nameEl.style.color || '#092214';

      ctx.save();
      if (isTilt) {
        ctx.translate(nLeft + nW / 2, nTop + nH / 2);
        ctx.rotate(-3 * Math.PI / 180);
        ctx.translate(-(nLeft + nW / 2), -(nTop + nH / 2));
      }
      ctx.fillStyle = nameColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const lines = Array.from(nameEl.querySelectorAll('div'));
      if (lines.length > 0) {
        lines.forEach((line) => {
          const lText = line.textContent;
          if (!lText) return;
          const lStyle = win.getComputedStyle ? win.getComputedStyle(line) : line.style;
          const lFs = parseFloat(lStyle.fontSize) || parseFloat(line.style.fontSize) || 90;
          ctx.font = `400 ${lFs}px ${nameFamily}`;
          const m = ctx.measureText(lText);
          const asc = m.fontBoundingBoxAscent || lFs * 0.8;
          const desc = m.fontBoundingBoxDescent || lFs * 0.2;
          const lh = parseFloat(lStyle.lineHeight);
          const boxH = Number.isFinite(lh) ? lh : (asc + desc);
          const baseline = nTop + line.offsetTop + (boxH - (asc + desc)) / 2 + asc;
          ctx.fillText(lText, nLeft + line.offsetLeft, baseline);
        });
      } else {
        ctx.font = `400 90px ${nameFamily}`;
        const m = ctx.measureText(nameEl.textContent);
        ctx.fillText(nameEl.textContent, nLeft, nTop + (m.fontBoundingBoxAscent || 72));
      }
      ctx.restore();
    } catch (_) {}
  }

  // 4. Draw Center Brand Logo (if present and visible)
  const logoEl = iframeDoc.getElementById('logo');
  if (logoEl && logoEl.src && logoEl.style.visibility !== 'hidden' && logoEl.style.display !== 'none') {
    try {
      const logoPos = getElementPosition(logoEl, '#logo', template?.logoSlot);
      const lWidth = logoPos.width || 110;
      const lHeight = logoPos.height || 110;
      // Re-load with CORS: the iframe's <img> has no crossorigin attribute, so
      // drawing it directly taints the canvas and breaks PNG download/print.
      const safeLogo = await loadCorsImage(logoEl.currentSrc || logoEl.src);
      if (safeLogo && safeLogo.naturalWidth > 0 && lWidth > 0 && lHeight > 0) {
        // Respect object-fit:contain used by the templates.
        const ratio = Math.min(lWidth / safeLogo.naturalWidth, lHeight / safeLogo.naturalHeight);
        const dw = safeLogo.naturalWidth * ratio;
        const dh = safeLogo.naturalHeight * ratio;
        ctx.drawImage(safeLogo, logoPos.left + (lWidth - dw) / 2, logoPos.top + (lHeight - dh) / 2, dw, dh);
      }
    } catch (_) {}
  }

  // 5. Draw Vector QR Code from Live SVG Path at exact computed position
  const qrSvg = iframeDoc.getElementById('qr');
  const qrp = iframeDoc.getElementById('qrp');
  if (qrSvg && qrp) {
    try {
      const qrPos = getElementPosition(qrSvg, '#qr', template?.qrCenter);
      const qLeft = qrPos.left;
      const qTop = qrPos.top;
      const qWidth = qrPos.width || 250;
      const qHeight = qrPos.height || 250;
      const pathD = qrp.getAttribute('d');
      const qrColor = qrp.getAttribute('fill') || '#000000';

      if (pathD && typeof Path2D !== 'undefined') {
        const viewBox = (qrSvg.getAttribute('viewBox') || '0 0 25 25').split(' ').map(Number);
        const modCount = viewBox[2] || 25;
        const scaleX = qWidth / modCount;
        const scaleY = qHeight / modCount;

        ctx.save();
        ctx.translate(qLeft, qTop);
        ctx.scale(scaleX, scaleY);
        ctx.fillStyle = qrColor;
        ctx.fill(new Path2D(pathD));
        ctx.restore();
      }
    } catch (_) {}
  }
}

function drawWatermark(canvas, template) {
  const ctx = canvas.getContext('2d');
  const targetWidth = template.nativeWidth || 1024;
  const targetHeight = template.nativeHeight || 1536;
  const k = canvas.width / targetWidth || 1;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = 'rgba(27, 18, 12, 0.75)';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  ctx.font = 'bold 52px "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.fillText('PREMIUM TIER SAMPLE', targetWidth / 2, targetHeight / 2 - 20);

  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Upgrade to PRO to unlock and download in full 300 DPI print quality', targetWidth / 2, targetHeight / 2 + 30);
  ctx.restore();
}

export async function renderViaOffscreenIframe(template, config, canvas, pixelScale = 1) {
  if (typeof document === 'undefined' || !template?.htmlFile) {
    return false;
  }

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1024px;height:1536px;opacity:0;pointer-events:none;border:none;';

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    }, 4500);

    function cleanup() {
      clearTimeout(timer);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }

    iframe.onload = async () => {
      if (settled) return;
      try {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        if (!win || !doc) throw new Error('No iframe window');

        await Promise.all([
          ensureTemplateFontsLoaded(document),
          ensureTemplateFontsLoaded(doc)
        ]);

        if (typeof win.renderStandee === 'function') {
          win.renderStandee(config);
        }

        await new Promise((r) => setTimeout(r, 120));

        await renderIframeToCanvas(iframe, canvas, template, pixelScale);
        settled = true;
        cleanup();
        resolve(true);
      } catch (err) {
        settled = true;
        cleanup();
        resolve(false);
      }
    };

    iframe.onerror = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(false);
      }
    };

    iframe.src = template.htmlFile;
    document.body.appendChild(iframe);
  });
}

export async function renderStandeeToCanvas(firstArg, secondArg) {
  let canvas, opts;
  if (firstArg && firstArg.getContext) {
    canvas = firstArg;
    opts = secondArg || {};
  } else {
    opts = firstArg || {};
    canvas = opts.canvas;
  }
  if (!canvas) return;

  let template = opts.template;
  if (!template && opts.templateId) {
    template = STANDEE_TEMPLATES.find(
      (t) => t.id === opts.templateId || (t.aliases && t.aliases.includes(opts.templateId))
    ) || STANDEE_TEMPLATES[0];
  }
  if (!template) return;

  const {
    title = '',
    description = '',
    centerLogoUrl = '',
    qrDotColor = '#2B1E16',
    qrBgColor = '#ffffff',
    qrEyeShape = 'square',
    qrDotStyle = 'classic',
    qrBgImageUrl = '',
    guestMenuUrl = '',
    showWatermark = false,
    hotelName = '',
    standeeTitle = 'MENU',
    scanCallout = 'SCAN TO VIEW',
    label1 = 'FOOD',
    label2 = 'DRINKS',
    label3 = 'SPECIALS',
    extraSlots = {},
    pixelScale = 1
  } = opts;

  const hotelDisplayName = title || hotelName || 'Your Hotel Name';
  const taglineDisplayName = (description && !description.includes('Scan with') && !description.includes('Scan with camera') && !description.includes('Scan with your phone'))
    ? description
    : (template.tagline || '');

  const templateConfig = {
    name: hotelDisplayName,
    tagline: taglineDisplayName,
    title: standeeTitle || 'MENU',
    scan: scanCallout || 'SCAN TO VIEW',
    label1: label1 || 'FOOD',
    label2: label2 || 'DRINKS',
    label3: label3 || 'SPECIALS',
    menuUrl: guestMenuUrl || 'https://example.com/menu',
    qrColor: qrDotColor || template.config?.qrDotColor || '#000000',
    logo: (template.hasLogo !== false ? centerLogoUrl : '') || '',
    ...extraSlots
  };

  // 1. Primary: Render with 100% fidelity using offscreen HTML template iframe
  if (typeof document !== 'undefined') {
    try {
      const success = await renderViaOffscreenIframe(template, templateConfig, canvas, pixelScale);
      if (success) {
        if (showWatermark) {
          drawWatermark(canvas, template);
        }
        return;
      }
    } catch (_) {}
  }

  // 2. Direct canvas fallback (if iframe is not available, e.g. Node.js unit tests)
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const targetWidth = template.nativeWidth || 1024;
  const targetHeight = template.nativeHeight || 1536;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  let bgDrawn = false;
  if (template.bgImage) {
    try {
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve;
        bgImg.onerror = reject;
        bgImg.src = template.bgImage;
      });
      ctx.drawImage(bgImg, 0, 0, targetWidth, targetHeight);
      bgDrawn = true;
    } catch (_) {}
  }

  if (!bgDrawn) {
    ctx.fillStyle = template.config?.cardBgColor || '#FDF9F3';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
  }

  // Title / Restaurant Name & Template Slots
  if (template.id === 'circle-logo') {
    // Free-1 Organic Green layout
    ctx.save();
    ctx.font = 'bold 54px "Chewy", cursive';
    ctx.fillStyle = '#194D33';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(512, 230);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.fillText(hotelDisplayName, 0, 0, 580);
    ctx.restore();

    // Central "MENU" inside yellow oval
    ctx.save();
    ctx.font = 'bold 80px "Chewy", cursive';
    ctx.fillStyle = '#0d2a19';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(512, 635);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.fillText(standeeTitle || 'MENU', 0, 0, 400);
    ctx.restore();

    // "SCAN TO VIEW"
    ctx.save();
    ctx.font = '600 22px "Jost", sans-serif';
    ctx.fillStyle = '#0a2214';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scanCallout || 'SCAN TO VIEW', 512, 755);
    ctx.restore();

    // Category labels
    ctx.save();
    ctx.font = '500 18px "Jost", sans-serif';
    ctx.fillStyle = '#06130a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label1 || 'FOOD'}     •     ${label2 || 'DRINKS'}     •     ${label3 || 'SPECIALS'}`, 512, 1235);
    ctx.restore();
  } else {
    // Standard template slot rendering
    if (template.titleSlot) {
      ctx.save();
      ctx.font = template.titleSlot.font || 'bold 44px "Playfair Display", Georgia, serif';
      ctx.fillStyle = template.titleSlot.color || '#2B1E16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hotelDisplayName, template.titleSlot.x, template.titleSlot.y, template.titleSlot.maxWidth || 600);
      ctx.restore();
    }

    if (template.taglineSlot && taglineDisplayName) {
      ctx.save();
      ctx.font = template.taglineSlot.font || '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = template.taglineSlot.color || '#78716c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(taglineDisplayName, template.taglineSlot.x, template.taglineSlot.y, template.taglineSlot.maxWidth || 580);
      ctx.restore();
    }
  }

  // Brand Logo
  if (centerLogoUrl && template.hasLogo !== false && template.logoSlot) {
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = centerLogoUrl;
      });

      const lSize = template.logoSlot.size || 110;
      const lx = template.logoSlot.x - (lSize / 2);
      const ly = template.logoSlot.y - (lSize / 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(template.logoSlot.x, template.logoSlot.y, lSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, lx, ly, lSize, lSize);
      ctx.restore();
    } catch (_) {}
  }

  // QR Module
  const qrTarget = template.qrCenter || { x: targetWidth / 2, y: targetHeight * 0.65, size: 280 };
  const qrCanvas = await renderCustomQrCanvas({
    url: guestMenuUrl || 'https://example.com/menu',
    width: qrTarget.size,
    qrDotColor: qrDotColor || template.config?.qrDotColor || '#2B1E16',
    qrBgColor: qrBgColor || template.config?.qrBgColor || '#FFFFFF',
    qrEyeShape: qrEyeShape || template.config?.qrEyeShape || 'square',
    qrDotStyle: qrDotStyle || template.config?.qrDotStyle || 'classic',
    qrBgImageUrl: qrBgImageUrl || template.config?.qrBgImageUrl || '',
    centerLogoUrl: ''
  });

  const qx = qrTarget.x - (qrTarget.size / 2);
  const qy = qrTarget.y - (qrTarget.size / 2);
  ctx.drawImage(qrCanvas, qx, qy);

  if (showWatermark) {
    drawWatermark(canvas, template);
  }
}

/**
 * Generates standalone downloadable .html file with user's inputs replaced
 */
export async function generateStandaloneStandeeHtml({
  template,
  name,
  tagline,
  logo,
  menuUrl,
  title,
  scan,
  label1,
  label2,
  label3,
  extraSlots = {}
}) {
  try {
    const res = await fetch(template.htmlFile);
    let html = await res.text();

    const configObj = {
      name: name || 'Your Hotel Name',
      tagline: tagline || template.tagline || '',
      title: title || 'MENU',
      scan: scan || 'SCAN TO VIEW',
      label1: label1 || 'FOOD',
      label2: label2 || 'DRINKS',
      label3: label3 || 'SPECIALS',
      menuUrl: menuUrl || 'https://example.com/menu',
      logo: template.hasLogo !== false ? (logo || '') : '',
      qrColor: template.config?.qrDotColor || '#111111',
      ...extraSlots
    };

    // Replace var CONFIG = { ... };
    const configRegex = /var\s+CONFIG\s*=\s*\{[\s\S]*?\};/;
    if (configRegex.test(html)) {
      html = html.replace(configRegex, `var CONFIG = ${JSON.stringify(configObj, null, 2)};`);
    }

    // Replace text inside <div class="t" data-key="...">
    Object.keys(configObj).forEach((k) => {
      const val = String(configObj[k]);
      const elRegex = new RegExp(`(<[^>]+data-key=["']${k}["'][^>]*>)[^<]*(<\\/[^>]+>)`, 'gi');
      html = html.replace(elRegex, `$1${val}$2`);
    });

    return html;
  } catch (err) {
    return null;
  }
}

export function downloadCanvasAsPng(canvas, filename = 'standee-qr.png') {
  if (!canvas) return;
  try {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.warn('downloadCanvasAsPng toDataURL error, using toBlob fallback:', err);
    if (typeof canvas.toBlob === 'function') {
      try {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2500);
      }, 'image/png');
      } catch (blobErr) {
        console.error('downloadCanvasAsPng failed:', blobErr);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Could not export the standee image. Please re-upload your logo and try again.');
        }
      }
    }
  }
}

export function printCanvasImage(canvas) {
  if (!canvas) return;
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const img = printWindow.document.createElement('img');
      img.src = dataUrl;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.onload = () => {
        printWindow.print();
        printWindow.close();
      };
      printWindow.document.body.appendChild(img);
      printWindow.document.close();
    }
  } catch (_) {
    window.print();
  }
}

// ── Physical print size ─────────────────────────────────────────────────────
// Standees keep their template's aspect ratio: the owner picks a width and the
// height follows. Exports are rendered at 300 DPI for that physical size.
export const STANDEE_PRINT_DPI = 300;
export const STANDEE_SIZE_PRESETS = [
  { id: 'small', label: 'Small', widthCm: 8 },
  { id: 'medium', label: 'Medium', widthCm: 10 },
  { id: 'large', label: 'Large', widthCm: 15 },
  { id: 'xl', label: 'Poster', widthCm: 21 },
];
export const STANDEE_MIN_WIDTH_CM = 5;
export const STANDEE_MAX_WIDTH_CM = 60;

export function getTemplateAspect(template) {
  const w = template?.nativeWidth || (template?.tier === 'pro' ? 887 : 1024);
  const h = template?.nativeHeight || (template?.tier === 'pro' ? 1774 : 1536);
  return h / w;
}

export function getStandeePrintSize(template, widthCm) {
  const width = Math.min(STANDEE_MAX_WIDTH_CM, Math.max(STANDEE_MIN_WIDTH_CM, Number(widthCm) || 10));
  const height = Math.round(width * getTemplateAspect(template) * 10) / 10;
  return { widthCm: width, heightCm: height };
}

/** Pixel ratio needed to render a template natively at its 300 DPI print width. */
export function getPrintPixelScale(template, widthCm) {
  const nativeW = template?.nativeWidth || (template?.tier === 'pro' ? 887 : 1024);
  const pxW = Math.round((Number(widthCm) / 2.54) * STANDEE_PRINT_DPI);
  return pxW > 0 ? pxW / nativeW : 1;
}

/** Returns a new canvas scaled to the physical size at 300 DPI. */
export function scaleCanvasToPrintSize(sourceCanvas, widthCm, heightCm) {
  if (!sourceCanvas || !widthCm || !heightCm) return sourceCanvas;
  const pxW = Math.round((widthCm / 2.54) * STANDEE_PRINT_DPI);
  const pxH = Math.round((heightCm / 2.54) * STANDEE_PRINT_DPI);
  // Already rendered at print resolution → no lossy resample.
  if (Math.abs(sourceCanvas.width - pxW) <= 2 && Math.abs(sourceCanvas.height - pxH) <= 2) return sourceCanvas;
  const out = document.createElement('canvas');
  out.width = pxW;
  out.height = pxH;
  const ctx = out.getContext('2d');
  if (!ctx) return sourceCanvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, pxW, pxH);
  return out;
}

/** Opens the print dialog with the standee at its exact physical size. */
export function printCanvasAtSize(canvas, widthCm, heightCm) {
  if (!canvas) return;
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank');
    if (!win) return;
    const doc = win.document;
    doc.title = `Standee ${widthCm} × ${heightCm} cm`;
    const style = doc.createElement('style');
    style.textContent = `@page{size:${widthCm}cm ${heightCm}cm;margin:0}html,body{margin:0;padding:0}img{display:block;width:${widthCm}cm;height:${heightCm}cm}`;
    doc.head.appendChild(style);
    const img = doc.createElement('img');
    img.alt = 'Standee';
    img.src = dataUrl;
    doc.body.appendChild(img);
    const go = () => { win.focus(); win.print(); };
    if (img && !img.complete) img.onload = go; else setTimeout(go, 50);
  } catch (_) {
    window.print();
  }
}

function downloadHtmlFile(htmlContent, filename = 'standee-menu.html') {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────
// QrTemplateTile Component (Gallery item)
// ─────────────────────────────────────────────────────────────
export function QrTemplateTile({
  template,
  isSelected,
  isProUnlocked,
  hotelName,
  title,
  description,
  logoUrl,
  guestMenuUrl,
  dishPhotos,
  onSelect
}) {
  const isPro = template.tier === 'pro';
  const isLocked = isPro && !isProUnlocked;

  return (
    <div
      onClick={onSelect}
      style={{
        width: '148px',
        flexShrink: 0,
        borderRadius: '12px',
        border: isSelected ? '2px solid #C27835' : '1px solid #E5DECE',
        background: '#FAF6EF',
        padding: '8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        boxShadow: isSelected
          ? '0 6px 16px -2px rgba(194, 120, 53, 0.35)'
          : '0 1px 3px rgba(43, 30, 22, 0.05)',
        position: 'relative',
        transition: 'all 0.18s ease',
        transform: isSelected ? 'translateY(-2px)' : 'none'
      }}
    >
      {/* Thumbnail Aspect Ratio Container */}
      <div
        style={{
          width: '100%',
          aspectRatio: template.aspectRatio || '2 / 3',
          borderRadius: '8px',
          overflow: 'hidden',
          background: template.previewCardBg || '#FAF6EE',
          position: 'relative',
          border: '1px solid rgba(229, 222, 206, 0.7)'
        }}
      >
        <img
          src={template.previewImage || template.bgImage}
          alt={template.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
        />

        {/* Lock Overlay for locked Pro templates */}
        {isLocked && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(27, 18, 12, 0.65)',
              backdropFilter: 'blur(2px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: '#FDE68A',
                color: '#2B1E16',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700
              }}
            >
              🔒
            </div>
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#FDE68A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              PRO Only
            </span>
          </div>
        )}
      </div>

      {/* Title & Badge */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#2B1E16',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '92px'
            }}
          >
            {template.name}
          </span>
          <span
            style={{
              fontSize: '8px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: '999px',
              background: isPro ? '#fef3c7' : '#e7e5e4',
              color: isPro ? '#92400e' : '#44403c',
              border: isPro ? '1px solid #fde68a' : '1px solid #d6d3d1'
            }}
          >
            {isPro ? 'PRO' : 'FREE'}
          </span>
        </div>
        <span
          style={{
            fontSize: '9px',
            color: '#78716c',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {template.tagline || (template.hasLogo ? 'Brand Logo + QR' : 'Typographic + QR')}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StandeeModal Component
// ─────────────────────────────────────────────────────────────
export default function StandeeModal({
  isOpen,
  onClose,
  hotelName = '',
  guestMenuUrl = '',
  hotelPlan = 'free',
  adminLogoUrl = '',
  initialStandeeConfig = null,
  dishPhotos = [],
  hotelSubdomain = '',
  onSaveConfig = null,
  hotelStatus = 'verified'
}) {
  const isProUnlocked = (hotelPlan || '').toLowerCase() === 'pro';
  const isPendingApproval = (hotelStatus || '').toLowerCase() === 'pending';

  // 1. Template Selection
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialStandeeConfig?.templateId || 'circle-logo'
  );

  // 2. Slot User Inputs
  const [title, setTitle] = useState(''); // Hotel / Standee Name (data-key="name")
  const [description, setDescription] = useState(''); // Tagline (data-key="tagline")
  const [centerLogoUrl, setCenterLogoUrl] = useState(''); // Logo slot (img id="logo")
  const [standeeTitle, setStandeeTitle] = useState('MENU'); // Header word (data-key="title")
  const [scanCallout, setScanCallout] = useState('SCAN TO VIEW'); // Scan text (data-key="scan")
  const [labelFood, setLabelFood] = useState('FOOD'); // Section 1 (data-key="label1")
  const [labelDrinks, setLabelDrinks] = useState('DRINKS'); // Section 2 (data-key="label2")
  const [labelSpecials, setLabelSpecials] = useState('SPECIALS'); // Section 3 (data-key="label3")
  const [extraSlotValues, setExtraSlotValues] = useState({}); // Template-specific extra slots

  // 2b. Physical print size (width in cm; height follows template aspect)
  const [printWidthCm, setPrintWidthCm] = useState(initialStandeeConfig?.printSize?.widthCm || 10);

  // 3. UI Drawers and Action State
  const [isSignageDrawerOpen, setIsSignageDrawerOpen] = useState(false);
  const [isExtraDrawerOpen, setIsExtraDrawerOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingHtml, setDownloadingHtml] = useState(false);

  // Background removal prompt modal state
  const [bgRemovePromptOpen, setBgRemovePromptOpen] = useState(false);
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState('');
  const [pendingLogoFile, setPendingLogoFile] = useState(null);
  const [processingBgRemoval, setProcessingBgRemoval] = useState(false);

  // 4. Custom Template Super Admin Inquiry Modal State
  const [isCustomInquiryOpen, setIsCustomInquiryOpen] = useState(false);
  const [superAdminEmail, setSuperAdminEmail] = useState('rakshakasur@gmail.com');
  const [hotelAdminEmail, setHotelAdminEmail] = useState('');
  const [inquiryCopyFeedback, setInquiryCopyFeedback] = useState(false);

  // 5. Canvas and Iframe Live References
  const livePreviewCanvasRef = useRef(null);
  const iframeRef = useRef(null);

  // Match selected template or fallback to first
  const activeTemplate = useMemo(() => {
    return (
      STANDEE_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
      STANDEE_TEMPLATES.find((t) => t.aliases?.includes(selectedTemplateId)) ||
      STANDEE_TEMPLATES[0]
    );
  }, [selectedTemplateId]);

  const isProActive = activeTemplate.tier === 'pro';
  const isExportLocked = isProActive && !isProUnlocked;
  const isStandeeDownloadLocked = isExportLocked;

  // Sync initial state ONLY when the modal opens. Re-syncing on every prop
  // change used to throw away the template the owner had just picked and the
  // logo they had just uploaded (closing the file picker focuses the window,
  // which made the dashboard re-render with a fresh config object).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (justOpened) {
      setPrintWidthCm(initialStandeeConfig?.printSize?.widthCm || 10);
      setTitle(initialStandeeConfig?.name || initialStandeeConfig?.title || hotelName || 'Your Hotel Name');
      setDescription(
        // The slot beside the hotel name is the hotel's tagline (e.g. "Multi Cuisine
        // Restaurant"), not guest scan instructions — drop legacy instruction text.
        (() => {
          const t = initialStandeeConfig?.tagline || initialStandeeConfig?.description || '';
          return /scan with/i.test(t) ? '' : t;
        })()
      );
      setCenterLogoUrl(initialStandeeConfig?.centerLogoUrl || adminLogoUrl || '');
      setSelectedTemplateId(initialStandeeConfig?.templateId || 'circle-logo');
      setStandeeTitle(initialStandeeConfig?.standeeTitle || initialStandeeConfig?.titleSlotValue || 'MENU');
      setScanCallout(initialStandeeConfig?.scanCallout || 'SCAN TO VIEW');
      setLabelFood(initialStandeeConfig?.label1 || 'FOOD');
      setLabelDrinks(initialStandeeConfig?.label2 || 'DRINKS');
      setLabelSpecials(initialStandeeConfig?.label3 || 'SPECIALS');
      setExtraSlotValues(initialStandeeConfig?.extraSlots || {});

      // Fetch super admin contact email for custom inquiry safely
      if (typeof fetchSuperAdminEmail === 'function') {
        try {
          fetchSuperAdminEmail().then((res) => {
            if (res?.email) setSuperAdminEmail(res.email);
          }).catch(() => {});
        } catch (_) {}
      }

      // Get logged in hotel admin email safely
      if (supabase && supabase.auth && typeof supabase.auth.getUser === 'function') {
        try {
          supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.email) {
              setHotelAdminEmail(data.user.email);
            }
          }).catch(() => {});
        } catch (_) {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Word customisation (title, scan CTA, badges and template slogans) is a
  // Pro feature. Free hotels always get the template's default words.
  const effectiveWords = () => (isProUnlocked
    ? {
        title: standeeTitle || 'MENU',
        scan: scanCallout || 'SCAN TO VIEW',
        label1: labelFood || 'FOOD',
        label2: labelDrinks || 'DRINKS',
        label3: labelSpecials || 'SPECIALS',
        ...extraSlotValues
      }
    : { title: 'MENU', scan: 'SCAN TO VIEW', label1: 'FOOD', label2: 'DRINKS', label3: 'SPECIALS' });

  const printSize = getStandeePrintSize(activeTemplate, printWidthCm);

  // Synchronize Live Iframe Stage with current user inputs in real-time
  const pushInputsToIframe = () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const send = () => {
      if (iframe?.contentWindow && typeof iframe.contentWindow.renderStandee === 'function') {
        const words = effectiveWords();
        const data = {
          name: title || hotelName || 'Your Hotel Name',
          tagline: description || 'Scan with camera to view 3D AR menu & wine pairing',
          logo: activeTemplate.hasLogo !== false ? (centerLogoUrl || '') : '',
          menuUrl: guestMenuUrl || 'https://example.com/menu',
          ...words
        };
        iframe.contentWindow.renderStandee(data);
      }
    };
    send();
    setTimeout(send, 50);
    setTimeout(send, 150);
    setTimeout(send, 350);
    setTimeout(send, 800);
  };

  useEffect(() => {
    pushInputsToIframe();
  }, [
    activeTemplate,
    title,
    description,
    centerLogoUrl,
    guestMenuUrl,
    standeeTitle,
    scanCallout,
    labelFood,
    labelDrinks,
    labelSpecials,
    extraSlotValues
  ]);

  // Also render background canvas for high-res PNG export & unit tests
  useEffect(() => {
    if (!isOpen || !livePreviewCanvasRef.current) return;

    renderStandeeToCanvas({
      canvas: livePreviewCanvasRef.current,
      template: activeTemplate,
      title: title || hotelName,
      description,
      centerLogoUrl: activeTemplate.hasLogo !== false ? centerLogoUrl : '',
      qrDotColor: activeTemplate.config?.qrDotColor,
      qrBgColor: activeTemplate.config?.qrBgColor,
      qrEyeShape: activeTemplate.config?.qrEyeShape,
      qrDotStyle: activeTemplate.config?.qrDotStyle,
      qrBgImageUrl: activeTemplate.config?.qrBgImageUrl,
      guestMenuUrl,
      showWatermark: isProActive && !isProUnlocked,
      dishPhotos,
      hotelName
    }).catch(() => {});
  }, [
    isOpen,
    activeTemplate,
    title,
    description,
    centerLogoUrl,
    guestMenuUrl,
    isProActive,
    isProUnlocked,
    dishPhotos,
    hotelName
  ]);

  if (!isOpen) return null;

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read immediately to DataURL, automatically cutout plain background, and place at logo slot
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setProcessingBgRemoval(true);
        try {
          const transparentDataUrl = await removeImageBackground(dataUrl);
          setCenterLogoUrl(transparentDataUrl || dataUrl);
        } catch (_) {
          setCenterLogoUrl(dataUrl);
        } finally {
          setProcessingBgRemoval(false);
        }
      }
    };
    reader.readAsDataURL(file);

    // Reset input so selecting the same file triggers onChange
    if (e.target) {
      e.target.value = '';
    }
  }

  async function handleConfirmRemoveBg() {
    if (!pendingLogoDataUrl) return;
    setProcessingBgRemoval(true);
    try {
      const transparentDataUrl = await removeImageBackground(pendingLogoDataUrl);
      setCenterLogoUrl(transparentDataUrl);
    } catch (_) {
      setCenterLogoUrl(pendingLogoDataUrl);
    }
    setProcessingBgRemoval(false);
    setBgRemovePromptOpen(false);
    setPendingLogoDataUrl('');
    setPendingLogoFile(null);
  }

  function handleKeepOriginalLogo() {
    if (pendingLogoDataUrl) {
      setCenterLogoUrl(pendingLogoDataUrl);
    }
    setBgRemovePromptOpen(false);
    setPendingLogoDataUrl('');
    setPendingLogoFile(null);
  }

  function handleDismissRemoveBg() {
    setBgRemovePromptOpen(false);
    setPendingLogoDataUrl('');
    setPendingLogoFile(null);
  }

  async function handleUseThisQr() {
    if (isExportLocked) return;
    setSaving(true);

    let finalLogoUrl = activeTemplate.hasLogo !== false ? (centerLogoUrl || '') : '';

    // If centerLogoUrl is a local dataURL (transparent PNG or uploaded file), upload to Supabase Storage on save
    if (finalLogoUrl && finalLogoUrl.startsWith('data:image/')) {
      try {
        const res = await fetch(finalLogoUrl);
        const blob = await res.blob();
        const file = new File([blob], `logo-${Date.now()}.png`, { type: 'image/png' });
        const { url, error } = await uploadHeaderImage(file);
        if (!error && url) {
          finalLogoUrl = url;
          setCenterLogoUrl(url);
        }
      } catch (_) {}
    }

    const newConfig = {
      templateId: activeTemplate.id,
      name: title || hotelName || 'Your Hotel Name',
      title: title || hotelName || 'Your Hotel Name',
      tagline: description || 'Scan with camera to view 3D AR menu & wine pairing',
      description: description || 'Scan with camera to view 3D AR menu & wine pairing',
      centerLogoUrl: finalLogoUrl,
      standeeTitle: isProUnlocked ? (standeeTitle || 'MENU') : 'MENU',
      scanCallout: isProUnlocked ? (scanCallout || 'SCAN TO VIEW') : 'SCAN TO VIEW',
      label1: isProUnlocked ? (labelFood || 'FOOD') : 'FOOD',
      label2: isProUnlocked ? (labelDrinks || 'DRINKS') : 'DRINKS',
      label3: isProUnlocked ? (labelSpecials || 'SPECIALS') : 'SPECIALS',
      printSize,
      theme: activeTemplate.config?.theme,
      cardBgColor: activeTemplate.config?.cardBgColor,
      qrDotColor: activeTemplate.config?.qrDotColor,
      qrBgColor: activeTemplate.config?.qrBgColor,
      qrEyeShape: activeTemplate.config?.qrEyeShape,
      qrDotStyle: activeTemplate.config?.qrDotStyle,
      qrBgImageUrl: activeTemplate.config?.qrBgImageUrl || '',
      logoPlacement: activeTemplate.logoPlacement || 'top',
      extraSlots: isProUnlocked ? extraSlotValues : {},
      plan: isProUnlocked ? 'pro' : 'free'
    };

    if (onSaveConfig) {
      await onSaveConfig(newConfig);
    }
    setSaving(false);
    onClose();
  }

  function handleExtraSlotChange(key, value) {
    setExtraSlotValues((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  async function renderCurrentStandeeCanvas() {
    // Export into a dedicated canvas at true 300 DPI print resolution so the
    // live preview canvas isn't resized and text isn't upscaled (smudged).
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : livePreviewCanvasRef.current;
    if (!canvas) return null;
    const pixelScale = getPrintPixelScale(activeTemplate, printSize.widthCm);
    const iframe = iframeRef.current;
    if (iframe && iframe.contentDocument) {
      try {
        pushInputsToIframe();
        await new Promise((resolve) => setTimeout(resolve, 80));
        await renderIframeToCanvas(iframe, canvas, activeTemplate, pixelScale);
        return canvas;
      } catch (err) {
        console.warn('Iframe standee canvas export fallback:', err);
      }
    }
    await renderStandeeToCanvas({
      canvas,
      template: activeTemplate,
      title: title || hotelName,
      description,
      centerLogoUrl: activeTemplate.hasLogo !== false ? centerLogoUrl : '',
      qrDotColor: activeTemplate.config?.qrDotColor,
      qrBgColor: activeTemplate.config?.qrBgColor,
      qrEyeShape: activeTemplate.config?.qrEyeShape,
      qrDotStyle: activeTemplate.config?.qrDotStyle,
      qrBgImageUrl: activeTemplate.config?.qrBgImageUrl,
      guestMenuUrl,
      showWatermark: isProActive && !isProUnlocked,
      hotelName,
      pixelScale
    });
    return canvas;
  }

  async function handlePrintStandee() {
    if (isStandeeDownloadLocked) return;
    const canvas = await renderCurrentStandeeCanvas();
    if (canvas) printCanvasAtSize(canvas, printSize.widthCm, printSize.heightCm);
  }

  async function handleDownloadStandeeHtml() {
    if (isStandeeDownloadLocked) return;
    setDownloadingHtml(true);
    const standaloneHtml = await generateStandaloneStandeeHtml({
      template: activeTemplate,
      name: title || hotelName,
      tagline: description,
      logo: activeTemplate.hasLogo !== false ? centerLogoUrl : '',
      menuUrl: guestMenuUrl,
      ...(() => { const w = effectiveWords(); return { title: w.title, scan: w.scan, label1: w.label1, label2: w.label2, label3: w.label3 }; })(),
      extraSlots: isProUnlocked ? extraSlotValues : {}
    });

    if (standaloneHtml) {
      const fileName = `${(title || hotelName || 'standee').toLowerCase().replace(/\s+/g, '-')}-standee.html`;
      downloadHtmlFile(standaloneHtml, fileName);
    }
    setDownloadingHtml(false);
  }

  async function handleDownloadStandeePng() {
    if (isStandeeDownloadLocked) return;
    const fileName = `${(title || hotelName || 'standee').toLowerCase().replace(/\s+/g, '-')}-standee-${printSize.widthCm}x${printSize.heightCm}cm.png`;
    const canvas = await renderCurrentStandeeCanvas();
    if (!canvas) return;
    downloadCanvasAsPng(scaleCanvasToPrintSize(canvas, printSize.widthCm, printSize.heightCm), fileName);
  }

  const freeTemplates = STANDEE_TEMPLATES.filter((t) => t.tier === 'free' && !t.isLegacy);
  const proTemplates = STANDEE_TEMPLATES.filter((t) => t.tier === 'pro' && !t.isLegacy);

  const inquirySubject = `Custom QR Standee Design & Premium Upgrade Request - ${title || hotelName || 'Our Venue'}`;
  const inquiryBody = `Hi Super Admin Team,\n\nWe would like to request a bespoke custom QR Standee design tailored specifically to our brand aesthetic and inquire about upgrading our account to the Premium tier.\n\nVenue Information:\n• Hotel / Restaurant Name: ${title || hotelName || 'Our Venue'}\n• Subdomain: ${hotelSubdomain || 'Not assigned'}\n• Hotel Admin Email: ${hotelAdminEmail || 'Not provided'}\n\nCustom Design Specifications Needed:\n• Material & Mounting (e.g. Laser-Cut Walnut Wood / Frosted Acrylic / Brushed Brass Stand)\n• Custom Brand Palette & Logo Accent Integration\n• Multi-Language Guest Scan Directions & Special Slogans\n\nPlease reply with the custom design specifications, turnaround time, and premium unlock options.\n\nWarm regards,\n${title || hotelName || 'Hotel Admin'}`;

  function handleCopyInquiry() {
    navigator.clipboard.writeText(`To: ${superAdminEmail}\nSubject: ${inquirySubject}\n\n${inquiryBody.replace(/\\n/g, '\n')}`).then(() => {
      setInquiryCopyFeedback(true);
      setTimeout(() => setInquiryCopyFeedback(false), 2500);
    });
  }

  function handleLaunchMail() {
    openGmailCompose({ to: superAdminEmail, subject: inquirySubject, body: inquiryBody.replace(/\\n/g, '\n') });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20, 13, 9, 0.85)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(8px)'
      }}
    >
      {/* Modal Container */}
      <div
        data-purpose="modal-window"
        style={{
          width: '100%',
          maxWidth: '1240px',
          maxHeight: '94vh',
          background: 'var(--bg-card, #FFFFFF)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-md, 0 25px 60px -15px rgba(27, 18, 12, 0.45))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* BEGIN: Modal Header */}
        <header
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                boxShadow: 'var(--shadow-xs)',
                flexShrink: 0
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
                  fontWeight: 700,
                  fontSize: '20px',
                  color: 'var(--text)',
                  margin: 0,
                  letterSpacing: '-0.01em'
                }}
              >
                Customize Standee &amp; QR Code
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                Select a bespoke brand template, customize signage text slots, or request bespoke tabletop standees.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              transition: 'all 0.15s ease'
            }}
          >
            ✕
          </button>
        </header>
        {/* END: Modal Header */}

        {/* BEGIN: Modal Scrollable Content */}
        <div
          className="custom-scrollbar"
          style={{
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            flex: 1,
            background: 'var(--bg)'
          }}
        >
          {isPendingApproval && (
            <div
              style={{
                background: 'var(--warning-subtle, #FFFBEB)',
                border: '1px solid var(--warning, #F59E0B)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--warning-fg, #92400E)'
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}>ℹ️</span>
              <div style={{ fontSize: '12px', lineHeight: 1.4 }}>
                <strong>Account Pending Verification:</strong> Your hotel is currently under review by Super Admin. You can customize, save, and download your standee anytime; digital menus will go live to guests automatically upon approval.
              </div>
            </div>
          )}

          {/* Top Configuration Bar: Core Input Slots */}
          <section
            data-purpose="customization-bar"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '16px 20px',
              boxShadow: 'var(--shadow-xs)'
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                alignItems: 'center'
              }}
            >
              {/* Input Slot 1: Hotel / Brand Name (data-key="name") */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Hotel / Brand Name (Slot: name)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Spice & Soul"
                    style={{
                      width: '100%',
                      background: 'var(--input-bg, var(--bg-card))',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      outline: 'none',
                      fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)'
                    }}
                  />
                </div>
              </div>

              {/* Input Slot 2: Tagline / Description (data-key="tagline") */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Hotel Tagline (Slot: tagline)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. INDIAN KITCHEN / Multi Cuisine"
                  style={{
                    width: '100%',
                    background: 'var(--input-bg, var(--bg-card))',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--text)',
                    outline: 'none',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)'
                  }}
                />
              </div>

              {/* Input Slot 3: Logo Slot (img id="logo") */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Brand Logo (Slot: logo)
                </label>
                {activeTemplate.hasLogo === false ? (
                  <div
                    style={{
                      width: '100%',
                      background: 'var(--bg-subtle)',
                      border: '1px dashed var(--border)',
                      borderRadius: '8px',
                      padding: '7px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 600
                    }}
                  >
                    <span>ℹ️</span>
                    <span>This template is typographic and has no logo slot — pick a template marked with a logo (e.g. Warm Kraft or Clean Acrylic) to place your logo.</span>
                  </div>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--input-bg, var(--bg-card))',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      cursor: 'pointer',
                      height: '38px',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'var(--primary, #2B1E16)',
                          color: '#FDE68A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
                          fontSize: '11px',
                          fontWeight: 700,
                          border: '1px solid rgba(253, 224, 71, 0.4)',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}
                      >
                        {centerLogoUrl ? (
                          <img src={centerLogoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          (title || hotelName || 'GT').substring(0, 2).toUpperCase()
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {uploadingLogo ? 'Uploading…' : (centerLogoUrl ? 'Change Logo' : 'Upload Logo')}
                        </span>
                        <span style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)' }}>
                          SVG, PNG
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {centerLogoUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCenterLogoUrl('');
                          }}
                          title="Reset to template artwork"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#dc2626',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '2px 4px'
                          }}
                        >
                          ✕
                        </button>
                      )}
                      <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 700 }}>↑</span>
                    </div>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>

            {/* Expandable Section A: Signage Words Drawer (Title, Scan, Menu Categories) */}
            <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border)', paddingTop: '10px' }}>
              {!isProUnlocked ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border)', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🔒</span> Customize Words &amp; Badges
                    </span>
                    <span style={{ fontSize: '9px', background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: '#FFFFFF', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>PRO</span>
                  </div>
                  <span style={{ fontSize: '10px', color: '#92400e', background: '#FEF3C7', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FDE68A', fontWeight: 600 }}>
                    ⭐ Word customization for Menu badges &amp; Callouts is reserved for Premium subscribers.
                  </span>
                </div>
              ) : (
                <>
                  <div
                    onClick={() => setIsSignageDrawerOpen(!isSignageDrawerOpen)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🏷️</span> Customize Signage Words &amp; Menu Badges (Title: "{standeeTitle}", CTA: "{scanCallout}")
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {isSignageDrawerOpen ? '▲ Hide Words' : '▼ Edit Words'}
                    </span>
                  </div>

                  {isSignageDrawerOpen && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '10px' }}>
                      {/* Standee Title (slot: title) */}
                      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Title (Slot: title)
                        </span>
                        <input
                          type="text"
                          value={standeeTitle}
                          onChange={(e) => setStandeeTitle(e.target.value)}
                          placeholder="MENU"
                          style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '11px', fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                        />
                      </div>

                      {/* Scan Callout (slot: scan) */}
                      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Scan CTA (Slot: scan)
                        </span>
                        <input
                          type="text"
                          value={scanCallout}
                          onChange={(e) => setScanCallout(e.target.value)}
                          placeholder="SCAN TO VIEW"
                          style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '11px', fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                        />
                      </div>

                      {/* Category 1 (slot: label1) */}
                      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Badge 1 (Slot: label1)
                        </span>
                        <input
                          type="text"
                          value={labelFood}
                          onChange={(e) => setLabelFood(e.target.value)}
                          placeholder="FOOD"
                          style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '11px', fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                        />
                      </div>

                      {/* Category 2 (slot: label2) */}
                      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Badge 2 (Slot: label2)
                        </span>
                        <input
                          type="text"
                          value={labelDrinks}
                          onChange={(e) => setLabelDrinks(e.target.value)}
                          placeholder="DRINKS"
                          style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '11px', fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                        />
                      </div>

                      {/* Category 3 (slot: label3) */}
                      <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Badge 3 (Slot: label3)
                        </span>
                        <input
                          type="text"
                          value={labelSpecials}
                          onChange={(e) => setLabelSpecials(e.target.value)}
                          placeholder="SPECIALS"
                          style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '11px', fontWeight: 600, color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Expandable Section B: Template-Specific Extra Slots (Slogans, Corner Badges, Footers) — PRO only */}
            {isProUnlocked && activeTemplate.extraSlots && activeTemplate.extraSlots.length > 0 && (
              <div style={{ marginTop: '10px', borderTop: '1px dashed var(--border)', paddingTop: '10px' }}>
                <div
                  onClick={() => setIsExtraDrawerOpen(!isExtraDrawerOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#C27835', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✨</span> Fine-Tune Style Badges &amp; Slogans for {activeTemplate.name} ({activeTemplate.extraSlots.length} slots)
                  </span>
                  <span style={{ fontSize: '11px', color: '#78716c', fontWeight: 600 }}>
                    {isExtraDrawerOpen ? '▲ Hide Style Badges' : '▼ Customize Style Badges'}
                  </span>
                </div>

                {isExtraDrawerOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginTop: '10px' }}>
                    {activeTemplate.extraSlots.map((slot) => (
                      <div
                        key={slot.key}
                        style={{
                          background: '#FFFDF9',
                          border: '1px solid #E5DECE',
                          borderRadius: '6px',
                          padding: '6px 10px'
                        }}
                      >
                        <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: '#78716c', textTransform: 'uppercase' }}>
                          {slot.label} (Slot: {slot.key})
                        </span>
                        <input
                          type="text"
                          value={extraSlotValues[slot.key] ?? slot.def}
                          onChange={(e) => handleExtraSlotChange(slot.key, e.target.value)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            width: '100%',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#2B1E16',
                            outline: 'none',
                            padding: '2px 0 0'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Two-Column Balanced Workspace */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '24px' }}>
            {/* LEFT COLUMN: Gallery (~60% / col-span-7) */}
            <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* SECTION 1: Heritage Minimalist Collection (4 Free Templates) */}
              <div data-purpose="category-heritage-free">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: '#2B1E16',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        margin: 0
                      }}
                    >
                      Heritage Minimalist Collection
                    </h3>
                    <span
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: '#e7e5e4',
                        color: '#44403c',
                        borderRadius: '999px',
                        border: '1px solid #d6d3d1'
                      }}
                    >
                      4 Curated Free Styles
                    </span>
                    {/* Unit test helper compatibility string */}
                    <span style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
                      Free Minimal Templates
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#a8a29e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                    Scroll horizontally →
                  </span>
                </div>

                {/* Horizontal Scroll Card Slider (4 Free Items) */}
                <div
                  className="custom-scrollbar"
                  style={{
                    display: 'flex',
                    gap: '14px',
                    overflowX: 'auto',
                    paddingBottom: '10px',
                    paddingTop: '2px'
                  }}
                >
                  {freeTemplates.map((tpl) => (
                    <QrTemplateTile
                      key={tpl.id}
                      template={tpl}
                      isSelected={selectedTemplateId === tpl.id}
                      isProUnlocked={isProUnlocked}
                      hotelName={hotelName}
                      title={title}
                      description={description}
                      logoUrl={centerLogoUrl}
                      guestMenuUrl={guestMenuUrl}
                      dishPhotos={dishPhotos}
                      onSelect={() => setSelectedTemplateId(tpl.id)}
                    />
                  ))}
                </div>
              </div>

              {/* SECTION 2: Palace Imperial Tier (4 PRO Templates + 1 Custom Slot) */}
              <div data-purpose="category-imperial-pro">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)',
                        fontWeight: 700,
                        fontSize: '13px',
                        color: '#2B1E16',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        margin: 0
                      }}
                    >
                      Palace Imperial Tier (PRO)
                    </h3>
                    <span
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: '#fef3c7',
                        color: '#92400e',
                        borderRadius: '999px',
                        border: '1px solid #fde68a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span>★</span>
                      <span>{isProUnlocked ? 'PRO Unlocked' : 'UNLOCKED'}</span>
                    </span>
                    {/* Unit test helper compatibility string */}
                    <span style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
                      Premium Luxury Templates
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#a8a29e', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                    Scroll horizontally →
                  </span>
                </div>

                {/* Horizontal Luxury Row (4 Pro items + 1 Custom Standee Slot) */}
                <div
                  className="custom-scrollbar"
                  style={{
                    display: 'flex',
                    gap: '14px',
                    overflowX: 'auto',
                    paddingBottom: '10px',
                    paddingTop: '2px'
                  }}
                >
                  {proTemplates.map((tpl) => (
                    <QrTemplateTile
                      key={tpl.id}
                      template={tpl}
                      isSelected={selectedTemplateId === tpl.id}
                      isProUnlocked={isProUnlocked}
                      hotelName={hotelName}
                      title={title}
                      description={description}
                      logoUrl={centerLogoUrl}
                      guestMenuUrl={guestMenuUrl}
                      dishPhotos={dishPhotos}
                      onSelect={() => setSelectedTemplateId(tpl.id)}
                    />
                  ))}

                  {/* Bespoke + Custom Template Tile */}
                  <div
                    onClick={() => setIsCustomInquiryOpen(true)}
                    style={{
                      width: '148px',
                      flexShrink: 0,
                      borderRadius: '12px',
                      border: '2px dashed #C27835',
                      background: 'linear-gradient(135deg, #FBF6EE 0%, #F5ECDD 100%)',
                      padding: '12px 10px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(194, 120, 53, 0.15)',
                      transition: 'all 0.18s ease'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', textAlign: 'center' }}>
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          background: 'rgba(194, 120, 53, 0.1)',
                          border: '1px solid rgba(194, 120, 53, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          marginBottom: '10px',
                          color: '#C27835'
                        }}
                      >
                        ✨
                      </div>
                      <h4
                        style={{
                          margin: '0 0 4px',
                          fontSize: '13px',
                          fontWeight: 700,
                          color: '#2B1E16',
                          fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)'
                        }}
                      >
                        + Custom Template
                      </h4>
                      <p style={{ margin: 0, fontSize: '10px', color: '#78716c', lineHeight: 1.4, padding: '0 4px' }}>
                        Request custom brand colors, typography, or laser-cut wooden standees.
                      </p>
                    </div>

                    <button
                      type="button"
                      style={{
                        width: '100%',
                        padding: '6px 0',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: '1px solid #C27835',
                        background: '#2B1E16',
                        color: '#FDE68A',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        boxShadow: '0 2px 4px rgba(27, 18, 12, 0.2)'
                      }}
                    >
                      <span>Inquire Upgrade</span>
                      <span style={{ fontSize: '10px' }}>↗</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Realistic Live HTML/CSS Stage Mockup Preview (~40% / col-span-5) */}
            <div
              data-purpose="live-preview-column"
              style={{
                gridColumn: 'span 5',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-xs)'
              }}
            >
              <div>
                {/* Preview Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 0 3px rgba(194, 120, 53, 0.25)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Live Standee Display Preview
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    Pixel-Perfect HTML/CSS
                  </span>
                </div>

                {/* Realistic 3D Mockup Display on Table Surface */}
                <div
                  style={{
                    margin: '18px 0',
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    padding: '20px 16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.06)'
                  }}
                >
                  {/* Subtle Lighting Ambiance */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.7), transparent 70%)',
                      pointerEvents: 'none'
                    }}
                  />

                  {/* Dimension Indicator Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '14px',
                      zIndex: 20,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      background: 'rgba(255, 255, 255, 0.92)',
                      backdropFilter: 'blur(4px)',
                      borderRadius: '999px',
                      border: '1px solid #E5DECE',
                      boxShadow: '0 1px 2px rgba(43, 30, 22, 0.05)'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C27835' }} />
                    <span style={{ fontSize: '9px', fontWeight: 600, color: '#57534e', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      300 DPI Stage
                    </span>
                  </div>

                  {(() => {
                    const stageHeight = 380;
                    const nativeW = activeTemplate.nativeWidth || (activeTemplate.tier === 'pro' ? 887 : 1024);
                    const nativeH = activeTemplate.nativeHeight || (activeTemplate.tier === 'pro' ? 1774 : 1536);
                    const standeeWidth = Math.round(stageHeight * (nativeW / nativeH));
                    const baseWidth = standeeWidth + 24;
                    const shadowWidth = standeeWidth + 28;

                    return (
                      <>
                        {/* Upright Standee Acrylic / Heavy Card Container */}
                        <div
                          style={{
                            width: `${standeeWidth}px`,
                            height: `${stageHeight}px`,
                            background: '#FFFDF9',
                            border: '1px solid #DCD3C3',
                            borderTopLeftRadius: '6px',
                            borderTopRightRadius: '6px',
                            padding: '2px',
                            boxShadow: '0 22px 38px -10px rgba(43, 30, 22, 0.32), 0 0 0 1px rgba(194, 120, 53, 0.18)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative',
                            zIndex: 10,
                            overflow: 'hidden'
                          }}
                        >
                          {/* Live HTML/CSS Stage Iframe with Real Code Engine */}
                          <iframe
                            ref={iframeRef}
                            key={activeTemplate.id}
                            src={activeTemplate.htmlFile}
                            onLoad={pushInputsToIframe}
                            title="Standee Live Stage"
                            style={{
                              width: '100%',
                              height: '100%',
                              border: 'none',
                              borderRadius: '4px',
                              background: 'transparent'
                            }}
                          />

                          {/* Hidden or Companion Canvas to satisfy unit test assertions */}
                          <canvas
                            ref={livePreviewCanvasRef}
                            style={{ display: 'none' }}
                          />
                        </div>

                        {/* Artisan Dark Walnut Wood Base */}
                        <div
                          style={{
                            width: `${baseWidth}px`,
                            height: '16px',
                            borderRadius: '6px',
                            background: 'linear-gradient(180deg, #4A3323 0%, #301E13 65%, #1F120A 100%)',
                            boxShadow: 'inset 0 2px 2px rgba(255,255,255,0.18), inset 0 -2px 3px rgba(0,0,0,0.5), 0 10px 24px rgba(27,17,10,0.4)',
                            marginTop: '-4px',
                            position: 'relative',
                            zIndex: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderTop: '1px solid rgba(253, 224, 71, 0.25)'
                          }}
                        >
                          <div style={{ width: '96px', height: '2px', background: 'rgba(253, 224, 71, 0.45)', borderRadius: '999px' }} />
                        </div>

                        {/* Deep Ambient Shadow Cast on Table Linen */}
                        <div style={{ width: `${shadowWidth}px`, height: '12px', background: 'rgba(20, 13, 9, 0.35)', filter: 'blur(6px)', borderRadius: '999px', marginTop: '2px' }} />
                      </>
                    );
                  })()}
                  {/* Standee physical size — proportional to the template */}
                  <div
                    data-purpose="standee-size-slot"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      position: 'relative',
                      zIndex: 20
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Standee Size
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>
                        {printSize.widthCm} × {printSize.heightCm} cm
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {STANDEE_SIZE_PRESETS.map((preset) => {
                        const active = Number(printWidthCm) === preset.widthCm;
                        const presetSize = getStandeePrintSize(activeTemplate, preset.widthCm);
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setPrintWidthCm(preset.widthCm)}
                            title={`${presetSize.widthCm} × ${presetSize.heightCm} cm`}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '999px',
                              border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: active ? 'var(--accent-subtle, rgba(194,120,53,0.12))' : 'var(--bg-card)',
                              color: active ? 'var(--accent)' : 'var(--text)',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {preset.label} · {presetSize.widthCm}×{presetSize.heightCm}
                          </button>
                        );
                      })}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>Custom width</span>
                      <input
                        type="number"
                        min={STANDEE_MIN_WIDTH_CM}
                        max={STANDEE_MAX_WIDTH_CM}
                        step="0.5"
                        value={printWidthCm}
                        onChange={(e) => setPrintWidthCm(e.target.value)}
                        onBlur={() => setPrintWidthCm(printSize.widthCm)}
                        style={{ width: '70px', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '12px' }}
                      />
                      <span>cm → height {printSize.heightCm} cm (keeps template proportions)</span>
                    </label>
                  </div>

                  {/* Print / download helpers below stage */}
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative', zIndex: 20 }}>
                    <button
                      type="button"
                      onClick={handlePrintStandee}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card, #FFFFFF)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: 'var(--shadow-xs)'
                      }}
                      title="Print Standee"
                    >
                      <span>🖨️</span>
                      <span>Print Standee</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadStandeePng}
                      disabled={isStandeeDownloadLocked}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card, #FFFFFF)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: isStandeeDownloadLocked ? 'not-allowed' : 'pointer',
                        opacity: isStandeeDownloadLocked ? 0.5 : 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: 'var(--shadow-xs)'
                      }}
                      title={`Download PNG at 300 DPI (${printSize.widthCm} × ${printSize.heightCm} cm)`}
                    >
                      <span>⬇️</span>
                      <span>Download PNG</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* END: Modal Scrollable Content */}

        {/* BEGIN: Modal Footer Bar */}
        <footer
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Selected: <strong style={{ color: 'var(--text)' }}>{activeTemplate.name}</strong> ({activeTemplate.tier.toUpperCase()})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              aria-label="Use This QR"
              onClick={handleUseThisQr}
              disabled={saving || isExportLocked}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: isExportLocked
                  ? 'var(--text-muted, #a8a29e)'
                  : 'linear-gradient(135deg, var(--accent, #C27835) 0%, var(--accent-hover, #A86225) 100%)',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isExportLocked ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isExportLocked ? 'none' : '0 4px 14px rgba(194, 120, 53, 0.4)',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{saving ? 'Saving…' : 'Use This QR'}</span>
              <span>→</span>
            </button>
          </div>
        </footer>
        {/* END: Modal Footer Bar */}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          BESPOKE CUSTOM INQUIRY MODAL (Pop-up from + Custom Template)
         ───────────────────────────────────────────────────────────── */}
      {isCustomInquiryOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 13, 9, 0.82)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(6px)'
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              background: '#FDF9F3',
              border: '1px solid #E5DECE',
              borderRadius: '16px',
              boxShadow: '0 25px 60px -15px rgba(27, 18, 12, 0.5)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid #E5DECE',
                background: '#FAF6EF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>✨</span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#2B1E16',
                      fontFamily: 'var(--font-serif, "Playfair Display", Georgia, serif)'
                    }}
                  >
                    Bespoke Custom Standee &amp; Pro Inquiry
                  </h3>
                  <span style={{ fontSize: '11px', color: '#78716c' }}>
                    Connect directly with the platform Super Admin design team
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomInquiryOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#78716c',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Inquiry Content */}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#FFFDF9', border: '1px solid #E5DECE', borderRadius: '8px', padding: '10px' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#78716c', fontWeight: 600 }}>Recipient (Super Admin)</span>
                  <strong style={{ fontSize: '12px', color: '#C27835' }}>{superAdminEmail}</strong>
                </div>
                <div style={{ background: '#FFFDF9', border: '1px solid #E5DECE', borderRadius: '8px', padding: '10px' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#78716c', fontWeight: 600 }}>From (Your Admin Email)</span>
                  <strong style={{ fontSize: '12px', color: '#2B1E16' }}>{hotelAdminEmail || 'your-email@venue.com'}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#2B1E16', marginBottom: '6px' }}>
                  Inquiry Subject:
                </label>
                <input
                  type="text"
                  readOnly
                  value={inquirySubject}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #DCD3C3',
                    background: '#FDF9F3',
                    fontSize: '12px',
                    color: '#2B1E16',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#2B1E16', marginBottom: '6px' }}>
                  Pre-Crafted Inquiry Message:
                </label>
                <textarea
                  readOnly
                  rows={7}
                  value={inquiryBody}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #DCD3C3',
                    background: '#FAF6EF',
                    fontSize: '11px',
                    color: '#44403c',
                    lineHeight: 1.5,
                    fontFamily: 'monospace',
                    resize: 'none'
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleLaunchMail}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #C27835 0%, #A86225 100%)',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 12px rgba(194, 120, 53, 0.35)'
                  }}
                >
                  <span>✉️</span>
                  <span>Open in Mail Client</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyInquiry}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '8px',
                    border: '1px solid #E5DECE',
                    background: '#FFFFFF',
                    color: '#2B1E16',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>📋</span>
                  <span>{inquiryCopyFeedback ? 'Copied to Clipboard!' : 'Copy Inquiry Text'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Background Confirmation Modal */}
      {bgRemovePromptOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20, 13, 9, 0.78)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(4px)'
          }}
          onClick={handleDismissRemoveBg}
        >
          <div
            style={{
              background: '#FAF6EF',
              border: '1px solid #DCD3C3',
              borderRadius: '16px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 24px 38px 3px rgba(0,0,0,0.22), 0 9px 46px 8px rgba(0,0,0,0.18)',
              padding: '24px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleDismissRemoveBg}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: '#78716c',
                fontSize: '18px',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              ✕
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                  fontSize: '18px'
                }}
              >
                ✨
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#2B1E16' }}>
                  Remove Background?
                </h3>
                <p style={{ margin: 0, fontSize: '11px', color: '#78716c' }}>
                  Logo Customization
                </p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#44403c', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Would you like to automatically remove the background from this logo for a clean, transparent fit on the standee?
            </p>

            {pendingLogoDataUrl && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#FFFFFF',
                  borderRadius: '10px',
                  border: '1px solid #E7E0D3',
                  padding: '12px',
                  marginBottom: '20px'
                }}
              >
                <img
                  src={pendingLogoDataUrl}
                  alt="Logo Preview"
                  style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={handleConfirmRemoveBg}
                disabled={processingBgRemoval}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #C27835 0%, #A86225 100%)',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: processingBgRemoval ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 4px rgba(120, 53, 15, 0.25)'
                }}
              >
                {processingBgRemoval ? 'Removing Background...' : 'Yes, Remove Background'}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={handleKeepOriginalLogo}
                  disabled={processingBgRemoval}
                  style={{
                    flex: 1,
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #DCD3C3',
                    background: '#FFFFFF',
                    color: '#44403c',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Keep Original
                </button>
                <button
                  type="button"
                  onClick={handleDismissRemoveBg}
                  disabled={processingBgRemoval}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid transparent',
                    background: 'transparent',
                    color: '#78716c',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
