"use client";
import { useEffect, useRef } from "react";
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
}

export default function Map({ parkings, onSelect, userPos, dark, center, zoom }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const lastCenter = useRef<string>("");
  const LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  // Init map — use center prop if available, otherwise France overview
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const initCenter = center || [46.6, 2.5];
    const initZoom = center ? (zoom || 13) : 6;
    const map = L.map(containerRef.current, {
      center: initCenter, zoom: initZoom,
      zoomControl: false, attributionControl: false,
      minZoom: 5, maxZoom: 18, zoomSnap: 0.5, wheelPxPerZoomLevel: 120,
    });
    const tile = L.tileLayer(dark ? DARK : LIGHT, { maxZoom: 18, keepBuffer: 6, updateWhenZooming: false, updateWhenIdle: true }).addTo(map);
    tileRef.current = tile;
    const cluster = L.markerClusterGroup({ maxClusterRadius: 40, showCoverageOnHover: false, zoomToBoundsOnClick: true, disableClusteringAtZoom: 16, chunkedLoading: true });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    map.getContainer().style.background = dark ? "#1a1a22" : "#f2efe9";
    if (center) lastCenter.current = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Dark mode tiles
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    tileRef.current.setUrl(dark ? DARK : LIGHT);
    mapRef.current.getContainer().style.background = dark ? "#1a1a22" : "#f2efe9";
  }, [dark]);

  // FLY TO CENTER when center changes
  useEffect(() => {
    if (!mapRef.current || !center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === lastCenter.current) return;
    lastCenter.current = key;
    mapRef.current.flyTo(center, zoom || 13, { duration: 1.2 });
  }, [center, zoom]);

  // Update markers
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const ms = parkings.map((p) => {
      const full = p.avail === 0;
      let cls = p.type === "free" ? "mm-f" : "mm-p";
      if (full) cls = "mm-x";
      const sz = full ? 26 : 34;
      const icon = L.divIcon({ className: `mm ${cls}`, html: `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;line-height:1">${p.avail}</span>`, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2], popupAnchor: [0, -sz / 2 - 4] });
      const m = L.marker([p.lat, p.lng], { icon });
      const pct = p.total > 0 ? p.avail / p.total : 0;
      const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";
      m.bindPopup(`<div style="padding:14px 16px;min-width:200px;font-family:Outfit,sans-serif"><div style="font-size:10px;font-weight:600;letter-spacing:1.5px;color:${p.type === "free" ? "var(--free)" : "var(--paid)"}">${p.type === "free" ? "GRATUIT" : "PAYANT"}</div><div style="font-size:15px;font-weight:600;margin:4px 0 2px">${p.name}</div><div style="font-size:11px;opacity:0.5;margin-bottom:10px">${p.addr}</div><div style="display:flex;gap:10px;border-top:1px solid rgba(128,128,128,0.2);padding-top:10px"><div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600;color:${vc}">${p.avail}</div><div style="font-size:9px;opacity:0.4">Dispo</div></div><div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600">${p.total}</div><div style="font-size:9px;opacity:0.4">Total</div></div><div style="flex:1;text-align:center"><div style="font-size:16px;font-weight:600;color:${p.price ? "var(--paid)" : "var(--free)"}">${p.price || "0€"}</div><div style="font-size:9px;opacity:0.4">Tarif</div></div></div></div>`, { maxWidth: 260 });
      m.on("click", () => onSelect(p));
      return m;
    });
    cluster.addLayers(ms);
  }, [parkings, onSelect]);

  // User position marker
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({ className: "", html: '<div style="width:16px;height:16px;background:var(--accent);border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.5)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    userMarkerRef.current = L.marker(userPos, { icon }).addTo(mapRef.current);
  }, [userPos]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: dark ? "#1a1a22" : "#f2efe9" }} />;
}
