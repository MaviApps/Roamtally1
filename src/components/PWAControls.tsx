import React, { useState } from 'react';
import { Copy, Check, Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';
import { RoamTallyLogo } from './RoamTallyLogo';

export const MobileAppInstallModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyLink = () => {
    if (!appUrl) return;
    navigator.clipboard?.writeText(appUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <RoamTallyLogo size="md" showWordmark={false} />
            <div>
              <h3 className="text-lg font-bold text-slate-900">RoamTally Mobile App</h3>
              <p className="text-[11px] font-medium text-teal-700">Powered by MaVi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mobile install modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Install RoamTally directly to your iPhone or Android home screen for full-screen thumb navigation, offline maps,
          and instant expense tracking—no app store wait required.
        </p>

        {isInstalled ? (
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-sm font-medium text-teal-900">
            RoamTally is already running in standalone mobile app mode on this device.
          </div>
        ) : isInstallable ? (
          <button
            type="button"
            onClick={async () => {
              const ok = await install();
              if (ok) onClose();
            }}
            className="mt-4 w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-700 transition-colors cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Install RoamTally on This Device
          </button>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed">
            {isIOS ? (
              <>
                <p className="font-semibold text-slate-900">iPhone &amp; iPad (Safari)</p>
                <p>1. Open this app in Safari and tap the <strong>Share</strong> icon in the bottom bar.</p>
                <p>2. Scroll down and tap <strong>Add to Home Screen</strong>.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900">Android &amp; iOS Home Screen Setup</p>
                <p>· <strong>Android Chrome</strong>: Tap the browser menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
                <p>· <strong>iPhone Safari</strong>: Tap <strong>Share</strong> and select <strong>Add to Home Screen</strong>.</p>
              </>
            )}
          </div>
        )}

        {appUrl && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <span className="text-xs font-mono-num text-slate-600 truncate">{appUrl}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedUrl ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-4 w-4 text-teal-600" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="h-4 w-4 text-teal-600" />
          Get App
        </button>

        <MobileAppInstallModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC<{ simulatedOffline?: boolean }> = ({ simulatedOffline }) => {
  const isOnline = useOnlineStatus();
  const offline = !isOnline || simulatedOffline;

  if (!offline) return null;

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 shadow-sm">
      <WifiOff className="h-4 w-4 text-amber-600 shrink-0" />
      <span>
        {simulatedOffline
          ? 'Offline Preview Active — Using locally cached maps and trip snapshots.'
          : 'Offline Mode — Cached maps and itinerary remain available.'}
      </span>
    </div>
  );
};
