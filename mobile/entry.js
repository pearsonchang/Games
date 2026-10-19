import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Haptics } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser';

// Only the packaged lobby receives this bridge. Embedded games send validated
// gameplay intents to the parent; they do not receive a native plugin bridge.
window.PlayroomDevice = Object.freeze({
  isNative: Capacitor.isNativePlatform(),
  platform: Capacitor.getPlatform(),
  App, Preferences, Haptics, Browser
});
