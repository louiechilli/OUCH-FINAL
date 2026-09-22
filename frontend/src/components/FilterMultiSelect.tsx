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
  placeholder?: string;
}

function optionLabel(options: FilterMultiSelectOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function FilterMultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  emptyLabel = "None",
  placeholder,
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const allSelected = Boolean(allLabel) && selected.length === 0;

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
      return;
    }
    onChange([...selected, value]);
  }

  function selectAll() {
    onChange([]);
  }

  function selectEveryOption() {
    onChange(options.map((option) => option.value));
  }

  const triggerPlaceholder = placeholder ?? allLabel ?? emptyLabel;

  return (
    <div className={`dropdown-select${open ? " dropdown-select--open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown-select__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className="dropdown-select__value">
          {allSelected ? (
            <span className="dropdown-select__text">{allLabel}</span>
          ) : selected.length === 0 ? (
            <span className="dropdown-select__text dropdown-select__text--placeholder">{triggerPlaceholder}</span>
          ) : (
            <span className="dropdown-select__chips">
              {selected.slice(0, 3).map((value) => (
                <span key={value} className="dropdown-select__chip">
                  {optionLabel(options, value)}
                </span>
              ))}
              {selected.length > 3 ? (
                <span className="dropdown-select__chip dropdown-select__chip--more">+{selected.length - 3}</span>
              ) : null}
            </span>
          )}
        </span>
        <span className="dropdown-select__chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div className="dropdown-select__panel" id={listId} role="listbox" aria-multiselectable="true">
          {allLabel ? (
            <>
              <button
                type="button"
                role="option"
                aria-selected={allSelected}
                className={`dropdown-select__option${allSelected ? " dropdown-select__option--selected" : ""}`}
                onClick={selectAll}
              >
                <span>{allLabel}</span>
                {allSelected ? <span className="dropdown-select__check" aria-hidden="true" /> : null}
              </button>
              <div className="dropdown-select__divider" role="presentation" />
            </>
          ) : null}

          <ul className="dropdown-select__list">
            {options.map((option) => {
              const isSelected = !allSelected && selected.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`dropdown-select__option${isSelected ? " dropdown-select__option--selected" : ""}`}
                    onClick={() => toggleValue(option.value)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <span className="dropdown-select__check" aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {!allLabel && options.length > 1 ? (
            <div className="dropdown-select__footer">
              <button
                type="button"
                className="dropdown-select__footer-action"
                onClick={selectEveryOption}
                disabled={selected.length === options.length}
              >
                Select all
              </button>
              <button
                type="button"
                className="dropdown-select__footer-action"
                onClick={() => onChange([])}
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default FilterMultiSelect;
