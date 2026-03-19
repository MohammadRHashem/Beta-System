import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  FaArrowsAltH,
  FaCheck,
  FaChevronDown,
  FaChevronUp,
  FaEye,
  FaEyeSlash,
  FaPencilAlt,
  FaPlus,
  FaSave,
  FaSyncAlt,
  FaTrash,
} from "react-icons/fa";
import Modal from "../Modal";
import Pagination from "../Pagination";
import { usePortal } from "../../context/PortalContext";
import {
  claimPortalTrkbitTransaction,
  createPortalTransaction,
  deletePortalTransaction,
  getPortalDashboardSummary,
  getPortalTransactions,
  getPortalTrkbitTransactions,
  updatePortalTransaction,
  updatePortalTransactionBadge,
  updatePortalTransactionConfirmation,
  updatePortalTransactionNotes,
  updatePortalTransactionVisibility,
} from "../../services/api";

const Page = styled.div`
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Toolbar = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadowSm};
  border-radius: 18px;
  padding: 1rem;
`;

const ToolbarTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div`
  min-width: 0;
  h2 {
    margin: 0 0 0.2rem;
    color: ${({ theme }) => theme.primary};
    font-size: clamp(1.05rem, 1.8vw, 1.4rem);
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.92rem;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  align-items: center;
`;

const Tabs = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const Tab = styled.button`
  border: 1px solid ${({ theme, $active }) => ($active ? theme.secondary : theme.border)};
  background: ${({ theme, $active }) => ($active ? theme.secondarySoft : theme.surface)};
  color: ${({ theme, $active }) => ($active ? theme.primary : theme.lightText)};
  border-radius: 999px;
  padding: 0.65rem 0.95rem;
  font-weight: 700;
  cursor: pointer;
`;

const Input = styled.input`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.72rem 0.85rem;
  min-width: 0;
  flex: 1 1 180px;
`;

const Select = styled.select`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.72rem 0.85rem;
  min-width: 150px;
`;

const Button = styled.button`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme, $variant }) => ($variant === "ghost" ? theme.border : theme.secondary)};
  background: ${({ theme, $variant }) => ($variant === "ghost" ? theme.surface : theme.secondary)};
  color: ${({ theme, $variant }) => ($variant === "ghost" ? theme.primary : "#fff")};
  padding: 0.72rem 0.95rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
`;

const Metrics = styled.section`
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const MetricCard = styled.article`
  border-radius: 16px;
  padding: 0.95rem 1rem;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadowSm};
  min-width: 0;
  h3 {
    margin: 0 0 0.3rem;
    font-size: 0.82rem;
    color: ${({ theme }) => theme.lightText};
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  p {
    margin: 0;
    font-size: clamp(1.15rem, 2vw, 1.45rem);
    font-family: "Courier New", monospace;
    font-weight: 800;
    color: ${({ theme }) => theme.primary};
  }
`;

const Panel = styled.section`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadowSm};
  border-radius: 18px;
  overflow: hidden;
`;

const TableWrap = styled.div`
  min-height: 0;
  flex: 1;
  overflow: auto;
  @media (max-width: 860px) {
    display: none;
  }
`;

const Table = styled.table`
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  th, td {
    padding: 0.9rem 0.95rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    text-align: left;
    vertical-align: top;
  }
  th {
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.lightText};
    position: sticky;
    top: 0;
    z-index: 1;
  }
`;

const MobileList = styled.div`
  display: none;
  @media (max-width: 860px) {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
    overflow: auto;
    min-height: 0;
    flex: 1;
  }
`;

const MobileCard = styled.article`
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.border};
  padding: 0.95rem;
  background: ${({ theme }) => theme.surface};
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
`;

const Badge = styled.button`
  border: 1px solid ${({ theme }) => theme.borderStrong};
  background: ${({ theme }) => theme.secondarySoft};
  color: ${({ theme }) => theme.primary};
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: ${({ $editable }) => ($editable ? "pointer" : "default")};
`;

const TinyAction = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme, $active }) => ($active ? theme.secondarySoft : theme.surface)};
  color: ${({ theme }) => theme.primary};
  border-radius: 999px;
  padding: 0.35rem 0.65rem;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
`;

const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.82rem;
`;

const EmptyState = styled.div`
  padding: 3rem 1rem;
  text-align: center;
  color: ${({ theme }) => theme.lightText};
`;

const ModalTitle = styled.h3`
  margin: 0 0 0.9rem;
  color: ${({ theme }) => theme.primary};
`;

const FormGrid = styled.div`
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const TextArea = styled.textarea`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  min-height: 92px;
  padding: 0.72rem 0.85rem;
  resize: vertical;
  width: 100%;
`;

const parseJwt = (token) => {
  try {
    const payload = token.split(".")[1] || "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)), "=");
    return JSON.parse(atob(padded));
  } catch (_error) {
    return null;
  }
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
};

const makeInitialForm = () => ({
  transaction_date: new Date().toISOString().slice(0, 16),
  amount: "",
  operation_direct: "in",
  sender_name: "",
  counterparty_name: "",
  portal_notes: "",
});

const PortalTransactionWorkspace = ({ forceViewOnly = false }) => {
  const { filters, setFilters } = usePortal();
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, currentPage: 1, totalRecords: 0, limit: 50 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorForm, setEditorForm] = useState(makeInitialForm());
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRows, setTransferRows] = useState([]);
  const [tokenPayload, setTokenPayload] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem("portalAuthToken") || localStorage.getItem("portalAuthToken");
    setTokenPayload(parseJwt(token));
  }, []);

  const isImpersonating = tokenPayload?.impersonation === true || sessionStorage.getItem("portalImpersonation") === "true";
  const isViewOnly = forceViewOnly || tokenPayload?.accessLevel === "view_only";
  const canEdit = isImpersonating;
  const activePool = filters.pool === "manual" ? "manual" : "statement";
  const accountType = tokenPayload?.accountType || "xpayz";
  const showTransfer = canEdit && accountType === "cross" && activePool === "statement";

  const updateFilters = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getPortalTransactions({ ...filters, pool: activePool, page, limit: pagination.limit });
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setPagination((prev) => ({
        ...prev,
        totalPages: Number(data.totalPages || 1),
        currentPage: Number(data.currentPage || 1),
        totalRecords: Number(data.totalRecords || 0),
        limit: data.limit === "all" ? prev.limit : Number(data.limit || prev.limit || 50),
      }));
    } catch (error) {
      console.error("Failed to fetch portal transactions", error);
    } finally {
      setLoading(false);
    }
  }, [activePool, filters, page, pagination.limit]);

  const fetchSummary = useCallback(async () => {
    if (isViewOnly) return;
    try {
      const { data } = await getPortalDashboardSummary(filters);
      setSummary(data);
    } catch (error) {
      console.error("Failed to fetch dashboard summary", error);
    }
  }, [filters, isViewOnly]);

  useEffect(() => {
    fetchTransactions();
    fetchSummary();
  }, [fetchTransactions, fetchSummary]);

  const visibleMetrics = useMemo(() => {
    if (isViewOnly || !summary) return [];
    if (isImpersonating) {
      return [
        ["Chave Balance", summary.statementBalance],
        ["Manual Balance", summary.manualBalance],
        ["Combined Visible", summary.combinedBalance],
        ["All-Time Balance", summary.allTimeBalance],
      ];
    }
    if (activePool === "manual") return [["Manual Balance", summary.manualBalance]];
    return [
      ["All-Time Balance", summary.combinedBalance],
      ["Chave Balance", summary.statementBalance],
    ];
  }, [activePool, isImpersonating, isViewOnly, summary]);

  const openCreate = () => {
    setEditingTransaction(null);
    setEditorForm(makeInitialForm());
    setEditorOpen(true);
  };

  const openEdit = (transaction) => {
    setEditingTransaction(transaction);
    const isoDate = transaction.transaction_date
      ? new Date(transaction.transaction_date).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16);
    setEditorForm({
      transaction_date: isoDate,
      amount: transaction.amount,
      operation_direct: transaction.operation_direct || "in",
      sender_name: transaction.sender_name || "",
      counterparty_name: transaction.counterparty_name || "",
      portal_notes: transaction.portal_notes || "",
    });
    setEditorOpen(true);
  };

  const saveEditor = async (event) => {
    event.preventDefault();
    const payload = { ...editorForm, pool: activePool };
    if (editingTransaction) await updatePortalTransaction(editingTransaction.id, payload);
    else await createPortalTransaction(payload);
    setEditorOpen(false);
    fetchTransactions();
    fetchSummary();
  };

  const removeTransaction = async (transaction) => {
    const confirmed = window.confirm(activePool === "statement" ? "Hide this statement transaction?" : "Delete this manual transaction permanently?");
    if (!confirmed) return;
    await deletePortalTransaction(transaction.id, activePool);
    fetchTransactions();
    fetchSummary();
  };

  const toggleAudience = async (transaction, audienceKey) => {
    await updatePortalTransactionVisibility({
      transactionId: transaction.id,
      pool: activePool,
      visibleInMaster: audienceKey === "master" ? !Boolean(transaction.visible_in_master) : undefined,
      visibleInViewOnly: audienceKey === "view_only" ? !Boolean(transaction.visible_in_view_only) : undefined,
    });
    fetchTransactions();
  };

  const editBadge = async (transaction) => {
    const nextLabel = window.prompt("Badge text", transaction.badge_label || "added");
    if (nextLabel == null) return;
    await updatePortalTransactionBadge({ transactionId: transaction.id, pool: activePool, badgeLabel: nextLabel });
    fetchTransactions();
  };

  const editNotes = async (transaction) => {
    const nextNotes = window.prompt("Transaction note", transaction.portal_notes || "");
    if (nextNotes == null) return;
    await updatePortalTransactionNotes(transaction.id, transaction.source, nextNotes, activePool);
    fetchTransactions();
  };

  const toggleConfirmation = async (transaction) => {
    const nextConfirmed = !Boolean(transaction.is_portal_confirmed);
    const passcode = nextConfirmed ? undefined : window.prompt("Unconfirm PIN");
    if (!nextConfirmed && passcode == null) return;
    await updatePortalTransactionConfirmation(transaction.id, transaction.source, nextConfirmed, passcode, activePool);
    fetchTransactions();
  };

  const fetchTransferRows = async () => {
    const { data } = await getPortalTrkbitTransactions({ page: 1, limit: 50 });
    setTransferRows(Array.isArray(data.transactions) ? data.transactions : []);
  };

  const claimTransfer = async (row) => {
    await claimPortalTrkbitTransaction(row.id);
    await fetchTransferRows();
    fetchTransactions();
    fetchSummary();
  };

  const renderActions = (transaction) => {
    if (!canEdit) return null;
    return (
      <ActionGroup>
        <TinyAction type="button" onClick={() => toggleConfirmation(transaction)}>{transaction.is_portal_confirmed ? "Confirmed" : "Pending"}</TinyAction>
        <TinyAction type="button" onClick={() => editNotes(transaction)}><FaPencilAlt /> Note</TinyAction>
        <TinyAction type="button" onClick={() => openEdit(transaction)}><FaSave /> Edit</TinyAction>
        <TinyAction type="button" onClick={() => removeTransaction(transaction)}><FaTrash /> Delete</TinyAction>
      </ActionGroup>
    );
  };

  const renderVisibility = (transaction) => {
    if (!canEdit) return null;
    return (
      <ActionGroup>
        <TinyAction type="button" $active={Boolean(transaction.visible_in_master)} onClick={() => toggleAudience(transaction, "master")}>
          {transaction.visible_in_master ? <FaEye /> : <FaEyeSlash />} Master
        </TinyAction>
        <TinyAction type="button" $active={Boolean(transaction.visible_in_view_only)} onClick={() => toggleAudience(transaction, "view_only")}>
          {transaction.visible_in_view_only ? <FaEye /> : <FaEyeSlash />} View Only
        </TinyAction>
      </ActionGroup>
    );
  };

  return (
    <Page>
      <Toolbar>
        <ToolbarTop>
          <TitleBlock>
            <h2>{activePool === "statement" ? "Chave Pix Statement" : "Manual Entries"}</h2>
            <p>{canEdit ? "Impersonation mode can add, edit, move, hide, and control visibility." : "Read-only transaction view."}</p>
          </TitleBlock>
          <Tabs>
            <Tab type="button" $active={activePool === "statement"} onClick={() => updateFilters({ pool: "statement" })}>Chave Pix Statement</Tab>
            <Tab type="button" $active={activePool === "manual"} onClick={() => updateFilters({ pool: "manual" })}>Manual Entries</Tab>
          </Tabs>
        </ToolbarTop>

        <Row>
          <Input placeholder="Search" value={filters.search || ""} onChange={(event) => updateFilters({ search: event.target.value })} />
          <Input type="date" value={filters.date || ""} onChange={(event) => updateFilters({ date: event.target.value, dateFrom: "", dateTo: "" })} />
          <Input type="date" value={filters.dateFrom || ""} onChange={(event) => updateFilters({ dateFrom: event.target.value, date: "" })} />
          <Input type="date" value={filters.dateTo || ""} onChange={(event) => updateFilters({ dateTo: event.target.value, date: "" })} />
          <Select value={filters.direction || ""} onChange={(event) => updateFilters({ direction: event.target.value })}>
            <option value="">All Directions</option>
            <option value="in">IN</option>
            <option value="out">OUT</option>
          </Select>
          <Select value={filters.confirmation || ""} onChange={(event) => updateFilters({ confirmation: event.target.value })}>
            <option value="">All Confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
          </Select>
          <Button type="button" $variant="ghost" onClick={() => { fetchTransactions(); fetchSummary(); }}><FaSyncAlt /> Refresh</Button>
          {canEdit && <Button type="button" onClick={openCreate}><FaPlus /> Add</Button>}
          {showTransfer && <Button type="button" $variant="ghost" onClick={() => { setTransferOpen(true); fetchTransferRows(); }}><FaArrowsAltH /> Transfer Ownership</Button>}
        </Row>
      </Toolbar>

      {!isViewOnly && visibleMetrics.length > 0 && (
        <Metrics>
          {visibleMetrics.map(([label, value]) => (
            <MetricCard key={label}>
              <h3>{label}</h3>
              <p>{formatMoney(value)}</p>
            </MetricCard>
          ))}
        </Metrics>
      )}

      <Panel>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Party</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Badge</th>
                {canEdit && <th>Visibility</th>}
                {canEdit && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {!loading && transactions.length === 0 ? (
                <tr><td colSpan={canEdit ? 8 : 6}><EmptyState>No transactions found.</EmptyState></td></tr>
              ) : transactions.map((transaction) => (
                <tr key={transaction.transaction_key}>
                  <td>{formatDateTime(transaction.transaction_date)}</td>
                  <td>{transaction.operation_direct === "out" ? <FaChevronUp /> : <FaChevronDown />} {(transaction.operation_direct || "in").toUpperCase()}</td>
                  <td>{transaction.operation_direct === "out" ? (transaction.counterparty_name || "—") : (transaction.sender_name || "—")}</td>
                  <td>{formatMoney(transaction.amount)}</td>
                  <td>{transaction.portal_notes || <Meta>No note</Meta>}</td>
                  <td>{transaction.badge_label ? <Badge type="button" $editable={canEdit} onClick={() => canEdit && editBadge(transaction)}>{transaction.badge_label}</Badge> : "—"}</td>
                  {canEdit && <td>{renderVisibility(transaction)}</td>}
                  {canEdit && <td>{renderActions(transaction)}</td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>

        <MobileList>
          {!loading && transactions.length === 0 ? (
            <EmptyState>No transactions found.</EmptyState>
          ) : transactions.map((transaction) => (
            <MobileCard key={transaction.transaction_key}>
              <Row style={{ justifyContent: "space-between" }}>
                <strong>{transaction.operation_direct === "out" ? "OUT" : "IN"}</strong>
                <strong>{formatMoney(transaction.amount)}</strong>
              </Row>
              <div>{transaction.operation_direct === "out" ? (transaction.counterparty_name || "—") : (transaction.sender_name || "—")}</div>
              <Meta>{formatDateTime(transaction.transaction_date)}</Meta>
              {transaction.portal_notes && <Meta>{transaction.portal_notes}</Meta>}
              {transaction.badge_label && <Badge type="button" $editable={canEdit} onClick={() => canEdit && editBadge(transaction)}>{transaction.badge_label}</Badge>}
              {canEdit && renderVisibility(transaction)}
              {canEdit && renderActions(transaction)}
            </MobileCard>
          ))}
        </MobileList>
        <div style={{ padding: "0.8rem 1rem" }}>
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />
        </div>
      </Panel>

      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="720px">
        <ModalTitle>{editingTransaction ? "Edit Transaction" : `Add ${activePool === "statement" ? "Statement" : "Manual"} Transaction`}</ModalTitle>
        <form onSubmit={saveEditor}>
          <FormGrid>
            <Input type="datetime-local" value={editorForm.transaction_date} onChange={(event) => setEditorForm((prev) => ({ ...prev, transaction_date: event.target.value }))} />
            <Input type="number" step="0.01" placeholder="Amount" value={editorForm.amount} onChange={(event) => setEditorForm((prev) => ({ ...prev, amount: event.target.value }))} />
            <Select value={editorForm.operation_direct} onChange={(event) => setEditorForm((prev) => ({ ...prev, operation_direct: event.target.value }))}>
              <option value="in">IN</option>
              <option value="out">OUT</option>
            </Select>
            <Input placeholder="Sender name" value={editorForm.sender_name} onChange={(event) => setEditorForm((prev) => ({ ...prev, sender_name: event.target.value }))} />
            <Input placeholder="Counterparty name" value={editorForm.counterparty_name} onChange={(event) => setEditorForm((prev) => ({ ...prev, counterparty_name: event.target.value }))} />
          </FormGrid>
          <div style={{ marginTop: "0.8rem" }}>
            <TextArea placeholder="Optional note" value={editorForm.portal_notes} onChange={(event) => setEditorForm((prev) => ({ ...prev, portal_notes: event.target.value }))} />
          </div>
          <Row style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
            <Button type="button" $variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button type="submit"><FaSave /> Save</Button>
          </Row>
        </form>
      </Modal>

      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="900px">
        <ModalTitle>Transfer Ownership</ModalTitle>
        <Meta>Taking ownership moves the transaction here, hides it from the origin account, and marks it with the editable added badge.</Meta>
        <div style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
          {transferRows.map((row) => (
            <MobileCard key={row.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <strong>{row.tx_payer_name || "Unknown"}</strong>
                <strong>{formatMoney(row.amount)}</strong>
              </Row>
              <Meta>{formatDateTime(row.transaction_date)}</Meta>
              <Meta>From PIX: {row.tx_pix_key || "—"}</Meta>
              <ActionGroup>
                <Button type="button" onClick={() => claimTransfer(row)}><FaCheck /> Take Ownership</Button>
              </ActionGroup>
            </MobileCard>
          ))}
        </div>
      </Modal>
    </Page>
  );
};

export default PortalTransactionWorkspace;
