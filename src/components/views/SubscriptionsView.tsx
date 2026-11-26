import React, { useState } from 'react';
import {
  Archive,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Gift,
  Headphones,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import { MobileAppInstallModal } from '../PWAControls';
import {
  activateBillingCycle,
  purchaseLicense,
  recordReferralInvite,
  toggleMonthlySync,
  unlockLifetimeVault,
} from '../../lib/maviService';
import { PARTNER_DEALS } from '../../types/mavi';

export const SubscriptionsView: React.FC = () => {
  const { firebaseUser, profile, billing, trips } = useMavi();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [referralEmail, setReferralEmail] = useState('');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [showMobileModal, setShowMobileModal] = useState(false);

  if (!firebaseUser || !profile || !billing) {
    return null;
  }

  const archivedTripsCount = trips.filter((t) => t.isHistoricalArchive).length;
  const currentCycle: 'monthly' | 'six_months' =
    billing.monthlySyncPrice >= 9 || billing.historyRetentionDays === 180 ? 'six_months' : 'monthly';

  const handleBuyLicense = async (tier: 'solo' | 'group5', price: number) => {
    setBusyAction(tier);
    setStatusNote(null);
    try {
      await purchaseLicense(firebaseUser.uid, tier, price);
      setStatusNote(
        tier === 'group5'
          ? '5-Member Group License ($10.00) activated across all trips.'
          : 'Solo Traveler License ($2.99) activated.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectBillingCycle = async (cycle: 'monthly' | 'six_months') => {
    setBusyAction(cycle);
    setStatusNote(null);
    try {
      await activateBillingCycle(firebaseUser.uid, cycle);
      setStatusNote(
        cycle === 'six_months'
          ? '6-Month Pass ($9.99 / 6 months) activated — includes 180-day cloud sync & Travel Wallet backup.'
          : 'Monthly Subscription ($1.99/mo) activated — rolling 30-day cloud sync & Travel Wallet backup.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleSync = async () => {
    setBusyAction('sync');
    try {
      await toggleMonthlySync(firebaseUser.uid, !billing.monthlySyncActive);
      setStatusNote(
        !billing.monthlySyncActive
          ? `${currentCycle === 'six_months' ? '6-Month Pass ($9.99)' : 'Monthly Subscription ($1.99/mo)'} resumed.`
          : 'Subscription auto-renewal paused.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnlockLifetime = async () => {
    setBusyAction('lifetime');
    try {
      await unlockLifetimeVault(firebaseUser.uid);
      setStatusNote('Lifetime Travel History Vault ($14.99) unlocked permanently.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleInviteFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralEmail.trim()) return;
    setBusyAction('referral');
    try {
      await recordReferralInvite(firebaseUser.uid, referralEmail.trim());
      setReferralEmail('');
      setStatusNote('Referral invite logged! Earn partner perks when friends join RoamTally.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {statusNote && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-900">
          {statusNote}
        </div>
      )}

      {/* App Subscription: Monthly or 6-Month Pass */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">RoamTally Subscriptions &amp; Licensing</h1>
          <p className="text-xs text-slate-500 mt-1">
            Purchase RoamTally on a flexible Monthly plan or 6-Month Pass, manage seat licenses, and unlock Travel Wallet cloud backups.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs text-slate-500">App Subscription Cycle</p>
            <p className="mt-1 text-lg font-bold font-mono-num text-teal-700">
              {billing.monthlySyncActive
                ? currentCycle === 'six_months'
                  ? '$9.99 / 6 mo · Active'
                  : '$1.99 / mo · Active'
                : 'Paused'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Traveler Mode License</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {profile.licenseTier === 'group5'
                ? '5-Member Group ($10.00)'
                : profile.licenseTier === 'solo'
                ? 'Solo Expense Mode ($2.99)'
                : 'Starter Trial (1 seat)'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Wallet &amp; Archive Retention</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {billing.lifetimeVaultUnlocked
                ? 'Lifetime Vault Unlocked'
                : `${billing.historyRetentionDays}-Day Window (${archivedTripsCount} archived)`}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-600" />
              Choose App Subscription Pass (Monthly or 6 Months)
            </h2>
            <button
              type="button"
              onClick={handleToggleSync}
              disabled={busyAction === 'sync'}
              className="self-start sm:self-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {billing.monthlySyncActive ? 'Pause Renewal' : 'Resume Subscription'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                billing.monthlySyncActive && currentCycle === 'monthly'
                  ? 'border-teal-600 bg-teal-50/30'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Flexible Rolling Plan</p>
                    <h3 className="text-base font-semibold text-slate-900">Monthly Subscription</h3>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-num text-xl font-bold text-slate-900">$1.99</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Ideal for weekend getaways or single monthly trips with live weather alerts, FX conversion, and cloud Travel Wallet keys.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> 30-day rolling cloud sync &amp; live flight/weather updates
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> 15 MB Pocket Travel Wallet for bills, tickets &amp; itineraries
                  </li>
                </ul>
              </div>
              <button
                type="button"
                disabled={
                  (billing.monthlySyncActive && currentCycle === 'monthly') || busyAction === 'monthly'
                }
                onClick={() => handleSelectBillingCycle('monthly')}
                className="mt-5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {billing.monthlySyncActive && currentCycle === 'monthly'
                  ? 'Active Monthly Plan'
                  : 'Purchase Monthly ($1.99/mo)'}
              </button>
            </div>

            <div
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                billing.monthlySyncActive && currentCycle === 'six_months'
                  ? 'border-teal-600 bg-teal-50/30'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-teal-700">Save 16% · Season Bundle</p>
                    <h3 className="text-base font-semibold text-slate-900">6-Month Pass</h3>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-num text-xl font-bold text-slate-900">$9.99</span>
                    <span className="text-xs text-slate-500"> / 6 mo</span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Best for frequent solo flyers and seasonal travelers—covers 180 full days of multi-trip sync, live FX, and encrypted Travel Wallet storage.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> 180 days uninterrupted cloud sync ($1.67/mo effective)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> Full Pocket Travel Wallet + offline map packs across trips
                  </li>
                </ul>
              </div>
              <button
                type="button"
                disabled={
                  (billing.monthlySyncActive && currentCycle === 'six_months') || busyAction === 'six_months'
                }
                onClick={() => handleSelectBillingCycle('six_months')}
                className="mt-5 min-h-[44px] w-full rounded-lg bg-teal-600 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
              >
                {billing.monthlySyncActive && currentCycle === 'six_months'
                  ? 'Active 6-Month Pass'
                  : 'Purchase 6-Month Pass ($9.99)'}
              </button>
            </div>
          </div>
        </div>

        {/* Traveler Mode Seat Licenses */}
        <div className="mt-8 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-600" />
            Traveler Seat Licenses (Solo or 5-Member Group)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                profile.licenseTier === 'solo' ? 'border-teal-600 bg-teal-50/30' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Solo Expense Management</h3>
                  <span className="font-mono-num text-xl font-bold text-slate-900">$2.99</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  Built for solo travelers—tracks personal budgets, category totals, multi-currency FX receipts, and offline maps without group split clutter.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> Personal Expense Manager &amp; budget runway
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> Unlimited itineraries, weather &amp; offline maps
                  </li>
                </ul>
              </div>
              <button
                type="button"
                disabled={profile.licenseTier === 'solo' || busyAction === 'solo'}
                onClick={() => handleBuyLicense('solo', 2.99)}
                className="mt-5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {profile.licenseTier === 'solo' ? 'Active Plan' : 'Purchase Solo ($2.99)'}
              </button>
            </div>

            <div
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                profile.licenseTier === 'group5' ? 'border-teal-600 bg-teal-50/30' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">5-Member Group License</h3>
                  <span className="font-mono-num text-xl font-bold text-slate-900">$10.00</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">
                  Ideal for friends, families, or colleagues splitting expenses and sharing encrypted trip docs together.
                </p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> Up to 5 members per trip with individual budgets
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-teal-600" /> Automated Splitwise settlements &amp; group wallet
                  </li>
                </ul>
              </div>
              <button
                type="button"
                disabled={profile.licenseTier === 'group5' || busyAction === 'group5'}
                onClick={() => handleBuyLicense('group5', 10.0)}
                className="mt-5 min-h-[44px] w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {profile.licenseTier === 'group5' ? 'Active Group Plan' : 'Purchase 5-Member Group ($10.00)'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Live Weather, FX &amp; Flight Sync
              </h2>
              <span className="font-mono-num text-base font-bold text-slate-900">
                {currentCycle === 'six_months' ? '$9.99 / 6 mo' : '$1.99/mo'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Keeps group expense ledgers, local-to-base FX rates, real-time flight departure reminders, and Open-Meteo
              destination weather synced across every traveler&apos;s device.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-xs font-medium text-slate-600">
              Status: {billing.monthlySyncActive ? 'Active Sync' : 'Paused'}
            </span>
            <button
              type="button"
              onClick={handleToggleSync}
              disabled={busyAction === 'sync'}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              {billing.monthlySyncActive ? 'Pause Sync' : 'Resume Sync'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Archive className="h-4 w-4 text-orange-500" />
                6-Month+ Lifetime History Vault
              </h2>
              <span className="font-mono-num text-base font-bold text-slate-900">$14.99 once</span>
            </div>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Preserve archived itineraries, bills, flight tickets, and receipts indefinitely beyond the standard
              6-month window.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-xs font-medium text-slate-600">
              {billing.lifetimeVaultUnlocked
                ? 'Lifetime Preservation Enabled'
                : `${archivedTripsCount} trip(s) older than 6 months`}
            </span>
            <button
              type="button"
              disabled={billing.lifetimeVaultUnlocked || busyAction === 'lifetime'}
              onClick={handleUnlockLifetime}
              className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
            >
              {billing.lifetimeVaultUnlocked ? 'Unlocked Forever' : 'Unlock Lifetime ($14.99)'}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Partner Travel Perks &amp; Referral Benefits</h2>
            <p className="text-xs text-slate-500 mt-1">
              Exclusive partner offers from Expedia and Booking.com, plus travel credits when friends join RoamTally.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono-num text-slate-700">
            <Gift className="h-4 w-4 text-orange-500" />
            <span>
              Your Code: <strong>{profile.referralCode}</strong> ({profile.referralCount} referrals)
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PARTNER_DEALS.map((deal) => (
            <div key={deal.id} className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold text-teal-700">{deal.partner}</p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">{deal.title}</h3>
                <p className="mt-1 text-xs font-medium text-orange-600">{deal.discountLabel}</p>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{deal.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleCopy(deal.code)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-mono-num text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  {copiedCode === deal.code ? 'Copied!' : deal.code}
                </button>
                <a
                  href={deal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  Visit {deal.partner}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleInviteFriend}
          className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-slate-200 pt-5"
        >
          <input
            type="text"
            placeholder="Invite a friend's name or code to log a referral perk..."
            value={referralEmail}
            onChange={(e) => setReferralEmail(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busyAction === 'referral'}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            Send Referral Perk
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Headphones className="h-4 w-4 text-teal-600" />
              RoamTally Sales, Support &amp; Mobile App · Powered by MaVi
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Operated by <strong>Mavi Solution</strong>. Contact sales for group/corporate bundles or reach support for
              account and archive recovery.
            </p>
            <p className="text-xs text-slate-500 font-mono-num">
              Sales &amp; Support: mavi.apps@mavisolution.com
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <a
              href="mailto:mavi.apps@mavisolution.com?subject=RoamTally%20Powered%20by%20MaVi%20Support"
              className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              Contact Support
            </a>
            <button
              type="button"
              onClick={() => setShowMobileModal(true)}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="h-4 w-4" />
              Get Mobile App
            </button>
          </div>
        </div>
      </section>

      <MobileAppInstallModal
        isOpen={showMobileModal}
        onClose={() => setShowMobileModal(false)}
      />
    </div>
  );
};
