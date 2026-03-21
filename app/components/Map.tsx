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
}

export default function Map({ parkings, onSelect, userPos, dark, center, zoom }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const lastCenter = useRef("");
  const updateTimer = useRef<NodeJS.Timeout>();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Always use Voyager (colorful) tiles — dark mode via CSS filter (Apple Maps style)
  const TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

  // Init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const c = center || [46.6, 2.5];
    const z = center ? (zoom || 13) : 6;
    const map = L.map(containerRef.current, {
      center: c, zoom: z,
      zoomControl: false, attributionControl: false,
      minZoom: 5, maxZoom: 18, zoomSnap: 0.5, wheelPxPerZoomLevel: 120,
      preferCanvas: true,
    });
    const tile = L.tileLayer(TILES, {
      maxZoom: 18, keepBuffer: 8, updateWhenZooming: false, updateWhenIdle: true,
    }).addTo(map);
    tileRef.current = tile;

    // Apply dark mode filter
    const tilePane = map.getPane("tilePane");
    if (tilePane && dark) {
      tilePane.style.filter = "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)";
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 10,
      animate: false,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    map.getContainer().style.background = dark ? "#1a1a2a" : "#f2efe9";
    if (center) lastCenter.current = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Dark mode toggle — apply/remove CSS filter on tile pane
  useEffect(() => {
    if (!mapRef.current) return;
    const tilePane = mapRef.current.getPane("tilePane");
    if (tilePane) {
      tilePane.style.filter = dark ? "invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)" : "none";
      tilePane.style.transition = "filter 0.5s ease";
    }
    mapRef.current.getContainer().style.background = dark ? "#1a1a2a" : "#f2efe9";
  }, [dark]);

  // Fly to center
  useEffect(() => {
    if (!mapRef.current || !center) return;
    const key = `${center[0].toFixed(4)},${center[1].toFixed(4)}`;
    if (key === lastCenter.current) return;
    lastCenter.current = key;
    mapRef.current.flyTo(center, zoom || 13, { duration: 0.8, easeLinearity: 0.5 });
  }, [center, zoom]);

  // Build marker icon — ALL styling inline to avoid Leaflet CSS conflicts
  const makeIcon = useCallback((p: Parking) => {
    const full = p.avail === 0;
    if (full) {
      return L.divIcon({
        className: "pk",
        html: `<div style="width:28px;height:22px;border-radius:8px;background:linear-gradient(135deg,#dc2626,#b91c1c);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:9px;opacity:0.6;border:1.5px solid rgba(255,255,255,0.3);box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative"><span>${p.avail}</span><div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #b91c1c"></div></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 27],
      });
    }
    const isFree = p.type === "free";
    const bg = isFree ? "linear-gradient(135deg,#16a34a,#059669)" : "linear-gradient(135deg,#ea580c,#d97706)";
    const arrow = isFree ? "#059669" : "#d97706";
    const pulse = isFree ? `<div class="pk-pulse"></div>` : "";
    const rt = p.realtime ? `<div class="pk-dot"></div>` : "";
    return L.divIcon({
      className: "pk",
      html: `<div style="width:38px;height:30px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;border:2px solid rgba(255,255,255,0.4);box-shadow:0 3px 12px rgba(0,0,0,0.3);position:relative">${pulse}${rt}<span style="position:relative;z-index:1">${p.avail}</span><div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${arrow}"></div></div>`,
      iconSize: [38, 36],
      iconAnchor: [19, 36],
    });
  }, []);

  // Debounced marker update
  useEffect(() => {
    if (updateTimer.current) clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(() => {
      const cluster = clusterRef.current;
      if (!cluster) return;

      // Batch clear + add
      cluster.clearLayers();
      const markers: L.Marker[] = [];

      for (const p of parkings) {
        const m = L.marker([p.lat, p.lng], { icon: makeIcon(p) });

        // Lightweight popup — lazy bound on first click
        m.on("click", () => {
          onSelectRef.current(p);
        });

        markers.push(m);
      }

      // Bulk add — much faster than individual adds
      cluster.addLayers(markers);
    }, 50);

    return () => { if (updateTimer.current) clearTimeout(updateTimer.current); };
  }, [parkings, makeIcon]);

  // User position
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({
      className: "",
      html: '<div style="width:16px;height:16px;background:var(--accent);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(37,99,235,0.2), 0 2px 8px rgba(0,0,0,0.3)"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker(userPos, { icon, zIndexOffset: 1000 }).addTo(mapRef.current);
  }, [userPos]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: dark ? "#1a1a22" : "#f2efe9" }} />;
}
