import React, { useState, useEffect } from 'react';
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
    gap: 1.5rem;
`;

const PageInfo = styled.span`
    font-size: 0.9rem;
    color: ${({ theme }) => theme.lightText};
    white-space: nowrap;
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
            pointer-events: none;
        `}
`;

const Ellipsis = styled.span`
    padding: 0.5rem 0.25rem;
    color: ${({ theme }) => theme.lightText};
    display: flex;
    align-items: center;
    height: 100%;
`;

const GoToPageForm = styled.form`
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const GoToPageInput = styled.input`
    width: 60px;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid ${({ theme }) => theme.border};
    text-align: center;
    font-weight: 600;
`;

const GoToPageButton = styled.button`
    padding: 0.5rem 1rem;
    border: 1px solid ${({ theme }) => theme.border};
    background-color: ${({ theme }) => theme.background};
    cursor: pointer;
    border-radius: 4px;
    font-weight: 600;

    &:hover {
        background-color: #e6e6e6;
    }
`;

// A more robust and professional page range generator
const generatePageRange = (currentPage, totalPages) => {
    // How many pages to show on each side of the current page
    const siblingCount = 1;
    // Total page numbers to show in the component
    const totalPageNumbers = siblingCount + 5;

    // Case 1: If total pages is less than the number we want to show, return all pages
    if (totalPages <= totalPageNumbers) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

    const firstPageIndex = 1;
    const lastPageIndex = totalPages;

    // Case 2: No left dots to show, but right dots needed
    if (!shouldShowLeftDots && shouldShowRightDots) {
        let leftItemCount = 3 + 2 * siblingCount;
        let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
        return [...leftRange, '...', totalPages];
    }

    // Case 3: No right dots to show, but left dots needed
    if (shouldShowLeftDots && !shouldShowRightDots) {
        let rightItemCount = 3 + 2 * siblingCount;
        let rightRange = Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
        return [firstPageIndex, '...', ...rightRange];
    }

    // Case 4: Both left and right dots needed
    if (shouldShowLeftDots && shouldShowRightDots) {
        let middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
        return [firstPageIndex, '...', ...middleRange, '...', lastPageIndex];
    }
    
    // Default case (should not be reached)
    return [];
};


const Pagination = ({ pagination, setPagination }) => {
    const { currentPage, totalPages, totalRecords } = pagination;
    const [goToPage, setGoToPage] = useState(currentPage);

    useEffect(() => {
        setGoToPage(currentPage);
    }, [currentPage]);

    const handlePageChange = (newPage) => {
        // Ensure new page is within valid bounds
        const page = Math.max(1, Math.min(newPage, totalPages));
        if (page !== currentPage) {
            setPagination(p => ({ ...p, page }));
        }
    };
    
    const handleGoToPageSubmit = (e) => {
        e.preventDefault();
        const pageNum = parseInt(goToPage, 10);
        if (!isNaN(pageNum)) {
            handlePageChange(pageNum);
        }
    };

    if (totalPages <= 1) {
        return (
            <PaginationContainer>
                <PageInfo>{totalRecords} records found</PageInfo>
            </PaginationContainer>
        );
    }

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
        </PaginationContainer>
    );
};

export default Pagination;