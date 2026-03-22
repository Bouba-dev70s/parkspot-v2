"use client";
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Parking } from "@/lib/api";

interface Props {
  parkings: Parking[];
  onSelect: (p: Parking) => void;
  userPos: [number, number] | null;
  dark?: boolean;
  center?: [number, number];
  zoom?: number;
  selectedId?: number | null;
  addressPin?: [number, number] | null;
}

// === ICON CACHE — build once, reuse forever ===
const iconCache: { [k: string]: L.DivIcon } = {};

function getIcon(p: Parking, selected: boolean): L.DivIcon {
  const key = `${p.type}-${p.avail}-${p.total}-${p.realtime ? 1 : 0}-${selected ? 1 : 0}`;
  if (iconCache[key]) return iconCache[key];

  const full = p.avail === 0;
  let icon: L.DivIcon;

  if (full) {
    icon = L.divIcon({
      className: "",
      html: `<div style="width:24px;height:20px;border-radius:6px;background:#dc2626;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:9px;opacity:0.5;border:1.5px solid rgba(255,255,255,0.3)">0</div>`,
      iconSize: [24, 20], iconAnchor: [12, 20],
    });
  } else {
    const isFree = p.type === "free";
    const bg = isFree ? "#16a34a" : "#ea580c";
    const label = p.realtime ? String(p.avail) : `~${p.avail}`;
    const fs = label.length > 3 ? 9 : 11;
    const w = selected ? 42 : 36;
    const h = selected ? 32 : 26;
    const border = selected ? `3px solid var(--accent)` : `1.5px solid rgba(255,255,255,0.5)`;
    const shadow = selected ? "0 0 0 3px rgba(37,99,235,0.3),0 2px 8px rgba(0,0,0,0.3)" : "0 2px 6px rgba(0,0,0,0.25)";
    const dot = p.realtime ? `<div style="position:absolute;top:-2px;right:-2px;width:6px;height:6px;background:#22d3ee;border-radius:50%;border:1px solid #fff"></div>` : "";

    icon = L.divIcon({
      className: "",
      html: `<div style="width:${w}px;height:${h}px;border-radius:${h/2}px;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${fs}px;border:${border};box-shadow:${shadow};position:relative">${dot}${label}</div>`,
      iconSize: [w, h], iconAnchor: [w / 2, h],
    });
  }

  iconCache[key] = icon;
  return icon;
}

export default function Map({ parkings, onSelect, userPos, dark, center, zoom, selectedId, addressPin }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const lastCenter = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // Track markers by parking id for fast selection update
  const markersById = useRef<{ [id: number]: { marker: L.Marker; parking: Parking } }>({});
  const prevSelectedId = useRef<number | null>(null);
  const lastParkingsRef = useRef<string>("");

  const TILES_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const TILES_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  // === INIT MAP — once ===
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const c = center || [46.6, 2.5];
    const z = center ? (zoom || 13) : 6;
    const map = L.map(containerRef.current, {
      center: c, zoom: z, zoomControl: false, attributionControl: false,
      minZoom: 5, maxZoom: 18, zoomSnap: 0.5,
      preferCanvas: true,
      fadeAnimation: true, // Smooth tile fade-in
      markerZoomAnimation: false,
      zoomAnimation: true,
      inertia: true,
      inertiaDeceleration: 3400,
      inertiaMaxSpeed: 3000,
    });
    const tile = L.tileLayer(dark ? TILES_DARK : TILES_LIGHT, {
      maxZoom: 19,
      keepBuffer: 25, // Keep MANY tiles in memory — kills grey areas
      updateWhenZooming: true, // Load tiles WHILE zooming, not after
      updateWhenIdle: false, // Don't wait for user to stop
    });
    tile.addTo(map);
    tileRef.current = tile;
    // NO CSS filter — we use native dark tiles instead (10x faster)
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      chunkInterval: 200,
      chunkDelay: 30,
      animate: false,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
      animateAddingMarkers: false,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    map.getContainer().style.background = dark ? "#1a1a2e" : "#f2efe9";
    if (center) lastCenter.current = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // === DARK MODE — swap tiles, no CSS filter ===
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    const url = dark ? TILES_DARK : TILES_LIGHT;
    tileRef.current.setUrl(url);
    mapRef.current.getContainer().style.background = dark ? "#1a1a2e" : "#f2efe9";
  }, [dark]);

  // === FLY TO ===
  useEffect(() => {
    if (!mapRef.current || !center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === lastCenter.current) return;
    lastCenter.current = key;
    mapRef.current.flyTo(center, zoom || 13, { duration: 0.4 });
  }, [center, zoom]);

  // === ADDRESS PIN ===
  useEffect(() => {
    if (!mapRef.current) return;
    if (pinRef.current) { mapRef.current.removeLayer(pinRef.current); pinRef.current = null; }
    if (!addressPin) return;
    const icon = L.divIcon({
      className: "",
      html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)" stroke="#fff" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>`,
      iconSize: [28, 28], iconAnchor: [14, 28],
    });
    pinRef.current = L.marker(addressPin, { icon, zIndexOffset: 900 }).addTo(mapRef.current);
  }, [addressPin]);

  // === BUILD MARKERS — only when parkings array changes ===
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    // Fingerprint to avoid unnecessary rebuilds
    const fp = parkings.map(p => p.id).join(",");
    if (fp === lastParkingsRef.current) return;
    lastParkingsRef.current = fp;

    cluster.clearLayers();
    markersById.current = {};
    const markers: L.Marker[] = [];

    for (const p of parkings) {
      const m = L.marker([p.lat, p.lng], { icon: getIcon(p, p.id === selectedId) });
      m.on("click", () => onSelectRef.current(p));
      markers.push(m);
      markersById.current[p.id] = { marker: m, parking: p };
    }
    cluster.addLayers(markers);
  }, [parkings]);

  // === SELECTION CHANGE — only update 2 markers, not all ===
  useEffect(() => {
    const prev = prevSelectedId.current;
    const next = selectedId ?? null;
    prevSelectedId.current = next;
    if (prev === next) return;

    // Deselect previous
    if (prev != null) {
      const entry = markersById.current[prev];
      if (entry) entry.marker.setIcon(getIcon(entry.parking, false));
    }
    // Select new
    if (next != null) {
      const entry = markersById.current[next];
      if (entry) entry.marker.setIcon(getIcon(entry.parking, true));
    }
  }, [selectedId]);

  // === USER POSITION ===
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({
      className: "",
      html: '<div style="width:14px;height:14px;background:var(--accent);border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 3px rgba(37,99,235,0.2)"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    });
    userMarkerRef.current = L.marker(userPos, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
  }, [userPos]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: dark ? "#1a1a2a" : "#f2efe9" }} />;
}
