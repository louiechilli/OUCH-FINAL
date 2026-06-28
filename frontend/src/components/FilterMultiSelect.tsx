import { useEffect, useId, useRef, useState } from "react";

export interface FilterMultiSelectOption {
  value: string;
  label: string;
}

interface FilterMultiSelectProps {
  options: FilterMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  allLabel?: string;
  emptyLabel?: string;
}

function selectionLabel(
  options: FilterMultiSelectOption[],
  selected: string[],
  allLabel?: string,
  emptyLabel?: string
) {
  if (allLabel && selected.length === 0) return allLabel;
  if (selected.length === 0) return emptyLabel ?? "None";
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? "1 selected";
  }
  if (selected.length === options.length) {
    return options.map((option) => option.label).join(", ");
  }
  if (selected.length <= 2) {
    return selected
      .map((value) => options.find((option) => option.value === value)?.label)
      .filter(Boolean)
      .join(", ");
  }
  return `${selected.length} selected`;
}

function FilterMultiSelect({ options, selected, onChange, allLabel, emptyLabel }: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function selectAll() {
    onChange([]);
  }

  const allSelected = Boolean(allLabel) && selected.length === 0;

  return (
    <div className="filter-multi-select" ref={rootRef}>
      <button
        type="button"
        className="filter-multi-select__trigger bookings-page__select"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="filter-multi-select__label">
          {selectionLabel(options, selected, allLabel, emptyLabel)}
        </span>
        <span className="filter-multi-select__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="filter-multi-select__menu" id={listId} role="listbox" aria-multiselectable="true">
          {allLabel ? (
            <label className="filter-multi-select__option">
              <input type="checkbox" checked={allSelected} onChange={selectAll} />
              <span>{allLabel}</span>
            </label>
          ) : null}
          {options.map((option) => (
            <label key={option.value} className="filter-multi-select__option">
              <input
                type="checkbox"
                checked={!allSelected && selected.includes(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default FilterMultiSelect;
