import React, { useMemo } from "react";
import styled, { css } from "styled-components";
import { viewInvoiceMedia } from "../services/api";
import { FaEdit, FaEye, FaLink, FaTrashAlt, FaUnlink } from "react-icons/fa";
import { formatInTimeZone } from "date-fns-tz";
import Pagination from "./Pagination";

const formatDisplayDateTime = (dbDateString) => {
  if (!dbDateString || typeof dbDateString !== "string") return "";
  try {
    const utcDate = new Date(`${dbDateString}Z`);
    return formatInTimeZone(utcDate, "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");
  } catch (error) {
    console.warn("Could not format date string:", dbDateString, error);
    return dbDateString;
  }
};

const Section = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const TableWrapper = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const Table = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
`;

const Thead = styled.thead`
  position: sticky;
  top: 0;
  z-index: 1;
`;

const Th = styled.th`
  padding: 0.45rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: ${({ theme }) => theme.surfaceAlt};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  text-align: left;
  white-space: nowrap;
`;

const Tr = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};

  ${({ isDuplicate }) =>
    isDuplicate &&
    css`
      background: rgba(220, 38, 38, 0.08);
    `}

  ${({ isDeleted }) =>
    isDeleted &&
    css`
      background: ${({ theme }) => theme.surfaceAlt};
      color: ${({ theme }) => theme.lightText};
      text-decoration: line-through;
    `}
`;

const Td = styled.td`
  padding: 0.46rem 0.5rem;
  font-size: 0.78rem;
  white-space: nowrap;
  vertical-align: middle;

  &.currency {
    text-align: right;
    font-family: "IBM Plex Mono", Consolas, monospace;
    font-weight: 700;
  }

  &.review {
    color: ${({ theme }) => theme.error};
  }

  &.actions,
  &.link {
    text-align: center;
  }
`;

const IconAction = styled.button`
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 0.12rem;
`;

const Message = styled.p`
  margin: 0;
  padding: 0.75rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.lightText};
`;

const InvoiceTable = ({
  invoices,
  loading,
  onEdit,
  onLink,
  onDelete,
  pagination,
  setPagination,
  hasPermission,
}) => {
  const duplicateCounts = useMemo(() => {
    const counts = {};
    if (!invoices || !Array.isArray(invoices)) return counts;

    invoices.forEach((invoice) => {
      if (invoice.transaction_id && !invoice.is_manual) {
        const key = `${invoice.transaction_id}|${invoice.amount}|${invoice.sender_name}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    });

    return counts;
  }, [invoices]);

  const handleViewMedia = async (id) => {
    try {
      await viewInvoiceMedia(id);
    } catch (error) {
      console.error("Failed to open media:", error);
      alert("Could not load media file. It may have been deleted.");
    }
  };

  if (loading) {
    return (
      <Section>
        <Message>Loading invoices...</Message>
      </Section>
    );
  }

  if (!invoices || !invoices.length) {
    return (
      <Section>
        <Message>No invoices found for the selected criteria.</Message>
      </Section>
    );
  }

  return (
    <Section>
      <TableWrapper>
        <Table>
          <Thead>
            <tr>
              <Th>Received At</Th>
              <Th>Transaction ID</Th>
              <Th>Sender</Th>
              <Th>Recipient</Th>
              <Th>Source Group</Th>
              <Th>Amount</Th>
              <Th>Link</Th>
              <Th>Actions</Th>
            </tr>
          </Thead>
          <tbody>
            {invoices.map((invoice) => {
              let isDuplicate = false;
              if (invoice.transaction_id && !invoice.is_manual) {
                const key = `${invoice.transaction_id}|${invoice.amount}|${invoice.sender_name}`;
                if (duplicateCounts[key] > 1) isDuplicate = true;
              }

              const needsReview =
                !invoice.is_manual &&
                (!invoice.sender_name || !invoice.recipient_name || !invoice.amount || invoice.amount === "0.00");

              return (
                <Tr key={invoice.id} isDuplicate={isDuplicate} isDeleted={!!invoice.is_deleted}>
                  <Td>{formatDisplayDateTime(invoice.received_at)}</Td>
                  <Td>{invoice.transaction_id || ""}</Td>
                  <Td>{invoice.sender_name || (needsReview && "REVIEW")}</Td>
                  <Td>{invoice.recipient_name || (needsReview && "REVIEW")}</Td>
                  <Td>{invoice.source_group_name || ""}</Td>
                  <Td className={`currency ${needsReview ? "review" : ""}`}>{invoice.amount || ""}</Td>
                  <Td className="link">
                    {invoice.linked_transaction_source ? (
                      <IconAction as="span" title={`Linked: ${invoice.linked_transaction_source} - ${invoice.linked_transaction_id}`}>
                        <FaLink />
                      </IconAction>
                    ) : (
                      hasPermission("invoice:link") &&
                      !invoice.is_deleted &&
                      invoice.message_id && (
                        <IconAction
                          type="button"
                          title="Link to bank transaction"
                          onClick={() => onLink(invoice)}
                        >
                          <FaUnlink />
                        </IconAction>
                      )
                    )}
                  </Td>
                  <Td className="actions">
                    {invoice.media_path && (
                      <IconAction type="button" onClick={() => handleViewMedia(invoice.id)} title="View media">
                        <FaEye />
                      </IconAction>
                    )}
                    {hasPermission("invoice:edit") && (
                      <IconAction type="button" onClick={() => onEdit(invoice)} title="Edit">
                        <FaEdit />
                      </IconAction>
                    )}
                    {hasPermission("invoice:delete") && (
                      <IconAction type="button" onClick={() => onDelete(invoice.id)} title="Delete">
                        <FaTrashAlt />
                      </IconAction>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrapper>
      <Pagination
        pagination={pagination}
        setPagination={setPagination}
        showPageSize
        storageKey="invoices"
      />
    </Section>
  );
};

export default InvoiceTable;
