import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getAlfaTransactions, exportAlfaPdf, triggerAlfaSync, exportAlfaExcel } from '../services/api';
import AlfaTrustFilter from '../components/AlfaTrustFilter';
import AlfaTrustTable from '../components/AlfaTrustTable';
import Modal from '../components/Modal';
import { FaFilePdf, FaSyncAlt, FaFileExcel } from 'react-icons/fa';
import { format, subDays } from 'date-fns';
import { useSocket } from '../context/SocketContext';

// Helper Hook
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: calc(100vh - 120px);
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    flex-shrink: 0;
`;

const Title = styled.h2` margin: 0; `;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    background-color: ${({ theme, color }) => color === 'excel' ? '#217346' : theme.error};
    color: white;
    font-size: 0.9rem;
    &:hover { opacity: 0.9; }
    &:disabled { cursor: not-allowed; opacity: 0.7; }
`;

const SyncButton = styled(Button)`
    background-color: ${({ theme }) => theme.primary};
`;

const RefreshBanner = styled.div`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    text-align: center;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
`;

const ExportForm = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    label { display: flex; flex-direction: column; font-weight: 500; gap: 0.5rem; }
    input { padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; }
    button {
        background-color: ${({ theme }) => theme.primary};
        color: white; border: none; padding: 0.8rem; border-radius: 4px;
        font-weight: bold; cursor: pointer; font-size: 1rem; &:hover { opacity: 0.9; }
    }
`;


const AlfaTrustPage = () => {
    const socket = useSocket();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasNewData, setHasNewData] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    
    // === MODIFICATION: Update filter state to use a date range ===
    const today = format(new Date(), 'yyyy-MM-dd');
    const [filters, setFilters] = useState({
        search: '', 
        dateFrom: today, // <-- Use dateFrom
        dateTo: today,   // <-- Use dateTo
        operation: ''
    });
    // =============================================================
    
    const debouncedSearch = useDebounce(filters.search, 500);

    const fetchTransactions = useCallback(async (showLoading = true) => {
        // <-- Updated validation -->
        if (!filters.dateFrom || !filters.dateTo) return;
        
        if (showLoading) setLoading(true);
        setHasNewData(false);
        try {
            const params = { 
                ...filters,
                search: debouncedSearch,
                page: pagination.page, 
                limit: pagination.limit 
            };
            const { data } = await getAlfaTransactions(params);
            setTransactions(data.transactions || []);
            setPagination(p => ({ ...p, totalPages: data.totalPages, totalRecords: data.totalRecords, currentPage: data.currentPage }));
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
            alert(error.response?.data?.message || "Failed to fetch transactions.");
            setTransactions([]);
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, debouncedSearch]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    useEffect(() => {
        if (socket) {
            const handleUpdate = () => {
                setHasNewData(true);
            };
            socket.on('alfa-trust:updated', handleUpdate);
            return () => socket.off('alfa-trust:updated', handleUpdate);
        }
    }, [socket]);

    const handleFilterChange = (newFilters) => {
        setPagination(p => ({ ...p, page: 1 }));
        setFilters(newFilters);
    };
    
    const handleExportPdf = async (exportFilters) => {
        try {
            await exportAlfaPdf(exportFilters);
            setIsExportModalOpen(false);
        } catch (error) {
            alert('Failed to export PDF statement.');
        }
    };

     const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            // This part works automatically because `filters` now contains the date range
            const exportParams = {
                ...filters,
                search: debouncedSearch,
            };
            await exportAlfaExcel(exportParams);
        } catch (error) {
            console.error("Failed to export Excel:", error);
            alert("Failed to export Excel file.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleManualSync = async () => { /* ... (no changes needed here) ... */ };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Alfa Trust Statement</Title>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <SyncButton onClick={handleManualSync} disabled={isSyncing}>
                            <FaSyncAlt style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} /> 
                            {isSyncing ? 'Syncing...' : 'Refresh Data'}
                        </SyncButton>
                        <Button color="excel" onClick={handleExportExcel} disabled={isExporting}>
                            <FaFileExcel /> {isExporting ? 'Exporting...' : 'Export Excel'}
                        </Button>
                        <Button onClick={() => setIsExportModalOpen(true)}><FaFilePdf/> Export PDF</Button>
                    </div>
                </Header>
                {hasNewData && (
                    <RefreshBanner onClick={() => fetchTransactions()}>
                        <FaSyncAlt /> New data is available. Click to refresh.
                    </RefreshBanner>
                )}
                <AlfaTrustFilter filters={filters} onFilterChange={handleFilterChange} />
                <AlfaTrustTable 
                    transactions={transactions}
                    loading={loading}
                    pagination={pagination}
                    setPagination={setPagination}
                />
            </PageContainer>
            
            <ExportPdfModal 
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportPdf}
            />
        </>
    );
};

// --- This modal component for PDF export remains unchanged as it already supported a range ---
const ExportPdfModal = ({ isOpen, onClose, onExport }) => {
    const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

    const handleSubmit = () => {
        if (!dateFrom || !dateTo) {
            alert('Both start and end dates are required.');
            return;
        }
        if (new Date(dateTo) < new Date(dateFrom)) {
            alert('End date cannot be earlier than start date.');
            return;
        }
        onExport({ dateFrom, dateTo });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>Export PDF Statement</h2>
            <ExportForm>
                <label>
                    From Date
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </label>
                <label>
                    To Date
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </label>
                <button onClick={handleSubmit}>Download Statement</button>
            </ExportForm>
        </Modal>
    );
}

export default AlfaTrustPage;