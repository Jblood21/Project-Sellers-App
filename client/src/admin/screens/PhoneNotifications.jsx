import { useCallback, useEffect, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// The site's public key arrives as base64url text; the browser wants bytes.
function keyBytes(text) {
  const padded = `${text}${'='.repeat((4 - (text.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/**
 * "Phone notifications" under Your details: this phone (the installed app) agrees to be sent a notification when a new
 * person signs in. The browser only allows the question from a tap, so it is a button. Which people are sent them is the
 * owner's choice on the Team page; this is each person turning on their own phone.
 */
export default function PhoneNotifications() {
  const { token } = useAdmin();
  const [info, setInfo] = useState(null); // { publicKey, devices, alertsOn }
  const [here, setHere] = useState(null); // whether THIS phone is subscribed
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const supported = canPush();

  const load = useCallback(async () => {
    try {
      setInfo(await adminApi.myPush(token));
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration();
        setHere(Boolean(await reg?.pushManager.getSubscription()));
      }
    } catch (err) {
      setError(err.message);
    }
  }, [token, supported]);
  useEffect(() => { load(); }, [load]);

  const run = async (task) => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      await task();
    } catch (err) {
      setError(err.message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () => run(async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications are blocked for this app. Turn them on in your phone\'s Settings, under Notifications, then try again.');
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) }));
    await adminApi.pushSubscribe(token, sub.toJSON());
    setNote('Turned on for this phone.');
    await load();
  });
  const turnOff = () => run(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await adminApi.pushUnsubscribe(token, sub.endpoint);
      await sub.unsubscribe();
    }
    setNote('Turned off for this phone.');
    await load();
  });
  const test = () => run(async () => {
    const r = await adminApi.pushTest(token);
    if (!r.ok) throw new Error(r.error);
    setNote('Sent. A notification should appear in a moment.');
  });

  let body;
  if (!supported) {
    body = isIos() && !isInstalled() ? (
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        On an iPhone this works from the app icon on your Home Screen, not from Safari. In Safari open this page, tap the
        Share button, then <strong>Add to Home Screen</strong>. If you added it before, delete that icon and add it again, then
        open it from the icon and come back here. It needs iOS 16.4 or newer.
      </p>
    ) : (
      <p className="text-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>This browser cannot receive notifications. On an iPhone, open the app from its Home Screen icon.</p>
    );
  } else if (!info) {
    body = <span className="text-muted" style={{ fontSize: 14 }}>Loading…</span>;
  } else {
    body = (
      <>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          {here
            ? 'This phone is turned on.'
            : 'Turn this phone on and it shows a notification when a new person signs in.'}
          {' '}
          {info.alertsOn
            ? 'The owner has switched notifications on for you.'
            : 'The owner has not switched notifications on for you yet, so none will arrive until they do (Team page).'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {here ? (
            <>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={test}>Send a test</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={turnOff}>Turn off for this phone</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={turnOn}>Turn on notifications for this phone</button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <span className="card-kicker">Phone notifications</span>
      {body}
      {note ? <span role="status" style={{ fontSize: 14 }}>{note}</span> : null}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
