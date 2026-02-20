import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import {
    getTrkbitTransactions,
    getTrkbitViews,
    unlinkTrkbitTransaction,
    exportTrkbit
} from '../services/api';
import { usePermissions } from '../context/PermissionContext';
import { FaFileExcel, FaLink, FaSyncAlt, FaUnlink } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import LinkInvoiceModal from '../components/LinkInvoiceModal';
import CrossIntermediacaoFilter from '../components/CrossIntermediacaoFilter';

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debouncedValue;
};

const CROSS_TAB_ORDER_STORAGE_KEY = 'cross_statement_tab_order_v1';
const CROSS_ACTIVE_TAB_STORAGE_KEY = 'cross_statement_active_tab_v1';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
`;

const Title = styled.h2`
    margin: 0;
`;

const HeaderActions = styled.div`
    display: flex;
    gap: 0.65rem;
`;

const ActionButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.62rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 700;
    cursor: pointer;
    color: #fff;
    background-color: ${({ theme, variant }) => (variant === 'excel' ? '#217346' : theme.primary)};
    font-size: 0.86rem;

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const TabContainer = styled.div`
    border-bottom: 2px solid ${({ theme }) => theme.border};
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    align-items: center;
`;

const TabItem = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
`;

const TabButton = styled.button`
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    color: ${({ theme, active }) => (active ? theme.primary : theme.lightText)};
    border-bottom: 3px solid ${({ theme, active }) => (active ? theme.secondary : 'transparent')};
    margin-bottom: -2px;
`;

const TabOrderButton = styled.button`
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 5px;
    background: #fff;
    color: ${({ theme }) => theme.lightText};
    font-weight: 700;
    width: 26px;
    height: 26px;
    line-height: 1;
    cursor: pointer;

    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
`;

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    overflow-x: auto;
    border: 1px solid ${({ theme }) => theme.border};
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;

    th,
    td {
        padding: 0.8rem 0.85rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        white-space: nowrap;
    }

    th {
        background: ${({ theme }) => theme.background};
        font-weight: 700;
    }
`;

const LinkBadge = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.77rem;
    font-weight: 700;
    border-radius: 999px;
    padding: 0.28rem 0.58rem;
    color: #fff;
    background: ${({ status }) => (status === 'linked' ? '#00C49A' : '#6B7C93')};
`;

const RowAction = styled.button`
    border: none;
    background: transparent;
    color: ${({ theme, kind }) => (kind === 'unlink' ? theme.error : theme.primary)};
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.8rem;

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const getStoredTabOrder = () => {
    if (typeof window === 'undefined') return [];
    try {
        const value = localStorage.getItem(CROSS_TAB_ORDER_STORAGE_KEY);
        if (!value) return [];
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
};

const saveTabOrder = (tabKeys) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CROSS_TAB_ORDER_STORAGE_KEY, JSON.stringify(tabKeys));
    } catch (error) {
        // no-op
    }
};

const getStoredActiveTab = () => {
    if (typeof window === 'undefined') return '';
    try {
        return localStorage.getItem(CROSS_ACTIVE_TAB_STORAGE_KEY) || '';
    } catch (error) {
        return '';
    }
};

const saveActiveTab = (tabKey) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(CROSS_ACTIVE_TAB_STORAGE_KEY, tabKey);
    } catch (error) {
        // no-op
    }
};

const applyStoredOrder = (nextTabs) => {
    const savedOrder = getStoredTabOrder();
    if (!savedOrder.length) return nextTabs;

    const rankMap = new Map(savedOrder.map((key, index) => [key, index]));
    return [...nextTabs].sort((a, b) => {
        const rankA = rankMap.has(a.key) ? rankMap.get(a.key) : Number.MAX_SAFE_INTEGER;
        const rankB = rankMap.has(b.key) ? rankMap.get(b.key) : Number.MAX_SAFE_INTEGER;
        return rankA - rankB;
    });
};

const formatDateTime = (value) => {
    if (!value) return '-';
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        date.setHours(date.getHours() - 3);
        return date.toLocaleString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (error) {
        return value;
    }
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TrkbitPage = () => {
    const { hasPermission } = usePermissions();
    const canViewStatements = hasPermission('finance:view_bank_statements');
    const canLink = hasPermission('invoice:link');

    const [tabs, setTabs] = useState([]);
    const [activeTabKey, setActiveTabKey] = useState(() => getStoredActiveTab());
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewsLoading, setViewsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [unlinkingUid, setUnlinkingUid] = useState('');

    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
        totalPages: 1,
        totalRecords: 0
    });

    const [filters, setFilters] = useState({
        search: '',
        txType: '',
        linkStatus: 'all',
        dateFrom: '',
        timeFrom: '',
        dateTo: '',
        timeTo: ''
    });

    const debouncedSearch = useDebounce(filters.search, 350);

    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const activeTab = tabs.find((tab) => tab.key === activeTabKey) || null;
    const isOtherTab = activeTab?.type === 'other';

    const fetchViews = useCallback(async () => {
        if (!canViewStatements) return;
        setViewsLoading(true);
        try {
            const { data } = await getTrkbitViews();
            const crossTabs = (data?.crossSubaccounts || []).map((subaccount) => ({
                key: `cross-${subaccount.id}`,
                type: 'cross',
                subaccountId: subaccount.id,
                label: subaccount.name,
                pixKey: subaccount.pix_key
            }));

            const otherTab = {
                key: 'other',
                type: 'other',
                label: data?.otherTab?.label || 'Other'
            };

            const nextTabs = applyStoredOrder([...crossTabs, otherTab]);
            setTabs(nextTabs);
            setActiveTabKey((current) => {
                const preferredTab = current || getStoredActiveTab();
                if (preferredTab && nextTabs.some((tab) => tab.key === preferredTab)) {
                    return preferredTab;
                }
                return nextTabs[0]?.key || '';
            });
        } catch (error) {
            console.error('Failed to fetch Cross tabs:', error);
            setTabs([{ key: 'other', type: 'other', label: 'Other' }]);
            setActiveTabKey('other');
        } finally {
            setViewsLoading(false);
        }
    }, [canViewStatements]);

    const fetchTransactions = useCallback(
        async (showLoading = true) => {
            if (!canViewStatements || !activeTab) return;

            if (showLoading) {
                setLoading(true);
            }

            try {
                const params = {
                    page: pagination.page,
                    limit: pagination.limit,
                    search: debouncedSearch,
                    txType: filters.txType,
                    linkStatus: filters.linkStatus,
                    dateFrom: filters.dateFrom,
                    timeFrom: filters.timeFrom,
                    dateTo: filters.dateTo,
                    timeTo: filters.timeTo,
                    viewType: activeTab.type
                };

                if (activeTab.type === 'cross') {
                    params.subaccountId = activeTab.subaccountId;
                }

                Object.keys(params).forEach((key) => {
                    const value = params[key];
                    if (value === '' || value === null || value === undefined) {
                        delete params[key];
                    }
                });

                const { data } = await getTrkbitTransactions(params);
                setTransactions(data.transactions || []);
                setPagination((prev) => ({
                    ...prev,
                    totalPages: data.totalPages || 1,
                    totalRecords: data.totalRecords || 0
                }));
            } catch (error) {
                console.error('Failed to fetch Cross Intermediação transactions:', error);
                setTransactions([]);
            } finally {
                if (showLoading) {
                    setLoading(false);
                }
            }
        },
        [
            canViewStatements,
            activeTab,
            pagination.page,
            pagination.limit,
            debouncedSearch,
            filters.txType,
            filters.linkStatus,
            filters.dateFrom,
            filters.timeFrom,
            filters.dateTo,
            filters.timeTo
        ]
    );

    useEffect(() => {
        fetchViews();
    }, [fetchViews]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    useEffect(() => {
        if (tabs.length > 0) {
            saveTabOrder(tabs.map((tab) => tab.key));
        }
    }, [tabs]);

    useEffect(() => {
        if (activeTabKey) {
            saveActiveTab(activeTabKey);
        }
    }, [activeTabKey]);

    const handleFilterChange = (nextFilters) => {
        setPagination((prev) => ({ ...prev, page: 1, currentPage: 1 }));
        setFilters(nextFilters);
    };

    const handleClearFilters = () => {
        setPagination((prev) => ({ ...prev, page: 1, currentPage: 1 }));
        setFilters({
            search: '',
            txType: '',
            linkStatus: 'all',
            dateFrom: '',
            timeFrom: '',
            dateTo: '',
            timeTo: ''
        });
    };

    const handleRefreshClick = () => {
        fetchTransactions();
    };

    const moveTab = (tabIndex, direction) => {
        setTabs((previousTabs) => {
            const targetIndex = tabIndex + direction;
            if (targetIndex < 0 || targetIndex >= previousTabs.length) {
                return previousTabs;
            }

            const nextTabs = [...previousTabs];
            const [movedTab] = nextTabs.splice(tabIndex, 1);
            nextTabs.splice(targetIndex, 0, movedTab);
            return nextTabs;
        });
    };

    const handleExport = async () => {
        if (!activeTab) return;
        setIsExporting(true);
        try {
            const params = {
                ...filters,
                search: debouncedSearch,
                viewType: activeTab.type
            };

            if (activeTab.type === 'cross') {
                params.subaccountId = activeTab.subaccountId;
            }

            Object.keys(params).forEach((key) => {
                if (params[key] === '' || params[key] === null || params[key] === undefined) {
                    delete params[key];
                }
            });

            await exportTrkbit(params);
        } catch (error) {
            console.error('Failed to export Cross Intermediação statement:', error);
            alert('Failed to export statement.');
        } finally {
            setIsExporting(false);
        }
    };

    const openLinkModal = (tx) => {
        if (!canLink) {
            alert('You do not have permission to link invoices.');
            return;
        }
        setSelectedTransaction({ id: tx.uid, amount: tx.amount, source: 'Trkbit' });
        setIsLinkModalOpen(true);
    };

    const handleUnlink = async (tx) => {
        if (!canLink) {
            alert('You do not have permission to unlink invoices.');
            return;
        }
        if (!window.confirm(`Unlink transaction ${tx.uid}? This will detach linked invoice(s) and mark it as unlinked.`)) {
            return;
        }

        setUnlinkingUid(tx.uid);
        try {
            const { data } = await unlinkTrkbitTransaction(tx.uid);
            alert(data?.message || 'Transaction unlinked.');
            await fetchTransactions(false);
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to unlink transaction.');
        } finally {
            setUnlinkingUid('');
        }
    };

    const tableColumnCount = (isOtherTab ? 7 : 6) + (canLink ? 1 : 0);

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Cross Intermediação</Title>
                    <HeaderActions>
                        <ActionButton onClick={handleRefreshClick}>
                            <FaSyncAlt /> Refresh
                        </ActionButton>
                        <ActionButton variant="excel" onClick={handleExport} disabled={isExporting}>
                            <FaFileExcel /> {isExporting ? 'Exporting...' : 'Export Excel'}
                        </ActionButton>
                    </HeaderActions>
                </Header>

                <TabContainer>
                    {viewsLoading ? (
                        <TabButton type="button" active={true}>Loading tabs...</TabButton>
                    ) : (
                        tabs.map((tab, index) => (
                            <TabItem key={tab.key}>
                                <TabButton
                                    type="button"
                                    active={activeTabKey === tab.key}
                                    onClick={() => {
                                        setPagination((prev) => ({ ...prev, page: 1, currentPage: 1 }));
                                        setActiveTabKey(tab.key);
                                    }}
                                >
                                    {tab.label}
                                </TabButton>
                                <TabOrderButton
                                    type="button"
                                    aria-label={`Move ${tab.label} left`}
                                    title="Move left"
                                    onClick={() => moveTab(index, -1)}
                                    disabled={index === 0}
                                >
                                    {'<'}
                                </TabOrderButton>
                                <TabOrderButton
                                    type="button"
                                    aria-label={`Move ${tab.label} right`}
                                    title="Move right"
                                    onClick={() => moveTab(index, 1)}
                                    disabled={index === tabs.length - 1}
                                >
                                    {'>'}
                                </TabOrderButton>
                            </TabItem>
                        ))
                    )}
                </TabContainer>

                <CrossIntermediacaoFilter
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onClear={handleClearFilters}
                    onRefresh={handleRefreshClick}
                />

                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <th>Date/Time</th>
                                <th>E2E ID</th>
                                <th>Name</th>
                                <th>Payer ID</th>
                                {isOtherTab && <th>PIX Key</th>}
                                <th>Amount</th>
                                <th>Link Status</th>
                                {canLink && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={tableColumnCount}>Loading...</td>
                                </tr>
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={tableColumnCount}>No transactions found for selected filters.</td>
                                </tr>
                            ) : (
                                transactions.map((tx) => {
                                    const amountValue = Math.abs(parseFloat(tx.amount || 0));
                                    const isDebit = tx.tx_type === 'D';
                                    const isLinked = tx.link_status === 'linked';

                                    return (
                                        <tr key={tx.id || tx.uid}>
                                            <td>{formatDateTime(tx.tx_date)}</td>
                                            <td>{tx.e2e_id || '-'}</td>
                                            <td>{tx.tx_payer_name || '-'}</td>
                                            <td>{tx.tx_payer_id || '-'}</td>
                                            {isOtherTab && <td>{tx.tx_pix_key || '-'}</td>}
                                            <td style={{ color: isDebit ? '#DE350B' : '#00A86B', fontWeight: 700 }}>
                                                {isDebit ? '-' : '+'}
                                                {currencyFormatter.format(amountValue)}
                                            </td>
                                            <td>
                                                <LinkBadge status={tx.link_status}>{tx.link_status}</LinkBadge>
                                            </td>
                                            {canLink && (
                                                <td>
                                                    {isLinked ? (
                                                        <RowAction
                                                            type="button"
                                                            kind="unlink"
                                                            onClick={() => handleUnlink(tx)}
                                                            disabled={unlinkingUid === tx.uid}
                                                        >
                                                            <FaUnlink />
                                                            {unlinkingUid === tx.uid ? 'Unlinking...' : 'Unlink'}
                                                        </RowAction>
                                                    ) : (
                                                        <RowAction type="button" onClick={() => openLinkModal(tx)}>
                                                            <FaLink /> Link
                                                        </RowAction>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </Table>
                </TableWrapper>

                <Pagination pagination={pagination} setPagination={setPagination} />
            </PageContainer>

            {canLink && (
                <LinkInvoiceModal
                    isOpen={isLinkModalOpen}
                    onClose={() => {
                        setIsLinkModalOpen(false);
                        fetchTransactions(false);
                    }}
                    transaction={selectedTransaction}
                    recipientPrefix="cross"
                />
            )}
        </>
    );
};

export default TrkbitPage;
