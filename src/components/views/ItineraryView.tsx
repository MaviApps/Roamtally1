import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, MapPin, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import {
  convertCurrencyAmount,
  fetchRatesForBase,
  formatCurrencyOptionLabel,
  SUPPORTED_CURRENCIES,
} from '../../lib/fx';
import {
  deleteItineraryWithExpenseSync,
  saveItineraryWithExpenseSync,
} from '../../lib/maviService';
import type { ItineraryCategory, ItineraryItem, SplitMethod, TouristSpot } from '../../types/mavi';

export const ItineraryView: React.FC = () => {
  const { firebaseUser, profile, activeTrip, members, itinerary } = useMavi();
  const isSoloMode = profile?.licenseTier === 'solo' || members.length <= 1;
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ItineraryCategory>('activity');
  const [dateTime, setDateTime] = useState('2026-11-23 10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('60');
  const [cost, setCost] = useState('0');
  const [paidCurrency, setPaidCurrency] = useState('USD');
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [paidBy, setPaidBy] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTrip?.currency) {
      setPaidCurrency(activeTrip.currency);
    }
  }, [activeTrip?.tripId, activeTrip?.currency]);

  useEffect(() => {
    if (!showForm) return;
    let active = true;
    setFxLoading(true);
    fetchRatesForBase(paidCurrency)
      .then((rates) => {
        if (active) setFxRates(rates);
      })
      .finally(() => {
        if (active) setFxLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paidCurrency, showForm]);

  const currencyChoices = useMemo(() => {
    const set = new Set<string>(SUPPORTED_CURRENCIES);
    if (activeTrip?.currency) set.add(activeTrip.currency.toUpperCase());
    return Array.from(set);
  }, [activeTrip?.currency]);

  const [suggesting, setSuggesting] = useState(false);
  const [suggestedItems, setSuggestedItems] = useState<
    Array<{
      title: string;
      category: ItineraryCategory;
      dateTime: string;
      location: string;
      notes: string;
      reminderMinutesBefore: number;
      cost: number;
    }>
  >([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  if (!activeTrip) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Select or create a trip to plan your itinerary.</p>
      </div>
    );
  }

  const effectivePayer = paidBy || members[0]?.memberId || 'owner';
  const rawCost = Number(cost) || 0;
  const isForeignCurrency = paidCurrency.toUpperCase() !== activeTrip.currency.toUpperCase();
  const conversion = convertCurrencyAmount(rawCost, paidCurrency, activeTrip.currency, fxRates);

  const openEditor = (item?: ItineraryItem) => {
    setPaidCurrency(activeTrip.currency);
    if (item) {
      setEditingItem(item);
      setTitle(item.title);
      setCategory(item.category);
      setDateTime(item.dateTime);
      setLocation(item.location);
      setNotes(item.notes);
      setReminderMinutes(String(item.reminderMinutesBefore));
      setCost(String(item.cost));
      setPaidBy(item.paidByMemberId);
      setSplitMethod(item.splitMethod);
    } else {
      setEditingItem(undefined);
      setTitle('');
      setCategory('activity');
      setDateTime(`${activeTrip.startDate} 10:00`);
      setLocation('');
      setNotes('');
      setReminderMinutes('60');
      setCost('0');
      setPaidBy(members[0]?.memberId || '');
      setSplitMethod('equal');
    }
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeTrip || !title.trim()) return;
    setSaving(true);
    try {
      const { convertedAmount, rate } = convertCurrencyAmount(
        rawCost,
        paidCurrency,
        activeTrip.currency,
        fxRates
      );
      const fxNote =
        isForeignCurrency && rawCost > 0
          ? `[Paid ${rawCost.toFixed(2)} ${paidCurrency} @ ${rate.toFixed(4)} → ${activeTrip.currency} ${convertedAmount.toFixed(2)}]`
          : '';
      const combinedNotes = [notes.trim(), fxNote].filter(Boolean).join(' ');

      await saveItineraryWithExpenseSync({
        tripId: activeTrip.tripId,
        currency: activeTrip.currency,
        uid: firebaseUser.uid,
        members,
        existingItem: editingItem,
        title: title.trim(),
        category,
        dateTime,
        location,
        notes: combinedNotes,
        reminderMinutesBefore: Number(reminderMinutes) || 0,
        cost: convertedAmount,
        paidByMemberId: effectivePayer,
        splitMethod,
        status: editingItem?.status || 'scheduled',
      });
      setShowForm(false);
      setEditingItem(undefined);
      setPaidCurrency(activeTrip.currency);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSpot = async (spot: TouristSpot) => {
    if (!firebaseUser || !activeTrip) return;
    await saveItineraryWithExpenseSync({
      tripId: activeTrip.tripId,
      currency: activeTrip.currency,
      uid: firebaseUser.uid,
      members,
      title: spot.name,
      category: 'activity',
      dateTime: `${activeTrip.startDate} 14:00`,
      location: activeTrip.destination,
      notes: spot.description,
      reminderMinutesBefore: 60,
      cost: spot.estimatedCost * Math.max(1, members.length),
      paidByMemberId: members[0]?.memberId || 'owner',
      splitMethod: 'equal',
      status: 'scheduled',
    });
  };

  const handleSuggestAI = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch('/api/travel/itinerary-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: activeTrip.origin,
          destination: activeTrip.destination,
          startDate: activeTrip.startDate,
          endDate: activeTrip.endDate,
          currency: activeTrip.currency,
          budget: activeTrip.totalBudget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate suggestions.');
      setSuggestedItems(data.items || []);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Unable to generate itinerary.');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Itinerary &amp; Auto-Synced Costs</h1>
            <p className="text-xs text-slate-500 mt-1">
              {isSoloMode
                ? 'Adding or updating any segment with a cost automatically logs it to your Personal Expense Manager.'
                : 'Adding or updating any segment with a cost automatically updates the Splitwise group ledger.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSuggestAI}
              disabled={suggesting}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4 text-orange-500" />
              {suggesting ? 'Drafting Plan...' : 'Suggest Itinerary'}
            </button>
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Add Segment
            </button>
          </div>
        </div>

        {suggestError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800">
            {suggestError}
          </div>
        )}

        {suggestedItems.length > 0 && (
          <div className="mt-5 border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Suggested Itinerary Segments</h2>
              <button
                type="button"
                onClick={() => setSuggestedItems([])}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {suggestedItems.map((sug, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{sug.title}</p>
                    <p className="text-xs text-slate-500 font-mono-num mt-0.5">
                      {sug.dateTime} · {sug.category} · {activeTrip.currency} {Number(sug.cost).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{sug.notes}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!firebaseUser) return;
                      await saveItineraryWithExpenseSync({
                        tripId: activeTrip.tripId,
                        currency: activeTrip.currency,
                        uid: firebaseUser.uid,
                        members,
                        title: sug.title,
                        category: sug.category,
                        dateTime: sug.dateTime,
                        location: sug.location,
                        notes: sug.notes,
                        reminderMinutesBefore: sug.reminderMinutesBefore,
                        cost: Number(sug.cost) || 0,
                        paidByMemberId: effectivePayer,
                        splitMethod: 'equal',
                        status: 'scheduled',
                      });
                      setSuggestedItems((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 shrink-0 cursor-pointer"
                  >
                    Sync to Trip
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSave} className="mt-5 border-b border-slate-200 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-700">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ferry to Capri Island"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ItineraryCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                >
                  <option value="flight">Flight</option>
                  <option value="train">Train</option>
                  <option value="lodging">Lodging</option>
                  <option value="activity">Activity</option>
                  <option value="dining">Dining</option>
                  <option value="transport">Transport</option>
                </select>
              </div>
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700">Date &amp; Time</label>
                <input
                  type="text"
                  required
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className={isSoloMode ? 'sm:col-span-4' : 'sm:col-span-3'}>
                <label className="block text-xs font-medium text-slate-700">Location / Terminal</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Reminder (min)</label>
                <input
                  type="number"
                  min={0}
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div className={isSoloMode ? 'sm:col-span-3' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-slate-700">Currency</label>
                <select
                  value={paidCurrency}
                  onChange={(e) => setPaidCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white font-mono-num"
                >
                  {currencyChoices.map((code) => (
                    <option key={code} value={code}>
                      {formatCurrencyOptionLabel(code, true)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={isSoloMode ? 'sm:col-span-3' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-slate-700">Cost ({paidCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              {!isSoloMode && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">Paid By</label>
                  <select
                    value={effectivePayer}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.memberId} value={m.memberId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!isSoloMode && (
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700">Split</label>
                  <select
                    value={splitMethod}
                    onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-1.5 py-2 text-sm bg-white"
                  >
                    <option value="equal">Equal</option>
                    <option value="exact">Exact</option>
                    <option value="percentage">Percent</option>
                  </select>
                </div>
              )}
            </div>

            {isForeignCurrency && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2 text-xs text-teal-900 font-mono-num">
                <span className="inline-flex items-center gap-1.5">
                  {fxLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-700" />}
                  Live FX: 1 {paidCurrency} = {conversion.rate.toFixed(4)} {activeTrip.currency}
                </span>
                <span className="font-semibold">
                  {rawCost > 0
                    ? `Synced Split Cost: ${activeTrip.currency} ${conversion.convertedAmount.toFixed(2)}`
                    : `Auto-converts to ${activeTrip.currency} on save`}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Confirmation info, seat assignment, or packing note"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Syncing...' : editingItem ? 'Update & Sync Expense' : 'Save & Sync Expense'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 divide-y divide-slate-100">
          {itinerary.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">Your itinerary timeline is empty</p>
              <p className="text-xs text-slate-500 mt-1">
                Add flights, trains, stays, or use Suggest Itinerary to populate your trip schedule.
              </p>
            </div>
          ) : (
            itinerary.map((item) => {
              const payerName =
                members.find((m) => m.memberId === item.paidByMemberId)?.displayName || 'Traveler';
              return (
                <div key={item.itemId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-xs text-slate-500 font-mono-num">
                      {item.dateTime} · <span className="capitalize">{item.category}</span> · Reminder{' '}
                      {item.reminderMinutesBefore}m prior
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">{item.title}</h3>
                    {item.location && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <MapPin className="h-3.5 w-3.5 text-teal-600" />
                        {item.location}
                      </p>
                    )}
                    {item.notes && <p className="mt-1 text-xs text-slate-500">{item.notes}</p>}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.cost > 0 && (
                      <div className="text-right">
                        <p className="font-mono-num text-sm font-bold text-slate-900">
                          {activeTrip.currency} {item.cost.toFixed(2)}
                        </p>
                        <p className="text-xs text-teal-700">
                          {isSoloMode ? 'Logged to Expenses' : `Synced · Paid by ${payerName}`}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditor(item)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItineraryWithExpenseSync(activeTrip.tripId, item)}
                      aria-label={`Delete ${item.title}`}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Top Local Tourist Spots in {activeTrip.destination}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Curated highlights for your destination. Add any spot straight into your synced itinerary and offline map.
        </p>

        {activeTrip.touristSpots.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Click &ldquo;Refresh Live Insights&rdquo; on the Overview tab to fetch top local spots for {activeTrip.destination}.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTrip.touristSpots.map((spot, idx) => (
              <div key={idx} className="flex flex-col justify-between rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-xs font-medium text-teal-700">
                    {spot.category} · Est. {activeTrip.currency} {spot.estimatedCost}/person
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{spot.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{spot.description}</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAddSpot(spot)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Add Spot to Itinerary
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
