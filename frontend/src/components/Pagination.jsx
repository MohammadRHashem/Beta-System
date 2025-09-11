import React from 'react';
import styled, { css } from 'styled-components';

const PaginationContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #fff;
    border-top: 1px solid ${({ theme }) => theme.border};
    border-radius: 0 0 8px 8px;
    flex-wrap: wrap;
    gap: 1rem;
`;

const PageInfo = styled.span`
    font-size: 0.9rem;
    color: ${({ theme }) => theme.lightText};
`;

const PageControls = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const PageButton = styled.button`
    padding: 0.5rem 1rem;
    min-width: 40px;
    border: 1px solid ${({ theme }) => theme.border};
    background-color: #fff;
    cursor: pointer;
    border-radius: 4px;
    font-weight: 600;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
        background-color: ${({ theme }) => theme.background};
        border-color: ${({ theme }) => theme.primary};
        color: ${({ theme }) => theme.primary};
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    ${({ isActive, theme }) =>
        isActive &&
        css`
            background-color: ${theme.primary};
            color: white;
            border-color: ${theme.primary};
        `}
`;

const Ellipsis = styled.span`
    padding: 0.5rem 0.75rem;
    color: ${({ theme }) => theme.lightText};
`;

// Helper to generate the range of pages to display
const generatePageRange = (currentPage, totalPages) => {
    const delta = 2; // How many pages to show around the current page
    const left = currentPage - delta;
    const right = currentPage + delta + 1;
    const range = [];
    const rangeWithDots = [];

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= left && i < right)) {
            range.push(i);
        }
    }

    let l;
    for (const i of range) {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1);
            } else if (i - l !== 1) {
                rangeWithDots.push('...');
            }
        }
        rangeWithDots.push(i);
        l = i;
    }

    return rangeWithDots;
};


const Pagination = ({ pagination, setPagination }) => {
    const { currentPage, totalPages, totalRecords } = pagination;

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setPagination(p => ({ ...p, page: newPage }));
        }
    };

    if (totalPages <= 1) return null; // Don't render if there's only one page

    const pageRange = generatePageRange(currentPage, totalPages);

    return (
        <PaginationContainer>
            <PageInfo>
                Page {currentPage} of {totalPages} ({totalRecords} records)
            </PageInfo>
            <PageControls>
                <PageButton onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
                    « Previous
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
                    Next »
                </PageButton>
            </PageControls>
        </PaginationContainer>
    );
};

export default Pagination;