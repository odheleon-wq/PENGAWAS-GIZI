# Security Specification — Rekapan Menu SPPG

## 1. Data Invariants
1. **Per-Email Dashboard Isolation**: Document `/users/{userId}` can only be read, created, updated, or deleted when `request.auth != null`, `request.auth.token.email_verified == true`, and `request.auth.uid == userId`.
2. **Master Gate Relational Integrity**: Subcollections `/users/{userId}/months/{monthId}` and `/users/{userId}/months/{monthId}/entries/{entryId}` require parent ownership (`uid == request.auth.uid`) and parent existence checks (`exists` or `existsAfter` for atomic batches).
3. **Immutable Identity & Timestamps**: `uid` and `createdAt` cannot be modified after creation (`incoming().uid == existing().uid` and `incoming().createdAt == existing().createdAt`). `createdAt` and `updatedAt` must equal `request.time`.
4. **Strict Field Boundaries & ID Guards**: Every document ID (`userId`, `monthId`, `entryId`) must satisfy `isValidId()`, every string enforces `.size()` limits matching `firebase-blueprint.json`, and `keys().hasAll(...) && keys().hasOnly(...)` blocks shadow/ghost fields.
5. **No Blanket List Scraping**: `list` is disallowed on `/users` globally and allowed on user subcollections strictly when `request.auth.uid == userId && resource.data.uid == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads (Adversarial Tests)
1. **Unauthenticated Read/Write**: Accessing `/users/userA` with `auth == null`.
2. **Unverified Email Spoof**: Accessing `/users/userA` with `auth.uid == 'userA'` but `email_verified == false`.
3. **Cross-Tenant Read**: `userB` reading `/users/userA` or `/users/userA/months/2026-11/entries/2026-11-02`.
4. **Cross-Tenant Write Spoof**: `userB` writing `/users/userA/months/2026-11` with `uid: 'userB'`.
5. **UID Hijack Inside Payload**: `userA` writing `/users/userA` with `uid: 'userB'`.
6. **Shadow/Ghost Field Injection**: `userA` creating `/users/userA` with extra field `isAdmin: true` or `role: 'superadmin'`.
7. **ID Poisoning**: Creating `/users/userA/months/2026-11/entries/bad$id` with invalid characters or length > 128.
8. **Client Timestamp Forgery**: Creating/updating a document with `createdAt` or `updatedAt` set to a forged client timestamp instead of `request.time`.
9. **Immutable Field Mutation**: Updating `/users/userA` to change `createdAt` or `uid`.
10. **Payload Size Exhaustion (DoW)**: Setting `namaMenu` to 5000 chars (> 1000) or `photoDataUrl` > 350000 chars.
11. **Invalid Month/Date Pattern**: Writing `monthKey: "November"` instead of `^[0-9]{4}-[0-9]{2}$` or `hariKe: 0` / `hariKe: 999`.
12. **Blanket User List Scraping**: Querying `collection(db, 'users')` as `userA` to enumerate all registered SPPG emails and phone numbers.
