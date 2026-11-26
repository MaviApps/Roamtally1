import type { OfflineMapPack, Trip, ItineraryItem, ExpenseItem } from '../types/mavi';

const DB_NAME = 'mavi_offline_store';
const DB_VERSION = 2;
const STORE_MAPS = 'offline_maps';
const STORE_TRIPS = 'cached_trips';
const STORE_WALLET = 'wallet_files';

export const WALLET_QUOTA_BYTES = 15 * 1024 * 1024; // 15 MB local pocket wallet quota
export const MAX_WALLET_FILE_BYTES = 3 * 1024 * 1024; // 3 MB max per uploaded bill/ticket/itinerary

export interface WalletFileRecord {
  docId: string;
  tripId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MAPS)) {
        db.createObjectStore(STORE_MAPS, { keyPath: 'tripId' });
      }
      if (!db.objectStoreNames.contains(STORE_TRIPS)) {
        db.createObjectStore(STORE_TRIPS, { keyPath: 'tripId' });
      }
      if (!db.objectStoreNames.contains(STORE_WALLET)) {
        const walletStore = db.createObjectStore(STORE_WALLET, { keyPath: 'docId' });
        walletStore.createIndex('tripId', 'tripId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineMapLocally(pack: OfflineMapPack): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MAPS, 'readwrite');
    tx.objectStore(STORE_MAPS).put({
      ...pack,
      savedAt: new Date().toISOString(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB map save failed:', err);
  }
}

export async function getOfflineMapLocally(tripId: string): Promise<(OfflineMapPack & { savedAt?: string }) | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MAPS, 'readonly');
    const req = tx.objectStore(STORE_MAPS).get(tripId);
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export interface CachedTripBundle {
  tripId: string;
  trip: Trip;
  itinerary: ItineraryItem[];
  expenses: ExpenseItem[];
  cachedAt: string;
}

export async function saveTripSnapshotLocally(bundle: CachedTripBundle): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TRIPS, 'readwrite');
    tx.objectStore(STORE_TRIPS).put(bundle);
  } catch (err) {
    console.warn('IndexedDB trip snapshot failed:', err);
  }
}

export async function getTripSnapshotLocally(tripId: string): Promise<CachedTripBundle | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TRIPS, 'readonly');
    const req = tx.objectStore(STORE_TRIPS).get(tripId);
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function saveWalletFileLocally(record: Omit<WalletFileRecord, 'savedAt'>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_WALLET, 'readwrite');
  tx.objectStore(STORE_WALLET).put({
    ...record,
    savedAt: new Date().toISOString(),
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWalletFilesForTrip(tripId: string): Promise<Record<string, WalletFileRecord>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_WALLET, 'readonly');
    const req = tx.objectStore(STORE_WALLET).getAll();
    const rows = await new Promise<WalletFileRecord[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as WalletFileRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    const map: Record<string, WalletFileRecord> = {};
    for (const row of rows) {
      if (row.tripId === tripId) {
        map[row.docId] = row;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export async function getWalletStorageUsageBytes(): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_WALLET, 'readonly');
    const req = tx.objectStore(STORE_WALLET).getAll();
    const rows = await new Promise<WalletFileRecord[]>((resolve, reject) => {
      req.onsuccess = () => resolve((req.result as WalletFileRecord[]) || []);
      req.onerror = () => reject(req.error);
    });
    return rows.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  } catch {
    return 0;
  }
}

export async function deleteWalletFileLocally(docId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_WALLET, 'readwrite');
    tx.objectStore(STORE_WALLET).delete(docId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB wallet file delete failed:', err);
  }
}
