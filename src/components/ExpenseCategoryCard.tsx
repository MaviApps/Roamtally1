import React, { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { PieChart } from 'lucide-react';
import type { ExpenseItem } from '../types/mavi';

interface ExpenseCategoryCardProps {
  expenses: ExpenseItem[];
  currency: string;
  onAddExpense: () => void;
}

interface CategoryDatum {
  key: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  lodging: { label: 'Lodging', color: '#0D9488' },
  dining: { label: 'Food & Dining', color: '#F97316' },
  travel: { label: 'Travel & Transit', color: '#0284C7' },
  activity: { label: 'Activities', color: '#14B8A6' },
  other: { label: 'Other', color: '#475569' },
};

function normalizeCategoryKey(rawCategory: string): string {
  const c = rawCategory.trim().toLowerCase();
  if (c === 'lodging' || c === 'hotel' || c === 'stay') return 'lodging';
  if (c === 'dining' || c === 'food' || c === 'restaurant') return 'dining';
  if (c === 'flight' || c === 'train' || c === 'transport' || c === 'travel') return 'travel';
  if (c === 'activity' || c === 'tour' || c === 'spot') return 'activity';
  return 'other';
}

export const ExpenseCategoryCard: React.FC<ExpenseCategoryCardProps> = ({
  expenses,
  currency,
  onAddExpense,
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { data, totalAmount } = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>();
    let grandTotal = 0;

    for (const exp of expenses) {
      if (exp.splitMethod === 'settlement' || exp.amount <= 0) continue;
      const key = normalizeCategoryKey(exp.category);
      const prev = totals.get(key) ?? { amount: 0, count: 0 };
      totals.set(key, {
        amount: prev.amount + exp.amount,
        count: prev.count + 1,
      });
      grandTotal += exp.amount;
    }

    const rows: CategoryDatum[] = Array.from(totals.entries())
      .map(([key, stats]) => {
        const meta = CATEGORY_META[key] ?? CATEGORY_META.other;
        return {
          key,
          label: meta.label,
          amount: Math.round(stats.amount * 100) / 100,
          count: stats.count,
          percentage: grandTotal > 0 ? Math.round((stats.amount / grandTotal) * 1000) / 10 : 0,
          color: meta.color,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      data: rows,
      totalAmount: Math.round(grandTotal * 100) / 100,
    };
  }, [expenses]);

  const arcs = useMemo(() => {
    if (data.length === 0) return [];
    const pieGenerator = d3
      .pie<CategoryDatum>()
      .value((d) => d.amount)
      .sort(null)
      .padAngle(0.025);

    const arcGenerator = d3
      .arc<d3.PieArcDatum<CategoryDatum>>()
      .innerRadius(62)
      .outerRadius(92)
      .cornerRadius(4);

    const activeArcGenerator = d3
      .arc<d3.PieArcDatum<CategoryDatum>>()
      .innerRadius(60)
      .outerRadius(97)
      .cornerRadius(4);

    return pieGenerator(data).map((slice) => ({
      datum: slice.data,
      path:
        activeKey === slice.data.key
          ? activeArcGenerator(slice) || ''
          : arcGenerator(slice) || '',
    }));
  }, [data, activeKey]);

  const barScale = useMemo(() => {
    const maxVal = data[0]?.amount ?? 1;
    return d3.scaleLinear().domain([0, maxVal]).range([0, 100]);
  }, [data]);

  const focusedDatum = activeKey ? data.find((d) => d.key === activeKey) ?? null : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Expenses by Category</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Spend breakdown across lodging, food, travel, and activities for this trip.
          </p>
        </div>
        {data.length > 0 && (
          <span className="text-xs font-mono-num text-slate-500">
            {data.reduce((sum, item) => sum + item.count, 0)} expenses · {currency}{' '}
            {totalAmount.toFixed(2)}
          </span>
        )}
      </div>

      {data.length === 0 ? (
        <div className="py-10 text-center">
          <PieChart className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No categorized spend yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Log an expense or sync a priced itinerary item to inspect your category breakdown.
          </p>
          <button
            type="button"
            onClick={onAddExpense}
            className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Add First Expense
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 flex flex-col items-center justify-center">
            <div className="relative h-52 w-52">
              <svg
                viewBox="-105 -105 210 210"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label="Trip expenses by category donut chart"
              >
                {arcs.map(({ datum, path }) => {
                  const isDimmed = activeKey !== null && activeKey !== datum.key;
                  return (
                    <path
                      key={datum.key}
                      d={path}
                      fill={datum.color}
                      opacity={isDimmed ? 0.35 : 1}
                      className="transition-opacity duration-150 cursor-pointer"
                      onMouseEnter={() => setActiveKey(datum.key)}
                      onMouseLeave={() => setActiveKey(null)}
                      onClick={() =>
                        setActiveKey((prev) => (prev === datum.key ? null : datum.key))
                      }
                    />
                  );
                })}
              </svg>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <span className="text-xs text-slate-500 truncate max-w-[105px]">
                  {focusedDatum ? focusedDatum.label : 'Total Spend'}
                </span>
                <span className="mt-0.5 font-mono-num text-base font-bold text-slate-900">
                  {currency}{' '}
                  {(focusedDatum ? focusedDatum.amount : totalAmount).toFixed(0)}
                </span>
                {focusedDatum && (
                  <span className="font-mono-num text-xs font-medium text-teal-700">
                    {focusedDatum.percentage}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-7 divide-y divide-slate-100">
            {data.map((row) => {
              const isHighlighted = activeKey === row.key;
              return (
                <button
                  key={row.key}
                  type="button"
                  onMouseEnter={() => setActiveKey(row.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  onClick={() =>
                    setActiveKey((prev) => (prev === row.key ? null : row.key))
                  }
                  className={`w-full py-3 first:pt-0 last:pb-0 text-left transition-colors cursor-pointer ${
                    isHighlighted ? 'bg-slate-50/80' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {row.label}
                      </span>
                      <span className="text-xs text-slate-500 font-mono-num">
                        · {row.count} {row.count === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono-num">
                      <span className="text-xs text-slate-500">{row.percentage}%</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {currency} {row.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: `${Math.max(4, barScale(row.amount))}%`,
                        backgroundColor: row.color,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
