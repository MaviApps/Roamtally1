import React, { useState } from 'react';
import { Compass, X } from 'lucide-react';
import { MASCOT_OPTIONS } from '../types/mavi';
import type { MascotId, ThemeAccent } from '../types/mavi';

interface MascotAvatarProps {
  mascotId: MascotId;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const MascotAvatar: React.FC<MascotAvatarProps> = ({
  mascotId,
  size = 'md',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const mascot = MASCOT_OPTIONS.find((m) => m.id === mascotId) || MASCOT_OPTIONS[0];

  const sizeClass =
    size === 'sm'
      ? 'h-9 w-9'
      : size === 'md'
      ? 'h-12 w-12'
      : size === 'lg'
      ? 'h-16 w-16'
      : 'h-24 w-24';

  if (imgFailed) {
    return (
      <div
        className={`${sizeClass} rounded-xl border border-slate-200 bg-teal-50 flex items-center justify-center text-teal-700 shrink-0 ${className}`}
        title={mascot.name}
      >
        <Compass className="h-5 w-5" />
      </div>
    );
  }

  return (
    <img
      src={mascot.image}
      alt={mascot.name}
      referrerPolicy="no-referrer"
      onError={() => setImgFailed(true)}
      className={`${sizeClass} rounded-xl border border-slate-200 object-cover bg-slate-100 shrink-0 ${className}`}
    />
  );
};

interface MascotCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName: string;
  initialMascot: MascotId;
  initialAccent: ThemeAccent;
  onSave: (displayName: string, mascotId: MascotId, themeAccent: ThemeAccent) => Promise<void>;
}

export const MascotCustomizerModal: React.FC<MascotCustomizerModalProps> = ({
  isOpen,
  onClose,
  initialName,
  initialMascot,
  initialAccent,
  onSave,
}) => {
  const [name, setName] = useState(initialName);
  const [mascotId, setMascotId] = useState<MascotId>(initialMascot);
  const [accent, setAccent] = useState<ThemeAccent>(initialAccent);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(name, mascotId, accent);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Customize Travel Companion & Profile</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose your MAVI cartoon travel guide and theme accent across trips.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customization dialog"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div>
            <label htmlFor="mavi-display-name" className="block text-sm font-medium text-slate-700">
              Traveler Display Name
            </label>
            <input
              id="mavi-display-name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">
              Select Your MAVI Travel Mascot
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MASCOT_OPTIONS.map((m) => {
                const selected = m.id === mascotId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMascotId(m.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-teal-600 bg-teal-50/50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <MascotAvatar mascotId={m.id} size="lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{m.name}</p>
                      <p className="text-xs font-medium text-teal-700">{m.role}</p>
                      <p className="mt-1 text-xs text-slate-500 leading-snug">{m.tagline}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">MAVI Highlight Accent</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccent('coastal-teal')}
                className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer ${
                  accent === 'coastal-teal'
                    ? 'border-teal-600 bg-teal-50 text-teal-900'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="h-4 w-4 rounded bg-teal-600 shrink-0" />
                Coastal Teal
              </button>
              <button
                type="button"
                onClick={() => setAccent('sunset-coral')}
                className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium cursor-pointer ${
                  accent === 'sunset-coral'
                    ? 'border-orange-500 bg-orange-50 text-orange-900'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="h-4 w-4 rounded bg-orange-500 shrink-0" />
                Sunset Coral
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Companion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
