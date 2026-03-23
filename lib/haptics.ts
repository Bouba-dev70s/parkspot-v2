// === HAPTIC FEEDBACK — Native iOS vibrations ===
// Uses @capacitor/haptics on native, silent fallback on web

let hapticsPlugin: any = null;
let available: boolean | null = null;

async function getHaptics() {
  if (available === false) return null;
  if (hapticsPlugin) return hapticsPlugin;
  try {
    const mod = await import("@capacitor/haptics");
    hapticsPlugin = mod.Haptics;
    available = true;
    return hapticsPlugin;
  } catch {
    available = false;
    return null;
  }
}

// Light tap — selecting a parking, changing tab
export async function tapLight() {
  const h = await getHaptics();
  if (h) try { await h.impact({ style: "light" }); } catch {}
}

// Medium tap — opening detail sheet, confirming action
export async function tapMedium() {
  const h = await getHaptics();
  if (h) try { await h.impact({ style: "medium" }); } catch {}
}

// Heavy tap — navigation start, park here
export async function tapHeavy() {
  const h = await getHaptics();
  if (h) try { await h.impact({ style: "heavy" }); } catch {}
}

// Success — arrived at destination, favorited
export async function tapSuccess() {
  const h = await getHaptics();
  if (h) try { await h.notification({ type: "success" }); } catch {}
}

// Warning — off route, parking full
export async function tapWarning() {
  const h = await getHaptics();
  if (h) try { await h.notification({ type: "warning" }); } catch {}
}

// Selection changed — filter toggle, sort change
export async function tapSelection() {
  const h = await getHaptics();
  if (h) try { await h.selectionChanged(); } catch {}
}
