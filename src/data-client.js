/* Optional data boundary. Loading this file does not enable remote play. */
(function (root) {
  'use strict';
  const GAME_IDS = Object.freeze(['minesweeper', 'rocket', 'dice', 'plinko', 'horse', 'slots', 'matrix', 'blocks', '2048']);
  const REPOSITORY_METHODS = Object.freeze(['getProfile', 'updateProfile', 'getPreferences', 'updatePreferences', 'getWallet', 'getActiveRound', 'getRound', 'startRound', 'submitAction']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const TOKEN = /^[A-Za-z0-9._~+/-]+=*$/u;
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const revision = value => Number.isSafeInteger(value) && value >= 0;
  class DataClientError extends Error {
    constructor(code, message, {status = null, retryable = false, commitUnknown = false, requestId = null, currentRevision = null} = {}) {
      super(message); this.name = 'DataClientError';
      Object.assign(this, {code, status, retryable, commitUnknown, requestId, currentRevision});
    }
  }
  function fail(code, message) { throw new DataClientError(code, message); }
  function requireValue(ok, message) { if (!ok) fail('INVALID_INPUT', message); }
  function fields(value, allowed, label) {
    requireValue(record(value), `${label} must be an object.`);
    requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} contains an unsupported field.`);
  }
  function game(value) { requireValue(GAME_IDS.includes(value), 'Unknown game ID.'); return value; }
  function uuid(value, label) { requireValue(typeof value === 'string' && UUID.test(value), `${label} must be a UUID.`); return value; }
  function command(value, extra = []) {
    fields(value, ['idempotencyKey', 'expectedRevision', ...extra], 'Command');
    uuid(value.idempotencyKey, 'idempotencyKey');
    requireValue(revision(value.expectedRevision), 'expectedRevision must be a nonnegative safe integer.');
    return {idempotencyKey:value.idempotencyKey, expectedRevision:value.expectedRevision};
  }
  function jsonValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!Array.isArray(value) && !record(value)) return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const valid = Object.values(value).every(item => jsonValue(item, seen)); seen.delete(value); return valid;
  }

  /** Async JSON persistence. Native Preferences must expose get/set/remove. */
  function createLocalStore(options = {}) {
    const namespace = options.namespace ?? 'playroom.';
    requireValue(typeof namespace === 'string' && /^[A-Za-z0-9._:-]{1,80}$/u.test(namespace), 'Invalid storage namespace.');
    let preferences = options.preferences, storage = options.storage, unavailable = false;
    if (preferences === undefined && storage === undefined) {
      try { preferences = root.Capacitor?.Plugins?.Preferences; } catch { unavailable = true; }
      if (!preferences && !unavailable) try { storage = root.localStorage; } catch { unavailable = true; }
    }
    const native = !!preferences;
    const backend = native ? 'native-preferences' : storage ? 'browser-storage' : 'unavailable';
    if (native && !['get', 'set', 'remove'].every(name => typeof preferences[name] === 'function')) fail('INVALID_CONFIG', 'Preferences must implement get, set and remove.');
    if (!native && storage && !['getItem', 'setItem', 'removeItem'].every(name => typeof storage[name] === 'function')) fail('INVALID_CONFIG', 'Storage must implement getItem, setItem and removeItem.');
    function keyOf(key) {
      requireValue(typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(key), 'Invalid storage key.');
      if (unavailable || backend === 'unavailable') fail('STORAGE_UNAVAILABLE', 'Persistent local storage is unavailable.');
      return namespace + key;
    }
    return Object.freeze({
      mode:'local', backend,
      async get(key) {
        const name = keyOf(key); let raw;
        try { raw = native ? (await preferences.get({key:name})).value : storage.getItem(name); }
        catch { fail('STORAGE_READ_FAILED', 'Could not read local data.'); }
        if (raw === null) return null;
        if (typeof raw !== 'string') fail('STORAGE_READ_FAILED', 'Storage returned an invalid value.');
        try { const value = JSON.parse(raw); if (!jsonValue(value)) throw Error('Invalid JSON value'); return value; }
        catch { fail('STORAGE_CORRUPT', 'Stored data is not valid finite JSON.'); }
      },
      async set(key, value) {
        const name = keyOf(key);
        requireValue(jsonValue(value), 'Stored values must be finite, acyclic JSON data.');
        const raw = JSON.stringify(value);
        try { if (native) await preferences.set({key:name, value:raw}); else storage.setItem(name, raw); }
        catch { fail('STORAGE_WRITE_FAILED', 'Could not persist local data.'); }
      },
      async remove(key) {
        const name = keyOf(key);
        try { if (native) await preferences.remove({key:name}); else storage.removeItem(name); }
        catch { fail('STORAGE_REMOVE_FAILED', 'Could not remove local data.'); }
      }
    });
  }

  function createIdempotencyKey(cryptoProvider = root.crypto) {
    if (typeof cryptoProvider?.randomUUID === 'function') return uuid(cryptoProvider.randomUUID(), 'Generated key');
    if (typeof cryptoProvider?.getRandomValues !== 'function') fail('CRYPTO_UNAVAILABLE', 'Secure randomness is required to create a request key.');
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  /** Tokens are intentionally held only in this closure, never in localStore. */
  function createMemoryTokenProvider(initialToken = null) {
    let token = null;
    const provider = async () => token;
    provider.setToken = value => {
      requireValue(value === null || (typeof value === 'string' && value.length <= 8192 && TOKEN.test(value)), 'Invalid bearer token.');
      token = value;
    };
    provider.clear = () => { token = null; };
    provider.setToken(initialToken);
    return Object.freeze(provider);
  }
  function profilePatch(patch) {
    fields(patch, ['displayName', 'avatarId'], 'Profile patch');
    requireValue(Object.keys(patch).length > 0, 'Profile patch is empty.');
    if ('displayName' in patch) requireValue(typeof patch.displayName === 'string' && patch.displayName.trim().length > 0 && patch.displayName.length <= 60 && !/[\u0000-\u001f\u007f]/u.test(patch.displayName), 'Invalid display name.');
    if ('avatarId' in patch) requireValue(typeof patch.avatarId === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(patch.avatarId), 'Invalid avatar ID.');
    return {...patch};
  }
  function preferencesPatch(patch, allowEmpty = false) {
    fields(patch, ['language', 'soundEnabled', 'reducedMotion', 'favoriteGameIds'], 'Preferences patch');
    requireValue(allowEmpty || Object.keys(patch).length > 0, 'Preferences patch is empty.');
    if ('language' in patch) requireValue(['zh-CN', 'en'].includes(patch.language), 'Unsupported language.');
    if ('soundEnabled' in patch) requireValue(typeof patch.soundEnabled === 'boolean', 'soundEnabled must be boolean.');
    if ('reducedMotion' in patch) requireValue(['system', 'reduce'].includes(patch.reducedMotion), 'Invalid reduced-motion preference.');
    if ('favoriteGameIds' in patch) requireValue(Array.isArray(patch.favoriteGameIds) && patch.favoriteGameIds.length <= GAME_IDS.length && new Set(patch.favoriteGameIds).size === patch.favoriteGameIds.length && patch.favoriteGameIds.every(id => GAME_IDS.includes(id)), 'Invalid favorite game IDs.');
    return {...patch, ...('favoriteGameIds' in patch ? {favoriteGameIds:[...patch.favoriteGameIds]} : {})};
  }
  function selectionFor(gameId, selection) {
    fields(selection, gameId === 'dice' ? ['mode', 'target'] : gameId === 'plinko' ? ['lane'] : gameId === 'horse' ? ['selected'] : [], 'Round selection');
    if (gameId === 'dice') {
      const {mode, target} = selection;
      requireValue(mode === 'size' ? ['small', 'big'].includes(target) : mode === 'sum' ? Number.isInteger(target) && target >= 3 && target <= 18 : mode === 'triple' && target === null, 'Invalid dice selection.');
    }
    if (gameId === 'plinko') requireValue(Number.isInteger(selection.lane) && selection.lane >= 0 && selection.lane <= 4, 'Invalid drop lane.');
    if (gameId === 'horse') requireValue(Number.isInteger(selection.selected) && selection.selected >= 0 && selection.selected <= 3, 'Invalid horse selection.');
    return {...selection};
  }
  function actionFor(gameId, type, payload) {
    const actions = {minesweeper:['reveal', 'flag', 'collect', 'forfeit'], rocket:['collect'], blocks:['place', 'restart'], '2048':['move', 'restart']};
    requireValue(actions[gameId]?.includes(type), 'Unsupported action for this game.');
    const names = type === 'reveal' || type === 'flag' ? ['index'] : type === 'place' ? ['slot', 'row', 'col'] : type === 'move' ? ['direction'] : [];
    fields(payload, names, 'Action payload');
    if (names.includes('index')) requireValue(Number.isInteger(payload.index) && payload.index >= 0 && payload.index < 54, 'Invalid board index.');
    if (type === 'place') requireValue(Number.isInteger(payload.slot) && payload.slot >= 0 && payload.slot < 3 && ['row', 'col'].every(key => Number.isInteger(payload[key]) && payload[key] >= 0 && payload[key] < 8), 'Invalid block placement.');
    if (type === 'move') requireValue(['up', 'down', 'left', 'right'].includes(payload.direction), 'Invalid move direction.');
    return {...payload};
  }
  function validWallet(value) { return record(value) && revision(value.revision) && revision(value.balanceMinor) && value.currency === 'DEMO_POINTS'; }
  function validRound(value) { return record(value) && typeof value.id === 'string' && UUID.test(value.id) && GAME_IDS.includes(value.gameId) && revision(value.revision) && typeof value.state === 'string' && value.state.length > 0 && value.state.length <= 64 && record(value.snapshot); }
  function validProfile(value) { return record(value) && revision(value.revision) && typeof value.userId === 'string' && value.userId.length > 0 && value.userId.length <= 128 && typeof value.displayName === 'string'; }
  function validPreferences(value) {
    if (!record(value) || !revision(value.revision)) return false;
    try { preferencesPatch(value.values, true); return true; } catch { return false; }
  }
  function validRoundResult(value) { return record(value) && validRound(value.round) && validWallet(value.wallet); }
  const ERROR_CODES = new Set(['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INSUFFICIENT_POINTS', 'ROUND_NOT_ACTIVE', 'VALIDATION_ERROR']);
  class HttpGameRepository {
    #base; #fetch; #tokenProvider; #timeoutMs;
    constructor({baseURL, tokenProvider, fetch:fetchImpl = root.fetch?.bind(root), timeoutMs = 10000} = {}) {
      let parsed;
      try { parsed = new URL(baseURL); } catch { fail('INVALID_CONFIG', 'A valid HTTPS API base URL is required.'); }
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !/^[A-Za-z0-9/_-]*$/u.test(parsed.pathname) || typeof baseURL !== 'string' || /\\|\/(?:\.|%2e)(?:\.|%2e)?(?:\/|$)/iu.test(baseURL)) fail('INVALID_CONFIG', 'API base URL must use HTTPS without credentials, query, fragment or traversal.');
      if (typeof tokenProvider !== 'function' || typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) fail('INVALID_CONFIG', 'A token provider, fetch and timeout of 1–120000 ms are required.');
      this.#base = parsed.href.replace(/\/+$/u, '') + '/'; this.#fetch = fetchImpl; this.#tokenProvider = tokenProvider; this.#timeoutMs = timeoutMs;
      Object.defineProperty(this, 'mode', {value:'remote', enumerable:true});
    }
    async #request(path, {method = 'GET', body, validate} = {}) {
      const controller = new AbortController(); let timer, dispatched = false;
      const mutation = method !== 'GET';
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new DataClientError('TIMEOUT', 'The API request timed out.', {retryable:true, commitUnknown:mutation && dispatched})); }, this.#timeoutMs); });
      const operation = async () => {
        let token;
        try { token = await this.#tokenProvider({signal:controller.signal}); }
        catch { throw new DataClientError('AUTH_UNAVAILABLE', 'Could not obtain an access token.'); }
        if (controller.signal.aborted) throw new DataClientError('TIMEOUT', 'The API request timed out.', {retryable:true});
        if (typeof token !== 'string' || token.length > 8192 || !TOKEN.test(token)) throw new DataClientError('AUTH_REQUIRED', 'An authenticated session is required.');
        const headers = {'Accept':'application/json', 'Authorization':`Bearer ${token}`};
        if (mutation) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = body.idempotencyKey; }
        let response;
        try {
          dispatched = true;
          response = await this.#fetch(this.#base + path, {method, headers, ...(mutation ? {body:JSON.stringify(body)} : {}), signal:controller.signal, redirect:'error', credentials:'omit', cache:'no-store', mode:'cors', referrerPolicy:'no-referrer'});
        } catch { throw new DataClientError('NETWORK_ERROR', 'The API request did not complete.', {retryable:true, commitUnknown:mutation}); }
        if (!response || !Number.isInteger(response.status) || typeof response.ok !== 'boolean' || typeof response.text !== 'function') throw new DataClientError('INVALID_RESPONSE', 'The API transport returned an invalid response.', {commitUnknown:mutation});
        const status = response.status;
        const requestId = response.headers?.get('x-request-id') || null;
        if (response.redirected) throw new DataClientError('INVALID_RESPONSE', 'API redirects are not allowed.', {status, requestId, commitUnknown:mutation});
        let envelope = null;
        try {
          const raw = await response.text();
          if (raw.length <= 1024 * 1024 && /^application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/iu.test(response.headers?.get('content-type') || '')) envelope = JSON.parse(raw);
        } catch { /* A malformed or interrupted body is handled below. */ }
        if (!response.ok) {
          const serverError = record(envelope?.error) ? envelope.error : {};
          const fallback = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
          throw new DataClientError(ERROR_CODES.has(serverError.code) ? serverError.code : fallback, `API request failed (${status}).`, {status, requestId, retryable:status === 429 || status >= 500, commitUnknown:mutation && status >= 500, currentRevision:revision(serverError.currentRevision) ? serverError.currentRevision : null});
        }
        if (!record(envelope) || !Object.hasOwn(envelope, 'data') || !validate(envelope.data)) throw new DataClientError('INVALID_RESPONSE', 'The API returned an invalid response.', {status, requestId, commitUnknown:mutation});
        return envelope.data;
      };
      try { return await Promise.race([operation(), timeout]); }
      finally { clearTimeout(timer); }
    }
    async getProfile() { return this.#request('me/profile', {validate:validProfile}); }
    async updateProfile(patch, options) { return this.#request('me/profile', {method:'PATCH', body:{...command(options), patch:profilePatch(patch)}, validate:validProfile}); }
    async getPreferences() { return this.#request('me/preferences', {validate:validPreferences}); }
    async updatePreferences(patch, options) { return this.#request('me/preferences', {method:'PATCH', body:{...command(options), patch:preferencesPatch(patch)}, validate:validPreferences}); }
    async getWallet() { return this.#request('me/wallet', {validate:validWallet}); }
    async getActiveRound(gameId) { return this.#request(`games/${game(gameId)}/rounds/active`, {validate:value => value === null || (validRound(value) && value.gameId === gameId)}); }
    async getRound(roundId) { return this.#request(`rounds/${uuid(roundId, 'roundId')}`, {validate:value => validRound(value) && value.id === roundId}); }
    async startRound(gameId, options) {
      game(gameId); const metadata = command(options, ['selection']);
      const body = {...metadata, selection:selectionFor(gameId, options.selection ?? {})};
      return this.#request(`games/${gameId}/rounds`, {method:'POST', body, validate:value => validRoundResult(value) && value.round.gameId === gameId});
    }
    async submitAction(gameId, roundId, options) {
      game(gameId); uuid(roundId, 'roundId'); const metadata = command(options, ['type', 'payload']);
      const type = options.type;
      const body = {...metadata, gameId, type, payload:actionFor(gameId, type, options.payload ?? {})};
      return this.#request(`rounds/${roundId}/actions`, {method:'POST', body, validate:value => validRoundResult(value) && value.round.gameId === gameId && (type === 'restart' || value.round.id === roundId)});
    }
  }
  /** Explicit composition only. There is deliberately no remote-to-local fallback. */
  function createGameRepository({mode = 'local', localRepository, remote} = {}) {
    if (mode === 'remote') return new HttpGameRepository(remote);
    if (mode !== 'local') fail('INVALID_CONFIG', 'Repository mode must be local or remote.');
    if (!localRepository || !REPOSITORY_METHODS.every(name => typeof localRepository[name] === 'function')) fail('INVALID_CONFIG', 'Inject a local repository implementing the documented interface.');
    return Object.freeze({mode:'local', ...Object.fromEntries(REPOSITORY_METHODS.map(name => [name, (...args) => Promise.resolve().then(() => localRepository[name](...args))]))});
  }
  const api = Object.freeze({DataClientError, createLocalStore, createIdempotencyKey, createMemoryTokenProvider, HttpGameRepository, createGameRepository, GAME_IDS, REPOSITORY_METHODS});
  root.PlayroomData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
