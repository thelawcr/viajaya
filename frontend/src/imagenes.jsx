import { useState } from 'react';

/** "Muelle de Cahuita" -> "muelle-de-cahuita" (sin tildes). Las fotos están en public/destinos/<slug>.jpg */
export const slug = (t = '') => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const BASE = import.meta.env.BASE_URL || '/';
export const urlFoto = (nombre) => `${BASE}destinos/${slug(nombre)}.jpg`;
export const urlPortada = `${BASE}portada.jpg`;

const PALETAS = [['#53a8ff', '#0878c9'], ['#2bb5a0', '#0b7a75'], ['#f3a54a', '#d9622b'], ['#8b7bf0', '#4f46c8'], ['#4cc38a', '#168a5b']];

/** Foto del destino; si no existe (destino nuevo) muestra una portada de color con ícono. */
export function FotoDestino({ nombre, className = '' }) {
  const [falla, setFalla] = useState(false);
  if (falla) {
    const [a, b] = PALETAS[[...String(nombre)].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETAS.length];
    return <div className={`foto portada-color ${className}`} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} role="img" aria-label={nombre}><span aria-hidden="true">🌴</span></div>;
  }
  return <img className={`foto ${className}`} src={urlFoto(nombre)} alt={nombre} loading="lazy" onError={() => setFalla(true)} />;
}

export function Logo({ size = 34 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#53a8ff" /><stop offset="1" stopColor="#0878c9" /></linearGradient></defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path fill="#fff" d="M32 11c-8.3 0-15 6.5-15 14.6C17 36.6 32 49 32 49s15-12.4 15-23.4C47 17.5 40.3 11 32 11Z" />
      <path fill="#0878c9" d="M23 26.5c2.7-2.1 5.4-2.1 9 0s6.3 2.1 9 0c-.9 4.2-4.5 7-9 7s-8.1-2.8-9-7Z" />
      <path fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" d="M14 54c4.7-3 9.3-3 14 0s9.3 3 14 0 6.7-2 8-1" />
    </svg>
  );
}
