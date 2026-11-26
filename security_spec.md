# MAVI Firestore Security Specification

## 1. Data Invariants
1. User PII (`email`) is strictly isolated in `/users/{userId}/private/info` and readable/writable only by `request.auth.uid == userId`.
2. Billing and license state (`/users/{userId}/billing/status`) is readable/writable only by `request.auth.uid == userId` with strict enum/numeric validation.
3. No user may list `/users` or enumerate other users' profiles, private records, or billing records.
4. A Trip (`/trips/{tripId}`) must have a valid `ownerId == request.auth.uid` on creation, a bounded `memberIds` array (1 to 5 UIDs) starting with the owner, and server-verified `createdAt == request.time`.
5. Every subcollection under `/trips/{tripId}` (`members`, `itinerary`, `expenses`, `encryptedDocs`, `offlinePacks`) enforces the Master Gate: the requesting user must be in the parent Trip's `memberIds` list via `get()`.
6. Every write operation enforces `email_verified == true`, strict `hasAll`/`hasOnly` key allowlists on create, `affectedKeys().hasOnly(...)` action branches on update, immutable ownership/timestamp fields, and strict string length bounds.
7. Terminal Trip state (`status == 'completed'`) locks itinerary and expense mutations unless re-opened by the owner (no arbitrary updates on locked trips).

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield PERMISSION_DENIED)
1. **Identity Spoofing on Trip Create**: User A tries to create `/trips/trip1` with `ownerId: "userB"`.
2. **Oversized Member Array (License Bypass)**: User A tries to create `/trips/trip1` with 6 UIDs in `memberIds`.
3. **Ghost Field Injection (Shadow Update)**: User A tries to create `/users/userA` with an extra field `isAdmin: true`.
4. **Unverified Email Write**: A user with `token.email_verified: false` attempts to create a trip or expense.
5. **Cross-User PII Read**: User B attempts `get` on `/users/userA/private/info`.
6. **Scrape Query (Unauthorized List)**: User B attempts `list` on `/trips` without filtering where `memberIds` contains `userB`.
7. **Orphan Subcollection Write**: User A tries to write `/trips/nonexistent/expenses/exp1`.
8. **Non-Member Subcollection Write**: User C (not in `trip1.memberIds`) attempts to create an encrypted document in `/trips/trip1/encryptedDocs/doc1`.
9. **Resource Poisoning (1MB ID/String)**: User A attempts to write a 2000-character string into `title` or document ID.
10. **Timestamp Forgery**: User A creates `/trips/trip1` with a backdated client timestamp `createdAt` instead of `request.time`.
11. **Immutable Owner Mutation**: User A updates `/trips/trip1` attempting to change `ownerId` or `createdAt`.
12. **Sender UID Spoofing in Encrypted Docs**: Member B tries to write `/trips/trip1/encryptedDocs/doc1` with `senderUid: "userA"`.
