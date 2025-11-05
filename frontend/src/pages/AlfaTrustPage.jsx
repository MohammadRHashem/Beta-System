import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getAlfaTransactions, exportAlfaPdf, triggerAlfaSync, exportAlfaExcel } from '../services/api';
import AlfaTrustFilter from '../components/AlfaTrustFilter';
import AlfaTrustTable from '../components/AlfaTrustTable';
import Modal from '../components/Modal';
import { FaFilePdf, FaSyncAlt, FaFileExcel } from 'react-icons/fa';
import { format, subDays } from 'date-fns';
import { useSocket } from '../context/SocketContext';

// Helper Hook - It's good practice to move this to its own file: /src/hooks/useDebounce.js
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
    /* This is crucial: Set a fixed height for the page container */
    height: calc(100vh - 120px); /* Full viewport height minus header and padding */
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    flex-shrink: 0; /* Header should not shrink */
`;

const Title = styled.h2`
    margin: 0;
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    background-color: ${({ theme }) => theme.error}; /* Red for PDF */
    color: white;
    font-size: 0.9rem;
    
    &:hover {
        opacity: 0.9;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.7;
    }
`;

const SyncButton = styled(Button)`
    background-color: ${({ theme }) => theme.primary};
`;

const ExportForm = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    
    label {
      display: flex;
      flex-direction: column;
      font-weight: 500;
      gap: 0.5rem;
    }

    input {
        padding: 0.75rem;
        border: 1px solid ${({ theme }) => theme.border};
        border-radius: 4px;
        font-size: 1rem;
    }

    button {
        background-color: ${({ theme }) => theme.primary};
        color: white;
        border: none;
        padding: 0.8rem;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        font-size: 1rem;
        &:hover {
            opacity: 0.9;
        }
    }
`;

const AlfaTrustPage = () => { // No longer accepts socket as a prop
    const socket = useSocket(); // <-- USE THE HOOK TO GET THE SOCKET INSTANCE
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasNewData, setHasNewData] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    
    const [filters, setFilters] = useState({
        search: '', 
        dateFrom: '2025-09-30', 
        dateTo: format(new Date(), 'yyyy-MM-dd'),
        operation: ''
    });
    
    const debouncedSearch = useDebounce(filters.search, 500);

    const fetchTransactions = useCallback(async (showLoading = true) => {
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

    // This listener setup is now reliable
    useEffect(() => {
        if (socket) {
            const handleUpdate = () => {
                console.log("Received alfa-trust:updated event from server.");
                setHasNewData(true);
            };
            socket.on('alfa-trust:updated', handleUpdate);
            return () => socket.off('alfa-trust:updated', handleUpdate);
        }
    }, [socket]); // The effect correctly depends on the socket instance

    const handleFilterChange = (newFilters) => {
        setPagination(p => ({ ...p, page: 1 }));
        setFilters(newFilters);
    };
    
    const handleExport = async (exportFilters) => {
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
            // Create a fresh params object using the FINAL debounced search value
            const exportParams = {
                ...filters,
                search: debouncedSearch, // Use the debounced value!
            };
            await exportAlfaExcel(exportParams);
        } catch (error) {
            console.error("Failed to export Excel:", error);
            alert("Failed to export Excel file.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleManualSync = async () => {
        setIsSyncing(true);
        try {
            await triggerAlfaSync();
            alert('Sync process triggered. Data will be updated shortly.');
            // Give the backend a moment to process, then refresh the view
            setTimeout(() => {
                fetchTransactions();
                setIsSyncing(false);
            }, 5000); // 5-second delay
        } catch (error) {
            alert('Failed to trigger sync.');
            setIsSyncing(false);
        }
    };

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
                onExport={handleExport}
            />
        </>
    );
};

// Modal component for PDF export
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