import React, { useState, useEffect, useMemo } from 'react';
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
    color: ${({ theme }) => theme.primary};

    &:hover:not(:disabled) {
        background-color: ${({ theme }) => theme.background};
        border-color: ${({ theme }) => theme.primary};
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
`;

const Ellipsis = styled.span`
    padding: 0.5rem 0.25rem;
    color: ${({ theme }) => theme.lightText};
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 40px;
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

const Pagination = ({ pagination, setPagination }) => { // Changed prop name to setPagination
    const { currentPage, totalPages, totalRecords } = pagination;
    const [goToPage, setGoToPage] = useState(currentPage);

    useEffect(() => {
        setGoToPage(currentPage);
    }, [currentPage]);

    const handlePageChange = (newPage) => {
        const pageAsNumber = Number(newPage);
        if (!isNaN(pageAsNumber) && pageAsNumber >= 1 && pageAsNumber <= totalPages && pageAsNumber !== currentPage) {
            setPagination(p => ({ ...p, page: pageAsNumber }));
        }
    };
    
    const handleGoToPageSubmit = (e) => {
        e.preventDefault();
        handlePageChange(goToPage);
    };

    const pageRange = useMemo(() => {
        const totalPageNumbers = 7;
        if (totalPages <= totalPageNumbers) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }

        const leftSiblingIndex = Math.max(currentPage - 1, 1);
        const rightSiblingIndex = Math.min(currentPage + 1, totalPages);
        
        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

        const firstPageIndex = 1;
        const lastPageIndex = totalPages;

        if (!shouldShowLeftDots && shouldShowRightDots) {
            let leftItemCount = 2;
            let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
            return [...leftRange, '...', totalPages];
        }

        if (shouldShowLeftDots && !shouldShowRightDots) {
            let rightItemCount = 2;
            let rightRange = Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
            return [firstPageIndex, '...', ...rightRange];
        }

        if (shouldShowLeftDots && shouldShowRightDots) {
            let middleRange = [currentPage - 1, currentPage, currentPage + 1];
            return [firstPageIndex, '...', ...middleRange, '...', lastPageIndex];
        }
        
        return [];
    }, [currentPage, totalPages]);

    if (totalPages <= 1) {
        return (
            <PaginationContainer>
                <PageInfo>{totalRecords} record{totalRecords !== 1 ? 's' : ''} found</PageInfo>
            </PaginationContainer>
        );
    }

    return (
        <PaginationContainer>
            <PageInfo>
                Page {currentPage} of {totalPages} ({totalRecords} records)
            </PageInfo>
            <PageControls>
                <PageButton onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
                    «
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
                    »
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