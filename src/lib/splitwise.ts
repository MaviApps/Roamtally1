import type { ExpenseItem, ExpenseShare, SplitMethod, TripMember } from '../types/mavi';

export function buildEqualShares(amount: number, members: TripMember[]): ExpenseShare[] {
  if (members.length === 0) return [];
  const centsTotal = Math.round(amount * 100);
  const baseCents = Math.floor(centsTotal / members.length);
  let remainder = centsTotal - baseCents * members.length;

  return members.map((m) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return {
      memberId: m.memberId,
      amount: (baseCents + extra) / 100,
    };
  });
}

export function buildPercentageShares(
  amount: number,
  percentages: Record<string, number>,
  members: TripMember[]
): ExpenseShare[] {
  return members.map((m) => {
    const pct = percentages[m.memberId] ?? 0;
    return {
      memberId: m.memberId,
      amount: Math.round(amount * (pct / 100) * 100) / 100,
    };
  });
}

export function buildSharesForMethod(
  amount: number,
  method: SplitMethod,
  members: TripMember[],
  customAmounts?: Record<string, number>
): ExpenseShare[] {
  if (members.length === 0) return [];
  if (method === 'equal') {
    return buildEqualShares(amount, members);
  }
  if (method === 'percentage' && customAmounts) {
    return buildPercentageShares(amount, customAmounts, members);
  }
  if (method === 'exact' && customAmounts) {
    return members.map((m) => ({
      memberId: m.memberId,
      amount: Math.round((customAmounts[m.memberId] ?? 0) * 100) / 100,
    }));
  }
  return buildEqualShares(amount, members);
}

export interface MemberBalanceSummary {
  memberId: string;
  displayName: string;
  paid: number;
  shareTotal: number;
  netBalance: number;
  budgetLimit: number;
  budgetUsedPct: number;
}

export interface SimplifiedTransfer {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  amount: number;
}

export function calculateMemberBalances(
  members: TripMember[],
  expenses: ExpenseItem[]
): { summaries: MemberBalanceSummary[]; transfers: SimplifiedTransfer[]; totalSpent: number } {
  const paidMap = new Map<string, number>();
  const shareMap = new Map<string, number>();

  for (const m of members) {
    paidMap.set(m.memberId, 0);
    shareMap.set(m.memberId, 0);
  }

  let totalSpent = 0;

  for (const exp of expenses) {
    if (exp.splitMethod !== 'settlement') {
      totalSpent += exp.amount;
    }
    paidMap.set(exp.paidByMemberId, (paidMap.get(exp.paidByMemberId) ?? 0) + exp.amount);
    for (const s of exp.shares) {
      shareMap.set(s.memberId, (shareMap.get(s.memberId) ?? 0) + s.amount);
    }
  }

  const summaries: MemberBalanceSummary[] = members.map((m) => {
    const paid = Math.round((paidMap.get(m.memberId) ?? 0) * 100) / 100;
    const shareTotal = Math.round((shareMap.get(m.memberId) ?? 0) * 100) / 100;
    const netBalance = Math.round((paid - shareTotal) * 100) / 100;
    const budgetUsedPct = m.budgetLimit > 0 ? Math.min(100, Math.round((shareTotal / m.budgetLimit) * 100)) : 0;
    return {
      memberId: m.memberId,
      displayName: m.displayName,
      paid,
      shareTotal,
      netBalance,
      budgetLimit: m.budgetLimit,
      budgetUsedPct,
    };
  });

  const debtors = summaries
    .filter((s) => s.netBalance < -0.01)
    .map((s) => ({ ...s, remaining: Math.abs(s.netBalance) }))
    .sort((a, b) => b.remaining - a.remaining);

  const creditors = summaries
    .filter((s) => s.netBalance > 0.01)
    .map((s) => ({ ...s, remaining: s.netBalance }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SimplifiedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settleAmount = Math.round(Math.min(debtor.remaining, creditor.remaining) * 100) / 100;

    if (settleAmount > 0.01) {
      transfers.push({
        fromMemberId: debtor.memberId,
        fromName: debtor.displayName,
        toMemberId: creditor.memberId,
        toName: creditor.displayName,
        amount: settleAmount,
      });
    }

    debtor.remaining = Math.round((debtor.remaining - settleAmount) * 100) / 100;
    creditor.remaining = Math.round((creditor.remaining - settleAmount) * 100) / 100;

    if (debtor.remaining <= 0.01) i++;
    if (creditor.remaining <= 0.01) j++;
  }

  return {
    summaries,
    transfers,
    totalSpent: Math.round(totalSpent * 100) / 100,
  };
}
