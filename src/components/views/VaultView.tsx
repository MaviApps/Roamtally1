import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  HardDrive,
  Lock,
  Paperclip,
  Plane,
  Receipt,
  Route,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import { decryptTripDocument, encryptTripDocument } from '../../lib/crypto';
import { deleteEncryptedDocument, saveEncryptedDocument } from '../../lib/maviService';
import {
  deleteWalletFileLocally,
  getWalletFilesForTrip,
  getWalletStorageUsageBytes,
  MAX_WALLET_FILE_BYTES,
  saveWalletFileLocally,
  WALLET_QUOTA_BYTES,
  type WalletFileRecord,
} from '../../lib/offlineDb';
import type { EncryptedDocCategory, EncryptedDocument } from '../../types/mavi';

type WalletItemType = 'bill' | 'flight' | 'itinerary' | 'insurance' | 'passport';
type WalletFilter = 'all' | WalletItemType;

interface DecryptedWalletPayload {
  walletType: WalletItemType;
  refCode?: string;
  details: string;
  fileName?: string;
}

const WALLET_TYPE_META: Record<
  WalletItemType,
  { label: string; shortLabel: string; firestoreCategory: EncryptedDocCategory; icon: React.ComponentType<{ className?: string }> }
> = {
  bill: { label: 'Bill / Receipt', shortLabel: 'Bills', firestoreCategory: 'note', icon: Receipt },
  flight: { label: 'Flight Ticket / Boarding Pass', shortLabel: 'Flights', firestoreCategory: 'ticket', icon: Plane },
  itinerary: { label: 'Itinerary Confirmation', shortLabel: 'Itinerary', firestoreCategory: 'note', icon: Route },
  insurance: { label: 'Travel Insurance', shortLabel: 'Insurance', firestoreCategory: 'insurance', icon: ShieldCheck },
  passport: { label: 'Passport / Visa ID', shortLabel: 'IDs & Visas', firestoreCategory: 'passport', icon: FileText },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferWalletType(docItem: EncryptedDocument, decrypted?: DecryptedWalletPayload): WalletItemType {
  if (decrypted?.walletType) return decrypted.walletType;
  if (docItem.docCategory === 'ticket') return 'flight';
  if (docItem.docCategory === 'insurance') return 'insurance';
  if (docItem.docCategory === 'passport' || docItem.docCategory === 'visa' || docItem.docCategory === 'customs') {
    return 'passport';
  }
  const lowerTitle = docItem.title.toLowerCase();
  if (lowerTitle.includes('bill') || lowerTitle.includes('receipt') || lowerTitle.includes('invoice')) return 'bill';
  if (lowerTitle.includes('itinerary') || lowerTitle.includes('hotel') || lowerTitle.includes('check-in')) return 'itinerary';
  return 'bill';
}

function parseDecryptedContent(raw: string, fallbackCategory: EncryptedDocCategory): DecryptedWalletPayload {
  try {
    const parsed = JSON.parse(raw) as {
      v?: number;
      walletType?: WalletItemType;
      refCode?: string;
      details?: string;
      fileName?: string;
    };
    if (parsed && parsed.v === 1 && typeof parsed.details === 'string') {
      return {
        walletType: parsed.walletType || (fallbackCategory === 'ticket' ? 'flight' : 'bill'),
        refCode: parsed.refCode,
        details: parsed.details,
        fileName: parsed.fileName,
      };
    }
  } catch {
    // Legacy plain-text document payload
  }
  return {
    walletType: fallbackCategory === 'ticket' ? 'flight' : fallbackCategory === 'insurance' ? 'insurance' : 'passport',
    details: raw,
  };
}

export const VaultView: React.FC = () => {
  const { firebaseUser, profile, activeTrip, encryptedDocs } = useMavi();
  const [walletType, setWalletType] = useState<WalletItemType>('bill');
  const [title, setTitle] = useState('');
  const [refCode, setRefCode] = useState('');
  const [secretContent, setSecretContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    dataUrl: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sending, setSending] = useState(false);
  const [filterType, setFilterType] = useState<WalletFilter>('all');
  const [decryptedMap, setDecryptedMap] = useState<Record<string, DecryptedWalletPayload>>({});
  const [walletFiles, setWalletFiles] = useState<Record<string, WalletFileRecord>>({});
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [checkedReqs, setCheckedReqs] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadLocalWallet = async () => {
      if (!activeTrip) return;
      const [filesMap, used] = await Promise.all([
        getWalletFilesForTrip(activeTrip.tripId),
        getWalletStorageUsageBytes(),
      ]);
      if (active) {
        setWalletFiles(filesMap);
        setStorageUsedBytes(used);
      }
    };
    loadLocalWallet();
    return () => {
      active = false;
    };
  }, [activeTrip, encryptedDocs.length]);

  if (!activeTrip) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">
          Select or create a trip to open your Travel Wallet &amp; Encrypted Vault.
        </p>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Please upload an image (JPG, PNG, WebP) or PDF ticket/bill.');
      return;
    }
    if (file.size > MAX_WALLET_FILE_BYTES) {
      setError(`File exceeds the 3 MB per-item limit (${formatBytes(file.size)}).`);
      return;
    }
    if (storageUsedBytes + file.size > WALLET_QUOTA_BYTES) {
      setError('Pocket Wallet 15 MB device storage quota reached. Delete an older item first.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedFile({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          dataUrl: reader.result,
        });
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^.]+$/, ''));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveWalletItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !title.trim()) return;
    if (!secretContent.trim() && !selectedFile && !refCode.trim()) {
      setError('Add notes, a booking/bill reference, or attach a file before saving.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const payloadJson = JSON.stringify({
        v: 1,
        walletType,
        refCode: refCode.trim() || undefined,
        details:
          secretContent.trim() ||
          (selectedFile ? `Stored attachment: ${selectedFile.fileName}` : refCode.trim()),
        fileName: selectedFile?.fileName,
      });

      const { ciphertext, iv } = await encryptTripDocument(
        payloadJson,
        activeTrip.tripId,
        activeTrip.joinCode
      );

      const newDocId = await saveEncryptedDocument({
        tripId: activeTrip.tripId,
        senderUid: firebaseUser.uid,
        senderName: profile.displayName,
        docCategory: WALLET_TYPE_META[walletType].firestoreCategory,
        title: title.trim(),
        ciphertext,
        iv,
      });

      if (selectedFile) {
        await saveWalletFileLocally({
          docId: newDocId,
          tripId: activeTrip.tripId,
          fileName: selectedFile.fileName,
          mimeType: selectedFile.mimeType,
          sizeBytes: selectedFile.sizeBytes,
          dataUrl: selectedFile.dataUrl,
        });
        const [filesMap, used] = await Promise.all([
          getWalletFilesForTrip(activeTrip.tripId),
          getWalletStorageUsageBytes(),
        ]);
        setWalletFiles(filesMap);
        setStorageUsedBytes(used);
      }

      setTitle('');
      setRefCode('');
      setSecretContent('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Travel Wallet item.');
    } finally {
      setSending(false);
    }
  };

  const handleToggleDecrypt = async (docItem: EncryptedDocument) => {
    if (decryptedMap[docItem.docId]) {
      setDecryptedMap((prev) => {
        const next = { ...prev };
        delete next[docItem.docId];
        return next;
      });
      return;
    }

    try {
      const plain = await decryptTripDocument(
        docItem.ciphertext,
        docItem.iv,
        activeTrip.tripId,
        activeTrip.joinCode
      );
      const parsed = parseDecryptedContent(plain, docItem.docCategory);
      setDecryptedMap((prev) => ({ ...prev, [docItem.docId]: parsed }));
    } catch {
      setDecryptedMap((prev) => ({
        ...prev,
        [docItem.docId]: {
          walletType: inferWalletType(docItem),
          details: 'Unable to decrypt with current trip key.',
        },
      }));
    }
  };

  const handleDeleteWalletItem = async (docId: string) => {
    await Promise.all([
      deleteEncryptedDocument(activeTrip.tripId, docId),
      deleteWalletFileLocally(docId),
    ]);
    const [filesMap, used] = await Promise.all([
      getWalletFilesForTrip(activeTrip.tripId),
      getWalletStorageUsageBytes(),
    ]);
    setWalletFiles(filesMap);
    setStorageUsedBytes(used);
  };

  const storagePercent = Math.min(100, Math.round((storageUsedBytes / WALLET_QUOTA_BYTES) * 100));

  const filteredDocs = encryptedDocs.filter((docItem) => {
    if (filterType === 'all') return true;
    const type = inferWalletType(docItem, decryptedMap[docItem.docId]);
    return type === filterType;
  });

  const walletCounts = encryptedDocs.reduce<Record<WalletItemType, number>>(
    (acc, d) => {
      const t = inferWalletType(d, decryptedMap[d.docId]);
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    { bill: 0, flight: 0, itinerary: 0, insurance: 0, passport: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Pocket Travel Wallet Quota & Overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Travel Wallet &amp; Encrypted Vault</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Store bills, receipts, flight boarding passes, and itinerary confirmations for {activeTrip.destination}.
              </p>
            </div>
          </div>

          <div className="w-full md:w-64 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                <HardDrive className="h-3.5 w-3.5 text-teal-600" />
                Pocket Wallet Storage
              </span>
              <span className="font-mono-num text-slate-600">
                {formatBytes(storageUsedBytes)} / 15.0 MB
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${
                  storagePercent >= 85 ? 'bg-orange-500' : 'bg-teal-600'
                }`}
                style={{ width: `${Math.max(storageUsedBytes > 0 ? 3 : 0, storagePercent)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(Object.keys(WALLET_TYPE_META) as WalletItemType[]).map((key) => {
            const meta = WALLET_TYPE_META[key];
            const Icon = meta.icon;
            return (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{meta.shortLabel}</span>
                  <Icon className="h-3.5 w-3.5 text-teal-700" />
                </div>
                <p className="mt-1 text-lg font-bold font-mono-num text-slate-900">{walletCounts[key]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add to Travel Wallet Form */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-900">Add to Wallet</h2>
            </div>
            <span className="text-[11px] font-medium text-teal-700">AES-GCM + Offline File</span>
          </div>

          <form onSubmit={handleSaveWalletItem} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">Wallet Slot</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(WALLET_TYPE_META) as WalletItemType[]).map((key) => {
                  const meta = WALLET_TYPE_META[key];
                  const Icon = meta.icon;
                  const active = walletType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setWalletType(key)}
                      className={`min-h-[40px] flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{meta.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Item Title</label>
              <input
                type="text"
                required
                placeholder={
                  walletType === 'flight'
                    ? 'e.g. Lufthansa LH455 SFO → MUC'
                    : walletType === 'bill'
                    ? 'e.g. Positano Dinner Receipt'
                    : walletType === 'itinerary'
                    ? 'e.g. Villa Terrazza Hotel Confirmation'
                    : 'e.g. Travel Policy #8841'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                {walletType === 'bill'
                  ? 'Bill Amount / Merchant (Optional)'
                  : walletType === 'flight'
                  ? 'PNR / Seat / Gate (Optional)'
                  : 'Booking Reference / Confirmation Code (Optional)'}
              </label>
              <input
                type="text"
                placeholder={
                  walletType === 'bill'
                    ? 'e.g. EUR 64.50 · Da Adolfo'
                    : walletType === 'flight'
                    ? 'e.g. PNR XK92MP · Seat 14A'
                    : 'e.g. Conf #HTL-44102'
                }
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Encrypted Notes / Details
              </label>
              <textarea
                rows={3}
                placeholder="Check-in PIN, baggage allowance, emergency hotline, or itemized note..."
                value={secretContent}
                onChange={(e) => setSecretContent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {/* Pocket File Attachment */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Attach Bill Photo, Flight Ticket, or PDF (Max 3 MB)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                    <span className="truncate font-medium text-slate-800">{selectedFile.fileName}</span>
                    <span className="font-mono-num text-slate-500 shrink-0">
                      ({formatBytes(selectedFile.sizeBytes)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    aria-label="Remove attached file"
                    className="rounded p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-teal-600" />
                  Upload Receipt Image or Flight Ticket PDF
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              {sending ? 'Encrypting & Storing...' : 'Save to Travel Wallet'}
            </button>
          </form>
        </section>

        {/* Wallet Documents & Files */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Saved Wallet Items</h2>
              <p className="text-xs text-slate-500">
                Cloud metadata encrypted with trip key · File attachments saved offline on this device
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono-num">{filteredDocs.length} items</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'bill', label: 'Bills' },
                { id: 'flight', label: 'Flight Tickets' },
                { id: 'itinerary', label: 'Itinerary' },
                { id: 'insurance', label: 'Insurance' },
                { id: 'passport', label: 'IDs & Visas' },
              ] as Array<{ id: WalletFilter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  filterType === f.id
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredDocs.length === 0 ? (
            <div className="py-12 text-center">
              <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">No wallet items in this folder yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Add a bill photo, boarding pass PDF, or hotel confirmation using the Travel Wallet form.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {filteredDocs.map((docItem) => {
                const decrypted = decryptedMap[docItem.docId];
                const attachedFile = walletFiles[docItem.docId];
                const itemType = inferWalletType(docItem, decrypted);
                const meta = WALLET_TYPE_META[itemType];
                const TypeIcon = meta.icon;

                return (
                  <div key={docItem.docId} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                          <TypeIcon className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                          <span>{meta.label}</span>
                          <span>·</span>
                          <span>Added by {docItem.senderName}</span>
                          {attachedFile && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 text-teal-700 font-medium font-mono-num">
                                <Paperclip className="h-3 w-3" />
                                {formatBytes(attachedFile.sizeBytes)}
                              </span>
                            </>
                          )}
                        </p>
                        <h3 className="mt-0.5 text-sm font-semibold text-slate-900 truncate">{docItem.title}</h3>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleDecrypt(docItem)}
                          className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {decrypted ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {decrypted ? 'Hide' : 'Open'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWalletItem(docItem.docId)}
                          aria-label={`Delete ${docItem.title}`}
                          className="min-h-[36px] rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {decrypted ? (
                      <div className="mt-3 space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3.5 text-sm text-slate-800">
                        {decrypted.refCode && (
                          <p className="text-xs font-semibold font-mono-num text-teal-900">
                            Ref / Amount: {decrypted.refCode}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{decrypted.details}</p>

                        {attachedFile ? (
                          <div className="border-t border-teal-200/70 pt-3 space-y-2.5">
                            {attachedFile.mimeType.startsWith('image/') && (
                              <img
                                src={attachedFile.dataUrl}
                                alt={attachedFile.fileName}
                                className="max-h-64 w-auto rounded-lg border border-slate-200 bg-white object-contain"
                              />
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-slate-600 truncate">
                                {attachedFile.fileName} · {formatBytes(attachedFile.sizeBytes)}
                              </span>
                              <a
                                href={attachedFile.dataUrl}
                                download={attachedFile.fileName}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 shrink-0"
                              >
                                <Download className="h-3.5 w-3.5 text-teal-700" />
                                Download File
                              </a>
                            </div>
                          </div>
                        ) : decrypted.fileName ? (
                          <p className="text-xs text-slate-500 border-t border-teal-200/70 pt-2">
                            File &ldquo;{decrypted.fileName}&rdquo; is stored locally on the device where it was uploaded.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 font-mono-num text-xs text-slate-400 truncate">
                        AES-GCM Protected: {docItem.ciphertext.slice(0, 48)}...
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Required Destination Documents Checklist */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Required Destination Checklist</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Entry &amp; insurance checklist for {activeTrip.origin} → {activeTrip.destination}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700">
            <ShieldCheck className="h-4 w-4" />
            AES-GCM 256-Bit Vault Key
          </div>
        </div>

        {activeTrip.requiredDocs.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Tap &ldquo;Refresh Live Insights&rdquo; on the Home tab to load destination visa, passport, and
            insurance requirements.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {activeTrip.requiredDocs.map((req, idx) => (
              <label key={idx} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(checkedReqs[idx])}
                  onChange={(e) => setCheckedReqs((prev) => ({ ...prev, [idx]: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {req.title}{' '}
                    <span className="text-xs font-normal text-slate-500 capitalize">
                      · {req.docType} · {req.priority}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{req.requirement}</p>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
