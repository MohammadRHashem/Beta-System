const buildCacheKey = (parts) => parts.map((part) => String(part ?? '')).join('::');

const createCache = () => new Map();

const readCache = (cache, key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
};

const writeCache = (cache, key, value, ttlMs) => {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
    });
    return value;
};

const clearCache = (cache) => {
    cache.clear();
};

const clearCacheByPrefix = (cache, prefix) => {
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
};

const subaccountCache = createCache();
const portalAllTimeBalanceCache = createCache();
const invoiceRecipientNamesCache = createCache();
const invoiceQueryCache = createCache();
const invoiceStartingEntryCache = createCache();
const invoiceRecipientNamesPending = new Map();
const invoiceQueryPending = new Map();

const SUBACCOUNT_TTL_MS = 30 * 1000;
const PORTAL_ALL_TIME_BALANCE_TTL_MS = 10 * 1000;
const INVOICE_RECIPIENT_NAMES_TTL_MS = 60 * 1000;
const INVOICE_QUERY_TTL_MS = 5 * 1000;
const INVOICE_STARTING_ENTRY_TTL_MS = 5 * 1000;

const loadCachedValue = async (cache, pending, key, ttlMs, loader) => {
    const cached = readCache(cache, key);
    if (cached !== null) return cached;

    const existingPromise = pending.get(key);
    if (existingPromise) return existingPromise;

    const loadPromise = (async () => {
        try {
            const fresh = await loader();
            return writeCache(cache, key, fresh, ttlMs);
        } finally {
            pending.delete(key);
        }
    })();

    pending.set(key, loadPromise);
    return loadPromise;
};

const getCachedSubaccount = async (keyParts, loader) => {
    const key = buildCacheKey(keyParts);
    const cached = readCache(subaccountCache, key);
    if (cached) return cached;
    const fresh = await loader();
    if (fresh) {
        writeCache(subaccountCache, key, fresh, SUBACCOUNT_TTL_MS);
    }
    return fresh;
};

const getCachedPortalAllTimeBalance = async (keyParts, loader) => {
    const key = buildCacheKey(keyParts);
    const cached = readCache(portalAllTimeBalanceCache, key);
    if (cached !== null) return cached;
    const fresh = await loader();
    return writeCache(portalAllTimeBalanceCache, key, fresh, PORTAL_ALL_TIME_BALANCE_TTL_MS);
};

const getCachedInvoiceRecipientNames = async (loader) => {
    const key = 'invoice-recipient-names';
    return loadCachedValue(
        invoiceRecipientNamesCache,
        invoiceRecipientNamesPending,
        key,
        INVOICE_RECIPIENT_NAMES_TTL_MS,
        loader
    );
};

const getCachedInvoiceQuery = async (keyParts, loader) => {
    const key = buildCacheKey(keyParts);
    return loadCachedValue(
        invoiceQueryCache,
        invoiceQueryPending,
        key,
        INVOICE_QUERY_TTL_MS,
        loader
    );
};

const getCachedInvoiceStartingEntry = async (subaccountId, statementScope, loader) => {
    const key = buildCacheKey(['invoice-starting-entry', subaccountId, statementScope]);
    const cached = readCache(invoiceStartingEntryCache, key);
    if (cached) return cached;
    const fresh = await loader();
    if (!fresh) return null;
    return writeCache(invoiceStartingEntryCache, key, fresh, INVOICE_STARTING_ENTRY_TTL_MS);
};

const invalidatePortalReadCaches = () => {
    clearCache(portalAllTimeBalanceCache);
    clearCache(invoiceStartingEntryCache);
};

const invalidateInvoiceReadCaches = (options = {}) => {
    const { recipientNames = true } = options;
    clearCache(invoiceQueryCache);
    clearCache(portalAllTimeBalanceCache);
    clearCache(invoiceStartingEntryCache);
    if (recipientNames) {
        clearCache(invoiceRecipientNamesCache);
    }
};

const invalidateInvoiceRecipientNamesCache = () => {
    clearCache(invoiceRecipientNamesCache);
};

const invalidateSubaccountCache = (subaccountId) => {
    clearCacheByPrefix(subaccountCache, buildCacheKey(['subaccount-id', subaccountId]));
};

module.exports = {
    getCachedSubaccount,
    getCachedPortalAllTimeBalance,
    getCachedInvoiceRecipientNames,
    getCachedInvoiceQuery,
    getCachedInvoiceStartingEntry,
    invalidatePortalReadCaches,
    invalidateInvoiceReadCaches,
    invalidateInvoiceRecipientNamesCache,
    invalidateSubaccountCache
};
