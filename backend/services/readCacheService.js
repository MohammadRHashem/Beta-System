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
const invoiceStartingEntryCache = createCache();

const SUBACCOUNT_TTL_MS = 30 * 1000;
const PORTAL_ALL_TIME_BALANCE_TTL_MS = 10 * 1000;
const INVOICE_RECIPIENT_NAMES_TTL_MS = 60 * 1000;
const INVOICE_STARTING_ENTRY_TTL_MS = 5 * 1000;

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
    const cached = readCache(invoiceRecipientNamesCache, key);
    if (cached) return cached;
    const fresh = await loader();
    return writeCache(invoiceRecipientNamesCache, key, fresh, INVOICE_RECIPIENT_NAMES_TTL_MS);
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

const invalidateInvoiceReadCaches = () => {
    clearCache(invoiceRecipientNamesCache);
    clearCache(portalAllTimeBalanceCache);
    clearCache(invoiceStartingEntryCache);
};

const invalidateSubaccountCache = (subaccountId) => {
    clearCacheByPrefix(subaccountCache, buildCacheKey(['subaccount-id', subaccountId]));
};

module.exports = {
    getCachedSubaccount,
    getCachedPortalAllTimeBalance,
    getCachedInvoiceRecipientNames,
    getCachedInvoiceStartingEntry,
    invalidatePortalReadCaches,
    invalidateInvoiceReadCaches,
    invalidateSubaccountCache
};
