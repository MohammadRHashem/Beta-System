import React, { useState, useEffect, useMemo, useRef } from 'react';
import styled, { css } from 'styled-components';

const PaginationContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.82rem 0.88rem;
    background: ${({ theme }) => theme.surface};
    border-top: 1px solid ${({ theme }) => theme.border};
    border-radius: 0 0 12px 12px;
    flex-wrap: wrap;
    gap: 0.8rem;
    row-gap: 0.6rem;

    @media (max-width: 680px) {
        padding: 0.6rem 0.72rem;
        gap: 0.45rem;
        row-gap: 0.35rem;
        flex-wrap: nowrap;
        align-items: center;
    }
`;

const PageInfo = styled.span`
    font-size: 0.9rem;
    color: ${({ theme }) => theme.lightText};
    white-space: nowrap;

    @media (max-width: 680px) {
        font-size: 0.68rem;
        flex-shrink: 1;
        min-width: 0;
    }
`;

const PageControls = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;

    @media (max-width: 680px) {
        gap: 0.18rem;
    }
`;

const RightCluster = styled.div`
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: flex-end;

    @media (max-width: 680px) {
        gap: 0.28rem;
        flex-wrap: nowrap;
        margin-left: auto;
        min-width: 0;
    }
`;

const PageSizeWrap = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.lightText};
`;

const PageSizeSelect = styled.select`
    min-width: 92px;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.surface};
    color: ${({ theme }) => theme.text};
    padding: 0.35rem 0.5rem;
    font-weight: 600;
`;

const PageButton = styled.button`
    padding: 0.4rem 0.72rem;
    min-width: 36px;
    border: 1px solid ${({ theme }) => theme.border};
    background-color: ${({ theme }) => theme.surface};
    cursor: pointer;
    border-radius: 8px;
    font-weight: 600;
    transition: all 0.2s ease;
    color: ${({ theme }) => theme.primary};

    &:hover:not(:disabled) {
        background-color: ${({ theme }) => theme.surfaceAlt};
        border-color: ${({ theme }) => theme.borderStrong};
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
        color: ${({ theme }) => theme.lightText};
    }

    ${({ isActive, theme }) =>
        isActive &&
        css`
            background-color: ${theme.primary};
            color: white;
            border-color: ${theme.primary};
            pointer-events: none;
        `}

    @media (max-width: 680px) {
        min-width: 28px;
        padding: 0.26rem 0.45rem;
        font-size: 0.72rem;
        border-radius: 6px;
    }
`;

const Ellipsis = styled.span`
    padding: 0.5rem 0.25rem;
    color: ${({ theme }) => theme.lightText};
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;

    @media (max-width: 680px) {
        min-width: 20px;
        padding: 0.2rem 0.08rem;
        font-size: 0.72rem;
    }
`;

const GoToPageForm = styled.form`
    display: flex;
    align-items: center;
    gap: 0.5rem;

    @media (max-width: 680px) {
      gap: 0.25rem;
      justify-content: flex-end;
      flex-shrink: 0;
    }
`;

const GoToPageInput = styled.input`
    width: 56px;
    padding: 0.4rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.border};
    text-align: center;
    font-weight: 600;

    @media (max-width: 680px) {
        width: 34px;
        padding: 0.26rem;
        font-size: 0.72rem;
        border-radius: 6px;
    }
`;

const GoToPageButton = styled.button`
    padding: 0.4rem 0.85rem;
    border: 1px solid ${({ theme }) => theme.border};
    background-color: ${({ theme }) => theme.surfaceAlt};
    cursor: pointer;
    border-radius: 8px;
    font-weight: 600;

    &:hover {
        border-color: ${({ theme }) => theme.borderStrong};
    }

    @media (max-width: 680px) {
        padding: 0.26rem 0.5rem;
        font-size: 0.72rem;
        border-radius: 6px;
    }
`;

const range = (start, end) => {
    const length = end - start + 1;
    return Array.from({ length }, (_, idx) => idx + start);
};

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 'all'];

const normalizeLimitValue = (value) => {
    if (value === 'all') return 'all';
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 50;
};

const Pagination = ({
    pagination,
    setPagination,
    showPageSize = false,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    storageKey = '',
}) => {
    const currentPage = Number(pagination.page ?? pagination.currentPage ?? 1);
    const totalPages = Math.max(Number(pagination.totalPages ?? 1), 1);
    const totalRecords = Number(pagination.totalRecords ?? 0);
    const currentLimit = normalizeLimitValue(pagination.limit ?? 50);
    const [goToPage, setGoToPage] = useState(currentPage);
    const [isCompactMobile, setIsCompactMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 680 : false));
    const didReadStoredSize = useRef(false);

    const normalizedPageSizeOptions = useMemo(() => {
        const next = [];
        pageSizeOptions.forEach((option) => {
            const normalized = normalizeLimitValue(option);
            if (normalized === 'all' || Number.isFinite(normalized)) {
                if (!next.includes(normalized)) {
                    next.push(normalized);
                }
            }
        });
        return next.length ? next : DEFAULT_PAGE_SIZE_OPTIONS;
    }, [pageSizeOptions]);

    useEffect(() => {
        setGoToPage(currentPage);
    }, [currentPage]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const syncViewport = () => setIsCompactMobile(window.innerWidth <= 680);
        syncViewport();
        window.addEventListener('resize', syncViewport);
        return () => window.removeEventListener('resize', syncViewport);
    }, []);

    useEffect(() => {
        if (!showPageSize || !storageKey || didReadStoredSize.current) return;

        didReadStoredSize.current = true;
        const saved = localStorage.getItem(`pagination:${storageKey}:limit`);
        if (!saved) return;

        const savedLimit = normalizeLimitValue(saved);
        if (!normalizedPageSizeOptions.includes(savedLimit)) return;
        if (savedLimit === currentLimit) return;

        setPagination((prev) => ({
            ...prev,
            page: 1,
            currentPage: 1,
            limit: savedLimit,
        }));
    }, [showPageSize, storageKey, normalizedPageSizeOptions, currentLimit, setPagination]);

    const handlePageChange = (newPage) => {
        const pageAsNumber = Number(newPage);
        if (!Number.isNaN(pageAsNumber) && pageAsNumber >= 1 && pageAsNumber <= totalPages && pageAsNumber !== currentPage) {
            setPagination((p) => ({ ...p, page: pageAsNumber, currentPage: pageAsNumber }));
        }
    };

    const handlePageSizeChange = (event) => {
        const nextLimit = normalizeLimitValue(event.target.value);
        if (nextLimit === currentLimit) return;

        if (showPageSize && storageKey) {
            localStorage.setItem(`pagination:${storageKey}:limit`, String(nextLimit));
        }

        setPagination((prev) => ({
            ...prev,
            page: 1,
            currentPage: 1,
            limit: nextLimit,
        }));
    };

    const handleGoToPageSubmit = (e) => {
        e.preventDefault();
        handlePageChange(goToPage);
    };

    const pageRange = useMemo(() => {
        const siblingCount = 1;
        const totalPageNumbers = siblingCount + 5;

        if (totalPages <= totalPageNumbers) {
            return range(1, totalPages);
        }

        const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
        const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

        const firstPageIndex = 1;
        const lastPageIndex = totalPages;

        if (!shouldShowLeftDots && shouldShowRightDots) {
            const leftItemCount = 3 + 2 * siblingCount;
            const leftRange = range(1, leftItemCount);
            return [...leftRange, '...', totalPages];
        }

        if (shouldShowLeftDots && !shouldShowRightDots) {
            const rightItemCount = 3 + 2 * siblingCount;
            const rightRange = range(totalPages - rightItemCount + 1, totalPages);
            return [firstPageIndex, '...', ...rightRange];
        }

        if (shouldShowLeftDots && shouldShowRightDots) {
            const middleRange = range(leftSiblingIndex, rightSiblingIndex);
            return [firstPageIndex, '...', ...middleRange, '...', lastPageIndex];
        }

        return [];
    }, [currentPage, totalPages]);

    return (
        <PaginationContainer>
            <PageInfo>
                {isCompactMobile ? `P. ${currentPage}/${totalPages} (${totalRecords})` : `Page ${currentPage} of ${totalPages} (${totalRecords} records)`}
            </PageInfo>

            <RightCluster>
                {showPageSize && (
                    <PageSizeWrap>
                        Rows
                        <PageSizeSelect value={String(currentLimit)} onChange={handlePageSizeChange}>
                            {normalizedPageSizeOptions.map((option) => (
                                <option key={String(option)} value={String(option)}>
                                    {option === 'all' ? 'All' : option}
                                </option>
                            ))}
                        </PageSizeSelect>
                    </PageSizeWrap>
                )}

                {totalPages > 1 && (
                    <>
                        <PageControls>
                            <PageButton onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
                                {'<'}
                            </PageButton>

                            {pageRange.map((page, index) => {
                                if (page === '...') {
                                    return <Ellipsis key={`dot-${index}`}>...</Ellipsis>;
                                }
                                return (
                                    <PageButton
                                        key={page}
                                        isActive={page === currentPage}
                                        onClick={() => handlePageChange(page)}
                                    >
                                        {page}
                                    </PageButton>
                                );
                            })}

                            <PageButton onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>
                                {'>'}
                            </PageButton>
                        </PageControls>

                        <GoToPageForm onSubmit={handleGoToPageSubmit}>
                            <GoToPageInput
                                type="number"
                                value={goToPage}
                                onChange={(e) => setGoToPage(e.target.value)}
                                min="1"
                                max={totalPages}
                            />
                            <GoToPageButton type="submit">Go</GoToPageButton>
                        </GoToPageForm>
                    </>
                )}
            </RightCluster>
        </PaginationContainer>
    );
};

export default Pagination;
