"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface Pin {
  id: number;
  name: string;
  lat: number;
  lng: number;
  label?: string; // stop number
  sub?: string;
  highlight?: boolean;
}

// default marker image path next e bhange, tai divIcon
function icon(label: string, highlight: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${highlight ? "#1f5e4a" : "#1d2422"};border:2px solid #fffdf8;box-shadow:0 2px 6px rgba(0,0,0,.3);display:grid;place-items:center"><span style="transform:rotate(45deg);color:#fff;font:600 11px ui-monospace,monospace">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

export default function PharmacyMap({ user, pins, route }: { user: [number, number] | null; pins: Pin[]; route?: [number, number][] }) {
  const points: [number, number][] = [...(user ? [user] : []), ...pins.map((p) => [p.lat, p.lng] as [number, number])];
  const center = user ?? (pins[0] ? [pins[0].lat, pins[0].lng] : [23.7255, 90.3965]);

  return (
    <MapContainer center={center as [number, number]} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <Fit points={points} />
      {user && (
        <CircleMarker center={user} radius={8} pathOptions={{ color: "#fff", fillColor: "#b5432f", fillOpacity: 1, weight: 2 }}>
          <Popup>You are here</Popup>
        </CircleMarker>
      )}
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#1f5e4a", weight: 3, dashArray: "6 6" }} />}
      {pins.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={icon(p.label ?? "", !!p.highlight)}>
          <Popup>
            <div style={{ fontSize: 13 }}>
              <b>{p.name}</b>
              {p.sub && <div style={{ color: "#666" }}>{p.sub}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
