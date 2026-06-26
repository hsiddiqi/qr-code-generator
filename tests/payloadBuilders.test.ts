import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQrPayload, validateQrProject } from '../src/payloadBuilders';
import { QrProject, QrType } from '../src/types';

const project = (type: QrType, fields: Record<string, string>): QrProject => ({
  id: 'test',
  name: 'Test QR',
  category: 'Test',
  type,
  fields,
  foreground: '#101820',
  background: '#FFFFFF',
  size: 512,
  errorCorrection: 'Q',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

test('builds URL payloads with https fallback', () => {
  assert.equal(buildQrPayload(project('url', { url: 'example.com' })), 'https://example.com');
});

test('builds menu payloads with optional table query', () => {
  assert.equal(buildQrPayload(project('menu', { url: 'https://cafe.test/menu', table: 'Patio 4' })), 'https://cafe.test/menu?table=Patio%204');
});

test('builds contact payloads as vCard', () => {
  const payload = buildQrPayload(project('contact', { firstName: 'Amina', lastName: 'Khan', email: 'amina@example.com', phone: '+15550100' }));
  assert.match(payload, /BEGIN:VCARD/);
  assert.match(payload, /FN:Amina Khan/);
  assert.match(payload, /EMAIL:amina@example.com/);
});

test('builds Wi-Fi payloads', () => {
  assert.equal(buildQrPayload(project('wifi', { ssid: 'Cafe Guest', password: 'secret', encryption: 'WPA' })), 'WIFI:T:WPA;S:Cafe Guest;P:secret;;');
});

test('builds communication payloads', () => {
  assert.equal(buildQrPayload(project('email', { email: 'hello@example.com', subject: 'Hi', body: 'There' })), 'mailto:hello@example.com?subject=Hi&body=There');
  assert.equal(buildQrPayload(project('phone', { phone: '+15550100' })), 'tel:+15550100');
  assert.equal(buildQrPayload(project('sms', { phone: '+15550100', message: 'Hello' })), 'SMSTO:+15550100:Hello');
});

test('builds event payloads', () => {
  const payload = buildQrPayload(project('event', { title: 'Launch', start: '20260715T180000', end: '20260715T210000', location: 'Hall' }));
  assert.match(payload, /BEGIN:VEVENT/);
  assert.match(payload, /DTSTART:20260715T180000/);
});

test('builds location payloads for coordinates and addresses', () => {
  assert.equal(buildQrPayload(project('location', { query: '24.8607, 67.0011' })), 'geo:24.8607,67.0011');
  assert.equal(buildQrPayload(project('location', { query: 'Karachi Port' })), 'https://maps.google.com/?q=Karachi%20Port');
});

test('validates required content and color contrast', () => {
  assert.equal(validateQrProject(project('text', { text: '' })).ok, false);
  assert.equal(validateQrProject({ ...project('text', { text: 'Hello' }), background: '#101820' }).ok, false);
  assert.equal(validateQrProject(project('text', { text: 'Hello' })).ok, true);
});
