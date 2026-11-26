import { supabase, type AuthUser } from './supabase';
import { buildSharesForMethod } from './splitwise';
import type {
  EncryptedDocCategory,
  EncryptedDocument,
  ExpenseItem,
  ExpenseShare,
  ItineraryCategory,
  ItineraryItem,
  LicenseTier,
  MascotId,
  OfflineMapPack,
  OfflineMapPin,
  RequiredDocItem,
  SplitMethod,
  ThemeAccent,
  TouristSpot,
  Trip,
  TripMember,
  UserBilling,
  UserProfile,
} from '../types/mavi';

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }
  return supabase;
}

function cleanId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

// Lightweight local event bus so local writes trigger immediate UI refreshes
type RefreshScope = 'profile' | 'billing' | 'trips' | `trip:${string}`;
const listeners = new Map<RefreshScope, Set<() => void>>();

function subscribeLocal(scope: RefreshScope, cb: () => void): () => void {
  const set = listeners.get(scope) ?? new Set<() => void>();
  set.add(cb);
  listeners.set(scope, set);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(scope);
  };
}

function notifyLocal(scope: RefreshScope) {
  listeners.get(scope)?.forEach((cb) => cb());
}

function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    uid: String(row.uid),
    displayName: String(row.display_name || 'Traveler'),
    mascotId: (row.mascot_id as MascotId) || 'mavi-pelican',
    themeAccent: (row.theme_accent as ThemeAccent) || 'coastal-teal',
    licenseTier: (row.license_tier as LicenseTier) || 'free',
    referralCode: String(row.referral_code || 'MAVI001'),
    referredBy: row.referred_by ? String(row.referred_by) : undefined,
    referralCount: Number(row.referral_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBilling(row: Record<string, unknown>): UserBilling {
  return {
    uid: String(row.uid),
    licenseTier: (row.license_tier as LicenseTier) || 'free',
    licensePricePaid: Number(row.license_price_paid || 0),
    monthlySyncActive: Boolean(row.monthly_sync_active),
    monthlySyncPrice: Number(row.monthly_sync_price ?? 1.99),
    lifetimeVaultUnlocked: Boolean(row.lifetime_vault_unlocked),
    lifetimeVaultPrice: Number(row.lifetime_vault_price ?? 14.99),
    historyRetentionDays: Number(row.history_retention_days ?? 180),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrip(row: Record<string, unknown>): Trip {
  return {
    tripId: String(row.trip_id),
    ownerId: String(row.owner_id),
    memberIds: Array.isArray(row.member_ids) ? row.member_ids.map(String) : [],
    title: String(row.title || ''),
    origin: String(row.origin || ''),
    destination: String(row.destination || ''),
    startDate: String(row.start_date || ''),
    endDate: String(row.end_date || ''),
    currency: String(row.currency || 'USD'),
    totalBudget: Number(row.total_budget || 0),
    joinCode: String(row.join_code || ''),
    status: (row.status as Trip['status']) || 'planning',
    isHistoricalArchive: Boolean(row.is_historical_archive),
    weatherSummary: String(row.weather_summary || ''),
    flightUpdateSummary: String(row.flight_update_summary || ''),
    touristSpots: Array.isArray(row.tourist_spots) ? (row.tourist_spots as TouristSpot[]) : [],
    requiredDocs: Array.isArray(row.required_docs) ? (row.required_docs as RequiredDocItem[]) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: Record<string, unknown>): TripMember {
  return {
    memberId: String(row.member_id),
    tripId: String(row.trip_id),
    displayName: String(row.display_name || 'Traveler'),
    mascotId: (row.mascot_id as MascotId) || 'mavi-pelican',
    role: (row.role as 'organizer' | 'traveler') || 'traveler',
    budgetLimit: Number(row.budget_limit || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItinerary(row: Record<string, unknown>): ItineraryItem {
  return {
    itemId: String(row.item_id),
    tripId: String(row.trip_id),
    title: String(row.title || ''),
    category: (row.category as ItineraryCategory) || 'activity',
    dateTime: String(row.date_time || ''),
    location: String(row.location || ''),
    notes: String(row.notes || ''),
    reminderMinutesBefore: Number(row.reminder_minutes_before || 0),
    cost: Number(row.cost || 0),
    paidByMemberId: String(row.paid_by_member_id || ''),
    splitMethod: (row.split_method as SplitMethod) || 'equal',
    linkedExpenseId: String(row.linked_expense_id || ''),
    status: (row.status as ItineraryItem['status']) || 'scheduled',
    createdBy: String(row.created_by || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExpense(row: Record<string, unknown>): ExpenseItem {
  return {
    expenseId: String(row.expense_id),
    tripId: String(row.trip_id),
    title: String(row.title || ''),
    category: String(row.category || 'dining'),
    amount: Number(row.amount || 0),
    currency: String(row.currency || 'USD'),
    paidByMemberId: String(row.paid_by_member_id || ''),
    splitMethod: (row.split_method as ExpenseItem['splitMethod']) || 'equal',
    shares: Array.isArray(row.shares) ? (row.shares as ExpenseShare[]) : [],
    linkedItineraryId: String(row.linked_itinerary_id || ''),
    date: String(row.date || ''),
    createdBy: String(row.created_by || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEncryptedDoc(row: Record<string, unknown>): EncryptedDocument {
  return {
    docId: String(row.doc_id),
    tripId: String(row.trip_id),
    senderUid: String(row.sender_uid),
    senderName: String(row.sender_name || 'Traveler'),
    docCategory: (row.doc_category as EncryptedDocCategory) || 'note',
    title: String(row.title || ''),
    ciphertext: String(row.ciphertext || ''),
    iv: String(row.iv || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOfflinePack(row: Record<string, unknown>): OfflineMapPack {
  return {
    packId: String(row.pack_id),
    tripId: String(row.trip_id),
    destination: String(row.destination || ''),
    centerLat: Number(row.center_lat || 0),
    centerLng: Number(row.center_lng || 0),
    zoomLevel: Number(row.zoom_level || 12),
    pins: Array.isArray(row.pins) ? (row.pins as OfflineMapPin[]) : [],
    downloadedByUid: String(row.downloaded_by_uid || ''),
    sizeKb: Number(row.size_kb || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function sbEnsureUserAccount(user: AuthUser): Promise<{ profile: UserProfile; billing: UserBilling }> {
  const client = requireClient();
  const uid = user.uid;

  const [{ data: existingProfile }, { data: existingBilling }] = await Promise.all([
    client.from('profiles').select('*').eq('uid', uid).maybeSingle(),
    client.from('user_billing').select('*').eq('uid', uid).maybeSingle(),
  ]);

  let profile: UserProfile;
  if (!existingProfile) {
    const displayName = clampStr(user.displayName || user.email?.split('@')[0] || 'Traveler', 80);
    const referralCode = `RT${uid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'MAVI01'}`;
    const insertRow = {
      uid,
      display_name: displayName,
      mascot_id: 'mavi-pelican',
      theme_accent: 'coastal-teal',
      license_tier: 'free',
      referral_code: referralCode,
      referral_count: 0,
    };
    const { data, error } = await client.from('profiles').upsert(insertRow).select('*').single();
    if (error) throw new Error(error.message);
    profile = mapProfile(data as Record<string, unknown>);
  } else {
    profile = mapProfile(existingProfile as Record<string, unknown>);
  }

  let billing: UserBilling;
  if (!existingBilling) {
    const billingRow = {
      uid,
      license_tier: profile.licenseTier,
      license_price_paid: 0,
      monthly_sync_active: true,
      monthly_sync_price: 1.99,
      lifetime_vault_unlocked: false,
      lifetime_vault_price: 14.99,
      history_retention_days: 180,
    };
    const { data, error } = await client.from('user_billing').upsert(billingRow).select('*').single();
    if (error) throw new Error(error.message);
    billing = mapBilling(data as Record<string, unknown>);
  } else {
    billing = mapBilling(existingBilling as Record<string, unknown>);
  }

  return { profile, billing };
}

export function sbSubscribeUserProfile(uid: string, onData: (profile: UserProfile | null) => void): () => void {
  const client = requireClient();
  const load = async () => {
    const { data } = await client.from('profiles').select('*').eq('uid', uid).maybeSingle();
    onData(data ? mapProfile(data as Record<string, unknown>) : null);
  };
  load();
  return subscribeLocal('profile', load);
}

export function sbSubscribeUserBilling(uid: string, onData: (billing: UserBilling | null) => void): () => void {
  const client = requireClient();
  const load = async () => {
    const { data } = await client.from('user_billing').select('*').eq('uid', uid).maybeSingle();
    onData(data ? mapBilling(data as Record<string, unknown>) : null);
  };
  load();
  return subscribeLocal('billing', load);
}

export async function sbUpdateUserCustomization(
  uid: string,
  displayName: string,
  mascotId: MascotId,
  themeAccent: ThemeAccent
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('profiles')
    .update({
      display_name: clampStr(displayName || 'Traveler', 80),
      mascot_id: mascotId,
      theme_accent: themeAccent,
      updated_at: new Date().toISOString(),
    })
    .eq('uid', uid);
  if (error) throw new Error(error.message);
  notifyLocal('profile');
}

export async function sbPurchaseLicense(uid: string, tier: LicenseTier, price: number): Promise<void> {
  const client = requireClient();
  const now = new Date().toISOString();
  const [pRes, bRes] = await Promise.all([
    client.from('profiles').update({ license_tier: tier, updated_at: now }).eq('uid', uid),
    client
      .from('user_billing')
      .update({ license_tier: tier, license_price_paid: price, updated_at: now })
      .eq('uid', uid),
  ]);
  if (pRes.error) throw new Error(pRes.error.message);
  if (bRes.error) throw new Error(bRes.error.message);
  notifyLocal('profile');
  notifyLocal('billing');
}

export async function sbToggleMonthlySync(uid: string, active: boolean): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('user_billing')
    .update({ monthly_sync_active: active, updated_at: new Date().toISOString() })
    .eq('uid', uid);
  if (error) throw new Error(error.message);
  notifyLocal('billing');
}

export async function sbActivateBillingCycle(uid: string, cycle: 'monthly' | 'six_months'): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('user_billing')
    .update({
      monthly_sync_active: true,
      monthly_sync_price: cycle === 'six_months' ? 9.99 : 1.99,
      history_retention_days: cycle === 'six_months' ? 180 : 30,
      updated_at: new Date().toISOString(),
    })
    .eq('uid', uid);
  if (error) throw new Error(error.message);
  notifyLocal('billing');
}

export async function sbUnlockLifetimeVault(uid: string): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('user_billing')
    .update({ lifetime_vault_unlocked: true, updated_at: new Date().toISOString() })
    .eq('uid', uid);
  if (error) throw new Error(error.message);
  notifyLocal('billing');
}

export async function sbRecordReferralInvite(uid: string, friendCode: string): Promise<void> {
  const client = requireClient();
  const { data } = await client.from('profiles').select('referral_count').eq('uid', uid).maybeSingle();
  const count = Number(data?.referral_count || 0);
  const { error } = await client
    .from('profiles')
    .update({
      referral_count: count + 1,
      referred_by: clampStr(friendCode || 'INVITE', 24),
      updated_at: new Date().toISOString(),
    })
    .eq('uid', uid);
  if (error) throw new Error(error.message);
  notifyLocal('profile');
}

export function sbSubscribeUserTrips(uid: string, onData: (trips: Trip[]) => void): () => void {
  const client = requireClient();
  const load = async () => {
    const { data } = await client
      .from('trips')
      .select('*')
      .contains('member_ids', [uid])
      .order('created_at', { ascending: false });
    onData((data || []).map((row) => mapTrip(row as Record<string, unknown>)));
  };
  load();
  return subscribeLocal('trips', load);
}

export function sbSubscribeTripSubcollections(
  tripId: string,
  callbacks: {
    onMembers: (members: TripMember[]) => void;
    onItinerary: (items: ItineraryItem[]) => void;
    onExpenses: (expenses: ExpenseItem[]) => void;
    onEncryptedDocs: (docs: EncryptedDocument[]) => void;
    onOfflinePacks: (packs: OfflineMapPack[]) => void;
  }
): () => void {
  const client = requireClient();
  const load = async () => {
    const [mRes, iRes, eRes, dRes, pRes] = await Promise.all([
      client.from('trip_members').select('*').eq('trip_id', tripId),
      client.from('itinerary_items').select('*').eq('trip_id', tripId).order('date_time', { ascending: true }),
      client.from('expenses').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
      client.from('encrypted_docs').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
      client.from('offline_map_packs').select('*').eq('trip_id', tripId),
    ]);
    callbacks.onMembers((mRes.data || []).map((r) => mapMember(r as Record<string, unknown>)));
    callbacks.onItinerary((iRes.data || []).map((r) => mapItinerary(r as Record<string, unknown>)));
    callbacks.onExpenses((eRes.data || []).map((r) => mapExpense(r as Record<string, unknown>)));
    callbacks.onEncryptedDocs((dRes.data || []).map((r) => mapEncryptedDoc(r as Record<string, unknown>)));
    callbacks.onOfflinePacks((pRes.data || []).map((r) => mapOfflinePack(r as Record<string, unknown>)));
  };
  load();
  return subscribeLocal(`trip:${tripId}`, load);
}

export async function sbCreateNewTrip(params: {
  owner: UserProfile;
  title: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  currency: string;
  totalBudget: number;
  companionNames: Array<{ name: string; mascotId: MascotId; budgetLimit: number }>;
  isHistoricalArchive?: boolean;
}): Promise<string> {
  const client = requireClient();
  const tripId = cleanId('trip');
  const joinCode = `RT${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const totalBudget = Math.max(0, Number(params.totalBudget) || 0);

  const { error: tripErr } = await client.from('trips').insert({
    trip_id: tripId,
    owner_id: params.owner.uid,
    member_ids: [params.owner.uid],
    title: clampStr(params.title, 120),
    origin: clampStr(params.origin, 100),
    destination: clampStr(params.destination, 100),
    start_date: clampStr(params.startDate, 32),
    end_date: clampStr(params.endDate, 32),
    currency: clampStr(params.currency || 'USD', 8),
    total_budget: totalBudget,
    join_code: joinCode,
    status: params.isHistoricalArchive ? 'completed' : 'planning',
    is_historical_archive: Boolean(params.isHistoricalArchive),
    weather_summary: 'Tap Refresh Live Insights for destination forecast and packing notes.',
    flight_update_summary: 'Add flight or rail segments to enable departure reminders.',
    tourist_spots: [],
    required_docs: [],
  });
  if (tripErr) throw new Error(tripErr.message);

  const perMemberBudget =
    params.companionNames.length > 0
      ? Math.round((totalBudget / (params.companionNames.length + 1)) * 100) / 100
      : totalBudget;

  const memberRows = [
    {
      member_id: cleanId('mem'),
      trip_id: tripId,
      display_name: clampStr(params.owner.displayName, 80),
      mascot_id: params.owner.mascotId,
      role: 'organizer',
      budget_limit: perMemberBudget,
    },
    ...params.companionNames.slice(0, 4).map((c) => ({
      member_id: cleanId('mem'),
      trip_id: tripId,
      display_name: clampStr(c.name, 80),
      mascot_id: c.mascotId,
      role: 'traveler',
      budget_limit: Math.max(0, c.budgetLimit),
    })),
  ];

  const { error: memErr } = await client.from('trip_members').insert(memberRows);
  if (memErr) throw new Error(memErr.message);

  notifyLocal('trips');
  notifyLocal(`trip:${tripId}`);
  return tripId;
}

export async function sbAddTripMember(
  tripId: string,
  displayName: string,
  mascotId: MascotId,
  budgetLimit: number
): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('trip_members').insert({
    member_id: cleanId('mem'),
    trip_id: tripId,
    display_name: clampStr(displayName, 80),
    mascot_id: mascotId,
    role: 'traveler',
    budget_limit: Math.max(0, budgetLimit),
  });
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${tripId}`);
}

export async function sbUpdateTripMemberBudget(tripId: string, memberId: string, budgetLimit: number): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('trip_members')
    .update({ budget_limit: Math.max(0, budgetLimit), updated_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .eq('member_id', memberId);
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${tripId}`);
}

export async function sbUpdateTripIntelligence(
  tripId: string,
  payload: {
    weatherSummary: string;
    flightUpdateSummary: string;
    touristSpots: TouristSpot[];
    requiredDocs: RequiredDocItem[];
  }
): Promise<void> {
  const client = requireClient();
  const { error } = await client
    .from('trips')
    .update({
      weather_summary: clampStr(payload.weatherSummary, 800),
      flight_update_summary: clampStr(payload.flightUpdateSummary, 800),
      tourist_spots: payload.touristSpots.slice(0, 12),
      required_docs: payload.requiredDocs.slice(0, 15),
      updated_at: new Date().toISOString(),
    })
    .eq('trip_id', tripId);
  if (error) throw new Error(error.message);
  notifyLocal('trips');
}

export async function sbSaveItineraryWithExpenseSync(params: {
  tripId: string;
  currency: string;
  uid: string;
  members: TripMember[];
  existingItem?: ItineraryItem;
  title: string;
  category: ItineraryCategory;
  dateTime: string;
  location: string;
  notes: string;
  reminderMinutesBefore: number;
  cost: number;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  status: 'scheduled' | 'boarding' | 'completed';
}): Promise<void> {
  const client = requireClient();
  const itemId = params.existingItem?.itemId || cleanId('itin');
  const cleanCost = Math.max(0, Math.round(params.cost * 100) / 100);
  const shouldHaveExpense = cleanCost > 0 && params.members.length > 0;
  const linkedExpenseId = shouldHaveExpense ? params.existingItem?.linkedExpenseId || cleanId('exp') : '';

  const { error: itinErr } = await client.from('itinerary_items').upsert({
    item_id: itemId,
    trip_id: params.tripId,
    title: clampStr(params.title, 140),
    category: params.category,
    date_time: clampStr(params.dateTime, 64),
    location: clampStr(params.location, 140),
    notes: clampStr(params.notes, 600),
    reminder_minutes_before: Math.max(0, Math.min(43200, Math.round(params.reminderMinutesBefore))),
    cost: cleanCost,
    paid_by_member_id: params.paidByMemberId,
    split_method: params.splitMethod,
    linked_expense_id: linkedExpenseId,
    status: params.status,
    created_by: params.existingItem?.createdBy || params.uid,
    updated_at: new Date().toISOString(),
  });
  if (itinErr) throw new Error(itinErr.message);

  if (shouldHaveExpense) {
    const shares = buildSharesForMethod(cleanCost, params.splitMethod, params.members);
    const datePart = clampStr(params.dateTime.split(' ')[0] || params.dateTime, 40);
    const { error: expErr } = await client.from('expenses').upsert({
      expense_id: linkedExpenseId,
      trip_id: params.tripId,
      title: clampStr(params.title, 140),
      category: params.category,
      amount: cleanCost,
      currency: params.currency,
      paid_by_member_id: params.paidByMemberId,
      split_method: params.splitMethod,
      shares,
      linked_itinerary_id: itemId,
      date: datePart,
      created_by: params.uid,
      updated_at: new Date().toISOString(),
    });
    if (expErr) throw new Error(expErr.message);
  } else if (params.existingItem?.linkedExpenseId) {
    await client.from('expenses').delete().eq('expense_id', params.existingItem.linkedExpenseId);
  }

  notifyLocal(`trip:${params.tripId}`);
}

export async function sbDeleteItineraryWithExpenseSync(tripId: string, item: ItineraryItem): Promise<void> {
  const client = requireClient();
  await client.from('itinerary_items').delete().eq('item_id', item.itemId);
  if (item.linkedExpenseId) {
    await client.from('expenses').delete().eq('expense_id', item.linkedExpenseId);
  }
  notifyLocal(`trip:${tripId}`);
}

export async function sbCreateExpenseEntry(params: {
  tripId: string;
  uid: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod | 'settlement';
  shares: ExpenseShare[];
  date: string;
}): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('expenses').insert({
    expense_id: cleanId('exp'),
    trip_id: params.tripId,
    title: clampStr(params.title, 140),
    category: clampStr(params.category, 40),
    amount: Math.max(0, Math.round(params.amount * 100) / 100),
    currency: clampStr(params.currency || 'USD', 8),
    paid_by_member_id: params.paidByMemberId,
    split_method: params.splitMethod,
    shares: params.shares.slice(0, 5),
    linked_itinerary_id: '',
    date: clampStr(params.date, 40),
    created_by: params.uid,
  });
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${params.tripId}`);
}

export async function sbDeleteExpenseEntry(tripId: string, expenseId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('expenses').delete().eq('trip_id', tripId).eq('expense_id', expenseId);
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${tripId}`);
}

export async function sbSaveEncryptedDocument(params: {
  tripId: string;
  senderUid: string;
  senderName: string;
  docCategory: EncryptedDocCategory;
  title: string;
  ciphertext: string;
  iv: string;
}): Promise<string> {
  const client = requireClient();
  const docId = cleanId('doc');
  const { error } = await client.from('encrypted_docs').insert({
    doc_id: docId,
    trip_id: params.tripId,
    sender_uid: params.senderUid,
    sender_name: clampStr(params.senderName, 80),
    doc_category: params.docCategory,
    title: clampStr(params.title, 120),
    ciphertext: params.ciphertext.slice(0, 8000),
    iv: params.iv.slice(0, 128),
  });
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${params.tripId}`);
  return docId;
}

export async function sbDeleteEncryptedDocument(tripId: string, docId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from('encrypted_docs').delete().eq('trip_id', tripId).eq('doc_id', docId);
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${tripId}`);
}

export async function sbSaveOfflineMapPack(params: {
  tripId: string;
  destination: string;
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  pins: OfflineMapPin[];
  downloadedByUid: string;
  sizeKb: number;
}): Promise<OfflineMapPack> {
  const client = requireClient();
  const packId = `pack_${params.tripId}`.slice(0, 128);
  const pack: OfflineMapPack = {
    packId,
    tripId: params.tripId,
    destination: clampStr(params.destination, 100),
    centerLat: params.centerLat,
    centerLng: params.centerLng,
    zoomLevel: params.zoomLevel,
    pins: params.pins.slice(0, 20),
    downloadedByUid: params.downloadedByUid,
    sizeKb: params.sizeKb,
  };
  const { error } = await client.from('offline_map_packs').upsert({
    pack_id: pack.packId,
    trip_id: pack.tripId,
    destination: pack.destination,
    center_lat: pack.centerLat,
    center_lng: pack.centerLng,
    zoom_level: pack.zoomLevel,
    pins: pack.pins,
    downloaded_by_uid: pack.downloadedByUid,
    size_kb: pack.sizeKb,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  notifyLocal(`trip:${params.tripId}`);
  return pack;
}

export async function sbCreateDemoTripsForUser(owner: UserProfile): Promise<string> {
  const tripId = await sbCreateNewTrip({
    owner,
    title: 'Dubai & Abu Dhabi Coastal Escape',
    origin: 'Mumbai, India',
    destination: 'Dubai, United Arab Emirates',
    startDate: '2026-12-10',
    endDate: '2026-12-15',
    currency: 'AED',
    totalBudget: 6500,
    companionNames: [
      { name: 'Elena Vance', mascotId: 'sunny-fox', budgetLimit: 2100 },
      { name: 'Marcus Chen', mascotId: 'pip-otter', budgetLimit: 2100 },
    ],
  });

  await sbUpdateTripIntelligence(tripId, {
    weatherSummary: 'Warm clear desert sun around 26°C (79°F), pleasant evenings near 19°C. Pack light cotton layers and sunglasses.',
    flightUpdateSummary: 'Direct flight BOM → DXB Terminal 3; Dubai Metro Red Line connects airport directly to Downtown in 25 mins.',
    touristSpots: [
      {
        name: 'Burj Khalifa At The Top',
        category: 'Landmark',
        description: 'Panoramic sunset views over Downtown Dubai and the Arabian Gulf.',
        estimatedCost: 179,
        latOffset: 0.012,
        lngOffset: 0.008,
      },
      {
        name: 'Al Fahidi Historical District',
        category: 'Neighborhood',
        description: 'Restored wind-tower alleys, creekside cafes, and traditional abra crossings.',
        estimatedCost: 25,
        latOffset: -0.014,
        lngOffset: -0.011,
      },
    ],
    requiredDocs: [
      {
        docType: 'passport',
        title: 'Valid Passport (6+ Months)',
        requirement: 'Passport must remain valid at least 6 months from UAE arrival date.',
        priority: 'mandatory',
      },
      {
        docType: 'insurance',
        title: 'Travel Medical Insurance',
        requirement: 'Comprehensive medical coverage recommended for international travel.',
        priority: 'mandatory',
      },
    ],
  });

  return tripId;
}
