import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Plus,
  Receipt,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useMavi } from '../../context/MaviContext';
import {
  convertCurrencyAmount,
  fetchRatesForBase,
  formatCurrencyOptionLabel,
  SUPPORTED_CURRENCIES,
} from '../../lib/fx';
import { createExpenseEntry, deleteExpenseEntry } from '../../lib/maviService';
import { buildSharesForMethod, calculateMemberBalances } from '../../lib/splitwise';
import type { SplitMethod } from '../../types/mavi';

export const ExpensesView: React.FC = () => {
  const { firebaseUser, profile, activeTrip, members, expenses } = useMavi();
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('dining');
  const [amount, setAmount] = useState('');
  const [paidCurrency, setPaidCurrency] = useState('USD');
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [paidBy, setPaidBy] = useState('');
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTrip?.currency) {
      setPaidCurrency(activeTrip.currency);
    }
  }, [activeTrip?.tripId, activeTrip?.currency]);

  useEffect(() => {
    if (!showAdd) return;
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
  }, [paidCurrency, showAdd]);

  const { summaries, transfers, totalSpent } = useMemo(
    () => calculateMemberBalances(members, expenses),
    [members, expenses]
  );

  const soloCategoryStats = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const exp of expenses) {
      if (exp.splitMethod === 'settlement' || exp.amount <= 0) continue;
      const key = exp.category || 'other';
      const prev = map.get(key) ?? { amount: 0, count: 0 };
      map.set(key, { amount: prev.amount + exp.amount, count: prev.count + 1 });
    }
    return Array.from(map.entries())
      .map(([cat, stat]) => ({
        category: cat,
        amount: Math.round(stat.amount * 100) / 100,
        count: stat.count,
        pct: totalSpent > 0 ? Math.round((stat.amount / totalSpent) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, totalSpent]);

  const currencyChoices = useMemo(() => {
    const set = new Set<string>(SUPPORTED_CURRENCIES);
    if (activeTrip?.currency) set.add(activeTrip.currency.toUpperCase());
    return Array.from(set);
  }, [activeTrip?.currency]);

  if (!activeTrip) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Select or create a trip to manage travel expenses.</p>
      </div>
    );
  }

  const isSoloMode = profile?.licenseTier === 'solo' || members.length <= 1;
  const effectivePayer = paidBy || members[0]?.memberId || '';
  const parsedAmount = Number(amount) || 0;
  const isForeignCurrency = paidCurrency.toUpperCase() !== activeTrip.currency.toUpperCase();
  const conversion = convertCurrencyAmount(parsedAmount, paidCurrency, activeTrip.currency, fxRates);

  const remainingBudget = Math.round((activeTrip.totalBudget - totalSpent) * 100) / 100;
  const budgetPct =
    activeTrip.totalBudget > 0 ? Math.min(100, Math.round((totalSpent / activeTrip.totalBudget) * 100)) : 0;
  const nonSettlementCount = expenses.filter((e) => e.splitMethod !== 'settlement').length;
  const avgExpense = nonSettlementCount > 0 ? totalSpent / nonSettlementCount : 0;

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeTrip || members.length === 0) return;

    const numAmount = Number(amount);
    if (!title.trim() || Number.isNaN(numAmount) || numAmount <= 0) {
      setError('Enter a description and an amount greater than 0.');
      return;
    }

    const activeSplitMethod: SplitMethod = isSoloMode ? 'equal' : splitMethod;
    const numericCustom: Record<string, number> = {};
    for (const m of members) {
      numericCustom[m.memberId] = Number(customValues[m.memberId] ?? 0);
    }

    if (!isSoloMode && activeSplitMethod === 'percentage') {
      const pctSum = Object.values(numericCustom).reduce((a, b) => a + b, 0);
      if (Math.abs(pctSum - 100) > 0.5) {
        setError(`Percentage splits must add up to 100% (currently ${pctSum.toFixed(1)}%).`);
        return;
      }
    }

    if (!isSoloMode && activeSplitMethod === 'exact') {
      const exactSum = Object.values(numericCustom).reduce((a, b) => a + b, 0);
      if (Math.abs(exactSum - numAmount) > 0.05) {
        setError(`Exact splits must total ${paidCurrency} ${numAmount.toFixed(2)}.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const { convertedAmount, rate } = convertCurrencyAmount(
        numAmount,
        paidCurrency,
        activeTrip.currency,
        fxRates
      );

      let splitCustom = numericCustom;
      if (!isSoloMode && activeSplitMethod === 'exact' && isForeignCurrency) {
        const convertedCustom: Record<string, number> = {};
        let runningCents = 0;
        let largestMemberId = members[0]?.memberId;
        let largestVal = -1;

        for (const m of members) {
          const valCents = Math.round((numericCustom[m.memberId] ?? 0) * rate * 100);
          convertedCustom[m.memberId] = valCents / 100;
          runningCents += valCents;
          if ((numericCustom[m.memberId] ?? 0) > largestVal) {
            largestVal = numericCustom[m.memberId] ?? 0;
            largestMemberId = m.memberId;
          }
        }
        const targetCents = Math.round(convertedAmount * 100);
        const diffCents = targetCents - runningCents;
        if (diffCents !== 0 && largestMemberId) {
          convertedCustom[largestMemberId] =
            Math.round((convertedCustom[largestMemberId] * 100 + diffCents)) / 100;
        }
        splitCustom = convertedCustom;
      }

      const shares = buildSharesForMethod(convertedAmount, activeSplitMethod, members, splitCustom);
      const formattedTitle = isForeignCurrency
        ? `${title.trim()} (${numAmount.toFixed(2)} ${paidCurrency})`
        : title.trim();

      await createExpenseEntry({
        tripId: activeTrip.tripId,
        uid: firebaseUser.uid,
        title: formattedTitle,
        category,
        amount: convertedAmount,
        currency: activeTrip.currency,
        paidByMemberId: effectivePayer,
        splitMethod: activeSplitMethod,
        shares,
        date: new Date().toISOString().slice(0, 10),
      });
      setTitle('');
      setAmount('');
      setPaidCurrency(activeTrip.currency);
      setCustomValues({});
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleSettleUp = async (fromId: string, toId: string, amt: number, fromName: string, toName: string) => {
    if (!firebaseUser || !activeTrip) return;
    await createExpenseEntry({
      tripId: activeTrip.tripId,
      uid: firebaseUser.uid,
      title: `Settlement: ${fromName} → ${toName}`,
      category: 'settlement',
      amount: amt,
      currency: activeTrip.currency,
      paidByMemberId: fromId,
      splitMethod: 'settlement',
      shares: [{ memberId: toId, amount: amt }],
      date: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {isSoloMode ? 'Personal Expense Manager' : 'Splitwise Expense Ledger'}
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-mono-num">
              {activeTrip.title} · {expenses.length} entries · Total Spend {activeTrip.currency}{' '}
              {totalSpent.toFixed(2)}
              {isSoloMode && activeTrip.totalBudget > 0
                ? ` · ${remainingBudget >= 0 ? 'Remaining' : 'Over'} ${activeTrip.currency} ${Math.abs(remainingBudget).toFixed(2)}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAddExpense} className="mt-5 border-b border-slate-200 pb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className={isSoloMode ? 'sm:col-span-5' : 'sm:col-span-4'}>
                <label className="block text-xs font-medium text-slate-700">Expense Description</label>
                <input
                  type="text"
                  required
                  placeholder={isSoloMode ? 'e.g. Harbor Train Ticket or Lunch' : 'e.g. Cliffside Seafood Dinner'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Paid Currency</label>
                <select
                  value={paidCurrency}
                  onChange={(e) => setPaidCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white font-mono-num"
                >
                  {currencyChoices.map((code) => (
                    <option key={code} value={code}>
                      {formatCurrencyOptionLabel(code, true)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={isSoloMode ? 'sm:col-span-3' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-slate-700">Amount ({paidCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono-num"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                >
                  <option value="dining">Dining</option>
                  <option value="lodging">Lodging</option>
                  <option value="flight">Flight</option>
                  <option value="train">Train</option>
                  <option value="activity">Activity</option>
                  <option value="transport">Transport</option>
                </select>
              </div>
              {!isSoloMode && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">Paid By</label>
                  <select
                    value={effectivePayer}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.memberId} value={m.memberId}>
                        {m.displayName}
                      </option>
                    ))}
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
                  {parsedAmount > 0
                    ? `Converted Total: ${activeTrip.currency} ${conversion.convertedAmount.toFixed(2)}`
                    : `Auto-converts to ${activeTrip.currency} on save`}
                </span>
              </div>
            )}

            {!isSoloMode && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-slate-700">Split Mode:</span>
                <div className="inline-flex rounded-lg bg-slate-100 p-1">
                  {(['equal', 'exact', 'percentage'] as SplitMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setSplitMethod(method)}
                      className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
                        splitMethod === method
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isSoloMode && splitMethod !== 'equal' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {members.map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-xs font-medium text-slate-700 truncate">{m.displayName}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={splitMethod === 'percentage' ? '%' : paidCurrency}
                      value={customValues[m.memberId] || ''}
                      onChange={(e) =>
                        setCustomValues((prev) => ({ ...prev, [m.memberId]: e.target.value }))
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-mono-num text-right"
                    />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 cursor-pointer disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : isForeignCurrency
                    ? isSoloMode
                      ? `Convert & Log in ${activeTrip.currency}`
                      : `Convert & Split in ${activeTrip.currency}`
                    : isSoloMode
                      ? 'Save Personal Expense'
                      : 'Save Split Expense'}
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 overflow-x-auto">
          {expenses.length === 0 ? (
            <div className="py-10 text-center">
              <Receipt className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">No expenses logged yet</p>
              <p className="text-xs text-slate-500 mt-1">
                {isSoloMode
                  ? 'Log a trip expense here or add a priced item in your Itinerary to track personal spending.'
                  : 'Add an expense here or add a priced item in the Itinerary to auto-sync group splits.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pr-4">Expense</th>
                  {!isSoloMode && <th className="py-2.5 pr-4">Paid By</th>}
                  {!isSoloMode && <th className="py-2.5 pr-4">Split</th>}
                  {isSoloMode && <th className="py-2.5 pr-4">Category</th>}
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {expenses.map((exp) => {
                  const payerName =
                    members.find((m) => m.memberId === exp.paidByMemberId)?.displayName || 'Traveler';
                  return (
                    <tr key={exp.expenseId} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{exp.title}</p>
                        <p className="text-xs text-slate-500 font-mono-num">
                          {exp.date}
                          {!isSoloMode ? ` · ${exp.category}` : ''}
                          {exp.linkedItineraryId ? ' · Auto-synced from itinerary' : ''}
                        </p>
                      </td>
                      {!isSoloMode && <td className="py-3 pr-4 text-slate-700">{payerName}</td>}
                      {!isSoloMode && (
                        <td className="py-3 pr-4 text-xs text-slate-500 capitalize">
                          {exp.splitMethod} ({exp.shares.length} {exp.shares.length === 1 ? 'share' : 'shares'})
                        </td>
                      )}
                      {isSoloMode && (
                        <td className="py-3 pr-4 text-xs text-slate-600 capitalize">{exp.category}</td>
                      )}
                      <td className="py-3 pr-4 text-right font-mono-num font-semibold text-slate-900">
                        {exp.currency} {exp.amount.toFixed(2)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => deleteExpenseEntry(activeTrip.tripId, exp.expenseId)}
                          aria-label={`Delete ${exp.title}`}
                          className="inline-flex rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {isSoloMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-teal-600" />
              <h2 className="text-base font-semibold text-slate-900">Solo Budget Runway</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Personal spend vs. your trip budget target in {activeTrip.currency}.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500">Budget Target</p>
                <p className="mt-1 text-base font-bold text-slate-900 font-mono-num">
                  {activeTrip.currency} {activeTrip.totalBudget.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Spent</p>
                <p className="mt-1 text-base font-bold text-slate-900 font-mono-num">
                  {activeTrip.currency} {totalSpent.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{remainingBudget >= 0 ? 'Remaining' : 'Over Cap'}</p>
                <p
                  className={`mt-1 text-base font-bold font-mono-num ${
                    remainingBudget >= 0 ? 'text-teal-700' : 'text-red-700'
                  }`}
                >
                  {activeTrip.currency} {Math.abs(remainingBudget).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all ${
                    remainingBudget < 0 ? 'bg-red-600' : budgetPct >= 85 ? 'bg-amber-500' : 'bg-teal-600'
                  }`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-mono-num text-slate-600">
                <span className={remainingBudget < 0 ? 'text-red-700 font-medium inline-flex items-center gap-1' : ''}>
                  {remainingBudget < 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                  {budgetPct}% utilized
                </span>
                <span>
                  Avg {activeTrip.currency} {avgExpense.toFixed(2)} / entry
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Spending by Category</h2>
            <p className="mt-1 text-xs text-slate-500">
              Where your personal travel funds are going across this itinerary.
            </p>
            {soloCategoryStats.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500">Log expenses above to see your category totals.</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {soloCategoryStats.map((item) => (
                  <div key={item.category} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-slate-900 capitalize">{item.category}</p>
                      <p className="text-xs text-slate-500 font-mono-num">
                        {item.count} {item.count === 1 ? 'entry' : 'entries'} · {item.pct}% of spend
                      </p>
                    </div>
                    <span className="font-mono-num text-sm font-semibold text-slate-900">
                      {activeTrip.currency} {item.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Simplified Group Settlements</h2>
            <p className="mt-1 text-xs text-slate-500">
              Minimum transfers required to settle everyone&apos;s balance cleanly.
            </p>

            {transfers.length === 0 ? (
              <div className="mt-5 flex items-center gap-2.5 text-sm text-teal-700 font-medium">
                <CheckCircle2 className="h-5 w-5" />
                All group balances are completely settled.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {transfers.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 text-sm text-slate-800">
                      <span className="font-semibold">{t.fromName}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-semibold">{t.toName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num text-sm font-bold text-orange-600">
                        {activeTrip.currency} {t.amount.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleSettleUp(t.fromMemberId, t.toMemberId, t.amount, t.fromName, t.toName)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                      >
                        Record Paid
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Net Balances by Member</h2>
            <p className="mt-1 text-xs text-slate-500">
              Positive amounts mean the group owes that traveler; negative means they owe the group.
            </p>
            <div className="mt-4 divide-y divide-slate-100">
              {summaries.map((s) => (
                <div key={s.memberId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.displayName}</p>
                    <p className="text-xs text-slate-500 font-mono-num">
                      Paid {activeTrip.currency} {s.paid.toFixed(2)} · Fair Share {activeTrip.currency}{' '}
                      {s.shareTotal.toFixed(2)}
                    </p>
                  </div>
                  <span
                    className={`font-mono-num text-sm font-semibold ${
                      s.netBalance >= 0 ? 'text-teal-700' : 'text-orange-700'
                    }`}
                  >
                    {s.netBalance >= 0 ? '+' : '-'}
                    {activeTrip.currency} {Math.abs(s.netBalance).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
