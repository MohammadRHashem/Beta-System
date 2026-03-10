const DEFAULT_ALLOWED_LIMITS = [20, 50, 100, 200];

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

const parsePagination = (query = {}, options = {}) => {
    const {
        defaultPage = 1,
        defaultLimit = 50,
        allowedLimits = DEFAULT_ALLOWED_LIMITS,
        allowAll = true
    } = options;

    const page = parsePositiveInt(query.page, defaultPage);
    const rawLimit = String(query.limit ?? defaultLimit).trim().toLowerCase();

    if (allowAll && rawLimit === 'all') {
        return {
            page,
            limit: 'all',
            limitValue: null,
            offset: 0,
            isAll: true
        };
    }

    const parsedLimit = parsePositiveInt(rawLimit, defaultLimit);
    const normalizedLimit = allowedLimits.includes(parsedLimit) ? parsedLimit : defaultLimit;

    return {
        page,
        limit: normalizedLimit,
        limitValue: normalizedLimit,
        offset: (page - 1) * normalizedLimit,
        isAll: false
    };
};

const buildPaginationMeta = (total, pagination) => {
    const totalRecords = Number(total) || 0;

    if (pagination.isAll) {
        return {
            totalPages: 1,
            currentPage: 1,
            totalRecords,
            limit: 'all'
        };
    }

    const limit = pagination.limitValue || 1;
    const totalPages = Math.max(Math.ceil(totalRecords / limit), 1);
    const currentPage = totalRecords === 0
        ? 1
        : Math.max(pagination.page, 1);

    return {
        totalPages,
        currentPage,
        totalRecords,
        limit
    };
};

module.exports = {
    DEFAULT_ALLOWED_LIMITS,
    parsePagination,
    buildPaginationMeta
};
