export type TimedLayoutInput = {
  id: string;
  top: number;
  height: number;
};

export type TimedLayoutPosition = {
  top: number;
  height: number;
  leftPercent: number;
  widthPercent: number;
  column: number;
};

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Google Calendar-style column layout for overlapping timed events in one day column. */
export function layoutOverlappingTimedEvents(items: TimedLayoutInput[]): Map<string, TimedLayoutPosition> {
  const result = new Map<string, TimedLayoutPosition>();
  if (items.length === 0) return result;

  const events = items.map((item) => ({
    ...item,
    bottom: item.top + item.height,
  }));

  const sorted = [...events].sort((a, b) => {
    if (a.top !== b.top) return a.top - b.top;
    return b.bottom - b.top - (a.bottom - a.top);
  });

  const columns = new Map<string, { column: number; columnCount: number }>();

  for (const event of sorted) {
    let column = 0;
    while (true) {
      const conflict = sorted.some(
        (other) =>
          other.id !== event.id &&
          columns.get(other.id)?.column === column &&
          rangesOverlap(other.top, other.bottom, event.top, event.bottom)
      );
      if (!conflict) break;
      column += 1;
    }
    columns.set(event.id, { column, columnCount: 1 });
  }

  for (const event of sorted) {
    const overlapping = sorted.filter((other) =>
      rangesOverlap(other.top, other.bottom, event.top, event.bottom)
    );
    const columnCount = Math.max(...overlapping.map((item) => columns.get(item.id)!.column)) + 1;
    for (const item of overlapping) {
      const entry = columns.get(item.id)!;
      entry.columnCount = Math.max(entry.columnCount, columnCount);
    }
  }

  for (const event of events) {
    const { column, columnCount } = columns.get(event.id)!;
    const widthPercent = 100 / columnCount;
    result.set(event.id, {
      top: event.top,
      height: event.height,
      leftPercent: column * widthPercent,
      widthPercent,
      column,
    });
  }

  return result;
}

export function timedEventPositionStyle(position: TimedLayoutPosition): Record<string, string | number> {
  const inset = 2;
  return {
    top: position.top,
    height: position.height,
    left: `calc(${position.leftPercent}% + ${inset}px)`,
    width: `calc(${position.widthPercent}% - ${inset * 2}px)`,
    right: "auto",
    zIndex: position.column + 2,
  };
}
