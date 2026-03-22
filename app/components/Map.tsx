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

export default function Map({ parkings, onSelect, userPos, dark, center, zoom, selectedId, addressPin }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const lastCenter = useRef("");
  const updateTimer = useRef<NodeJS.Timeout>();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const c = center || [46.6, 2.5];
    const z = center ? (zoom || 13) : 6;
    const map = L.map(containerRef.current, {
      center: c, zoom: z, zoomControl: false, attributionControl: false,
      minZoom: 5, maxZoom: 18, zoomSnap: 0.5, wheelPxPerZoomLevel: 120, preferCanvas: true,
    });
    const tile = L.tileLayer(TILES, { maxZoom: 18, keepBuffer: 8, updateWhenZooming: false, updateWhenIdle: true }).addTo(map);
    tileRef.current = tile;
    const tp = map.getPane("tilePane");
    if (tp && dark) { tp.style.filter = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)"; }
    const cluster = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false, zoomToBoundsOnClick: true, disableClusteringAtZoom: 16, chunkedLoading: true, chunkInterval: 100, chunkDelay: 10, animate: false, spiderfyOnMaxZoom: false, removeOutsideVisibleBounds: true });
    map.addLayer(cluster);
    mapRef.current = map; clusterRef.current = cluster;
    map.getContainer().style.background = dark ? "#1a1a2a" : "#f2efe9";
    if (center) lastCenter.current = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const tp = mapRef.current.getPane("tilePane");
    if (tp) { tp.style.filter = dark ? "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)" : "none"; tp.style.transition = "filter 0.5s ease"; }
    mapRef.current.getContainer().style.background = dark ? "#1a1a2a" : "#f2efe9";
  }, [dark]);

  useEffect(() => {
    if (!mapRef.current || !center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === lastCenter.current) return;
    lastCenter.current = key;
    mapRef.current.flyTo(center, zoom || 13, { duration: 0.8, easeLinearity: 0.5 });
  }, [center, zoom]);

  // Address pin
  useEffect(() => {
    if (!mapRef.current) return;
    if (pinRef.current) { mapRef.current.removeLayer(pinRef.current); pinRef.current = null; }
    if (!addressPin) return;
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="var(--accent)" stroke="#fff" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg></div>`,
      iconSize: [32, 32], iconAnchor: [16, 32],
    });
    pinRef.current = L.marker(addressPin, { icon, zIndexOffset: 900 }).addTo(mapRef.current);
  }, [addressPin]);

  const makeIcon = useCallback((p: Parking, isSelected: boolean) => {
    const full = p.avail === 0;
    if (full) {
      return L.divIcon({
        className: "pk",
        html: `<div style="width:28px;height:22px;border-radius:8px;background:linear-gradient(135deg,#dc2626,#b91c1c);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:9px;opacity:0.6;border:1.5px solid rgba(255,255,255,0.3);box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative"><span>0</span><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #b91c1c"></div></div>`,
        iconSize: [28, 28], iconAnchor: [14, 27],
      });
    }
    const isFree = p.type === "free";
    const bg = isFree ? "linear-gradient(135deg,#16a34a,#059669)" : "linear-gradient(135deg,#ea580c,#d97706)";
    const arrow = isFree ? "#059669" : "#d97706";
    const pulse = isFree ? `<div class="pk-pulse"></div>` : "";
    const rt = p.realtime ? `<div class="pk-dot"></div>` : "";
    const label = p.realtime ? String(p.avail) : `~${p.avail}`;
    const fontSize = label.length > 3 ? "10px" : "12px";
    const ring = isSelected ? "outline:3px solid var(--accent);outline-offset:2px;" : "";
    const scale = isSelected ? "transform:scale(1.15);" : "";
    return L.divIcon({
      className: "pk",
      html: `<div style="width:38px;height:30px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${fontSize};border:2px solid rgba(255,255,255,0.4);box-shadow:0 3px 12px rgba(0,0,0,0.3);position:relative;${ring}${scale}">${pulse}${rt}<span style="position:relative;z-index:1">${label}</span><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${arrow}"></div></div>`,
      iconSize: [38, 36], iconAnchor: [19, 36],
    });
  }, []);

  useEffect(() => {
    if (updateTimer.current) clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(() => {
      const cluster = clusterRef.current;
      if (!cluster) return;
      cluster.clearLayers();
      const ms: L.Marker[] = [];
      for (const p of parkings) {
        const m = L.marker([p.lat, p.lng], { icon: makeIcon(p, p.id === selectedId) });
        m.on("click", () => onSelectRef.current(p));
        ms.push(m);
      }
      cluster.addLayers(ms);
    }, 50);
    return () => { if (updateTimer.current) clearTimeout(updateTimer.current); };
  }, [parkings, makeIcon, selectedId]);

  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({ className: "", html: '<div style="width:16px;height:16px;background:var(--accent);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(37,99,235,0.2), 0 2px 8px rgba(0,0,0,0.3)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    userMarkerRef.current = L.marker(userPos, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
  }, [userPos]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: dark ? "#1a1a2a" : "#f2efe9" }} />;
}
