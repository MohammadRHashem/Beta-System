import React from "react";
import styled, { useTheme } from "styled-components";
import Select from "react-select";

const Container = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 0.55rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 0.45rem;
  align-items: end;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.24rem;
`;

const Label = styled.label`
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 800;
  color: ${({ theme }) => theme.lightText};
`;

const Input = styled.input`
  width: 100%;
`;

const SelectInput = styled.select`
  width: 100%;
`;

const ClearButton = styled.button`
  border-radius: 7px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  font-size: 0.75rem;
  font-weight: 800;
  min-height: 30px;
`;

const InvoiceFilter = ({ filters, onFilterChange, allGroups, recipientNames }) => {
  const theme = useTheme();

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 31,
      borderRadius: 7,
      borderColor: state.isFocused ? theme.secondary : theme.border,
      background: theme.surface,
      boxShadow: state.isFocused ? `0 0 0 2px ${theme.secondarySoft}` : "none",
      ":hover": { borderColor: state.isFocused ? theme.secondary : theme.borderStrong },
    }),
    valueContainer: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
    indicatorSeparator: () => ({ display: "none" }),
    input: (base) => ({ ...base, margin: 0, color: theme.text }),
    placeholder: (base) => ({ ...base, color: theme.lightText, fontSize: "0.76rem" }),
    singleValue: (base) => ({ ...base, color: theme.text }),
    multiValue: () => ({ display: "none" }),
    multiValueLabel: () => ({ display: "none" }),
    multiValueRemove: () => ({ display: "none" }),
    menu: (base) => ({ ...base, zIndex: 2000, background: theme.surface, border: `1px solid ${theme.border}` }),
    option: (base, state) => ({
      ...base,
      fontSize: "0.76rem",
      background: state.isFocused ? theme.surfaceAlt : theme.surface,
      color: theme.text,
    }),
  };

  const handleMultiChange = (name, selectedOptions) => {
    const values = selectedOptions ? selectedOptions.map((option) => option.value) : [];
    onFilterChange((prev) => ({ ...prev, [name]: values }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    onFilterChange((prev) => ({ ...prev, [name]: value }));
  };

  const handleClear = () => {
    onFilterChange({
      search: "",
      amountExact: "",
      dateFrom: "",
      dateTo: "",
      timeFrom: "",
      timeTo: "",
      sourceGroups: [],
      recipientNames: [],
      reviewStatus: "",
      status: "",
    });
  };

  const groupOptions = (allGroups || []).map((group) => ({ value: group.id, label: group.name }));
  const recipientOptions = (recipientNames || []).map((name) => ({ value: name, label: name }));

  return (
    <Container>
      <Field>
        <Label>Search</Label>
        <Input
          name="search"
          type="text"
          value={filters.search}
          onChange={handleChange}
          placeholder="ID, sender, amount..."
        />
      </Field>

      <Field>
        <Label>Exact Amount</Label>
        <Input
          name="amountExact"
          type="text"
          inputMode="decimal"
          value={filters.amountExact}
          onChange={handleChange}
          placeholder="1500.55"
        />
      </Field>

      <Field>
        <Label>From Date</Label>
        <Input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleChange} />
      </Field>

      <Field>
        <Label>From Time</Label>
        <Input name="timeFrom" type="time" value={filters.timeFrom} onChange={handleChange} />
      </Field>

      <Field>
        <Label>To Date</Label>
        <Input name="dateTo" type="date" value={filters.dateTo} onChange={handleChange} />
      </Field>

      <Field>
        <Label>To Time</Label>
        <Input name="timeTo" type="time" value={filters.timeTo} onChange={handleChange} />
      </Field>

      <Field>
        <Label>Source Groups</Label>
        <Select
          isMulti
          closeMenuOnSelect={false}
          controlShouldRenderValue={false}
          options={groupOptions}
          styles={selectStyles}
          onChange={(opts) => handleMultiChange("sourceGroups", opts)}
          value={groupOptions.filter((opt) => filters.sourceGroups.includes(opt.value))}
          placeholder={
            filters.sourceGroups.length > 0
              ? `${filters.sourceGroups.length} selected`
              : "Select..."
          }
        />
      </Field>

      <Field>
        <Label>Recipient Names</Label>
        <Select
          isMulti
          closeMenuOnSelect={false}
          controlShouldRenderValue={false}
          options={recipientOptions}
          styles={selectStyles}
          onChange={(opts) => handleMultiChange("recipientNames", opts)}
          value={recipientOptions.filter((opt) => filters.recipientNames.includes(opt.value))}
          placeholder={
            filters.recipientNames.length > 0
              ? `${filters.recipientNames.length} selected`
              : "Select..."
          }
        />
      </Field>

      <Field>
        <Label>Review Status</Label>
        <SelectInput name="reviewStatus" value={filters.reviewStatus} onChange={handleChange}>
          <option value="">Show All</option>
          <option value="only_review">Only To Be Reviewed</option>
          <option value="hide_review">Hide To Be Reviewed</option>
        </SelectInput>
      </Field>

      <Field>
        <Label>Other Status</Label>
        <SelectInput name="status" value={filters.status} onChange={handleChange}>
          <option value="">Show All</option>
          <option value="only_deleted">Only Deleted</option>
          <option value="only_duplicates">Only Duplicates</option>
        </SelectInput>
      </Field>

      <ClearButton type="button" onClick={handleClear}>
        Clear Filters
      </ClearButton>
    </Container>
  );
};

export default InvoiceFilter;
