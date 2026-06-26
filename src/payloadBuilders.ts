import { QrProject, QrType, ValidationResult } from './types';

const normalize = (value?: string) => (value ?? '').trim();

const escapeVCard = (value?: string) => normalize(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

const escapeWifi = (value?: string) => normalize(value).replace(/([\\;,:"])/g, '\\$1');

const encodeParams = (params: Record<string, string>) =>
  Object.entries(params)
    .filter(([, value]) => normalize(value).length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

const ensureUrl = (url: string) => {
  const value = normalize(url);
  if (!value) {
    return '';
  }
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const buildUrlPayload = (url?: string) => ensureUrl(url ?? '');

const builders: Record<QrType, (fields: Record<string, string>) => string> = {
  url: (fields) => buildUrlPayload(fields.url),
  menu: (fields) => {
    const url = buildUrlPayload(fields.url);
    const table = normalize(fields.table);
    if (!table) {
      return url;
    }
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}table=${encodeURIComponent(table)}`;
  },
  app: (fields) => buildUrlPayload(fields.url),
  social: (fields) => buildUrlPayload(fields.url),
  payment: (fields) => buildUrlPayload(fields.url),
  text: (fields) => normalize(fields.text),
  phone: (fields) => `tel:${normalize(fields.phone)}`,
  sms: (fields) => {
    const phone = normalize(fields.phone);
    const message = normalize(fields.message);
    return message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}:`;
  },
  email: (fields) => {
    const email = normalize(fields.email);
    const params = encodeParams({ subject: normalize(fields.subject), body: normalize(fields.body) });
    return params ? `mailto:${email}?${params}` : `mailto:${email}`;
  },
  wifi: (fields) => {
    const security = normalize(fields.encryption).toUpperCase() || (normalize(fields.password) ? 'WPA' : 'nopass');
    return `WIFI:T:${escapeWifi(security)};S:${escapeWifi(fields.ssid)};P:${escapeWifi(fields.password)};;`;
  },
  contact: (fields) => {
    const firstName = escapeVCard(fields.firstName);
    const lastName = escapeVCard(fields.lastName);
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${lastName};${firstName};;;`,
      `FN:${fullName || firstName || lastName}`,
      normalize(fields.company) ? `ORG:${escapeVCard(fields.company)}` : '',
      normalize(fields.title) ? `TITLE:${escapeVCard(fields.title)}` : '',
      normalize(fields.phone) ? `TEL:${escapeVCard(fields.phone)}` : '',
      normalize(fields.email) ? `EMAIL:${escapeVCard(fields.email)}` : '',
      normalize(fields.website) ? `URL:${escapeVCard(buildUrlPayload(fields.website))}` : '',
      normalize(fields.address) ? `ADR:;;${escapeVCard(fields.address)};;;;` : '',
      'END:VCARD',
    ]
      .filter(Boolean)
      .join('\n');
  },
  event: (fields) =>
    [
      'BEGIN:VEVENT',
      `SUMMARY:${escapeVCard(fields.title)}`,
      `DTSTART:${normalize(fields.start)}`,
      `DTEND:${normalize(fields.end)}`,
      normalize(fields.location) ? `LOCATION:${escapeVCard(fields.location)}` : '',
      normalize(fields.description) ? `DESCRIPTION:${escapeVCard(fields.description)}` : '',
      'END:VEVENT',
    ]
      .filter(Boolean)
      .join('\n'),
  location: (fields) => {
    const query = normalize(fields.query);
    const coordinateMatch = query.match(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/);
    return coordinateMatch ? `geo:${query.replace(/\s+/g, '')}` : `https://maps.google.com/?q=${encodeURIComponent(query)}`;
  },
};

export const buildQrPayload = (project: Pick<QrProject, 'type' | 'fields'>) => builders[project.type](project.fields);

export const validateQrProject = (project: Pick<QrProject, 'type' | 'fields' | 'foreground' | 'background'>): ValidationResult => {
  const payload = buildQrPayload(project);
  if (!payload.trim()) {
    return { ok: false, message: 'Add the required content before generating.' };
  }

  const fields = project.fields;
  if (['url', 'menu', 'app', 'social', 'payment'].includes(project.type)) {
    try {
      const urlField = project.type === 'menu' ? fields.url : fields.url;
      new URL(buildUrlPayload(urlField));
    } catch {
      return { ok: false, message: 'Enter a valid URL.' };
    }
  }

  if (project.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalize(fields.email))) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  if (project.type === 'event' && (!normalize(fields.start) || !normalize(fields.end))) {
    return { ok: false, message: 'Event QR codes need start and end values.' };
  }

  if (project.foreground.toLowerCase() === project.background.toLowerCase()) {
    return { ok: false, message: 'Foreground and background colors must be different.' };
  }

  return { ok: true };
};
