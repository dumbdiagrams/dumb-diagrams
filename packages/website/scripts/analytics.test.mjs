import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { initAnalytics } from '../src/scripts/analytics.ts';

const key = 'dumb-diagrams:analytics-consent:v1';
function harness(t, saved, blocked = false) {
  const appended = [], events = [], storage = new Map(), windowEvents = new Map();
  let reloads = 0;
  const element = (dataset = {}) => ({
    dataset, hidden: true, focused: false, listeners: new Map(),
    addEventListener(name, callback) { this.listeners.set(name, callback); },
    click() { this.listeners.get('click')?.({ preventDefault() {} }); },
    focus() { this.focused = true; },
  });
  const allow = element({ analyticsChoice: 'granted' });
  const decline = element({ analyticsChoice: 'denied' });
  const banner = element({ analyticsId: 'G-TEST12345', analyticsEnabled: 'true' });
  const close = element();
  banner.querySelectorAll = () => [decline, allow];
  banner.querySelector = selector => selector === '[data-analytics-close]' ? close : decline;
  const settings = element(), extraSettings = element(), status = element(), revoke = element();
  settings.hidden = extraSettings.hidden = false;
  const doc = {
    querySelector: selector => ({ '[data-analytics-id]': banner, '[data-analytics-settings]': settings, '[data-analytics-status]': status })[selector],
    querySelectorAll: selector => ({ '[data-analytics-settings]': [settings, extraSettings], '[data-analytics-revoke]': [revoke], '[data-analytics-status]': [status] })[selector] || [],
    createElement: () => ({}),
    head: { append: (...scripts) => appended.push(...scripts) },
    cookie: '_ga=visitor; _ga_TEST12345=session; unrelated=keep',
  };
  const cookiesRemoved = [];
  Object.defineProperty(doc, 'cookie', { get: () => '_ga=visitor; _ga_TEST12345=session; unrelated=keep', set: value => cookiesRemoved.push(value) });
  if (saved !== undefined) storage.set(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  const globals = {
    document: doc,
    window: { location: { reload: () => reloads++ }, addEventListener: (name, fn) => windowEvents.set(name, fn), dispatchEvent: event => events.push(event.type) },
    localStorage: {
      getItem: name => { if (blocked) throw new Error('blocked'); return storage.get(name) || null; },
      setItem: (name, value) => { if (blocked) throw new Error('blocked'); storage.set(name, value); },
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  initAnalytics();
  return { allow, decline, banner, close, settings, extraSettings, status, revoke, appended, events, storage, cookiesRemoved, windowEvents, reloads: () => reloads };
}

test('fresh and declined visits never insert a Google script', t => {
  const app = harness(t);
  assert.equal(app.banner.hidden, false);
  assert.equal(app.settings.hidden, false);
  assert.equal(app.appended.length, 0);
  app.decline.click();
  assert.equal(app.appended.length, 0);
  assert.equal(JSON.parse(app.storage.get(key)).choice, 'denied');
  assert.equal(app.banner.hidden, true);
  app.settings.click();
  assert.equal(app.banner.hidden, false);
  assert.equal(app.decline.focused, true);
});

test('a saved choice can close reopened preferences without changing it', t => {
  const app = harness(t, { choice: 'denied', at: Date.now() });
  app.settings.click();
  assert.equal(app.banner.hidden, false);
  assert.equal(app.close.hidden, false);
  app.close.click();
  assert.equal(app.banner.hidden, true);
  assert.equal(app.settings.focused, true);
  assert.equal(JSON.parse(app.storage.get(key)).choice, 'denied');
});

test('accepting configures GA4 in the worker once, with advertising denied', t => {
  const app = harness(t);
  app.allow.click();
  app.allow.click();
  assert.equal(app.appended.length, 2);
  assert.ok(app.appended.every(script => script.type === 'text/partytown'));
  assert.equal(app.appended[1].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST12345');
  assert.deepEqual(app.events, ['ptupdate']);
  const worker = { window: {} };
  runInNewContext(app.appended[0].textContent, worker);
  const commands = worker.window.dataLayer;
  assert.equal(commands[0][0], 'consent');
  assert.equal(commands[0][2].analytics_storage, 'granted');
  for (const option of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(commands[0][2][option], 'denied');
  assert.equal(commands[2][0], 'config');
  assert.equal(commands[2][1], 'G-TEST12345');
  assert.equal(commands[2][2].allow_google_signals, false);
  assert.equal(commands[2][2].cookie_domain, 'none');
  assert.equal(commands[2][2].cookie_update, false);
  assert.equal(app.revoke.hidden, false);
});

for (const choice of ['granted', 'denied']) {
  test(`a returning ${choice} visitor retains their choice`, t => {
    const app = harness(t, { choice, at: Date.now() });
    assert.equal(app.banner.hidden, true);
    assert.equal(app.appended.length, choice === 'granted' ? 2 : 0);
    app.windowEvents.get('pageshow')({ persisted: true });
    assert.equal(app.reloads(), 0, 'ordinary back/forward restores without a reload');
  });
}

for (const saved of ['bad json', { choice: 'granted', at: 0 }, { choice: 'granted', at: Date.now() + 100_000 }, { choice: 'unexpected', at: Date.now() }]) {
  test(`invalid or expired consent fails closed: ${JSON.stringify(saved)}`, t => {
    const app = harness(t, saved);
    assert.equal(app.banner.hidden, false);
    assert.equal(app.appended.length, 0);
  });
}

test('blocked browser storage still allows a choice for this visit', t => {
  const app = harness(t, undefined, true);
  assert.equal(app.appended.length, 0);
  app.allow.click();
  assert.equal(app.appended.length, 2);
  app.decline.click();
  assert.equal(app.reloads(), 1);
});

test('withdrawing consent clears only this integration’s cookies and unloads tracking', t => {
  const app = harness(t, { choice: 'granted', at: Date.now() });
  app.settings.click();
  app.decline.click();
  assert.equal(JSON.parse(app.storage.get(key)).choice, 'denied');
  assert.equal(app.reloads(), 1);
  assert.equal(app.cookiesRemoved.length, 2);
  assert.ok(app.cookiesRemoved.every(cookie => cookie.startsWith('_ga') && cookie.includes('Max-Age=0')));
});

test('consent changed in another tab or while bfcached invalidates the old tracker', t => {
  const app = harness(t, { choice: 'granted', at: Date.now() });
  app.storage.set(key, JSON.stringify({ choice: 'denied', at: Date.now() }));
  app.windowEvents.get('storage')({ key });
  assert.equal(app.reloads(), 1);
  app.windowEvents.get('pageshow')({ persisted: true });
  assert.equal(app.reloads(), 2);
});

test('footer revoke withdraws consent in one click without reopening the banner', t => {
  const app = harness(t, { choice: 'granted', at: Date.now() });
  assert.equal(app.revoke.hidden, false);
  app.revoke.click();
  assert.equal(JSON.parse(app.storage.get(key)).choice, 'denied');
  assert.equal(app.revoke.hidden, true);
  assert.equal(app.reloads(), 1);
  assert.equal(app.cookiesRemoved.length, 2);
});

test('every settings link opens the same panel and restores focus to its trigger', t => {
  const app = harness(t, { choice: 'denied', at: Date.now() });
  app.extraSettings.click();
  assert.equal(app.banner.hidden, false);
  app.decline.click();
  assert.equal(app.extraSettings.focused, true);
  assert.equal(app.settings.focused, false);
});
