# Backend API boundary

`src/data-client.js` provides an optional storage and repository boundary for a future authenticated HTTP backend. **No backend or database is deployed, configured or connected by this module.** Loading it makes no request, changes no wallet and does not enable remote play. The existing local game engines remain the default.

The module exposes `window.PlayroomData` in the browser and the same object through CommonJS for tests. It introduces no runtime dependencies.

## Local and remote ownership

Local demo sessions and server accounts are different authorities. A local snapshot can restore a local demo, but cannot establish a server balance, reward, result, identity or random seed. There is no automatic upload or merge of local balances into a remote account.

In local mode, the existing engines calculate demo results and use the local wallet. Persistence is an optional adapter underneath that demo state. Its contents are user-editable and are never evidence of a server entitlement.

In a future remote mode, the server owns authenticated identity, rule versions, entry costs, balances, random outcomes, timers, legal moves, rewards and settlement. The client sends player intentions and displays public snapshots returned by the server. Reusing the current local engine's result as a remote claim would violate this boundary.

Remote mode must be selected explicitly at application composition time. Do not change mode during an active round. A timeout, authentication failure or HTTP error must not activate local play for the same round, issue a local refund or grant a local reward. The adapter never performs these fallbacks and never retries automatically.

## Async local JSON store

```js
const store = PlayroomData.createLocalStore({
  namespace: 'playroom.local.',
  storage: window.localStorage
});

await store.set('session.v1', validatedLocalSnapshot);
const restored = await store.get('session.v1'); // null when absent
await store.remove('session.v1');
```

`get`, `set` and `remove` always return promises. The store's immutable `mode` is `local`; `backend` is `browser-storage`, `native-preferences` or `unavailable`. Keys are namespaced and limited to letters, numbers, `.`, `_`, `:`, and `-`. `set` accepts finite, acyclic JSON values; it does not silently drop functions, `undefined` properties or non-finite numbers. Reading parses a new value rather than exposing a shared in-memory object.

For a native wrapper, inject a Preferences-compatible object:

```js
const store = PlayroomData.createLocalStore({
  namespace: 'playroom.local.',
  preferences: {
    get: ({key}) => NativePreferences.get({key}),       // Promise<{value: string | null}>
    set: ({key, value}) => NativePreferences.set({key, value}),
    remove: ({key}) => NativePreferences.remove({key})
  }
});
```

When neither provider is supplied, the factory looks for `window.Capacitor.Plugins.Preferences`, then browser `localStorage`. Supplying `preferences` explicitly chooses that backend. If its operation fails, the adapter does not silently fall back to browser storage. Wrappers using imported plugins can inject them directly instead of relying on automatic detection.

Success means the selected provider acknowledged the operation. This layer does not add database transactions, cross-tab locking, encryption, OS backup guarantees or a session schema. The application must validate snapshot versions and game invariants before restoring them. Serialize competing session saves at the session-controller layer. Browser storage and native Preferences are not a place for database credentials, access tokens or refresh tokens.

Storage failures are visible `DataClientError` rejections:

| Code | Meaning |
| --- | --- |
| `STORAGE_UNAVAILABLE` | No usable persistence provider, including denied browser access |
| `STORAGE_READ_FAILED` | Provider read failed or returned an invalid type |
| `STORAGE_CORRUPT` | Stored bytes were not valid JSON |
| `STORAGE_WRITE_FAILED` | Provider refused or failed the write |
| `STORAGE_REMOVE_FAILED` | Provider refused or failed removal |
| `INVALID_INPUT` | Invalid key or non-JSON value |

The local demo may continue in memory after an application handles a persistence error, but its UI must not claim the failed save succeeded. This storage adapter itself does not invent an in-memory fallback.

## Repository interface and explicit selection

Both repository implementations use promise-returning methods:

| Method | Arguments | Result |
| --- | --- | --- |
| `getProfile` | none | Profile |
| `updateProfile` | `patch, command` | Updated profile |
| `getPreferences` | none | Preferences resource |
| `updatePreferences` | `patch, command` | Updated preferences resource |
| `getWallet` | none | Wallet |
| `getActiveRound` | `gameId` | Public round or `null` |
| `getRound` | `roundId` | Public round |
| `startRound` | `gameId, command` | `{round, wallet}` |
| `submitAction` | `gameId, roundId, command` | `{round, wallet}` |

`PlayroomData.REPOSITORY_METHODS` lists these methods. `createGameRepository({localRepository})` defaults to `mode: 'local'`, validates an injected implementation and wraps its calls as promises. It does not fabricate a local engine implementation or rewire the current `GameBridge`:

```js
const repository = PlayroomData.createGameRepository({
  mode: 'local',
  localRepository: applicationOwnedLocalRepository
});
```

An explicitly constructed remote repository uses only the configured HTTPS API origin and path prefix:

```js
const tokens = PlayroomData.createMemoryTokenProvider();
// A future login flow supplies a short-lived access token.
tokens.setToken(accessTokenFromLogin);

const repository = PlayroomData.createGameRepository({
  mode: 'remote',
  remote: {
    baseURL: 'https://api.example.test/v1', // Illustrative; not a deployed service.
    tokenProvider: tokens,
    timeoutMs: 10000,
    fetch: window.fetch.bind(window)
  }
});

// tokens.clear() on logout. No token is written by this module to storage.
```

`new PlayroomData.HttpGameRepository(options)` constructs the same remote implementation. `tokenProvider({signal})` may be any async function returning the current bearer token. It runs for each request, allowing a future auth layer to manage expiry. It must honor cancellation when feasible; the adapter will not dispatch a request if token resolution finishes after the timeout. `createMemoryTokenProvider` is a convenience closure with `setToken()` and `clear()`; it does not implement login or refresh.

The base URL must use HTTPS and contain no credentials, query, fragment or traversal. All endpoint suffixes are internal constants. Public methods do not accept URLs or arbitrary paths. Game IDs are a fixed allowlist and remote round IDs are UUIDs. Requests use `redirect: 'error'`, `credentials: 'omit'`, `cache: 'no-store'`, and `referrerPolicy: 'no-referrer'`. These settings prevent a redirect from forwarding an authenticated request to a different destination. No client-controlled proxy endpoint is provided.

## Proposed HTTP contract

Paths below are relative to the configured API base, such as `/v1/`. Every endpoint requires `Authorization: Bearer <access-token>`. Successful responses use `Content-Type: application/json`, optionally expose `X-Request-Id`, and have the envelope `{ "data": ... }`.

| Verb | Path | Request body | Response `data` |
| --- | --- | --- | --- |
| GET | `me/profile` | none | Profile |
| PATCH | `me/profile` | `{idempotencyKey, expectedRevision, patch}` | Profile |
| GET | `me/preferences` | none | Preferences resource |
| PATCH | `me/preferences` | `{idempotencyKey, expectedRevision, patch}` | Preferences resource |
| GET | `me/wallet` | none | Wallet |
| GET | `games/{gameId}/rounds/active` | none | Public round or `null` |
| GET | `rounds/{roundId}` | none | Public round |
| POST | `games/{gameId}/rounds` | `{idempotencyKey, expectedRevision, selection}` | `{round, wallet}` |
| POST | `rounds/{roundId}/actions` | `{idempotencyKey, expectedRevision, gameId, type, payload}` | `{round, wallet}` |

Every mutation sends the same UUID in the `Idempotency-Key` header and `idempotencyKey` body field. Both must agree. `expectedRevision` is a nonnegative safe integer. These fields are required, never inferred from browser storage.

Minimum resource shapes:

```json
{
  "profile": {
    "userId": "server-user-id",
    "revision": 3,
    "displayName": "Pilot",
    "avatarId": "pilot-01"
  },
  "preferences": {
    "revision": 2,
    "values": {
      "language": "en",
      "soundEnabled": true,
      "reducedMotion": "system",
      "favoriteGameIds": ["blocks", "2048"]
    }
  },
  "wallet": {
    "revision": 5,
    "balanceMinor": 95000,
    "currency": "DEMO_POINTS"
  },
  "round": {
    "id": "f1172e80-ebcf-4ce4-9ac0-c7f343453e93",
    "gameId": "2048",
    "revision": 1,
    "state": "playing",
    "snapshot": {"moves": 0}
  }
}
```

This example shows separate resource shapes, not one endpoint response. `balanceMinor` is an integer count of hundredths of a demo point: `95000` means `950.00` points. It must be nonnegative and no larger than `Number.MAX_SAFE_INTEGER`. It is not a cash balance. The remote UUIDs are deliberately separate from local session IDs such as `blocks-1`.

`snapshot` is a game-specific **public** presentation state that the server produces. The minimal shape above is not a playable board. A production backend must define and version complete per-game snapshot schemas before remote play is integrated. Never expose unrevealed mine positions, future random draws, server seeds or credentials. The generic adapter checks resource identity, revisions and basic shape; it does not certify every nested game field. The eventual presentation adapter must validate the relevant game snapshot before displaying it.

Profile patches allow `displayName` and `avatarId` only. Names are nonempty, at most 60 JavaScript string units and contain no control characters. Avatar IDs use 1–64 letters, numbers, underscores or hyphens; they are catalog IDs, not image URLs. The server must still enforce authorization, canonicalization and its own catalog rules.

Preference patches allow `language` (`zh-CN` or `en`), `soundEnabled` (boolean), `reducedMotion` (`system` or `reduce`), and unique `favoriteGameIds` from the supported catalog. Neither profile nor preference endpoints accept wallet or reward fields.

## Round intentions

Supported game IDs are `minesweeper`, `rocket`, `dice`, `plinko`, `horse`, `slots`, `matrix`, `blocks`, and `2048`.

| Game | Start `selection` | Subsequent action types and `payload` |
| --- | --- | --- |
| minesweeper | `{}` | `reveal` / `flag`: `{index: 0..53}`; `collect` / `forfeit`: `{}` |
| rocket | `{}` | `collect`: `{}` |
| dice | `{mode: "size", target: "small" or "big"}`, `{mode: "sum", target: 3..18}`, or `{mode: "triple", target: null}` | None; server settles |
| plinko | `{lane: 0..4}` | None; server settles |
| horse | `{selected: 0..3}` | None; server settles |
| slots | `{}` | None; server settles |
| matrix | `{}` | None; server settles |
| blocks | `{}` | `place`: `{slot: 0..2, row: 0..7, col: 0..7}`; `restart`: `{}` |
| 2048 | `{}` | `move`: `{direction: "up", "down", "left", or "right"}`; `restart`: `{}` |

Ranges are integer ranges. A syntactically valid move can still be illegal in the authoritative state, and the server must reject it. Unknown command, selection and payload fields are rejected before transport. There is no command for setting a balance, submitting a payout, choosing a winning outcome or settling a client-calculated result.

For a start command, `expectedRevision` is the revision of the wallet most recently read. The server checks that revision and available points, creates the round, debits the wallet, and records idempotency atomically. Enforce at most one active round for each authenticated user/game unless a future version explicitly changes that rule.

For a round action, `expectedRevision` is the current round revision. The server verifies ownership, game ID and permitted transition. It updates the round, wallet and idempotency record atomically when settlement or a restart changes points. Wallet updates require a transaction or equivalent concurrency protection even though the action checks the round revision. A restart must preserve the current round if payment fails; successful abandonment, new entry and new round creation form one transaction. It may return a new round UUID.

Profile and preferences each use their own resource revisions. Every revision changes only when the server accepts a mutation. Never compare a profile revision with a round or wallet revision. A GET response is a snapshot, so callers must not overwrite a newer locally observed resource with an older response arriving out of order.

Timed games need server-side advancement and settlement independent of whether a browser remains open. Read endpoints may expose the newly settled public state; they must not create a new round or charge another entry. Client timestamps, animation progress and local elapsed time are not authoritative inputs.

## Idempotency, conflicts and uncertain requests

Create a request key once per user intention and retain the entire command until its outcome is resolved:

```js
const command = {
  idempotencyKey: PlayroomData.createIdempotencyKey(),
  expectedRevision: serverWallet.revision,
  selection: {}
};
const result = await repository.startRound('slots', command);
```

`createIdempotencyKey()` uses Web Crypto UUID generation or `getRandomValues`. It never falls back to `Math.random`. The HTTP adapter requires the caller's key instead of generating a different key on every attempt.

The server must scope idempotency records to the authenticated principal and retain them for the documented recovery lifetime. Store the method, route, canonical request fingerprint, committed mutation and original response together. An identical replay returns the original result without another debit or reward, even if current resource revisions have advanced. Idempotency lookup for an already accepted request therefore precedes rechecking its old `expectedRevision`. Reusing a key with different content returns `409 IDEMPOTENCY_CONFLICT`.

After a connection loss, timeout or invalid success response, the server may already have committed a mutation. Do not generate a new key, edit the command, charge again locally, or assume failure implies rollback. After connectivity/authentication is restored, an explicitly controlled retry may replay the exact command with the same key. An active-round read and wallet read can help reconcile the display, but do not by themselves prove the outcome of every concurrent request. Replaying the original idempotent command resolves its own outcome.

For `409 REVISION_CONFLICT`, fetch the current relevant resources, reconcile the display and decide whether the player still wants the action. A changed action is a new intention with a new key and the newly read revision. Do not automatically turn a conflict into another paid start or restart. Server rejections in the 4xx range must not commit the rejected mutation.

Error bodies use a JSON envelope such as:

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "currentRevision": 8
  }
}
```

`DataClientError` includes `code`, `status` (or `null`), `retryable`, `commitUnknown`, `requestId` and `currentRevision`. Messages are generic client-owned text; the adapter does not display server-supplied HTML or raw token-provider errors. Recognized server codes are `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INSUFFICIENT_POINTS`, `ROUND_NOT_ACTIVE` and `VALIDATION_ERROR`.

Other codes include `INVALID_CONFIG`, `INVALID_INPUT`, `AUTH_REQUIRED`, `AUTH_UNAVAILABLE`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `HTTP_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE` and `CRYPTO_UNAVAILABLE`. `retryable` is advisory, never an instruction to automatically resubmit a mutation. `commitUnknown` is true for a dispatched mutation whose outcome could not be confirmed, including network loss, timeout, a 5xx response or an invalid successful response. It is false for a timeout before a request was dispatched.

The default timeout is 10 seconds and covers token acquisition, network and body parsing. Configuration permits 1–120000 ms. The adapter aborts on timeout and performs no retry. Responses must be JSON, fit within the adapter's 1 MiB character-count limit after reading, and match the expected resource shape. The body-size check is not a streaming transport limit; enforce server and gateway response-size limits too.

## Authentication, CORS and server responsibilities

- Authenticate and authorize every resource using the token's principal. A client round UUID or `gameId` is not ownership proof. Validate token issuer, audience, expiry and permitted scope server-side.
- Keep database connection strings, administrative API keys, signing keys and private randomness secrets exclusively on the server. Do not ship them in static HTML, build-time client variables or native app resources.
- This adapter uses bearer headers and omits cookies. A cookie-based auth design would require a separate reviewed transport and CSRF design; changing only an endpoint is insufficient.
- Configure CORS for the actual browser and native-wrapper origins. Allow `GET`, `PATCH`, `POST`, `OPTIONS` and request headers `Authorization`, `Content-Type`, `Idempotency-Key`, `Accept`. Expose `X-Request-Id` if callers need it. CORS does not replace authentication or resource authorization.
- Rate-limit authenticated commands, validate all request fields again on the server, and apply atomic ledger updates with unique idempotency constraints. Frontend allowlists are not a security boundary against direct API callers.
- On logout, clear the in-memory token, cancel or disregard stale account requests at the application layer, and clear account-specific presentation caches. Local demo state must not be relabeled as the next signed-in user's server state.

Remote play still requires a real backend, authenticated login, complete per-game server snapshots, UI reconciliation and end-to-end acceptance tests. This interface and its mocked transport tests do not establish any of those as complete.

## Suggested database schema

The following relational model is a starting point for a future backend. These are proposed entities and constraints, not an installed database, executable migration or persistence implementation. Use server-generated IDs and timestamps, foreign keys for ownership, integer hundredths for demo points, and nonnegative resource revisions.

| Entity | Suggested columns | Keys and constraints |
| --- | --- | --- |
| `users` | `id`, `auth_issuer`, `auth_subject`, `status`, `created_at` | Primary key `id`; unique `(auth_issuer, auth_subject)` maps a verified authentication identity to one account. No client-supplied identity claim creates ownership. |
| `profiles` | `user_id`, `revision`, `display_name`, `avatar_id`, `updated_at` | Primary/foreign key `user_id` references `users`; one profile per user. Validate name and avatar catalog constraints server-side. |
| `preferences` | `user_id`, `revision`, `values_json`, `updated_at` | Primary/foreign key `user_id` references `users`; one preferences resource per user. Validate the allowlisted preferences schema before writing JSON. |
| `wallets` | `id`, `user_id`, `currency`, `balance_minor`, `revision`, `updated_at` | Primary key `id`; foreign key `user_id`; unique `(user_id, currency)`. Restrict currency to `DEMO_POINTS` for this contract and constrain balance to `0..9007199254740991`. |
| `ledger` | `id`, `wallet_id`, `round_id` (nullable), `event_key`, `kind`, `delta_minor`, `balance_after_minor`, `created_at` | Primary key `id`; foreign keys to wallet and optional round; unique `(wallet_id, event_key)` prevents duplicate accounting for one business event. Append-only entries record charges, rewards, refunds and any explicit server-issued opening credit. |
| `rounds` | `id`, `user_id`, `game_id`, `revision`, `state`, `rules_version`, `private_state_json`, `deadline_at`, `created_at`, `settled_at` | UUID primary key `id`; foreign key `user_id`; allowlisted `game_id`. Enforce one nonterminal round per `(user_id, game_id)` with a partial unique index or an equivalent locked active-round record. Private state and randomness never appear in a public snapshot. |
| `idempotency` | `user_id`, `key`, `method`, `route`, `request_hash`, `response_status`, `response_json`, `created_at`, `expires_at` | Composite primary key `(user_id, key)` with UUID `key`; foreign key `user_id`. Bind the key to the canonical command and retain the original committed response for the documented replay lifetime. |

Lock the relevant wallet/round rows or use equivalent transactional compare-and-update operations. A paid start must atomically verify the expected wallet revision and balance, create the round, append its debit entry, update the wallet and commit the idempotency response. A settlement or paid restart must atomically update all affected rounds, ledger entries and wallet state with its command record. Profile and preference changes atomically check their own revisions, apply the patch and record the response. Serialize competing requests for the same idempotency key so only one mutation executes; replay lookup precedes revision checking for an already committed command.

Use a stable business-event key such as a round settlement ID for both client-triggered and scheduled settlement. A server timer and a concurrent action must converge on the same terminal transition and ledger event, even when they have different request keys. Verify wallet totals against the append-only ledger; corrections use new compensating entries rather than rewriting historical amounts. Prevent unrelated account/round references and do not cascade-delete accounting history with a profile change. Define retention and deletion policies separately, including what happens after an idempotency key expires; never silently treat an uncertain old paid command as a new intention.

## Verification

Run `node --test tests/data-client.test.cjs`. Tests inject browser storage, native Preferences, token providers and HTTP responses. They cover persistence failure visibility, local/remote selection, destination validation, request allowlists, UUID keys, revision conflicts, token lifecycle, response validation and uncertain network outcomes. They make no external requests and connect to no database.
