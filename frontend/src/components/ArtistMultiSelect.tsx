import FilterMultiSelect from "./FilterMultiSelect";

interface ArtistOption {
  id: number;
  displayName: string;
}

interface ArtistMultiSelectProps {
  artists: ArtistOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

function ArtistMultiSelect({ artists, selectedIds, onChange }: ArtistMultiSelectProps) {
  const options = artists.map((artist) => ({
    value: String(artist.id),
    label: artist.displayName,
  }));

  return (
    <FilterMultiSelect
      options={options}
      selected={selectedIds.map(String)}
      onChange={(values) => onChange(values.map(Number))}
      allLabel="All artists"
    />
  );
}

export default ArtistMultiSelect;
