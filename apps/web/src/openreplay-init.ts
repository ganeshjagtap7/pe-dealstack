import Tracker from '@openreplay/tracker';

const key = (window as any).__ENV?.OPENREPLAY_KEY;
if (key) {
  const tracker = new Tracker({
    projectKey: key,
    __DISABLE_SECURE_MODE: window.location.hostname === 'localhost',
  });
  tracker.start();
  (window as any).__openReplayTracker = tracker;
}
