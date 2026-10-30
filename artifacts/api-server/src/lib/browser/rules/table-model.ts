export const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

type Scope = "auto" | "row" | "col" | "rowgroup" | "colgroup";
type Group = { start: number; end: number };
export interface NativeTableCell {
  element: Element;
  x: number;
  y: number;
  width: number;
  height: number;
  isHeader: boolean;
  empty: boolean;
  scope: Scope;
  headers: Set<NativeTableCell>;
}

function integer(element: Element, name: string, minimum: number, maximum: number, fallback = minimum): number {
  const value = parseInt(element.getAttribute(name) ?? "", 10);
  return Number.isNaN(value) ? fallback : Math.max(minimum, Math.min(maximum, value));
}
const overlaps = (a: number, size: number, b: number, otherSize: number) => a < b + otherSize && b < a + size;
const contains = (cell: NativeTableCell, x: number, y: number) =>
  x >= cell.x && x < cell.x + cell.width && y >= cell.y && y < cell.y + cell.height;

/**
 * Ampera's native-DOM HTML table model. Behavior references:
 * https://html.spec.whatwg.org/multipage/tables.html#forming-a-table
 * https://html.spec.whatwg.org/multipage/tables.html#header-and-data-cell-semantics
 * https://github.com/Siteimprove/alfa/tree/main/packages/alfa-table
 *
 * Rebuilt per evaluation; never mutates page markup or depends on Alfa packages.
 * Rectangular cells, rather than a dense slot matrix, keep large author-provided
 * spans from allocating millions of otherwise empty grid positions.
 */
export function modelNativeTable(table: Element): { cells: NativeTableCell[] } {
  const cells: NativeTableCell[] = [];
  const rowGroups: Group[] = [], columnGroups: Group[] = [];
  // Preserve header-slot insertion order. A row-spanning header can be
  // inserted before a later header to its left; sorting coordinates instead
  // changes the reference algorithm's reverse-order header jumps.
  const headerPaints: { x: number; right: number; y: number; bottom: number }[] = [];
  const byId = new Map<string, NativeTableCell>();
  let y = 0, bottom = 0, columnEnd = 0;
  let downward: NativeTableCell[] = [];
  const at = (x: number, row: number) => cells.filter(cell => contains(cell, x, row));
  const grow = (cell: NativeTableCell, height: number) => {
    if (cell.isHeader && height > cell.height) headerPaints.push({
      x: cell.x, right: cell.x + cell.width, y: cell.y + cell.height, bottom: cell.y + height,
    });
    cell.height = height;
  };
  const endGroup = () => {
    // Growth occurs row by row in the reference model. Keep that ordering
    // when multiple downward-growing headers share the same group.
    for (let row = y; row < bottom; row++) {
      for (const cell of downward) grow(cell, row - cell.y + 1);
    }
    y = bottom;
    downward = [];
  };
  const processRow = (row: Element) => {
    bottom = Math.max(bottom, y + 1);
    for (const cell of downward) grow(cell, y - cell.y + 1);
    let x = 0;
    for (const element of Array.from(row.children).filter(el => /^(td|th)$/.test(el.localName))) {
      // Jump over occupied intervals, including downward-growing row spans.
      for (let occupied = at(x, y); occupied.length; occupied = at(x, y)) {
        x = Math.max(...occupied.map(cell => cell.x + cell.width));
      }
      const height = integer(element, "rowspan", 0, 65534, 1);
      const declared = element.getAttribute("scope")?.toLowerCase();
      const cell: NativeTableCell = {
        element, x, y, width: integer(element, "colspan", 1, 1000), height: height || 1,
        isHeader: element.localName === "th",
        empty: !Array.from(element.childNodes).some(node =>
          node instanceof Element || node instanceof Text && !!node.data.trim()),
        scope: declared === "row" || declared === "col" || declared === "rowgroup" || declared === "colgroup"
          ? declared : "auto",
        headers: new Set(),
      };
      cells.push(cell);
      if (cell.isHeader) headerPaints.push({ x, right: x + cell.width, y, bottom: y + cell.height });
      if (element.id) byId.set(element.id, cell);
      if (!height) downward.push(cell);
      bottom = Math.max(bottom, y + cell.height);
      x += cell.width;
    }
    y++;
  };
  const processRows = (group: Element) => {
    const start = bottom;
    for (const row of Array.from(group.children).filter(el => el.localName === "tr")) processRow(row);
    if (bottom > start) rowGroups.push({ start, end: bottom });
    endGroup();
  };

  const children = Array.from(table.children).filter(el => /^(colgroup|thead|tbody|tfoot|tr)$/.test(el.localName));
  let i = 0;
  while (children[i]?.localName === "colgroup") {
    const group = children[i++];
    const columns = Array.from(group.children).filter(el => el.localName === "col");
    const size = columns.length
      ? columns.reduce((sum, col) => sum + integer(col, "span", 1, 1000), 0)
      : integer(group, "span", 1, 1000);
    columnGroups.push({ start: columnEnd, end: columnEnd + size });
    columnEnd += size;
  }
  const footers: Element[] = [];
  for (; i < children.length; i++) {
    const child = children[i];
    if (child.localName === "tr") { processRow(child); continue; }
    if (child.localName === "colgroup") continue;
    endGroup();
    if (child.localName === "tfoot") footers.push(child);
    else processRows(child);
  }
  for (const footer of footers) processRows(footer);

  const headers = cells.filter(cell => cell.isHeader);
  const data = cells.filter(cell => !cell.isHeader && !cell.empty);
  for (const header of headers) {
    if (header.scope !== "auto") continue;
    // Alfa treats empty data cells as absent when inferring automatic scope.
    if (!data.some(cell => overlaps(header.y, header.height, cell.y, cell.height))) header.scope = "col";
    else if (!data.some(cell => overlaps(header.x, header.width, cell.x, cell.width))) header.scope = "row";
  }

  // Geometry changes only at cell boundaries. Sampling those boundaries is
  // equivalent to visiting every row/column of a spanning cell without loops
  // proportional to potentially enormous rowspan/colspan values.
  const samples = (start: number, size: number, axis: "x" | "y") => {
    const points = new Set([start]);
    for (const cell of cells) {
      for (const boundary of [cell[axis], cell[axis] + (axis === "x" ? cell.width : cell.height)]) {
        if (boundary > start && boundary < start + size) points.add(boundary);
      }
    }
    return [...points].sort((a, b) => a - b);
  };
  const jumpHeader = (position: number, line: number, vertical: boolean) => {
    for (let i = headerPaints.length - 1; i >= 0; i--) {
      const paint = headerPaints[i];
      if (vertical && line >= paint.x && line < paint.right && paint.y <= position) return Math.min(position, paint.bottom - 1);
      if (!vertical && line >= paint.y && line < paint.bottom && paint.x <= position) return Math.min(position, paint.right - 1);
    }
    return -1;
  };
  const scan = (principal: NativeTableCell, line: number, vertical: boolean) => {
    let position = (vertical ? principal.y : principal.x) - 1;
    const opaque: NativeTableCell[] = [];
    let inHeader = principal.isHeader;
    let block: NativeTableCell[] = inHeader ? [principal] : [];
    while (position >= 0) {
      // Match Alfa's header-jump behavior: non-header-only positions are
      // bypassed, while overlapping/model-error slots are not assigned.
      position = jumpHeader(position, line, vertical);
      if (position < 0) break;
      const occupants = vertical ? at(line, position) : at(position, line);
      position--;
      if (occupants.length !== 1) continue;
      const cell = occupants[0];
      if (cell.isHeader) {
        inHeader = true;
        block.push(cell);
        const blocked = opaque.some(h => vertical
          ? h.x === cell.x && h.width === cell.width
          : h.y === cell.y && h.height === cell.height);
        if (!blocked && cell.scope === (vertical ? "col" : "row")) principal.headers.add(cell);
      } else if (inHeader) {
        inHeader = false;
        opaque.push(...block);
        block = [];
      }
    }
  };
  for (const cell of cells) {
    if (cell.element.hasAttribute("headers")) {
      // The presence of headers, even when empty/invalid, overrides implicit
      // assignment. Alfa also resolves explicit references to native td cells.
      for (const id of (cell.element.getAttribute("headers") || "").split(/[\t\n\f\r ]+/).filter(Boolean)) {
        const target = byId.get(id);
        if (target) cell.headers.add(target);
      }
    } else {
      for (const row of samples(cell.y, cell.height, "y")) scan(cell, row, false);
      for (const col of samples(cell.x, cell.width, "x")) scan(cell, col, true);
      const rowGroup = [...rowGroups].reverse().find(group => cell.y >= group.start && cell.y < group.end);
      const colGroup = [...columnGroups].reverse().find(group => cell.x >= group.start && cell.x < group.end);
      // Follow the reference model's group traversal, including its shared
      // descending cursor across each row/column, rather than treating every
      // group-scoped header in the bounding rectangle as an assignment.
      if (rowGroup) {
        for (let x = cell.x + cell.width - 1; x >= 0; x--) {
          for (const row of samples(rowGroup.start, cell.y + cell.height - rowGroup.start, "y")) {
            x = jumpHeader(x, row, false);
            if (x < 0) break;
            for (const header of at(x, row)) {
              if (header.isHeader && header.scope === "rowgroup") cell.headers.add(header);
            }
          }
        }
      }
      if (colGroup) {
        for (let row = cell.y + cell.height - 1; row >= 0; row--) {
          for (const x of samples(colGroup.start, cell.x + cell.width - colGroup.start, "x")) {
            row = jumpHeader(row, x, true);
            if (row < 0) break;
            for (const header of at(x, row)) {
              if (header.isHeader && header.scope === "colgroup") cell.headers.add(header);
            }
          }
        }
      }
    }
    for (const header of cell.headers) {
      if (header === cell || header.empty) cell.headers.delete(header);
    }
  }
  return { cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) };
}
