"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "cashier-sound-enabled";
const listeners = new Set<() => void>();

let cached: boolean | null = null;
let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio("/notification.wav");
    audio.preload = "auto";
  }
  return audio;
}

export function getSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (cached === null) {
    cached = window.localStorage.getItem(STORAGE_KEY) === "1";
  }
  return cached;
}

export function setSoundEnabled(value: boolean): void {
  cached = value;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  }
  listeners.forEach((listener) => listener());

  const el = getAudio();
  if (value && el) {
    // Dipicu oleh klik pengguna: sekaligus membuka izin autoplay.
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  } else if (!value && el) {
    el.pause();
  }
}

export function playCashierSound(): void {
  if (!getSoundEnabled()) return;
  const el = getAudio();
  if (!el) return;
  el.currentTime = 0;
  void el.play().catch(() => undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, getSoundEnabled, () => false);
}
