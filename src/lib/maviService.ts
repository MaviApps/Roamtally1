import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { buildSharesForMethod } from './splitwise';
import { isSupabaseConfigured, type AuthUser } from './supabase';
import {
  sbActivateBillingCycle,
  sbAddTripMember,
  sbCreateDemoTripsForUser,
  sbCreateExpenseEntry,
  sbCreateNewTrip,
  sbDeleteEncryptedDocument,
  sbDeleteExpenseEntry,
  sbDeleteItineraryWithExpenseSync,
  sbEnsureUserAccount,
  sbPurchaseLicense,
  sbRecordReferralInvite,
  sbSaveEncryptedDocument,
  sbSaveItineraryWithExpenseSync,
  sbSaveOfflineMapPack,
  sbSubscribeTripSubcollections,
  sbSubscribeUserBilling,
  sbSubscribeUserProfile,
  sbSubscribeUserTrips,
  sbToggleMonthlySync,
  sbUnlockLifetimeVault,
  sbUpdateTripIntelligence,
  sbUpdateTripMemberBudget,
  sbUpdateUserCustomization,
} from './supabaseService';
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

function cleanId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

export async function ensureUserAccount(user: AuthUser): Promise<{ profile: UserProfile; billing: UserBilling }> {
  if (isSupabaseConfigured) return sbEnsureUserAccount(user);
  const uid = user.uid;
  const userRef = doc(db, 'users', uid);
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  const billingRef = doc(db, 'users', uid, 'billing', 'status');

  try {
    const [userSnap, billingSnap] = await Promise.all([getDoc(userRef), getDoc(billingRef)]);

    if (!userSnap.exists()) {
      const displayName = clampStr(user.displayName || user.email?.split('@')[0] || 'Traveler', 80);
      const referralCode = `MAVI${uid.slice(0, 6).toUpperCase()}`.replace(/[^a-zA-Z0-9_-]/g, 'X');

      const newProfile: UserProfile = {
        uid,
        displayName,
        mascotId: 'mavi-pelican',
        themeAccent: 'coastal-teal',
        licenseTier: 'free',
        referralCode,
        referralCount: 0,
      };

      const batch = writeBatch(db);
      batch.set(userRef, {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateRef, {
        uid,
        email: clampStr(user.email || 'traveler@mavi.app', 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const newBilling: UserBilling = {
        uid,
        licenseTier: 'free',
        licensePricePaid: 0,
        monthlySyncActive: true,
        monthlySyncPrice: 1.99,
        lifetimeVaultUnlocked: false,
        lifetimeVaultPrice: 14.99,
        historyRetentionDays: 180,
      };

      batch.set(billingRef, {
        ...newBilling,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return { profile: newProfile, billing: newBilling };
    }

    if (!billingSnap.exists()) {
      const defaultBilling: UserBilling = {
        uid,
        licenseTier: (userSnap.data().licenseTier as LicenseTier) || 'free',
        licensePricePaid: 0,
        monthlySyncActive: true,
        monthlySyncPrice: 1.99,
        lifetimeVaultUnlocked: false,
        lifetimeVaultPrice: 14.99,
        historyRetentionDays: 180,
      };
      await setDoc(billingRef, {
        ...defaultBilling,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        profile: userSnap.data() as UserProfile,
        billing: defaultBilling,
      };
    }

    return {
      profile: userSnap.data() as UserProfile,
      billing: billingSnap.data() as UserBilling,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void
): () => void {
  if (isSupabaseConfigured) return sbSubscribeUserProfile(uid, onData);
  const path = `users/${uid}`;
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserProfile) : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export function subscribeUserBilling(
  uid: string,
  onData: (billing: UserBilling | null) => void
): () => void {
  if (isSupabaseConfigured) return sbSubscribeUserBilling(uid, onData);
  const path = `users/${uid}/billing/status`;
  return onSnapshot(
    doc(db, 'users', uid, 'billing', 'status'),
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserBilling) : null);
    },
    (error) => handleFirestoreError(error, OperationType.GET, path)
  );
}

export async function updateUserCustomization(
  uid: string,
  displayName: string,
  mascotId: MascotId,
  themeAccent: ThemeAccent
): Promise<void> {
  if (isSupabaseConfigured) return sbUpdateUserCustomization(uid, displayName, mascotId, themeAccent);
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: clampStr(displayName || 'Traveler', 80),
      mascotId,
      themeAccent,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function purchaseLicense(
  uid: string,
  tier: LicenseTier,
  price: number
): Promise<void> {
  if (isSupabaseConfigured) return sbPurchaseLicense(uid, tier, price);
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    licenseTier: tier,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid, 'billing', 'status'), {
    licenseTier: tier,
    licensePricePaid: price,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}/billing/status`);
  }
}

export async function toggleMonthlySync(uid: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured) return sbToggleMonthlySync(uid, active);
  const path = `users/${uid}/billing/status`;
  try {
    await updateDoc(doc(db, 'users', uid, 'billing', 'status'), {
      monthlySyncActive: active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function activateBillingCycle(
  uid: string,
  cycle: 'monthly' | 'six_months'
): Promise<void> {
  if (isSupabaseConfigured) return sbActivateBillingCycle(uid, cycle);
  const path = `users/${uid}/billing/status`;
  try {
    await updateDoc(doc(db, 'users', uid, 'billing', 'status'), {
      monthlySyncActive: true,
      monthlySyncPrice: cycle === 'six_months' ? 9.99 : 1.99,
      historyRetentionDays: cycle === 'six_months' ? 180 : 30,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function unlockLifetimeVault(uid: string): Promise<void> {
  if (isSupabaseConfigured) return sbUnlockLifetimeVault(uid);
  const path = `users/${uid}/billing/status`;
  try {
    await updateDoc(doc(db, 'users', uid, 'billing', 'status'), {
      lifetimeVaultUnlocked: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function recordReferralInvite(uid: string, friendCode: string): Promise<void> {
  if (isSupabaseConfigured) return sbRecordReferralInvite(uid, friendCode);
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const currentCount = snap.exists() ? Number(snap.data().referralCount || 0) : 0;
    await updateDoc(doc(db, 'users', uid), {
      referralCount: currentCount + 1,
      referredBy: clampStr(friendCode || 'INVITE', 24),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeUserTrips(uid: string, onData: (trips: Trip[]) => void): () => void {
  if (isSupabaseConfigured) return sbSubscribeUserTrips(uid, onData);
  const q = query(
    collection(db, 'trips'),
    where('memberIds', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const trips = snap.docs.map((d) => d.data() as Trip);
      trips.sort((a, b) => {
        const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
        return bSec - aSec;
      });
      onData(trips);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, 'trips')
  );
}

export function subscribeTripSubcollections(
  tripId: string,
  callbacks: {
    onMembers: (members: TripMember[]) => void;
    onItinerary: (items: ItineraryItem[]) => void;
    onExpenses: (expenses: ExpenseItem[]) => void;
    onEncryptedDocs: (docs: EncryptedDocument[]) => void;
    onOfflinePacks: (packs: OfflineMapPack[]) => void;
  }
): () => void {
  if (isSupabaseConfigured) return sbSubscribeTripSubcollections(tripId, callbacks);
  const unsubMembers = onSnapshot(
    collection(db, 'trips', tripId, 'members'),
    (snap) => callbacks.onMembers(snap.docs.map((d) => d.data() as TripMember)),
    (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/members`)
  );

  const unsubItinerary = onSnapshot(
    query(collection(db, 'trips', tripId, 'itinerary'), orderBy('dateTime', 'asc')),
    (snap) => callbacks.onItinerary(snap.docs.map((d) => d.data() as ItineraryItem)),
    (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/itinerary`)
  );

  const unsubExpenses = onSnapshot(
    query(collection(db, 'trips', tripId, 'expenses'), orderBy('createdAt', 'desc')),
    (snap) => callbacks.onExpenses(snap.docs.map((d) => d.data() as ExpenseItem)),
    (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/expenses`)
  );

  const unsubDocs = onSnapshot(
    query(collection(db, 'trips', tripId, 'encryptedDocs'), orderBy('createdAt', 'desc')),
    (snap) => callbacks.onEncryptedDocs(snap.docs.map((d) => d.data() as EncryptedDocument)),
    (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/encryptedDocs`)
  );

  const unsubPacks = onSnapshot(
    collection(db, 'trips', tripId, 'offlinePacks'),
    (snap) => callbacks.onOfflinePacks(snap.docs.map((d) => d.data() as OfflineMapPack)),
    (error) => handleFirestoreError(error, OperationType.LIST, `trips/${tripId}/offlinePacks`)
  );

  return () => {
    unsubMembers();
    unsubItinerary();
    unsubExpenses();
    unsubDocs();
    unsubPacks();
  };
}

export async function createNewTrip(params: {
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
  if (isSupabaseConfigured) return sbCreateNewTrip(params);
  const tripId = cleanId('trip');
  const joinCode = `MV${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const tripData: Trip = {
    tripId,
    ownerId: params.owner.uid,
    memberIds: [params.owner.uid],
    title: clampStr(params.title, 120),
    origin: clampStr(params.origin, 100),
    destination: clampStr(params.destination, 100),
    startDate: clampStr(params.startDate, 32),
    endDate: clampStr(params.endDate, 32),
    currency: clampStr(params.currency || 'USD', 8),
    totalBudget: Math.max(0, Number(params.totalBudget) || 0),
    joinCode,
    status: params.isHistoricalArchive ? 'completed' : 'planning',
    isHistoricalArchive: Boolean(params.isHistoricalArchive),
    weatherSummary: 'Tap Refresh Live Insights for destination forecast and packing notes.',
    flightUpdateSummary: 'Add flight or rail segments to enable departure reminders.',
    touristSpots: [],
    requiredDocs: [],
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'trips', tripId), {
    ...tripData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ownerMemberId = cleanId('mem');
  const perMemberBudget =
    params.companionNames.length > 0
      ? Math.round((tripData.totalBudget / (params.companionNames.length + 1)) * 100) / 100
      : tripData.totalBudget;

  batch.set(doc(db, 'trips', tripId, 'members', ownerMemberId), {
    memberId: ownerMemberId,
    tripId,
    displayName: clampStr(params.owner.displayName, 80),
    mascotId: params.owner.mascotId,
    role: 'organizer',
    budgetLimit: perMemberBudget,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const extraTravelers = params.companionNames.slice(0, 4);
  for (const c of extraTravelers) {
    const mId = cleanId('mem');
    batch.set(doc(db, 'trips', tripId, 'members', mId), {
      memberId: mId,
      tripId,
      displayName: clampStr(c.name, 80),
      mascotId: c.mascotId,
      role: 'traveler',
      budgetLimit: Math.max(0, c.budgetLimit),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return tripId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `trips/${tripId}`);
  }
}

export async function addTripMember(
  tripId: string,
  displayName: string,
  mascotId: MascotId,
  budgetLimit: number
): Promise<void> {
  if (isSupabaseConfigured) return sbAddTripMember(tripId, displayName, mascotId, budgetLimit);
  const memberId = cleanId('mem');
  const path = `trips/${tripId}/members/${memberId}`;
  try {
    await setDoc(doc(db, 'trips', tripId, 'members', memberId), {
      memberId,
      tripId,
      displayName: clampStr(displayName, 80),
      mascotId,
      role: 'traveler',
      budgetLimit: Math.max(0, budgetLimit),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateTripMemberBudget(
  tripId: string,
  memberId: string,
  budgetLimit: number
): Promise<void> {
  if (isSupabaseConfigured) return sbUpdateTripMemberBudget(tripId, memberId, budgetLimit);
  const path = `trips/${tripId}/members/${memberId}`;
  try {
    await updateDoc(doc(db, 'trips', tripId, 'members', memberId), {
      budgetLimit: Math.max(0, budgetLimit),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateTripIntelligence(
  tripId: string,
  payload: {
    weatherSummary: string;
    flightUpdateSummary: string;
    touristSpots: TouristSpot[];
    requiredDocs: RequiredDocItem[];
  }
): Promise<void> {
  if (isSupabaseConfigured) return sbUpdateTripIntelligence(tripId, payload);
  const path = `trips/${tripId}`;
  try {
    await updateDoc(doc(db, 'trips', tripId), {
      weatherSummary: clampStr(payload.weatherSummary, 800),
      flightUpdateSummary: clampStr(payload.flightUpdateSummary, 800),
      touristSpots: payload.touristSpots.slice(0, 12),
      requiredDocs: payload.requiredDocs.slice(0, 15),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveItineraryWithExpenseSync(params: {
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
  if (isSupabaseConfigured) return sbSaveItineraryWithExpenseSync(params);
  const itemId = params.existingItem?.itemId || cleanId('itin');
  const shouldHaveExpense = params.cost > 0 && params.members.length > 0;
  const linkedExpenseId = shouldHaveExpense
    ? params.existingItem?.linkedExpenseId || cleanId('exp')
    : '';

  const batch = writeBatch(db);
  const itinRef = doc(db, 'trips', params.tripId, 'itinerary', itemId);

  const itinBase = {
    itemId,
    tripId: params.tripId,
    title: clampStr(params.title, 140),
    category: params.category,
    dateTime: clampStr(params.dateTime, 64),
    location: clampStr(params.location, 140),
    notes: clampStr(params.notes, 600),
    reminderMinutesBefore: Math.max(0, Math.min(43200, Math.round(params.reminderMinutesBefore))),
    cost: Math.max(0, Math.round(params.cost * 100) / 100),
    paidByMemberId: params.paidByMemberId,
    splitMethod: params.splitMethod,
    linkedExpenseId,
    status: params.status,
    updatedAt: serverTimestamp(),
  };

  if (params.existingItem) {
    batch.update(itinRef, {
      title: itinBase.title,
      category: itinBase.category,
      dateTime: itinBase.dateTime,
      location: itinBase.location,
      notes: itinBase.notes,
      reminderMinutesBefore: itinBase.reminderMinutesBefore,
      cost: itinBase.cost,
      paidByMemberId: itinBase.paidByMemberId,
      splitMethod: itinBase.splitMethod,
      linkedExpenseId: itinBase.linkedExpenseId,
      status: itinBase.status,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(itinRef, {
      ...itinBase,
      createdBy: params.uid,
      createdAt: serverTimestamp(),
    });
  }

  if (shouldHaveExpense) {
    const expRef = doc(db, 'trips', params.tripId, 'expenses', linkedExpenseId);
    const shares = buildSharesForMethod(itinBase.cost, params.splitMethod, params.members);
    const datePart = clampStr(params.dateTime.split(' ')[0] || params.dateTime, 40);

    if (params.existingItem?.linkedExpenseId) {
      batch.update(expRef, {
        title: itinBase.title,
        category: itinBase.category,
        amount: itinBase.cost,
        currency: params.currency,
        paidByMemberId: params.paidByMemberId,
        splitMethod: params.splitMethod,
        shares,
        linkedItineraryId: itemId,
        date: datePart,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(expRef, {
        expenseId: linkedExpenseId,
        tripId: params.tripId,
        title: itinBase.title,
        category: itinBase.category,
        amount: itinBase.cost,
        currency: params.currency,
        paidByMemberId: params.paidByMemberId,
        splitMethod: params.splitMethod,
        shares,
        linkedItineraryId: itemId,
        date: datePart,
        createdBy: params.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else if (params.existingItem?.linkedExpenseId) {
    batch.delete(doc(db, 'trips', params.tripId, 'expenses', params.existingItem.linkedExpenseId));
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `trips/${params.tripId}/itinerary/${itemId}`);
  }
}

export async function deleteItineraryWithExpenseSync(
  tripId: string,
  item: ItineraryItem
): Promise<void> {
  if (isSupabaseConfigured) return sbDeleteItineraryWithExpenseSync(tripId, item);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'trips', tripId, 'itinerary', item.itemId));
  if (item.linkedExpenseId) {
    batch.delete(doc(db, 'trips', tripId, 'expenses', item.linkedExpenseId));
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}/itinerary/${item.itemId}`);
  }
}

export async function createExpenseEntry(params: {
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
  if (isSupabaseConfigured) return sbCreateExpenseEntry(params);
  const expenseId = cleanId('exp');
  const path = `trips/${params.tripId}/expenses/${expenseId}`;
  try {
    await setDoc(doc(db, 'trips', params.tripId, 'expenses', expenseId), {
      expenseId,
      tripId: params.tripId,
      title: clampStr(params.title, 140),
      category: clampStr(params.category, 40),
      amount: Math.max(0, Math.round(params.amount * 100) / 100),
      currency: clampStr(params.currency || 'USD', 8),
      paidByMemberId: params.paidByMemberId,
      splitMethod: params.splitMethod,
      shares: params.shares.slice(0, 5),
      linkedItineraryId: '',
      date: clampStr(params.date, 40),
      createdBy: params.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteExpenseEntry(tripId: string, expenseId: string): Promise<void> {
  if (isSupabaseConfigured) return sbDeleteExpenseEntry(tripId, expenseId);
  const path = `trips/${tripId}/expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'expenses', expenseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveEncryptedDocument(params: {
  tripId: string;
  senderUid: string;
  senderName: string;
  docCategory: EncryptedDocCategory;
  title: string;
  ciphertext: string;
  iv: string;
}): Promise<string> {
  if (isSupabaseConfigured) return sbSaveEncryptedDocument(params);
  const docId = cleanId('doc');
  const path = `trips/${params.tripId}/encryptedDocs/${docId}`;
  try {
    await setDoc(doc(db, 'trips', params.tripId, 'encryptedDocs', docId), {
      docId,
      tripId: params.tripId,
      senderUid: params.senderUid,
      senderName: clampStr(params.senderName, 80),
      docCategory: params.docCategory,
      title: clampStr(params.title, 120),
      ciphertext: params.ciphertext.slice(0, 8000),
      iv: params.iv.slice(0, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteEncryptedDocument(tripId: string, docId: string): Promise<void> {
  if (isSupabaseConfigured) return sbDeleteEncryptedDocument(tripId, docId);
  const path = `trips/${tripId}/encryptedDocs/${docId}`;
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'encryptedDocs', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveOfflineMapPack(params: {
  tripId: string;
  destination: string;
  centerLat: number;
  centerLng: number;
  zoomLevel: number;
  pins: OfflineMapPin[];
  downloadedByUid: string;
  sizeKb: number;
}): Promise<OfflineMapPack> {
  if (isSupabaseConfigured) return sbSaveOfflineMapPack(params);
  const packId = `pack_${params.tripId}`.slice(0, 128);
  const path = `trips/${params.tripId}/offlinePacks/${packId}`;
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

  try {
    await setDoc(doc(db, 'trips', params.tripId, 'offlinePacks', packId), {
      ...pack,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return pack;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function createDemoTripsForUser(owner: UserProfile): Promise<string> {
  if (isSupabaseConfigured) return sbCreateDemoTripsForUser(owner);
  const activeTripId = cleanId('trip');
  const archiveTripId = cleanId('trip');
  const batch = writeBatch(db);

  // 1. Active Amalfi Coast Trip
  const mem1 = cleanId('mem');
  const mem2 = cleanId('mem');
  const mem3 = cleanId('mem');

  const activeTrip: Trip = {
    tripId: activeTripId,
    ownerId: owner.uid,
    memberIds: [owner.uid],
    title: 'Amalfi Coastal Escape',
    origin: 'San Francisco, CA',
    destination: 'Amalfi Coast, Italy',
    startDate: '2026-11-22',
    endDate: '2026-11-28',
    currency: 'USD',
    totalBudget: 3600,
    joinCode: 'MAVIAMALFI',
    status: 'active',
    isHistoricalArchive: false,
    weatherSummary: 'Sunny coastal afternoons around 19°C (66°F), crisp evenings near 12°C. Light coastal breeze—pack a windproof jacket and walking shoes.',
    flightUpdateSummary: 'Outbound flight SFO → NAP arriving Terminal 1; regional ferry & SITA coastal rail run every 45 mins. Arrive 150 mins before international departure.',
    touristSpots: [
      {
        name: 'Ravello Villa Cimbrone',
        category: 'Landmark',
        description: 'Clifftop gardens and the Terrace of Infinity overlooking the Salerno Gulf.',
        estimatedCost: 14,
        latOffset: 0.018,
        lngOffset: 0.021,
      },
      {
        name: 'Positano Marina Grande',
        category: 'Neighborhood',
        description: 'Iconic pastel hillside village with boat charters and seaside trattorias.',
        estimatedCost: 35,
        latOffset: -0.015,
        lngOffset: -0.025,
      },
      {
        name: 'Path of the Gods Trail',
        category: 'Nature',
        description: 'High-altitude coastal footpath from Bomerano to Nocelle with dramatic sea views.',
        estimatedCost: 0,
        latOffset: 0.012,
        lngOffset: -0.011,
      },
      {
        name: 'Amalfi Paper Mill Museum',
        category: 'Museum',
        description: 'Historic 13th-century water-powered paper mill in the Valley of the Mills.',
        estimatedCost: 8,
        latOffset: 0.005,
        lngOffset: 0.006,
      },
    ],
    requiredDocs: [
      {
        docType: 'passport',
        title: 'Valid Passport (6+ Months)',
        requirement: 'Must remain valid at least 3–6 months beyond departure from the Schengen Area.',
        priority: 'mandatory',
      },
      {
        docType: 'insurance',
        title: 'Schengen Medical & Trip Insurance',
        requirement: 'Minimum €30,000 emergency medical & evacuation coverage certificate recommended.',
        priority: 'mandatory',
      },
      {
        docType: 'ticket',
        title: 'Return Flight & Hotel Confirmation',
        requirement: 'Border control may ask for proof of return itinerary and confirmed lodging.',
        priority: 'recommended',
      },
    ],
  };

  batch.set(doc(db, 'trips', activeTripId), {
    ...activeTrip,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'trips', activeTripId, 'members', mem1), {
    memberId: mem1,
    tripId: activeTripId,
    displayName: clampStr(owner.displayName, 80),
    mascotId: owner.mascotId,
    role: 'organizer',
    budgetLimit: 1200,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', activeTripId, 'members', mem2), {
    memberId: mem2,
    tripId: activeTripId,
    displayName: 'Elena Vance',
    mascotId: 'sunny-fox',
    role: 'traveler',
    budgetLimit: 1200,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', activeTripId, 'members', mem3), {
    memberId: mem3,
    tripId: activeTripId,
    displayName: 'Marcus Chen',
    mascotId: 'pip-otter',
    role: 'traveler',
    budgetLimit: 1200,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const demoMembers: TripMember[] = [
    { memberId: mem1, tripId: activeTripId, displayName: owner.displayName, mascotId: owner.mascotId, role: 'organizer', budgetLimit: 1200 },
    { memberId: mem2, tripId: activeTripId, displayName: 'Elena Vance', mascotId: 'sunny-fox', role: 'traveler', budgetLimit: 1200 },
    { memberId: mem3, tripId: activeTripId, displayName: 'Marcus Chen', mascotId: 'pip-otter', role: 'traveler', budgetLimit: 1200 },
  ];

  const itin1 = cleanId('itin');
  const exp1 = cleanId('exp');
  const itin2 = cleanId('itin');
  const exp2 = cleanId('exp');
  const itin3 = cleanId('itin');
  const exp3 = cleanId('exp');

  batch.set(doc(db, 'trips', activeTripId, 'itinerary', itin1), {
    itemId: itin1,
    tripId: activeTripId,
    title: 'Coastal Express Rail: Naples to Salerno',
    category: 'train',
    dateTime: '2026-11-22 11:15',
    location: 'Napoli Centrale Track 8',
    notes: 'High-speed regional connection with ferry transfer.',
    reminderMinutesBefore: 90,
    cost: 114,
    paidByMemberId: mem1,
    splitMethod: 'equal',
    linkedExpenseId: exp1,
    status: 'boarding',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', activeTripId, 'expenses', exp1), {
    expenseId: exp1,
    tripId: activeTripId,
    title: 'Coastal Express Rail: Naples to Salerno',
    category: 'train',
    amount: 114,
    currency: 'USD',
    paidByMemberId: mem1,
    splitMethod: 'equal',
    shares: buildSharesForMethod(114, 'equal', demoMembers),
    linkedItineraryId: itin1,
    date: '2026-11-22',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'trips', activeTripId, 'itinerary', itin2), {
    itemId: itin2,
    tripId: activeTripId,
    title: 'Villa Terrazza Boutique Stay (4 Nights)',
    category: 'lodging',
    dateTime: '2026-11-22 15:00',
    location: 'Via Laurito 42, Positano',
    notes: 'Check-in code in Encrypted Vault. Sea-view terrace included.',
    reminderMinutesBefore: 120,
    cost: 1380,
    paidByMemberId: mem2,
    splitMethod: 'equal',
    linkedExpenseId: exp2,
    status: 'scheduled',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', activeTripId, 'expenses', exp2), {
    expenseId: exp2,
    tripId: activeTripId,
    title: 'Villa Terrazza Boutique Stay (4 Nights)',
    category: 'lodging',
    amount: 1380,
    currency: 'USD',
    paidByMemberId: mem2,
    splitMethod: 'equal',
    shares: buildSharesForMethod(1380, 'equal', demoMembers),
    linkedItineraryId: itin2,
    date: '2026-11-22',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'trips', activeTripId, 'itinerary', itin3), {
    itemId: itin3,
    tripId: activeTripId,
    title: 'Private Capri & Grotta Boat Charter',
    category: 'activity',
    dateTime: '2026-11-24 09:30',
    location: 'Amalfi Harbor Pier B',
    notes: 'Bring sunscreen and downloaded offline map pack.',
    reminderMinutesBefore: 60,
    cost: 420,
    paidByMemberId: mem3,
    splitMethod: 'equal',
    linkedExpenseId: exp3,
    status: 'scheduled',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', activeTripId, 'expenses', exp3), {
    expenseId: exp3,
    tripId: activeTripId,
    title: 'Private Capri & Grotta Boat Charter',
    category: 'activity',
    amount: 420,
    currency: 'USD',
    paidByMemberId: mem3,
    splitMethod: 'equal',
    shares: buildSharesForMethod(420, 'equal', demoMembers),
    linkedItineraryId: itin3,
    date: '2026-11-24',
    createdBy: owner.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Historical Trip (> 6 Months Old) to demonstrate Lifetime Vault Preservation
  const archMem1 = cleanId('mem');
  const archiveTrip: Trip = {
    tripId: archiveTripId,
    ownerId: owner.uid,
    memberIds: [owner.uid],
    title: 'Kyoto Spring Blossom Trail',
    origin: 'San Francisco, CA',
    destination: 'Kyoto, Japan',
    startDate: '2026-03-14',
    endDate: '2026-03-21',
    currency: 'USD',
    totalBudget: 2400,
    joinCode: 'MAVIKYOTO',
    status: 'completed',
    isHistoricalArchive: true,
    weatherSummary: 'Crisp spring mornings 11°C–17°C with clear skies across Arashiyama.',
    flightUpdateSummary: 'Completed JL001 SFO → KIX with Haruka Express rail transfer.',
    touristSpots: [
      {
        name: 'Fushimi Inari Taisha',
        category: 'Landmark',
        description: 'Thousands of vermilion torii gates winding up Mount Inari.',
        estimatedCost: 0,
        latOffset: -0.02,
        lngOffset: 0.01,
      },
    ],
    requiredDocs: [
      {
        docType: 'passport',
        title: 'Passport & Visit Japan Web QR',
        requirement: 'Digital customs & immigration QR completed prior to arrival.',
        priority: 'mandatory',
      },
    ],
  };

  batch.set(doc(db, 'trips', archiveTripId), {
    ...archiveTrip,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'trips', archiveTripId, 'members', archMem1), {
    memberId: archMem1,
    tripId: archiveTripId,
    displayName: clampStr(owner.displayName, 80),
    mascotId: owner.mascotId,
    role: 'organizer',
    budgetLimit: 2400,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return activeTripId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `trips/${activeTripId}`);
  }
}
