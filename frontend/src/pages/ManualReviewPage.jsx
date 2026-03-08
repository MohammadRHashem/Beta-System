import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  clearAllPendingInvoices,
  confirmManualInvoice,
  getManualCandidates,
  getPendingManualInvoices,
  rejectManualInvoice,
  viewInvoiceMedia,
} from "../services/api";
import { useSocket } from "../context/SocketContext";
import { usePermissions } from "../context/PermissionContext";
import Modal from "../components/Modal";
import { FaBroom, FaCheck, FaTimes } from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";

const formatSaoPauloDateTime = (dbDateString, formatString) => {
  if (!dbDateString) return "";
  try {
    const utcDate = new Date(`${dbDateString}Z`);
    return formatInTimeZone(utcDate, SAO_PAULO_TIMEZONE, formatString);
  } catch (_error) {
    return dbDateString;
  }
};

const PageContainer = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const HeaderCard = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 0.62rem 0.75rem;
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.52rem;
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.12rem;
  font-weight: 800;
`;

const SummaryBadge = styled.span`
  border-radius: 999px;
  border: 1px solid rgba(22, 163, 74, 0.36);
  background: rgba(22, 163, 74, 0.12);
  color: ${({ theme }) => theme.success};
  padding: 0.18rem 0.52rem;
  font-size: 0.72rem;
  font-weight: 800;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.38rem;
  flex-wrap: wrap;
  justify-content: flex-end;
`;

const HeaderButton = styled.button`
  border: 1px solid transparent;
  border-radius: 7px;
  min-height: 30px;
  padding: 0.22rem 0.58rem;
  font-size: 0.75rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: ${({ theme, $danger }) => ($danger ? theme.error : theme.primary)};
  color: #fff;

  &:disabled {
    opacity: 0.65;
  }
`;

const TableCard = styled.section`
  flex: 1;
  min-height: 0;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  overflow: hidden;
`;

const TableWrap = styled.div`
  width: 100%;
  height: 100%;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  min-width: 1060px;
  border-collapse: collapse;

  th,
  td {
    padding: 0.46rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    vertical-align: middle;
    white-space: nowrap;
    font-size: 0.78rem;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.surfaceAlt};
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
`;

const TableRow = styled.tr`
  background: ${({ isSelected, theme }) =>
    isSelected ? theme.secondarySoft : "transparent"};
`;

const Checkbox = styled.input.attrs({ type: "checkbox" })`
  width: 15px;
  height: 15px;
`;

const ActionCellButton = styled.button`
  border: 1px solid ${({ theme, $variant }) => ($variant === "danger" ? theme.error : theme.success)};
  border-radius: 6px;
  min-height: 26px;
  padding: 0.16rem 0.48rem;
  font-size: 0.72rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  margin-right: 0.3rem;

  background: ${({ $variant }) => ($variant === "danger" ? "rgba(220,38,38,0.12)" : "rgba(22,163,74,0.12)")};
  color: ${({ theme, $variant }) => ($variant === "danger" ? theme.error : theme.success)};
`;

const UtilityButton = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
`;

const MediaLink = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  min-height: 24px;
  padding: 0.12rem 0.44rem;
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  font-size: 0.72rem;
  font-weight: 700;
`;

const ModalTitle = styled.h2`
  margin: 0 0 0.52rem;
  font-size: 1rem;
`;

const ModalIntro = styled.p`
  margin: 0;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.lightText};
`;

const CandidatesWrap = styled.div`
  margin-top: 0.55rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  max-height: 420px;
  overflow: auto;
`;

const CandidatesTable = styled.table`
  width: 100%;
  min-width: 620px;

  th,
  td {
    border-bottom: 1px solid ${({ theme }) => theme.border};
    padding: 0.42rem 0.46rem;
    font-size: 0.75rem;
    text-align: left;
  }

  th {
    position: sticky;
    top: 0;
    background: ${({ theme }) => theme.surfaceAlt};
    text-transform: uppercase;
    font-size: 0.66rem;
    letter-spacing: 0.05em;
  }
`;

const CandidateActionButton = styled.button`
  border: 1px solid ${({ theme }) => theme.success};
  border-radius: 6px;
  min-height: 24px;
  padding: 0.12rem 0.42rem;
  background: rgba(22, 163, 74, 0.12);
  color: ${({ theme }) => theme.success};
  font-size: 0.7rem;
  font-weight: 800;
`;

const ModalFooter = styled.div`
  margin-top: 0.55rem;
  padding-top: 0.55rem;
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
`;

const ForceButton = styled.button`
  border: 1px solid ${({ theme }) => theme.borderStrong};
  border-radius: 6px;
  min-height: 28px;
  padding: 0.16rem 0.52rem;
  background: ${({ theme }) => theme.surfaceAlt};
  font-size: 0.75rem;
  font-weight: 800;
`;

const Hint = styled.span`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.lightText};
`;

const ManualReviewPage = () => {
  const { hasPermission } = usePermissions();
  const socket = useSocket();

  const canConfirm = hasPermission("manual_review:confirm");
  const canReject = hasPermission("manual_review:reject");
  const canClear = hasPermission("manual_review:clear");

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());

  const fetchPending = async () => {
    setLoading(true);
    try {
      const { data } = await getPendingManualInvoices();
      setInvoices(data || []);
      setSelectedRows(new Set());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
    if (!socket) return undefined;
    socket.on("manual:refresh", fetchPending);
    return () => socket.off("manual:refresh", fetchPending);
  }, [socket]);

  const handleSelectRow = (messageId) => {
    const next = new Set(selectedRows);
    if (next.has(messageId)) next.delete(messageId);
    else next.add(messageId);
    setSelectedRows(next);
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allMessageIds = new Set(invoices.map((invoice) => invoice.message_id));
      setSelectedRows(allMessageIds);
      return;
    }
    setSelectedRows(new Set());
  };

  const handleClear = async (messageIdsToClear, isBulk = false) => {
    const count = messageIdsToClear.length;
    if (count === 0) return;

    const confirmText = isBulk
      ? `Are you sure you want to clear the ${count} selected invoices?`
      : "Are you sure you want to clear this invoice?";

    if (!window.confirm(`${confirmText}\nThis will not send a reply to clients.`)) {
      return;
    }

    try {
      await clearAllPendingInvoices(messageIdsToClear);
    } catch (_error) {
      alert("An error occurred while clearing items.");
    }
  };

  const handleReject = async (invoice) => {
    if (!window.confirm('Reject this invoice? This will reply "no caiu" to the client.')) return;
    try {
      await rejectManualInvoice(invoice.message_id);
    } catch (_error) {
      alert("Failed to reject.");
    }
  };

  const openConfirmModal = async (invoice) => {
    setSelectedInvoice(invoice);
    setIsModalOpen(true);
    setLoadingCandidates(true);
    try {
      const amount = parseFloat(String(invoice.amount).replace(/,/g, ""));
      const { data: allCandidates } = await getManualCandidates(amount, invoice.recipient_name);
      setCandidates(allCandidates || []);
    } catch (error) {
      console.error(error);
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleFinalConfirm = async (linkedTx = null) => {
    if (!selectedInvoice) return;

    const confirmText = linkedTx
      ? `Link this ${linkedTx.source} transaction and confirm the invoice?`
      : "Force confirm this invoice without linking a bank transaction?";

    if (!window.confirm(`${confirmText}\nThis will reply "Caiu" to the client.`)) {
      return;
    }

    try {
      setIsModalOpen(false);
      await confirmManualInvoice({
        messageId: selectedInvoice.message_id,
        linkedTransactionId: linkedTx ? linkedTx.id : null,
        source: linkedTx ? linkedTx.source : null,
      });
    } catch (error) {
      alert(error.response?.data?.message || "Failed to confirm.");
    }
  };

  const areAllSelected = useMemo(
    () => invoices.length > 0 && selectedRows.size === invoices.length,
    [selectedRows, invoices],
  );

  const tableColumnCount =
    (canClear ? 1 : 0) + 6 + (canConfirm || canReject ? 1 : 0) + (canClear ? 1 : 0);

  return (
    <PageContainer>
      <HeaderCard>
        <HeaderTop>
          <Title>Manual Confirmation Center</Title>
          <Actions>
            {canClear && (
              <>
                <HeaderButton
                  type="button"
                  onClick={() => handleClear(Array.from(selectedRows), true)}
                  disabled={selectedRows.size === 0}
                >
                  <FaBroom /> Clear Selected ({selectedRows.size})
                </HeaderButton>
                <HeaderButton
                  type="button"
                  $danger
                  onClick={() => handleClear(invoices.map((invoice) => invoice.message_id), true)}
                  disabled={invoices.length === 0}
                >
                  <FaBroom /> Clear All ({invoices.length})
                </HeaderButton>
              </>
            )}
            <SummaryBadge>{invoices.length} Pending</SummaryBadge>
          </Actions>
        </HeaderTop>
      </HeaderCard>

      <TableCard>
        {loading ? (
          <p style={{ margin: 0, padding: "0.7rem", fontSize: "0.8rem" }}>Loading...</p>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  {canClear && (
                    <th>
                      <Checkbox onChange={handleSelectAll} checked={areAllSelected} />
                    </th>
                  )}
                  <th>Date</th>
                  <th>Source Group</th>
                  <th>Sender</th>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Media</th>
                  {(canConfirm || canReject) && <th>Confirm/Reject</th>}
                  {canClear && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount}>All caught up.</td>
                  </tr>
                ) : (
                  invoices.map((invoice) => (
                    <TableRow key={invoice.id} isSelected={selectedRows.has(invoice.message_id)}>
                      {canClear && (
                        <td>
                          <Checkbox
                            checked={selectedRows.has(invoice.message_id)}
                            onChange={() => handleSelectRow(invoice.message_id)}
                          />
                        </td>
                      )}
                      <td>{formatSaoPauloDateTime(invoice.received_at, "dd/MM HH:mm")}</td>
                      <td>{invoice.source_group_name}</td>
                      <td>{invoice.sender_name}</td>
                      <td>{invoice.recipient_name}</td>
                      <td style={{ fontWeight: 800 }}>{invoice.amount}</td>
                      <td>
                        <MediaLink type="button" onClick={() => viewInvoiceMedia(invoice.id)}>
                          View Image
                        </MediaLink>
                      </td>
                      {(canConfirm || canReject) && (
                        <td>
                          {canConfirm && (
                            <ActionCellButton type="button" onClick={() => openConfirmModal(invoice)}>
                              <FaCheck /> Confirm
                            </ActionCellButton>
                          )}
                          {canReject && (
                            <ActionCellButton
                              type="button"
                              $variant="danger"
                              onClick={() => handleReject(invoice)}
                            >
                              <FaTimes /> Reject
                            </ActionCellButton>
                          )}
                        </td>
                      )}
                      {canClear && (
                        <td style={{ textAlign: "center" }}>
                          <UtilityButton
                            type="button"
                            title="Clear this item"
                            onClick={() => handleClear([invoice.message_id], false)}
                          >
                            <FaBroom />
                          </UtilityButton>
                        </td>
                      )}
                    </TableRow>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </TableCard>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="820px">
        <ModalTitle>Link Bank Transaction</ModalTitle>
        <ModalIntro>
          Select the matching transaction from the database to reconcile accounting.
          <br />
          <strong>Invoice Amount: {selectedInvoice?.amount}</strong>
        </ModalIntro>

        {loadingCandidates ? (
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.8rem" }}>Searching database...</p>
        ) : (
          <CandidatesWrap>
            <CandidatesTable>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan="4">No unused transactions found for this amount.</td>
                  </tr>
                ) : (
                  candidates.map((candidate) => (
                    <tr key={`${candidate.id}-${candidate.source}`}>
                      <td>{candidate.source}</td>
                      <td>{formatSaoPauloDateTime(candidate.date, "dd/MM HH:mm")}</td>
                      <td style={{ fontWeight: 700 }}>{candidate.name}</td>
                      <td>
                        <CandidateActionButton type="button" onClick={() => handleFinalConfirm(candidate)}>
                          Link & Confirm
                        </CandidateActionButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </CandidatesTable>
          </CandidatesWrap>
        )}

        <ModalFooter>
          <ForceButton type="button" onClick={() => handleFinalConfirm(null)}>
            Force Confirm (Without Linking)
          </ForceButton>
          <Hint>Use this if the bank API has not synced yet.</Hint>
        </ModalFooter>
      </Modal>
    </PageContainer>
  );
};

export default ManualReviewPage;
