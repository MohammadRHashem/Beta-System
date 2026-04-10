import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
    calculateInvoicePositionCounter,
    createInvoicePositionCounter,
    deleteInvoicePositionCounter,
    getInvoicePositionCounters,
    getSubaccounts,
    updateInvoicePositionCounter,
} from '../services/api';
import { usePermissions } from '../context/PermissionContext';
import PositionCounterCard from '../components/PositionCounterCard';
import PositionCounterModal from '../components/PositionCounterModal';
import { FaPlus, FaSyncAlt } from 'react-icons/fa';

const getTodayDateValue = () => new Date().toISOString().split('T')[0];

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: 0;
    height: 100%;
    overflow: auto;
`;

const Hero = styled.section`
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 1rem;
    padding: 1.2rem 1.25rem;
    border-radius: 20px;
    background:
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 36%),
        linear-gradient(135deg, ${({ theme }) => theme.primary} 0%, ${({ theme }) => theme.secondary} 100%);
    color: white;

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
    }
`;

const HeroCopy = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
`;

const HeroTitle = styled.h2`
    margin: 0;
    font-size: 1.9rem;
`;

const HeroText = styled.p`
    margin: 0;
    max-width: 52rem;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.5;
`;

const HeroMeta = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
    justify-content: flex-end;

    @media (max-width: 900px) {
        justify-content: flex-start;
    }
`;

const MetaPill = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 0.8rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    color: white;
    font-size: 0.9rem;
    font-weight: 600;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: wrap;
`;

const SectionTitle = styled.h3`
    margin: 0;
    color: ${({ theme }) => theme.primary};
`;

const SectionText = styled.p`
    margin: 0.25rem 0 0;
    color: ${({ theme }) => theme.lightText};
`;

const ActionRow = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.72rem 1rem;
    border-radius: 10px;
    border: 1px solid ${({ $ghost, theme }) => ($ghost ? theme.border : 'transparent')};
    background: ${({ $ghost, theme }) => ($ghost ? theme.surface : theme.secondary)};
    color: ${({ $ghost, theme }) => ($ghost ? theme.text : 'white')};
    font-weight: 700;
    cursor: pointer;
    box-shadow: ${({ theme, $ghost }) => ($ghost ? 'none' : theme.shadowMd)};
    opacity: ${({ disabled }) => (disabled ? 0.7 : 1)};

    &:disabled {
        cursor: not-allowed;
    }
`;

const CounterGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
    gap: 0.85rem;
    padding-bottom: 0.2rem;
`;

const EmptyState = styled.div`
    padding: 1.5rem;
    border: 1px dashed ${({ theme }) => theme.border};
    border-radius: 18px;
    background: ${({ theme }) => theme.surface};
    color: ${({ theme }) => theme.lightText};
`;

const PositionPage = () => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('finance:manage_counters');

    const [counters, setCounters] = useState([]);
    const [invoiceSubaccounts, setInvoiceSubaccounts] = useState([]);
    const [counterValues, setCounterValues] = useState({});
    const [counterErrors, setCounterErrors] = useState({});
    const [loadingIds, setLoadingIds] = useState({});
    const [lastUpdatedAt, setLastUpdatedAt] = useState({});
    const [dateFilters, setDateFilters] = useState({});
    const [loadingPage, setLoadingPage] = useState(true);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCounter, setEditingCounter] = useState(null);

    const countersRef = useRef([]);
    const dateFiltersRef = useRef({});

    useEffect(() => {
        countersRef.current = counters;
    }, [counters]);

    useEffect(() => {
        dateFiltersRef.current = dateFilters;
    }, [dateFilters]);

    const refreshCounter = useCallback(async (counterId, explicitDateTo) => {
        const activeDateTo = explicitDateTo ?? dateFiltersRef.current[counterId] ?? getTodayDateValue();
        setLoadingIds((prev) => ({ ...prev, [counterId]: true }));
        setCounterErrors((prev) => ({ ...prev, [counterId]: '' }));

        try {
            const { data } = await calculateInvoicePositionCounter(counterId, activeDateTo ? { dateTo: activeDateTo } : {});
            setCounterValues((prev) => ({ ...prev, [counterId]: data }));
            setLastUpdatedAt((prev) => ({ ...prev, [counterId]: new Date().toISOString() }));
            return data;
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to refresh counter.';
            setCounterErrors((prev) => ({ ...prev, [counterId]: message }));
            setCounterValues((prev) => ({ ...prev, [counterId]: null }));
            return null;
        } finally {
            setLoadingIds((prev) => ({ ...prev, [counterId]: false }));
        }
    }, []);

    const refreshAll = useCallback(async () => {
        const rows = countersRef.current;
        if (!rows.length) return;

        setRefreshingAll(true);
        try {
            await Promise.all(rows.map((counter) => refreshCounter(counter.id)));
        } finally {
            setRefreshingAll(false);
        }
    }, [refreshCounter]);

    const fetchCounters = useCallback(async () => {
        setLoadingPage(true);
        try {
            const { data } = await getInvoicePositionCounters();
            const rows = Array.isArray(data) ? data : [];
            setCounters(rows);
            setDateFilters((prev) => {
                const next = {};
                rows.forEach((counter) => {
                    next[counter.id] = prev[counter.id] || getTodayDateValue();
                });
                return next;
            });
        } catch (error) {
            console.error('Failed to fetch invoice position counters', error);
            setCounters([]);
        } finally {
            setLoadingPage(false);
        }
    }, []);

    const fetchInvoiceSubaccounts = useCallback(async () => {
        try {
            const { data } = await getSubaccounts();
            const filtered = (Array.isArray(data) ? data : [])
                .filter((subaccount) => subaccount.portal_source_type === 'invoices')
                .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
            setInvoiceSubaccounts(filtered);
        } catch (error) {
            console.error('Failed to fetch invoice portal subaccounts', error);
            setInvoiceSubaccounts([]);
        }
    }, []);

    useEffect(() => {
        fetchCounters();
        fetchInvoiceSubaccounts();
    }, [fetchCounters, fetchInvoiceSubaccounts]);

    useEffect(() => {
        if (!counters.length) return;
        refreshAll();
    }, [counters, refreshAll]);

    useEffect(() => {
        if (!counters.length) return undefined;
        const interval = window.setInterval(() => {
            refreshAll();
        }, 120000);
        return () => window.clearInterval(interval);
    }, [counters.length, refreshAll]);

    const handleOpenModal = (counter = null) => {
        setEditingCounter(counter);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingCounter(null);
        setIsModalOpen(false);
    };

    const handleSaveCounter = async (payload) => {
        try {
            if (editingCounter) {
                await updateInvoicePositionCounter(editingCounter.id, payload);
            } else {
                await createInvoicePositionCounter(payload);
            }
            await fetchCounters();
            handleCloseModal();
        } catch (error) {
            window.alert(error.response?.data?.message || 'Failed to save counter.');
        }
    };

    const handleDeleteCounter = async (counter) => {
        const confirmed = window.confirm(`Delete "${counter.name}" from the dashboard?`);
        if (!confirmed) return;

        try {
            await deleteInvoicePositionCounter(counter.id);
            await fetchCounters();
        } catch (error) {
            window.alert(error.response?.data?.message || 'Failed to delete counter.');
        }
    };

    const handleDateChange = async (counterId, nextDateTo) => {
        setDateFilters((prev) => ({ ...prev, [counterId]: nextDateTo }));
        await refreshCounter(counterId, nextDateTo);
    };

    const invoiceCounterCount = counters.length;
    const activeInvoiceSubaccountCount = invoiceSubaccounts.length;

    const cards = useMemo(
        () => counters.map((counter) => ({
            ...counter,
            dateTo: dateFilters[counter.id] || getTodayDateValue(),
            value: counterValues[counter.id] || null,
            error: counterErrors[counter.id] || '',
            loading: Boolean(loadingIds[counter.id]),
            lastUpdatedAt: lastUpdatedAt[counter.id] || null,
        })),
        [counterErrors, counterValues, counters, dateFilters, lastUpdatedAt, loadingIds]
    );

    return (
        <>
            <PageContainer>
                <Hero>
                    <HeroCopy>
                        <HeroTitle>Invoice Positions</HeroTitle>
                        <HeroText>
                            This dashboard mirrors invoice-based portal ledgers only. Every card reads the same
                            balance engine as the subaccount portal, with its own <strong>date to</strong> filter and
                            a shared 2-minute auto refresh.
                        </HeroText>
                    </HeroCopy>
                    <HeroMeta>
                        <MetaPill>{invoiceCounterCount} active counters</MetaPill>
                        <MetaPill>{activeInvoiceSubaccountCount} invoice portal subaccounts</MetaPill>
                        <MetaPill>Auto refresh: 2 min</MetaPill>
                    </HeroMeta>
                </Hero>

                <HeaderRow>
                    <div>
                        <SectionTitle>Counter Board</SectionTitle>
                        <SectionText>
                            Each card reads the portal ledger as a consolidated saldo total until the selected date.
                        </SectionText>
                    </div>
                    <ActionRow>
                        <Button type="button" $ghost onClick={refreshAll} disabled={!invoiceCounterCount || refreshingAll}>
                            <FaSyncAlt /> {refreshingAll ? 'Refreshing...' : 'Refresh All'}
                        </Button>
                        {canManage ? (
                            <Button type="button" onClick={() => handleOpenModal()}>
                                <FaPlus /> Add Counter
                            </Button>
                        ) : null}
                    </ActionRow>
                </HeaderRow>

                {loadingPage ? (
                    <EmptyState>Loading invoice position counters...</EmptyState>
                ) : cards.length ? (
                    <CounterGrid>
                        {cards.map((counter) => (
                            <PositionCounterCard
                                key={counter.id}
                                counter={counter}
                                dateTo={counter.dateTo}
                                value={counter.value}
                                loading={counter.loading}
                                error={counter.error}
                                lastUpdatedAt={counter.lastUpdatedAt}
                                canManage={canManage}
                                onDateChange={handleDateChange}
                                onRefresh={refreshCounter}
                                onEdit={handleOpenModal}
                                onDelete={handleDeleteCounter}
                            />
                        ))}
                    </CounterGrid>
                ) : (
                    <EmptyState>
                        {canManage
                            ? 'No invoice position counters yet. Add one from an invoice-based portal subaccount to start tracking saldo total.'
                            : 'No invoice position counters have been configured yet.'}
                    </EmptyState>
                )}
            </PageContainer>

            <PositionCounterModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSave={handleSaveCounter}
                editingCounter={editingCounter}
                invoiceSubaccounts={invoiceSubaccounts}
            />
        </>
    );
};

export default PositionPage;
