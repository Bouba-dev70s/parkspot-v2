// === SUPABASE BACKEND ===
// Analytics, crowdsource reports, user favorites sync, historical data

// ⚠️ REPLACE THESE with your Supabase project values
const SUPABASE_URL = "https://hpinixrndpysapfmwxnz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaW5peHJuZHB5c2FwZm13eG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjQ3MjgsImV4cCI6MjA4OTgwMDcyOH0.ghM_x07yUmbFKlLgKzLDTuA977TKN_oMcXu_qYV3uUY";

// === LIGHTWEIGHT SUPABASE CLIENT (no SDK needed) ===
async function supaFetch(path: string, options: RequestInit = {}): Promise<any> {
  if (SUPABASE_URL === "https://hpinixrndpysapfmwxnz.supabase.co") return null; // Not configured yet
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "Prefer": options.method === "POST" ? "return=representation" : "return=minimal",
        ...options.headers,
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// === DEVICE ID — anonymous, persistent ===
function getDeviceId(): string {
  let id = localStorage.getItem("parkspot_device_id");
  if (!id) {
    id = "d_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("parkspot_device_id", id);
  }
  return id;
}

// ==========================================
// 1. ANALYTICS — anonymous usage tracking
// ==========================================

export async function trackEvent(event: string, data?: Record<string, any>) {
  const deviceId = getDeviceId();
  await supaFetch("analytics", {
    method: "POST",
    body: JSON.stringify({
      device_id: deviceId,
      event,
      data: data || {},
      city: localStorage.getItem("parkspot_city") ? JSON.parse(localStorage.getItem("parkspot_city")!).name : null,
      platform: navigator.userAgent.includes("iPhone") ? "ios" : navigator.userAgent.includes("Android") ? "android" : "web",
      created_at: new Date().toISOString(),
    }),
  });
}

// Track common events
export const analytics = {
  appOpen: () => trackEvent("app_open"),
  citySelected: (city: string) => trackEvent("city_selected", { city }),
  parkingViewed: (parkingId: number, name: string) => trackEvent("parking_viewed", { parkingId, name }),
  navigationStarted: (mode: string) => trackEvent("navigation_started", { mode }),
  navigationCompleted: () => trackEvent("navigation_completed"),
  parkedHere: (parkingName: string) => trackEvent("parked_here", { parkingName }),
  favoriteAdded: (parkingName: string) => trackEvent("favorite_added", { parkingName }),
  voirieToggled: (on: boolean) => trackEvent("voirie_toggled", { on }),
  filterUsed: (filter: string) => trackEvent("filter_used", { filter }),
  searchUsed: (query: string) => trackEvent("search_used", { query: query.substring(0, 30) }),
};

// ==========================================
// 2. CROWDSOURCE — users report availability
// ==========================================

export interface CrowdReport {
  id?: number;
  parking_name: string;
  parking_lat: number;
  parking_lng: number;
  reported_avail: number; // -1 = "full", 0+ = estimated spots
  status: "full" | "few" | "many" | "empty"; // simplified status
  device_id: string;
  created_at: string;
}

export async function submitReport(parkingName: string, lat: number, lng: number, status: "full" | "few" | "many") {
  const deviceId = getDeviceId();
  const availMap = { full: 0, few: 5, many: 50 };
  await supaFetch("crowd_reports", {
    method: "POST",
    body: JSON.stringify({
      parking_name: parkingName,
      parking_lat: lat,
      parking_lng: lng,
      reported_avail: availMap[status],
      status,
      device_id: deviceId,
      created_at: new Date().toISOString(),
    }),
  });
}

// Get recent reports for a parking (last 2 hours)
export async function getReports(lat: number, lng: number, radiusKm: number = 0.5): Promise<CrowdReport[]> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const result = await supaFetch(
    `crowd_reports?created_at=gte.${twoHoursAgo}&parking_lat=gte.${lat - radiusKm / 111}&parking_lat=lte.${lat + radiusKm / 111}&parking_lng=gte.${lng - radiusKm / 74}&parking_lng=lte.${lng + radiusKm / 74}&order=created_at.desc&limit=50`,
    { method: "GET" }
  );
  return result || [];
}

// Get crowd consensus for a specific parking
export async function getCrowdStatus(parkingName: string): Promise<{ status: string; count: number; lastReport: string } | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const result = await supaFetch(
    `crowd_reports?parking_name=eq.${encodeURIComponent(parkingName)}&created_at=gte.${oneHourAgo}&order=created_at.desc&limit=10`,
    { method: "GET" }
  );
  if (!result || result.length === 0) return null;
  
  // Most common status in last hour
  const counts: Record<string, number> = {};
  for (const r of result) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  const topStatus = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const labels: Record<string, string> = { full: "Signalé complet", few: "Peu de places", many: "Beaucoup de places" };
  
  return {
    status: labels[topStatus[0]] || topStatus[0],
    count: result.length,
    lastReport: result[0].created_at,
  };
}

// ==========================================
// 3. USER FAVORITES SYNC (anonymous)
// ==========================================

export async function syncFavorites(favorites: Array<{ id: number; name: string; lat: number; lng: number }>) {
  const deviceId = getDeviceId();
  await supaFetch(`user_favorites?device_id=eq.${deviceId}`, { method: "DELETE" });
  if (favorites.length === 0) return;
  await supaFetch("user_favorites", {
    method: "POST",
    body: JSON.stringify(favorites.map(f => ({
      device_id: deviceId,
      parking_id: f.id,
      parking_name: f.name,
      parking_lat: f.lat,
      parking_lng: f.lng,
      updated_at: new Date().toISOString(),
    }))),
  });
}

export async function loadFavorites(): Promise<Array<{ id: number; name: string; lat: number; lng: number }>> {
  const deviceId = getDeviceId();
  const result = await supaFetch(`user_favorites?device_id=eq.${deviceId}&order=updated_at.desc`, { method: "GET" });
  if (!result) return [];
  return result.map((r: any) => ({ id: r.parking_id, name: r.parking_name, lat: r.parking_lat, lng: r.parking_lng }));
}

// ==========================================
// 4. HISTORICAL DATA — for better predictions
// ==========================================

export async function recordAvailability(parkingName: string, lat: number, lng: number, avail: number, total: number, realtime: boolean) {
  // Only record realtime data (to build accurate history)
  if (!realtime) return;
  await supaFetch("availability_history", {
    method: "POST",
    body: JSON.stringify({
      parking_name: parkingName,
      parking_lat: lat,
      parking_lng: lng,
      avail,
      total,
      hour: new Date().getHours(),
      day_of_week: new Date().getDay(),
      recorded_at: new Date().toISOString(),
    }),
  });
}

// Get historical average for a parking at a specific hour/day
export async function getHistoricalAvg(parkingName: string, hour: number, dayOfWeek: number): Promise<number | null> {
  const result = await supaFetch(
    `availability_history?parking_name=eq.${encodeURIComponent(parkingName)}&hour=eq.${hour}&day_of_week=eq.${dayOfWeek}&select=avail&order=recorded_at.desc&limit=20`,
    { method: "GET" }
  );
  if (!result || result.length === 0) return null;
  const avg = result.reduce((s: number, r: any) => s + r.avail, 0) / result.length;
  return Math.round(avg);
}

// ==========================================
// 5. APP STATS — for the landing page / admin
// ==========================================

export async function getAppStats(): Promise<{ totalUsers: number; totalSearches: number; totalReports: number } | null> {
  try {
    const [users, searches, reports] = await Promise.all([
      supaFetch("analytics?event=eq.app_open&select=device_id&limit=10000", { method: "GET", headers: { "Prefer": "count=exact" } }),
      supaFetch("analytics?event=eq.search_used&select=id&limit=1", { method: "GET", headers: { "Prefer": "count=exact" } }),
      supaFetch("crowd_reports?select=id&limit=1", { method: "GET", headers: { "Prefer": "count=exact" } }),
    ]);
    return {
      totalUsers: users ? new Set(users.map((u: any) => u.device_id)).size : 0,
      totalSearches: searches?.length || 0,
      totalReports: reports?.length || 0,
    };
  } catch { return null; }
}

// ==========================================
// INIT — call on app start
// ==========================================
export function initBackend() {
  if (SUPABASE_URL === "https://hpinixrndpysapfmwxnz.supabase.co") {
    console.log("[Backend] Supabase not configured — running offline");
    return;
  }
  console.log("[Backend] Connected to Supabase");
  analytics.appOpen();
}
