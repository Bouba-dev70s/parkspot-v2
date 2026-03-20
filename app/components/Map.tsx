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
}

export default function Map({ parkings, onSelect, userPos }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [48.8566, 2.3522],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: L.latLngBounds([48.1, 1.4], [49.25, 3.6]),
      maxBoundsViscosity: 0.8,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 120,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 18,
      keepBuffer: 6,
      updateWhenZooming: false,
      updateWhenIdle: true,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 40,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
    });
    map.addLayer(cluster);

    mapRef.current = map;
    clusterRef.current = cluster;
    map.getContainer().style.background = "#f2efe9";

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Update markers
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();

    const markers = parkings.map((p) => {
      const full = p.avail === 0;
      let cls = p.type === "free" ? "mm-f" : "mm-p";
      if (full) cls = "mm-x";
      const sz = full ? 26 : 34;
      const icon = L.divIcon({
        className: `mm ${cls}`,
        html: `${p.avail}`,
        iconSize: [sz, sz],
        iconAnchor: [sz / 2, sz / 2],
        popupAnchor: [0, -20],
      });
      const m = L.marker([p.lat, p.lng], { icon });
      const pct = p.total > 0 ? p.avail / p.total : 0;
      const vc = pct > 0.3 ? "var(--free)" : pct > 0 ? "var(--paid)" : "var(--full)";
      const tl = p.type === "free" ? "GRATUIT" : "PAYANT";
      m.bindPopup(
        `<div style="padding:14px 16px;min-width:200px;font-family:Outfit,sans-serif">
          <div style="font-size:10px;font-weight:600;letter-spacing:1.5px;color:${p.type === "free" ? "var(--free)" : "var(--paid)"}">${tl}</div>
          <div style="font-size:15px;font-weight:600;margin:4px 0 2px">${p.name}</div>
          <div style="font-size:11px;opacity:0.5;margin-bottom:10px">${p.addr}</div>
          <div style="display:flex;gap:10px;border-top:1px solid rgba(0,0,0,0.06);padding-top:10px">
            <div style="flex:1;text-align:center"><div class="font-mono" style="font-size:16px;font-weight:600;color:${vc}">${p.avail}</div><div style="font-size:9px;opacity:0.4">Dispo</div></div>
            <div style="flex:1;text-align:center"><div class="font-mono" style="font-size:16px;font-weight:600">${p.total}</div><div style="font-size:9px;opacity:0.4">Total</div></div>
            <div style="flex:1;text-align:center"><div class="font-mono" style="font-size:16px;font-weight:600;color:${p.price ? "var(--paid)" : "var(--free)"}">${p.price || "0€"}</div><div style="font-size:9px;opacity:0.4">Tarif</div></div>
          </div>
        </div>`,
        { maxWidth: 260 }
      );
      m.on("click", () => onSelect(p));
      return m;
    });

    cluster.addLayers(markers);

    // Fit bounds on first load
    if (parkings.length > 0 && mapRef.current) {
      const idf = parkings.filter((p) => p.lat > 48.1 && p.lat < 49.25);
      if (idf.length > 5) {
        const bounds = L.latLngBounds(idf.map((p) => [p.lat, p.lng]));
        mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }
    }
  }, [parkings, onSelect]);

  // User position
  useEffect(() => {
    if (!mapRef.current || !userPos) return;
    if (userMarkerRef.current) mapRef.current.removeLayer(userMarkerRef.current);
    const icon = L.divIcon({
      className: "",
      html: '<div style="width:16px;height:16px;background:var(--accent);border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.5)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker(userPos, { icon }).addTo(mapRef.current);
    mapRef.current.flyTo(userPos, 15, { duration: 0.8 });
  }, [userPos]);

  return <div ref={containerRef} className="w-full h-full" style={{ background: "var(--map-bg)" }} />;
}
