import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Bell,
  BellRing,
  Check,
  CloudSun,
  Plane,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import {
  addTripMember,
  createDemoTripsForUser,
  updateTripIntelligence,
  updateTripMemberBudget,
} from '../../lib/maviService';
import { calculateMemberBalances } from '../../lib/splitwise';
import { MASCOT_OPTIONS } from '../../types/mavi';
import type { MascotId } from '../../types/mavi';
import { MascotAvatar } from '../MascotAvatar';
import { ExpenseCategoryCard } from '../ExpenseCategoryCard';

interface OverviewViewProps {
  onOpenNewTrip: () => void;
  onOpenCustomize: () => void;
  onNavigateTab: (tab: 'overview' | 'expenses' | 'itinerary' | 'vault' | 'maps' | 'subscriptions') => void;
}

type ReminderPermissionState = NotificationPermission | 'unsupported';

function getNotificationPermission(): ReminderPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function getReminderTiming(dateTime: string, reminderMinutesBefore: number, nowMs: number) {
  const normalized = dateTime.trim().replace(' ', 'T');
  const targetMs = Date.parse(normalized);
  if (Number.isNaN(targetMs)) {
    return { statusLabel: `Alert ${reminderMinutesBefore}m prior`, inAlertWindow: false };
  }
  const diffMs = targetMs - nowMs;
  const windowMs = Math.max(0, reminderMinutesBefore) * 60_000;
  if (diffMs < -3_600_000) {
    return { statusLabel: 'Completed', inAlertWindow: false };
  }
  if (diffMs <= windowMs) {
    const minsLeft = Math.max(0, Math.round(diffMs / 60_000));
    return {
      statusLabel: minsLeft === 0 ? 'Departing Now' : `Alert Active · ${minsLeft}m left`,
      inAlertWindow: true,
    };
  }
  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) {
    return { statusLabel: `In ${days}d ${hours}h`, inAlertWindow: false };
  }
  const mins = Math.max(1, Math.floor((diffMs % 3_600_000) / 60_000));
  return { statusLabel: `In ${hours}h ${mins}m`, inAlertWindow: false };
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onOpenNewTrip,
  onOpenCustomize,
  onNavigateTab,
}) => {
  const { profile, billing, activeTrip, members, itinerary, expenses, setActiveTripId } = useMavi();
  const [refreshingAI, setRefreshingAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberMascot, setNewMemberMascot] = useState<MascotId>('pip-otter');
  const [newMemberBudget, setNewMemberBudget] = useState('800');
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState('');
  const [notifPermission, setNotifPermission] = useState<ReminderPermissionState>(getNotificationPermission);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  const { summaries, totalSpent } = useMemo(
    () => calculateMemberBalances(members, expenses),
    [members, expenses]
  );

  const upcomingReminders = useMemo(
    () => itinerary.filter((i) => i.category === 'flight' || i.category === 'train' || i.reminderMinutesBefore > 0).slice(0, 3),
    [itinerary]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (notifPermission !== 'granted') return;
    for (const item of upcomingReminders) {
      const timing = getReminderTiming(item.dateTime, item.reminderMinutesBefore, nowTick);
      if (timing.inAlertWindow && !notifiedIdsRef.current.has(item.itemId)) {
        notifiedIdsRef.current.add(item.itemId);
        try {
          new Notification(`MAVI Reminder: ${item.title}`, {
            body: `${item.dateTime}${item.location ? ` · ${item.location}` : ''} (${timing.statusLabel})`,
          });
        } catch {
          // Ignore browser notification errors in restricted iframes
        }
      }
    }
  }, [notifPermission, upcomingReminders, nowTick]);

  const handleEnableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    } catch {
      setNotifPermission('denied');
    }
  };

  const handleSeedDemo = async () => {
    if (!profile) return;
    setSeedingDemo(true);
    try {
      const tripId = await createDemoTripsForUser(profile);
      setActiveTripId(tripId);
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleRefreshInsights = async () => {
    if (!activeTrip) return;
    setRefreshingAI(true);
    setAiError(null);
    try {
      const res = await fetch('/api/travel/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: activeTrip.origin,
          destination: activeTrip.destination,
          startDate: activeTrip.startDate,
          endDate: activeTrip.endDate,
          travelers: members.length || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unable to fetch live travel insights.');
      }
      await updateTripIntelligence(activeTrip.tripId, {
        weatherSummary: data.weatherSummary,
        flightUpdateSummary: data.flightUpdateSummary,
        touristSpots: data.touristSpots || [],
        requiredDocs: data.requiredDocs || [],
      });
      if (Array.isArray(data.sources)) {
        setSources(data.sources);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to refresh travel insights.');
    } finally {
      setRefreshingAI(false);
    }
  };

  const handleAddTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !newMemberName.trim()) return;
    await addTripMember(
      activeTrip.tripId,
      newMemberName.trim(),
      newMemberMascot,
      Number(newMemberBudget) || 500
    );
    setNewMemberName('');
    setShowAddMember(false);
  };

  const handleSaveBudget = async (memberId: string) => {
    if (!activeTrip) return;
    await updateTripMemberBudget(activeTrip.tripId, memberId, Number(editingBudgetVal) || 0);
    setEditingBudgetId(null);
  };

  if (!activeTrip) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {profile && <MascotAvatar mascotId={profile.mascotId} size="xl" />}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900">Welcome to MAVI, {profile?.displayName}</h2>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
              Start by creating your first group or solo trip, or load the sample Amalfi Coast &amp; Kyoto Archive trips
              to explore auto-synced Splitwise expenses, encrypted documents, and offline navigation maps immediately.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenNewTrip}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors cursor-pointer"
              >
                Create First Trip
              </button>
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seedingDemo}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                {seedingDemo ? 'Loading Sample Trips...' : 'Load Sample Group + Archive Trips'}
              </button>
              <button
                type="button"
                onClick={onOpenCustomize}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Customize Companion
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isArchiveLocked = activeTrip.isHistoricalArchive && !billing?.lifetimeVaultUnlocked;
  const isSoloMode = profile?.licenseTier === 'solo' || members.length <= 1;
  const maxSeats = profile?.licenseTier === 'group5' ? 5 : 1;
  const canAddSeat = members.length < maxSeats;
  const groupBudgetPct =
    activeTrip.totalBudget > 0 ? Math.min(100, Math.round((totalSpent / activeTrip.totalBudget) * 100)) : 0;

  return (
    <div className="space-y-6">
      {isArchiveLocked && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Archive className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                6-Month History Retention Window Reached
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                This trip is older than 6 months. Unlock Lifetime Access ($14.99 one-time) to preserve and edit archived
                travel history permanently.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('subscriptions')}
            className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Unlock Lifetime Vault
          </button>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs text-slate-500 font-mono-num">
              {activeTrip.origin} → {activeTrip.destination} · {activeTrip.startDate} to {activeTrip.endDate} · Join Code:{' '}
              <span className="font-semibold text-slate-700">{activeTrip.joinCode}</span>
            </p>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">{activeTrip.title}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRefreshInsights}
              disabled={refreshingAI}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`h-4 w-4 ${refreshingAI ? 'animate-spin' : ''}`} />
              {refreshingAI ? 'Updating Weather & Flights...' : 'Refresh Live Insights'}
            </button>
            <button
              type="button"
              onClick={onOpenCustomize}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              Companion
            </button>
          </div>
        </div>

        {aiError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
            {aiError}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs text-slate-500">{isSoloMode ? 'Total Personal Spend' : 'Total Group Spend'}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 font-mono-num">
              {activeTrip.currency} {totalSpent.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Trip Budget Target</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 font-mono-num">
              {activeTrip.currency} {activeTrip.totalBudget.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Budget Utilized</p>
            <p className="mt-1 text-2xl font-bold text-teal-700 font-mono-num">{groupBudgetPct}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{isSoloMode ? 'Mode & License' : 'Travelers & Seats'}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 font-mono-num">
              {isSoloMode ? 'Solo' : `${members.length} / ${maxSeats}`}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CloudSun className="h-4 w-4 text-orange-500" />
              Local Weather Forecast
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{activeTrip.weatherSummary}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Plane className="h-4 w-4 text-teal-600" />
              Flight, Rail &amp; Transit Updates
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{activeTrip.flightUpdateSummary}</p>
          </div>
        </div>

        {sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Verified Search Sources:</span>
            {sources.map((s) => (
              <a
                key={s.uri}
                href={s.uri}
                target="_blank"
                rel="noreferrer"
                className="text-teal-700 hover:underline truncate max-w-[220px]"
              >
                {s.title}
              </a>
            ))}
          </div>
        )}
      </section>

      <ExpenseCategoryCard
        expenses={expenses}
        currency={activeTrip.currency}
        onAddExpense={() => onNavigateTab('expenses')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isSoloMode ? 'Personal Travel Budget' : 'Individual Member Budgets'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isSoloMode
                  ? 'Monitor your personal trip spending against your budget cap.'
                  : "Track each traveler's personal spend share against their target cap."}
              </p>
            </div>
            {canAddSeat ? (
              <button
                type="button"
                onClick={() => setShowAddMember((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Traveler
              </button>
            ) : profile?.licenseTier !== 'solo' ? (
              <button
                type="button"
                onClick={() => onNavigateTab('subscriptions')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 cursor-pointer"
              >
                {profile?.licenseTier === 'group5' ? '5/5 Group Limit Reached' : 'Upgrade to 5-Member ($10)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigateTab('subscriptions')}
                className="text-xs font-medium text-teal-700 hover:underline cursor-pointer"
              >
                Solo Expense Mode
              </button>
            )}
          </div>

          {showAddMember && (
            <form onSubmit={handleAddTraveler} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-2.5 border-b border-slate-200 pb-4">
              <input
                type="text"
                required
                placeholder="Friend or family name"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                className="sm:col-span-5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <select
                value={newMemberMascot}
                onChange={(e) => setNewMemberMascot(e.target.value as MascotId)}
                className="sm:col-span-4 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm bg-white"
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
                value={newMemberBudget}
                onChange={(e) => setNewMemberBudget(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono-num"
              />
              <button
                type="submit"
                className="sm:col-span-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer"
              >
                Add
              </button>
            </form>
          )}

          <div className="mt-4 divide-y divide-slate-100">
            {summaries.map((s) => {
              const memberObj = members.find((m) => m.memberId === s.memberId);
              const overBudget = s.budgetLimit > 0 && s.shareTotal > s.budgetLimit;
              const nearLimit = !overBudget && s.budgetUsedPct >= 85;
              return (
                <div key={s.memberId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <MascotAvatar mascotId={memberObj?.mascotId || 'mavi-pelican'} size="md" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{s.displayName}</p>
                        <p className="text-xs text-slate-500 font-mono-num">
                          {isSoloMode
                            ? `Logged ${activeTrip.currency} ${s.paid.toFixed(2)} · Cap ${activeTrip.currency} ${s.budgetLimit.toFixed(0)}`
                            : `Paid ${activeTrip.currency} ${s.paid.toFixed(2)} · Share ${activeTrip.currency} ${s.shareTotal.toFixed(2)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {editingBudgetId === s.memberId ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={editingBudgetVal}
                            onChange={(e) => setEditingBudgetVal(e.target.value)}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs font-mono-num"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveBudget(s.memberId)}
                            className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBudgetId(s.memberId);
                            setEditingBudgetVal(String(s.budgetLimit));
                          }}
                          className="text-xs text-slate-600 hover:text-teal-700 font-mono-num cursor-pointer"
                        >
                          Cap: {activeTrip.currency} {s.budgetLimit.toFixed(0)} (Edit)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full transition-all ${
                          overBudget ? 'bg-red-600' : nearLimit ? 'bg-amber-500' : 'bg-teal-600'
                        }`}
                        style={{ width: `${Math.min(100, s.budgetUsedPct)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs font-mono-num">
                      <span className={overBudget ? 'text-red-700 font-medium flex items-center gap-1' : 'text-slate-500'}>
                        {overBudget && <AlertTriangle className="h-3.5 w-3.5" />}
                        {overBudget
                          ? `Over cap by ${activeTrip.currency} ${(s.shareTotal - s.budgetLimit).toFixed(2)}`
                          : `${s.budgetUsedPct}% of budget used`}
                      </span>
                      {isSoloMode ? (
                        <span className={s.budgetLimit >= s.shareTotal ? 'text-teal-700 font-medium' : 'text-red-700 font-medium'}>
                          {s.budgetLimit >= s.shareTotal
                            ? `Remaining ${activeTrip.currency} ${(s.budgetLimit - s.shareTotal).toFixed(2)}`
                            : `Exceeded`}
                        </span>
                      ) : (
                        <span className={s.netBalance >= 0 ? 'text-teal-700 font-medium' : 'text-orange-700 font-medium'}>
                          {s.netBalance >= 0
                            ? `Gets back ${activeTrip.currency} ${s.netBalance.toFixed(2)}`
                            : `Owes ${activeTrip.currency} ${Math.abs(s.netBalance).toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-500" />
                <h2 className="text-lg font-semibold text-slate-900">Next Reminders</h2>
              </div>
              <div className="flex items-center gap-2.5">
                {notifPermission === 'default' && (
                  <button
                    type="button"
                    onClick={handleEnableNotifications}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <BellRing className="h-3 w-3 text-orange-500" />
                    Enable Alerts
                  </button>
                )}
                {notifPermission === 'granted' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 whitespace-nowrap">
                    <Check className="h-3.5 w-3.5" />
                    Alerts On
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onNavigateTab('itinerary')}
                  className="text-xs font-medium text-teal-700 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Full Timeline
                </button>
              </div>
            </div>

            {upcomingReminders.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No flight or rail alerts scheduled yet. Add an itinerary segment to enable reminders.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {upcomingReminders.map((item) => {
                  const timing = getReminderTiming(item.dateTime, item.reminderMinutesBefore, nowTick);
                  return (
                    <div key={item.itemId} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <span
                          className={`text-xs font-mono-num shrink-0 ${
                            timing.inAlertWindow ? 'font-semibold text-orange-600' : 'text-slate-500'
                          }`}
                        >
                          {timing.statusLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono-num">
                        {item.dateTime} · Alert {item.reminderMinutesBefore}m prior
                      </p>
                      {item.location && <p className="mt-1 text-xs text-slate-600">{item.location}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isSoloMode ? 'Open Expense Manager' : 'Open Splitwise Ledger'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
