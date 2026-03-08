import React, { useMemo } from "react";
import styled from "styled-components";
import {
  FaEdit,
  FaHistory,
  FaPause,
  FaPlay,
  FaRedo,
  FaStop,
  FaSyncAlt,
  FaTrashAlt,
} from "react-icons/fa";

const Container = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.surface};
  padding: 0.54rem;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
`;

const Title = styled.h3`
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.95rem;
`;

const RefreshButton = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 7px;
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  min-height: 28px;
  padding: 0.24rem 0.55rem;
  font-size: 0.74rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;

  &:disabled {
    opacity: 0.68;
  }
`;

const Layout = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(260px, 300px) 1fr;
  gap: 0.55rem;

  @media (max-width: 1400px) {
    grid-template-columns: 1fr;
  }
`;

const JobList = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  min-height: 0;
  overflow: auto;
`;

const JobListItem = styled.button`
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ selected, theme }) => (selected ? theme.secondarySoft : theme.surface)};
  padding: 0.48rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const JobLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
`;

const JobMeta = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.74rem;
`;

const StatusPill = styled.span`
  border-radius: 999px;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.44rem;
  background: ${({ theme, $status }) => {
    if ($status === "running") return theme.secondarySoft;
    if ($status === "paused") return "rgba(217, 119, 6, 0.14)";
    if ($status === "completed") return "rgba(22, 163, 74, 0.12)";
    if ($status === "failed") return "rgba(220, 38, 38, 0.12)";
    if ($status === "cancelled") return "rgba(100, 116, 139, 0.14)";
    return theme.surfaceAlt;
  }};
  color: ${({ theme, $status }) => {
    if ($status === "running") return theme.secondary;
    if ($status === "paused") return theme.warning;
    if ($status === "completed") return theme.success;
    if ($status === "failed") return theme.error;
    if ($status === "cancelled") return theme.lightText;
    return theme.lightText;
  }};
`;

const DetailPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.52rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.52rem;
  overflow: auto;
`;

const Empty = styled.div`
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.7rem;
  text-align: center;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.lightText};
`;

const Summary = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const SummaryCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 7px;
  padding: 0.42rem;
  text-align: center;

  strong {
    display: block;
    font-size: 0.95rem;
  }

  span {
    color: ${({ theme }) => theme.lightText};
    font-size: 0.7rem;
  }
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.36rem;
`;

const ActionButton = styled.button`
  border-radius: 7px;
  min-height: 28px;
  padding: 0.22rem 0.48rem;
  font-size: 0.72rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid
    ${({ theme, $variant }) => {
      if ($variant === "danger") return theme.error;
      if ($variant === "success") return theme.success;
      return theme.border;
    }};
  background: ${({ theme, $variant }) => {
    if ($variant === "danger") return theme.error;
    if ($variant === "success") return theme.success;
    return theme.surfaceAlt;
  }};
  color: ${({ $variant, theme }) => ($variant === "default" ? theme.primary : "#fff")};

  &:disabled {
    opacity: 0.64;
  }
`;

const EditRow = styled.div`
  display: flex;
  gap: 0.36rem;
`;

const EditInput = styled.input`
  flex: 1;
  min-width: 0;
`;

const SectionTitle = styled.h4`
  margin: 0;
  font-size: 0.82rem;
`;

const LogsBox = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 7px;
  background: ${({ theme }) => theme.surfaceAlt};
  max-height: 200px;
  overflow: auto;
  padding: 0.42rem;
`;

const LogLine = styled.div`
  font-size: 0.74rem;
  color: ${({ theme, $status }) => {
    if ($status === "failed") return theme.error;
    if ($status === "success") return theme.success;
    return theme.text;
  }};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0.23rem 0;
`;

const TableWrap = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 7px;
  max-height: 320px;
  overflow: auto;
`;

const TargetsTable = styled.table`
  width: 100%;
  min-width: 700px;

  th,
  td {
    padding: 0.42rem 0.48rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    font-size: 0.74rem;
    text-align: left;
  }

  th {
    position: sticky;
    top: 0;
    background: ${({ theme }) => theme.surfaceAlt};
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
    canControlJobs && targetSummary && !["completed", "cancelled"].includes(targetSummary.status);
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
                  OK {job.target_success || 0} | Fail {job.target_failed || 0} | Cancel {job.target_cancelled || 0}
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
                    disabled={isActionPending(selectedJob.id, "edit") || !String(editDraft || "").trim()}
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
                          <td>{target.last_error || target.delete_error || target.edit_error || "-"}</td>
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
