import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { CURRENCY_OPTIONS, TRAVEL_DESTINATION_COUNTRIES } from '../lib/fx';
import { MASCOT_OPTIONS } from '../types/mavi';
import type { LicenseTier, MascotId } from '../types/mavi';

interface NewTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  licenseTier: LicenseTier;
  onCreate: (payload: {
    title: string;
    origin: string;
    destination: string;
    startDate: string;
    endDate: string;
    currency: string;
    totalBudget: number;
    companionNames: Array<{ name: string; mascotId: MascotId; budgetLimit: number }>;
  }) => Promise<void>;
  onOpenSubscriptions: () => void;
}

export const NewTripModal: React.FC<NewTripModalProps> = ({
  isOpen,
  onClose,
  licenseTier,
  onCreate,
  onOpenSubscriptions,
}) => {
  const [title, setTitle] = useState('');
  const [origin, setOrigin] = useState('San Francisco, CA');
  const [destinationCountry, setDestinationCountry] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [startDate, setStartDate] = useState('2026-12-05');
  const [endDate, setEndDate] = useState('2026-12-11');
  const [currency, setCurrency] = useState('USD');
  const [totalBudget, setTotalBudget] = useState('2400');
  const [companions, setCompanions] = useState<Array<{ name: string; mascotId: MascotId; budgetLimit: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const maxExtraTravelers = licenseTier === 'group5' ? 4 : 0;

  const handleAddCompanion = () => {
    if (companions.length >= maxExtraTravelers) {
      setError('Solo and Free licenses include 1 traveler per trip. Upgrade to the 5-Member Group License ($10) for up to 5 companions.');
      return;
    }
    setError(null);
    const nextMascot = MASCOT_OPTIONS[(companions.length + 1) % MASCOT_OPTIONS.length].id;
    setCompanions((prev) => [...prev, { name: '', mascotId: nextMascot, budgetLimit: '600' }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !destinationCountry.trim() || !origin.trim()) {
      setError('Please enter a trip title, origin, and select a destination country.');
      return;
    }
    const formattedDestination = destinationCity.trim()
      ? `${destinationCity.trim()}, ${destinationCountry.trim()}`
      : destinationCountry.trim();

    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        origin: origin.trim(),
        destination: formattedDestination.slice(0, 100),
        startDate,
        endDate,
        currency,
        totalBudget: Number(totalBudget) || 0,
        companionNames: companions
          .filter((c) => c.name.trim().length > 0)
          .map((c) => ({
            name: c.name.trim(),
            mascotId: c.mascotId,
            budgetLimit: Number(c.budgetLimit) || 500,
          })),
      });
      setTitle('');
      setDestinationCountry('');
      setDestinationCity('');
      setCompanions([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create trip.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Plan a New Trip</h2>
            <p className="mt-1 text-sm text-slate-500">
              Set your destination, dates, and group budget to auto-sync expenses and travel alerts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new trip dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="trip-title" className="block text-sm font-medium text-slate-700">
              Trip Name
            </label>
            <input
              id="trip-title"
              type="text"
              required
              maxLength={120}
              placeholder="e.g. Dubai & Abu Dhabi Winter Getaway"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="trip-origin" className="block text-sm font-medium text-slate-700">
                Origin City
              </label>
              <input
                id="trip-origin"
                type="text"
                required
                maxLength={100}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label htmlFor="trip-dest-country" className="block text-sm font-medium text-slate-700">
                Destination Country
              </label>
              <select
                id="trip-dest-country"
                required
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Select destination country...</option>
                {TRAVEL_DESTINATION_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="trip-dest-city" className="block text-sm font-medium text-slate-700">
              Destination City / Region <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <input
              id="trip-dest-city"
              type="text"
              maxLength={60}
              placeholder="e.g. Dubai, Goa, Kyoto, or Lisbon"
              value={destinationCity}
              onChange={(e) => setDestinationCity(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-1 sm:col-span-1">
              <label htmlFor="trip-start" className="block text-sm font-medium text-slate-700">
                Start Date
              </label>
              <input
                id="trip-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="col-span-1 sm:col-span-1">
              <label htmlFor="trip-end" className="block text-sm font-medium text-slate-700">
                End Date
              </label>
              <input
                id="trip-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label htmlFor="trip-currency" className="block text-sm font-medium text-slate-700">
                Currency
              </label>
              <select
                id="trip-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900 bg-white font-mono-num focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="trip-budget" className="block text-sm font-medium text-slate-700">
                {licenseTier === 'group5' ? 'Group Budget' : 'Personal Budget'}
              </label>
              <input
                id="trip-budget"
                type="number"
                min={0}
                required
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num text-slate-900"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {licenseTier === 'group5'
                    ? `Travel Companions (${1 + companions.length} / 5 seats)`
                    : 'Solo Expense Management (1 traveler)'}
                </h3>
                <p className="text-xs text-slate-500">
                  {licenseTier === 'group5'
                    ? 'Add up to 4 friends, family, or colleagues to track individual budgets.'
                    : 'Tracks your personal trip budget, multi-currency FX receipts, and itinerary costs.'}
                </p>
              </div>
              {licenseTier === 'group5' ? (
                <button
                  type="button"
                  onClick={handleAddCompanion}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Member
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSubscriptions();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Need Group Split?
                </button>
              )}
            </div>

            {companions.length > 0 && (
              <div className="mt-3 space-y-2.5">
                {companions.map((comp, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder={`Traveler ${idx + 2} name`}
                      value={comp.name}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c))
                        )
                      }
                      className="col-span-5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    />
                    <select
                      value={comp.mascotId}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) =>
                            i === idx ? { ...c, mascotId: e.target.value as MascotId } : c
                          )
                        )
                      }
                      className="col-span-4 rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
                    >
                      {MASCOT_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="Budget"
                      value={comp.budgetLimit}
                      onChange={(e) =>
                        setCompanions((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, budgetLimit: e.target.value } : c))
                        )
                      }
                      className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono-num"
                    />
                    <button
                      type="button"
                      onClick={() => setCompanions((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove traveler"
                      className="col-span-1 flex justify-center p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {error}
            </div>
          )}

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
              {saving ? 'Creating Trip...' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
