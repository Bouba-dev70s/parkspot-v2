"use client";
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { Parking } from "@/lib/api";
import type { StreetSpot, VoirieStatus } from "@/lib/voirie";
import { PARIS_ZONE_1, PARIS_OUTER, spotTypeLabel } from "@/lib/voirie";
import type { Route } from "@/lib/navigation";

interface Props {
  parkings: Parking[];
  onSelect: (p: Parking) => void;
  userPos: [number, number] | null;
  dark?: boolean;
  center?: [number, number];
  zoom?: number;
  selectedId?: number | null;
  addressPin?: [number, number] | null;
  showVoirie?: boolean;
  streetSpots?: StreetSpot[];
  voirieStatus?: VoirieStatus | null;
  route?: Route | null;
  navigating?: boolean;
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

export default function Map({ parkings, onSelect, userPos, dark, center, zoom, selectedId, addressPin, showVoirie, streetSpots, voirieStatus, route, navigating }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const lastCenter = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const markersById = useRef<{ [id: number]: { marker: L.Marker; parking: Parking } }>({});
  const prevSelectedId = useRef<number | null>(null);
  const lastParkingsRef = useRef<string>("");

  // Voirie layers
  const voirieLayerRef = useRef<L.LayerGroup | null>(null);
  const streetSpotsLayerRef = useRef<L.LayerGroup | null>(null);
  // Route layer
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const userInteracted = useRef(false);

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
      preferCanvas: true, fadeAnimation: true, markerZoomAnimation: false,
      zoomAnimation: true, inertia: true, inertiaDeceleration: 3400, inertiaMaxSpeed: 3000,
    });
    const tile = L.tileLayer(dark ? TILES_DARK : TILES_LIGHT, {
      maxZoom: 19, keepBuffer: 25, updateWhenZooming: true, updateWhenIdle: false,
    });
    tile.addTo(map);
    tileRef.current = tile;
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 60, showCoverageOnHover: false, zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16, chunkedLoading: true, chunkInterval: 200, chunkDelay: 30,
      animate: false, spiderfyOnMaxZoom: false, removeOutsideVisibleBounds: true, animateAddingMarkers: false,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    map.getContainer().style.background = dark ? "#1a1a2e" : "#f2efe9";
    if (center) lastCenter.current = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // === DARK MODE ===
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    tileRef.current.setUrl(dark ? TILES_DARK : TILES_LIGHT);
    mapRef.current.getContainer().style.background = dark ? "#1a1a2e" : "#f2efe9";
  }, [dark]);

  // === FLY TO ===
  useEffect(() => {
    if (!mapRef.current || !center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === lastCenter.current) return;
    lastCenter.current = key;
    userInteracted.current = false; // Reset follow mode when center is set externally
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

  // === BUILD PARKING MARKERS ===
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
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

  // === SELECTION CHANGE ===
  useEffect(() => {
    const prev = prevSelectedId.current;
    const next = selectedId ?? null;
    prevSelectedId.current = next;
    if (prev === next) return;
    if (prev != null) { const e = markersById.current[prev]; if (e) e.marker.setIcon(getIcon(e.parking, false)); }
    if (next != null) { const e = markersById.current[next]; if (e) e.marker.setIcon(getIcon(e.parking, true)); }
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

  // === VOIRIE ZONE OVERLAYS ===
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old voirie layers
    if (voirieLayerRef.current) { mapRef.current.removeLayer(voirieLayerRef.current); voirieLayerRef.current = null; }

    if (!showVoirie || !voirieStatus || voirieStatus.zone === 0) return;

    const group = L.layerGroup();
    const isFree = voirieStatus.isFree;

    // Zone 1 overlay (arr 1-11)
    const z1Color = isFree ? "#16a34a" : "#ea580c";
    const z1 = L.polygon(PARIS_ZONE_1, {
      color: z1Color, weight: 1.5, fillColor: z1Color, fillOpacity: 0.12,
      interactive: true,
    });
    z1.bindPopup(`
      <div style="font-family:-apple-system,sans-serif;min-width:180px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">Zone 1 · Arr. 1–11</div>
        <div style="font-size:12px;color:${isFree ? '#16a34a' : '#ea580c'};font-weight:600;margin-bottom:4px">${isFree ? "✓ GRATUIT" : "6€/h"}</div>
        <div style="font-size:11px;color:#666">${voirieStatus.reason}</div>
        ${voirieStatus.nextChange ? `<div style="font-size:11px;color:#999;margin-top:2px">${voirieStatus.nextChange}</div>` : ""}
        <div style="font-size:10px;color:#aaa;margin-top:4px">Max 6h · Lun–Sam 9h–20h</div>
      </div>
    `);
    group.addLayer(z1);

    // Zone 2 overlay (arr 12-20, outer ring minus zone 1)
    const z2Color = isFree ? "#16a34a" : "#eab308";
    const z2 = L.polygon(PARIS_OUTER, {
      color: z2Color, weight: 1, fillColor: z2Color, fillOpacity: 0.08,
      interactive: true,
    });
    z2.bindPopup(`
      <div style="font-family:-apple-system,sans-serif;min-width:180px">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px">Zone 2 · Arr. 12–20</div>
        <div style="font-size:12px;color:${isFree ? '#16a34a' : '#eab308'};font-weight:600;margin-bottom:4px">${isFree ? "✓ GRATUIT" : "4€/h"}</div>
        <div style="font-size:11px;color:#666">${voirieStatus.reason}</div>
        ${voirieStatus.nextChange ? `<div style="font-size:11px;color:#999;margin-top:2px">${voirieStatus.nextChange}</div>` : ""}
        <div style="font-size:10px;color:#aaa;margin-top:4px">Max 6h · Lun–Sam 9h–20h</div>
      </div>
    `);
    group.addLayer(z2);

    group.addTo(mapRef.current);
    voirieLayerRef.current = group;
  }, [showVoirie, voirieStatus]);

  // === STREET SPOTS (individual markers when zoomed in) ===
  useEffect(() => {
    if (!mapRef.current) return;
    if (streetSpotsLayerRef.current) { mapRef.current.removeLayer(streetSpotsLayerRef.current); streetSpotsLayerRef.current = null; }

    if (!showVoirie || !streetSpots || streetSpots.length === 0) return;

    const group = L.layerGroup();
    for (const s of streetSpots) {
      const info = spotTypeLabel(s.type);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${info.color};border:1.5px solid rgba(255,255,255,0.7);box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5],
      });
      const m = L.marker([s.lat, s.lng], { icon, zIndexOffset: -100 });
      m.bindPopup(`
        <div style="font-family:-apple-system,sans-serif;min-width:130px">
          <div style="font-weight:700;font-size:13px;color:${info.color};margin-bottom:2px">${info.label}</div>
          <div style="font-size:11px;color:#666">${s.regime || s.type}</div>
          ${s.places > 1 ? `<div style="font-size:11px;color:#999">${s.places} places</div>` : ""}
        </div>
      `);
      group.addLayer(m);
    }
    group.addTo(mapRef.current);
    streetSpotsLayerRef.current = group;
  }, [showVoirie, streetSpots]);

  // === ROUTE POLYLINE ===
  useEffect(() => {
    if (!mapRef.current) return;
    if (routeLayerRef.current) { mapRef.current.removeLayer(routeLayerRef.current); routeLayerRef.current = null; }
    if (destMarkerRef.current) { mapRef.current.removeLayer(destMarkerRef.current); destMarkerRef.current = null; }
    if (!route || route.geometry.length < 2) return;

    const group = L.layerGroup();

    // Route outline (dark shadow)
    const outline = L.polyline(route.geometry, {
      color: dark ? "#1a1a2e" : "#fff", weight: 9, opacity: 0.7,
      lineCap: "round", lineJoin: "round",
    });
    group.addLayer(outline);

    // Route main line
    const line = L.polyline(route.geometry, {
      color: "#2563eb", weight: 5, opacity: 0.9,
      lineCap: "round", lineJoin: "round",
    });
    group.addLayer(line);

    // Destination marker (flag)
    const destPoint = route.geometry[route.geometry.length - 1];
    const destIcon = L.divIcon({
      className: "",
      html: `<div style="width:28px;height:28px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/></svg></div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    });
    destMarkerRef.current = L.marker(destPoint, { icon: destIcon, zIndexOffset: 800 });
    group.addLayer(destMarkerRef.current);

    group.addTo(mapRef.current);
    routeLayerRef.current = group;

    // Fit bounds to show entire route
    if (!navigating) {
      const bounds = L.latLngBounds(route.geometry);
      mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [route, dark]);

  // === AUTO-CENTER during navigation — only if user hasn't manually moved ===
  useEffect(() => {
    if (!mapRef.current || !navigating) { userInteracted.current = false; return; }
    const map = mapRef.current;
    const onMove = () => { userInteracted.current = true; };
    map.on("dragstart", onMove);
    map.on("zoomstart", onMove);
    return () => { map.off("dragstart", onMove); map.off("zoomstart", onMove); };
  }, [navigating]);

  useEffect(() => {
    if (!mapRef.current || !navigating || !userPos || userInteracted.current) return;
    mapRef.current.panTo(userPos, { animate: true, duration: 0.5 });
  }, [userPos, navigating]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: dark ? "#1a1a2a" : "#f2efe9" }} />;
}
