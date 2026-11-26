import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Download, MapPin, Minus, Plus, RotateCcw, WifiOff } from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import { useOnlineStatus } from '../../hooks/usePWA';
import { saveOfflineMapPack } from '../../lib/maviService';
import { getOfflineMapLocally, saveOfflineMapLocally } from '../../lib/offlineDb';
import type { OfflineMapPack, OfflineMapPin } from '../../types/mavi';

interface OfflineMapViewProps {
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
}

export const OfflineMapView: React.FC<OfflineMapViewProps> = ({
  simulatedOffline,
  onToggleSimulatedOffline,
}) => {
  const { firebaseUser, activeTrip, itinerary, offlinePacks } = useMavi();
  const isOnline = useOnlineStatus();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedPin, setSelectedPin] = useState<OfflineMapPin | null>(null);
  const [localPack, setLocalPack] = useState<(OfflineMapPack & { savedAt?: string }) | null>(null);
  const [downloading, setDownloading] = useState(false);

  const effectiveOffline = !isOnline || simulatedOffline;

  useEffect(() => {
    if (!activeTrip) return;
    getOfflineMapLocally(activeTrip.tripId).then((cached) => {
      if (cached) setLocalPack(cached);
      else setLocalPack(null);
    });
  }, [activeTrip]);

  const generatedPins: OfflineMapPin[] = useMemo(() => {
    if (!activeTrip) return [];
    const baseLat = activeTrip.destination.toLowerCase().includes('kyoto') ? 35.0116 : 40.6333;
    const baseLng = activeTrip.destination.toLowerCase().includes('kyoto') ? 135.7681 : 14.6029;
    const pins: OfflineMapPin[] = [];

    activeTrip.touristSpots.forEach((spot, idx) => {
      const angle = (idx * 1.4) + 0.5;
      const x = 50 + Math.cos(angle) * (18 + idx * 5);
      const y = 48 + Math.sin(angle) * (15 + idx * 4);
      pins.push({
        id: `spot-${idx}`,
        label: spot.name,
        kind: 'spot',
        x: Math.max(12, Math.min(88, x)),
        y: Math.max(14, Math.min(84, y)),
        lat: Number((baseLat + (spot.latOffset || 0.01 * (idx + 1))).toFixed(4)),
        lng: Number((baseLng + (spot.lngOffset || -0.01 * (idx + 1))).toFixed(4)),
        notes: spot.description,
      });
    });

    itinerary.forEach((item, idx) => {
      const kind =
        item.category === 'lodging'
          ? 'stay'
          : item.category === 'flight' || item.category === 'train' || item.category === 'transport'
          ? 'transit'
          : item.category === 'dining'
          ? 'dining'
          : 'spot';
      pins.push({
        id: `itin-${item.itemId}`,
        label: item.title,
        kind,
        x: 24 + ((idx * 19) % 54),
        y: 26 + ((idx * 23) % 50),
        lat: Number((baseLat + (idx - 1) * 0.009).toFixed(4)),
        lng: Number((baseLng + (idx - 1) * 0.012).toFixed(4)),
        notes: `${item.dateTime} · ${item.location || activeTrip.destination}`,
      });
    });

    if (pins.length === 0) {
      pins.push({
        id: 'center-hub',
        label: `${activeTrip.destination} Central Hub`,
        kind: 'transit',
        x: 50,
        y: 50,
        lat: baseLat,
        lng: baseLng,
        notes: 'Primary arrival & navigation anchor.',
      });
    }

    return pins.slice(0, 14);
  }, [activeTrip, itinerary]);

  const activePins = localPack?.pins?.length ? localPack.pins : offlinePacks[0]?.pins || generatedPins;

  useEffect(() => {
    if (activePins.length > 0 && !selectedPin) {
      setSelectedPin(activePins[0]);
    }
  }, [activePins, selectedPin]);

  if (!activeTrip) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Select or create a trip to download and navigate offline maps.</p>
      </div>
    );
  }

  const handleDownloadPack = async () => {
    if (!firebaseUser || !activeTrip) return;
    setDownloading(true);
    try {
      const centerLat = activePins[0]?.lat ?? 40.6333;
      const centerLng = activePins[0]?.lng ?? 14.6029;
      const sizeKb = 1480 + activePins.length * 42;

      const packPayload: OfflineMapPack = {
        packId: `pack_${activeTrip.tripId}`,
        tripId: activeTrip.tripId,
        destination: activeTrip.destination,
        centerLat,
        centerLng,
        zoomLevel: 13,
        pins: generatedPins,
        downloadedByUid: firebaseUser.uid,
        sizeKb,
      };

      await saveOfflineMapLocally(packPayload);
      setLocalPack({ ...packPayload, savedAt: new Date().toISOString() });

      if (navigator.onLine) {
        await saveOfflineMapPack(packPayload);
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Offline Navigation Map — {activeTrip.destination}</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono-num">
              {localPack
                ? `Cached locally (${(localPack.sizeKb / 1024).toFixed(2)} MB · ${localPack.pins.length} pins)`
                : 'Not cached locally yet · Download pack before entering remote areas'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleSimulatedOffline}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                simulatedOffline
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <WifiOff className="h-3.5 w-3.5" />
              {simulatedOffline ? 'Exit Offline Preview' : 'Test Offline Mode'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPack}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Caching Region...' : localPack ? 'Refresh Offline Pack' : 'Download Offline Pack'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 relative h-[430px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs">
              <Compass className="h-3.5 w-3.5 text-teal-600" />
              <span>{effectiveOffline ? 'Offline Vector Pack Active' : 'Interactive Vector + Sync Map'}</span>
            </div>

            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.25).toFixed(2))))}
                aria-label="Zoom in"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.25).toFixed(2))))}
                aria-label="Zoom out"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                aria-label="Reset map view"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, x: p.x + 25 }))}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-700 cursor-pointer"
              >
                West
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, y: p.y + 25 }))}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-700 cursor-pointer"
              >
                North
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, y: p.y - 25 }))}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-700 cursor-pointer"
              >
                South
              </button>
              <button
                type="button"
                onClick={() => setPan((p) => ({ ...p, x: p.x - 25 }))}
                className="rounded border border-slate-200 bg-white/95 px-2 py-1 text-xs text-slate-700 cursor-pointer"
              >
                East
              </button>
            </div>

            <div
              className="h-full w-full transition-transform duration-150 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <svg viewBox="0 0 800 500" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
                <rect width="800" height="500" fill="#E6F4F1" />
                {/* Coastal sea & terrain contours */}
                <path d="M0 320 Q 190 270 360 330 T 800 280 L 800 500 L 0 500 Z" fill="#BCE3DD" />
                <path d="M0 370 Q 240 330 480 390 T 800 350 L 800 500 L 0 500 Z" fill="#89CFC7" />
                {/* Topographic contour lines */}
                <path
                  d="M60 90 Q 220 50 380 120 T 720 85"
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="1.5"
                  strokeDasharray="6 4"
                />
                <path
                  d="M90 175 Q 290 130 470 205 T 760 170"
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="1.5"
                />
                {/* Scenic route connector */}
                <polyline
                  points={activePins.map((p) => `${(p.x / 100) * 800},${(p.y / 100) * 500}`).join(' ')}
                  fill="none"
                  stroke="#0D9488"
                  strokeWidth="2.5"
                  strokeDasharray="6 5"
                />
                {/* Coordinate grid */}
                {[160, 320, 480, 640].map((gx) => (
                  <line key={gx} x1={gx} y1="0" x2={gx} y2="500" stroke="#94A3B8" strokeOpacity="0.18" />
                ))}
                {[125, 250, 375].map((gy) => (
                  <line key={gy} x1="0" y1={gy} x2="800" y2={gy} stroke="#94A3B8" strokeOpacity="0.18" />
                ))}
              </svg>

              {activePins.map((pin) => {
                const isSelected = selectedPin?.id === pin.id;
                const pinColor =
                  pin.kind === 'stay'
                    ? 'bg-teal-700'
                    : pin.kind === 'transit'
                    ? 'bg-slate-900'
                    : 'bg-orange-500';
                return (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => setSelectedPin(pin)}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-white shadow-sm transition-transform cursor-pointer ${pinColor} ${
                      isSelected ? 'scale-110 ring-2 ring-white z-20' : 'hover:scale-105 z-10'
                    }`}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="max-w-[110px] truncate">{pin.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 p-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
                Offline Waypoints ({activePins.length})
              </h2>

              {selectedPin && (
                <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                  <p className="text-xs font-medium text-teal-800 uppercase tracking-wide">{selectedPin.kind}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{selectedPin.label}</p>
                  <p className="mt-1 text-xs text-slate-600">{selectedPin.notes}</p>
                  <p className="mt-2 font-mono-num text-xs text-slate-500">
                    GPS: {selectedPin.lat}, {selectedPin.lng}
                  </p>
                </div>
              )}

              <div className="mt-3 max-h-[220px] overflow-y-auto divide-y divide-slate-100">
                {activePins.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => setSelectedPin(pin)}
                    className={`w-full py-2 text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                      selectedPin?.id === pin.id ? 'text-teal-700 font-semibold' : 'text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{pin.label}</span>
                    <span className="font-mono-num text-slate-400 shrink-0 capitalize">{pin.kind}</span>
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              Offline packs persist in IndexedDB and remain accessible when cellular service is unavailable.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
