import React, { useMemo } from "react";
import styled from "styled-components";
import {
  FaPause,
  FaPlay,
  FaStop,
  FaRedo,
  FaTrashAlt,
  FaEdit,
  FaSyncAlt,
  FaHistory,
} from "react-icons/fa";

const Container = styled.div`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  padding: 1rem;
  min-height: 440px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
`;

const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
`;

const RefreshButton = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 0.9rem;
  min-height: 0;
  flex: 1;

  @media (max-width: 1600px) {
    grid-template-columns: 1fr;
  }
`;

const JobList = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  overflow: auto;
  min-height: 220px;
  max-height: 620px;
`;

const JobListItem = styled.button`
  width: 100%;
  text-align: left;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ selected, theme }) =>
    selected ? theme.background : theme.surface};
  padding: 0.72rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.background};
  }
`;

const JobLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const JobMeta = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.88rem;
`;

const StatusPill = styled.span`
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: ${({ $status }) => {
    if ($status === "running") return "#e6f4ff";
    if ($status === "paused") return "#fff4d6";
    if ($status === "completed") return "#e7f8ef";
    if ($status === "failed") return "#fde9e9";
    if ($status === "cancelled") return "#f2f4f7";
    return "#eef2f6";
  }};
  color: ${({ $status }) => {
    if ($status === "running") return "#0b5cad";
    if ($status === "paused") return "#8a6116";
    if ($status === "completed") return "#147a4b";
    if ($status === "failed") return "#ab2f2f";
    if ($status === "cancelled") return "#555";
    return "#5f6a7a";
  }};
`;

const DetailPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  overflow: hidden;
  min-height: 220px;
`;

const Empty = styled.div`
  color: ${({ theme }) => theme.lightText};
  padding: 1rem;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 8px;
  text-align: center;
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SummaryCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.55rem;
  text-align: center;

  strong {
    display: block;
    font-size: 1rem;
    color: ${({ theme }) => theme.primary};
  }

  span {
    color: ${({ theme }) => theme.lightText};
    font-size: 0.78rem;
  }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
`;

const ActionButton = styled.button`
  border: 1px solid
    ${({ theme, $variant }) => {
      if ($variant === "danger") return theme.error;
      if ($variant === "success") return theme.success;
      return theme.border;
    }};
  background: ${({ $variant, theme }) =>
    $variant === "danger"
      ? theme.error
      : $variant === "success"
        ? theme.success
        : theme.surfaceAlt};
  color: ${({ $variant }) => ($variant === "default" ? "#1d2a3b" : "#fff")};
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }
`;

const EditRow = styled.div`
  display: flex;
  gap: 0.45rem;
  align-items: center;
`;

const EditInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.5rem 0.62rem;
`;

const LogsBox = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.55rem;
  overflow: auto;
  max-height: 190px;
  background: #fdfdfd;
`;

const LogLine = styled.div`
  font-size: 0.82rem;
  color: ${({ theme, $status }) => {
    if ($status === "failed") return theme.error;
    if ($status === "success") return theme.success;
    return theme.text;
  }};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0.3rem 0;
`;

const SectionTitle = styled.h4`
  margin: 0;
  font-size: 0.92rem;
`;

const TableWrap = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  overflow: auto;
  max-height: 260px;
`;

const TargetsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;

  th,
  td {
    text-align: left;
    padding: 0.52rem 0.6rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    vertical-align: middle;
    font-size: 0.86rem;
  }

  th {
    position: sticky;
    top: 0;
    background: #f6f8fb;
    z-index: 1;
  }
`;

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const sourceLabel = (source) => {
  if (source === "scheduled") return "Scheduled";
  if (source === "replay") return "Replay";
  return "Manual";
};

const BroadcastJobsPanel = ({
  jobs = [],
  selectedJobId,
  onSelectJob,
  onRefresh,
  selectedJobDetails,
  selectedJobLogs = [],
  isRefreshing = false,
  isLoadingDetails = false,
  canControlJobs = false,
  canReplayJobs = false,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  onReplay,
  onDeleteForEveryone,
  onEditMessage,
  editDraft = "",
  onEditDraftChange,
  isActionPending,
}) => {
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId],
  );

  const targetSummary = selectedJobDetails?.job || selectedJob;
  const targets = selectedJobDetails?.targets || [];
  const actions = selectedJobDetails?.actions || [];

  const hasSentTargets = (targetSummary?.target_success || 0) > 0;
  const canMutateSent = canControlJobs && hasSentTargets && targetSummary?.status !== "running";
  const canPause = canControlJobs && targetSummary?.status === "running";
  const canResume = canControlJobs && targetSummary?.status === "paused";
  const canCancel =
    canControlJobs &&
    targetSummary &&
    !["completed", "cancelled"].includes(targetSummary.status);
  const canRetry =
    canControlJobs &&
    targetSummary &&
    targetSummary.status !== "running" &&
    (targetSummary.target_failed || 0) > 0;
  const canReplay =
    canReplayJobs &&
    targetSummary &&
    ["completed", "failed", "cancelled"].includes(targetSummary.status);

  return (
    <Container>
      <Header>
        <Title>
          <FaHistory /> Broadcast Jobs
        </Title>
        <RefreshButton type="button" onClick={onRefresh} disabled={isRefreshing}>
          <FaSyncAlt /> {isRefreshing ? "Refreshing..." : "Refresh"}
        </RefreshButton>
      </Header>

      <Layout>
        <JobList>
          {jobs.length === 0 && <Empty>No broadcast jobs yet.</Empty>}
          {jobs.map((job) => (
            <JobListItem
              key={job.id}
              type="button"
              selected={job.id === selectedJobId}
              onClick={() => onSelectJob(job.id)}
            >
              <JobLine>
                <strong>Job #{job.id}</strong>
                <StatusPill $status={job.status}>{job.status}</StatusPill>
              </JobLine>
              <JobLine>
                <JobMeta>{sourceLabel(job.source)}</JobMeta>
                <JobMeta>{formatDateTime(job.created_at)}</JobMeta>
              </JobLine>
              <JobLine>
                <JobMeta>
                  OK {job.target_success || 0} | Fail {job.target_failed || 0} | Cancel{" "}
                  {job.target_cancelled || 0}
                </JobMeta>
              </JobLine>
            </JobListItem>
          ))}
        </JobList>

        <DetailPanel>
          {!selectedJob && <Empty>Select a job to inspect status and controls.</Empty>}

          {selectedJob && (
            <>
              <JobLine>
                <div>
                  <strong>Job #{selectedJob.id}</strong>
                  <JobMeta>
                    {" "}
                    {sourceLabel(selectedJob.source)} | Created {formatDateTime(selectedJob.created_at)}
                  </JobMeta>
                </div>
                <StatusPill $status={targetSummary?.status || selectedJob.status}>
                  {targetSummary?.status || selectedJob.status}
                </StatusPill>
              </JobLine>

              <Summary>
                <SummaryCard>
                  <strong>{targetSummary?.target_total || 0}</strong>
                  <span>Total Targets</span>
                </SummaryCard>
                <SummaryCard>
                  <strong>{targetSummary?.target_success || 0}</strong>
                  <span>Successful</span>
                </SummaryCard>
                <SummaryCard>
                  <strong>{targetSummary?.target_failed || 0}</strong>
                  <span>Failed</span>
                </SummaryCard>
                <SummaryCard>
                  <strong>{targetSummary?.target_cancelled || 0}</strong>
                  <span>Cancelled</span>
                </SummaryCard>
              </Summary>

              <Controls>
                {canPause && (
                  <ActionButton
                    type="button"
                    onClick={() => onPause(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "pause")}
                  >
                    <FaPause /> Pause
                  </ActionButton>
                )}
                {canResume && (
                  <ActionButton
                    type="button"
                    onClick={() => onResume(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "resume")}
                    $variant="success"
                  >
                    <FaPlay /> Resume
                  </ActionButton>
                )}
                {canCancel && (
                  <ActionButton
                    type="button"
                    onClick={() => onCancel(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "cancel")}
                    $variant="danger"
                  >
                    <FaStop /> Cancel
                  </ActionButton>
                )}
                {canRetry && (
                  <ActionButton
                    type="button"
                    onClick={() => onRetryFailed(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "retry")}
                  >
                    <FaRedo /> Retry Failed
                  </ActionButton>
                )}
                {canReplay && (
                  <ActionButton
                    type="button"
                    onClick={() => onReplay(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "replay")}
                  >
                    <FaRedo /> Replay
                  </ActionButton>
                )}
                {canMutateSent && (
                  <ActionButton
                    type="button"
                    onClick={() => onDeleteForEveryone(selectedJob.id)}
                    disabled={isActionPending(selectedJob.id, "delete")}
                    $variant="danger"
                  >
                    <FaTrashAlt /> Delete For Everyone
                  </ActionButton>
                )}
              </Controls>

              {canMutateSent && (
                <EditRow>
                  <EditInput
                    type="text"
                    placeholder="Edit sent message..."
                    value={editDraft}
                    onChange={(event) => onEditDraftChange(selectedJob.id, event.target.value)}
                  />
                  <ActionButton
                    type="button"
                    onClick={() => onEditMessage(selectedJob.id)}
                    disabled={
                      isActionPending(selectedJob.id, "edit") || !String(editDraft || "").trim()
                    }
                  >
                    <FaEdit /> Edit Sent
                  </ActionButton>
                </EditRow>
              )}

              <SectionTitle>Live Logs</SectionTitle>
              <LogsBox>
                {selectedJobLogs.length === 0 && (
                  <LogLine $status="info">No live logs captured for this session.</LogLine>
                )}
                {selectedJobLogs.map((entry) => (
                  <LogLine
                    key={entry.id}
                    $status={entry.status}
                    title={entry.timestamp ? formatDateTime(entry.timestamp) : ""}
                  >
                    {entry.message}
                  </LogLine>
                ))}
              </LogsBox>

              <SectionTitle>Target Status</SectionTitle>
              <TableWrap>
                <TargetsTable>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Send</th>
                      <th>Delete</th>
                      <th>Edit</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingDetails && (
                      <tr>
                        <td colSpan="5">Loading job details...</td>
                      </tr>
                    )}
                    {!isLoadingDetails && targets.length === 0 && (
                      <tr>
                        <td colSpan="5">No target details found.</td>
                      </tr>
                    )}
                    {!isLoadingDetails &&
                      targets.map((target) => (
                        <tr key={target.id}>
                          <td>{target.group_name || target.group_jid}</td>
                          <td>{target.status}</td>
                          <td>{target.delete_status || "none"}</td>
                          <td>{target.edit_status || "none"}</td>
                          <td>
                            {target.last_error ||
                              target.delete_error ||
                              target.edit_error ||
                              "-"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </TargetsTable>
              </TableWrap>

              {actions.length > 0 && (
                <>
                  <SectionTitle>Action History</SectionTitle>
                  <LogsBox>
                    {actions.map((action) => (
                      <LogLine key={action.id} $status="info">
                        [{formatDateTime(action.created_at)}] {action.action}
                        {action.username ? ` by ${action.username}` : ""}
                      </LogLine>
                    ))}
                  </LogsBox>
                </>
              )}
            </>
          )}
        </DetailPanel>
      </Layout>
    </Container>
  );
};

export default BroadcastJobsPanel;
